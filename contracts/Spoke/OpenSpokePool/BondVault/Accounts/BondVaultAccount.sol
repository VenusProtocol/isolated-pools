// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";

/**
 * @title BondVaultAccount
 * @author Venus
 * @notice Holds one open spoke pool bond. This contract holds an asset with no source as it is; the accounts for a
 * source, such as `XVSBondVaultAccount` and `HubBondVaultAccount`, inherit it and put the bond to work there. The
 * source sees the account as the staker, so it keeps this bond's rewards, shares and withdrawals apart from every
 * other bond's. The yield is everything the account holds beyond its principal and the seizures it still owes, and is
 * paid only once no seizure is owed. A seizure takes yield first, then principal; a release gives the owner
 * everything the seizures leave. Whatever cannot be paid at once is paid by `payOwed`, seizures first, in
 * the order they were made
 * @dev An EIP-1167 clone created by `SpokeBondManager`, its only caller. A source account overrides the source steps
 * (`_depositToSource`, `_syncSource`, `_payYield`, `_withdrawFromSource`, `_collectFromSource`, `_sourceAssets`), plus
 * `sourceType` and `isValidSource`; the defaults here are those of an asset with no source. A source whose position can
 * lose value also overrides `value` and `_bondAssets`
 */
contract BondVaultAccount is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice A seizure not paid yet
    struct OwedPayment {
        address receiver;
        uint256 amount;
    }

    /// @notice The SpokeBondManager that created the account
    address public bondManager;

    /// @notice The bond's owner, paid the yield and, after release, everything the seizures leave
    address public owner;

    /// @notice The bond's asset
    IERC20Upgradeable public asset;

    /// @notice Whether the bond is released; the owner is then paid everything the seizures leave
    bool public released;

    /// @notice Where the asset earns yield; zero for an asset with no source
    address public source;

    /// @notice The bond's principal, held in the account or in the source
    uint256 public principal;

    /// @notice The part of the principal the source refused, held in the account until `retryDeposit`
    uint256 public pendingDeposit;

    /// @notice The total still owed to seizures not paid yet
    uint256 public totalOwed;

    /// @notice Index of the first seizure in `owedPayments` not fully paid
    uint256 public firstUnpaid;

    /// @notice Seizures in the order they were made; paid ones have a zero amount
    OwedPayment[] public owedPayments;

    /**
     * @notice Emitted when the source refuses a deposit and the amount is kept as a pending deposit
     * @param amount The amount kept
     */
    event SourceDepositRefused(uint256 amount);

    /**
     * @notice Emitted when the account pays out: a seizure, the yield, or the owner after release
     * @param receiver The receiver
     * @param amount The amount paid
     */
    event Paid(address indexed receiver, uint256 amount);

    /**
     * @notice Emitted when part of a seizure cannot be paid at once
     * @param receiver The seizure's receiver
     * @param amount The amount owed
     */
    event PaymentOwed(address indexed receiver, uint256 amount);

    /**
     * @notice Thrown when the caller is not the account's SpokeBondManager
     * @param caller The caller
     */
    error NotBondManager(address caller);

    /// @notice Thrown when there is no pending deposit to retry
    error NothingToRetry();

    /// @notice Thrown when the source refuses the pending deposit
    error SourceDepositFailed();

    /**
     * @notice Thrown when a seizure asks for more than the bond holds
     * @param amount The amount asked for
     * @param available What the bond holds beyond the seizures owed
     */
    error InsufficientBond(uint256 amount, uint256 available);

    /// @dev Reverts unless the caller is the account's SpokeBondManager
    modifier onlyBondManager() {
        if (msg.sender != bondManager) {
            revert NotBondManager(msg.sender);
        }
        _;
    }

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the account; the caller becomes its SpokeBondManager
     * @param owner_ The bond's owner
     * @param asset_ The bond's asset
     * @param source_ Where the asset earns yield; zero for an asset with no source
     */
    function initialize(address owner_, IERC20Upgradeable asset_, address source_) external initializer {
        bondManager = msg.sender;
        owner = owner_;
        asset = asset_;
        source = source_;
    }

    /**
     * @notice Pulls `amount` from the SpokeBondManager, adds it to the principal and deposits it in the source. A
     *   refusal does not revert: the amount is kept as a pending deposit until `retryDeposit`
     * @param amount The amount, which the SpokeBondManager must have approved
     * @custom:event Emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:access Only the SpokeBondManager
     */
    function deposit(uint256 amount) external onlyBondManager {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        principal += amount;
        if (!_depositToSource(amount)) {
            pendingDeposit += amount;
            emit SourceDepositRefused(amount);
        }
    }

    /**
     * @notice Retries depositing the pending deposit in the source
     * @return amount The amount deposited
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:error NothingToRetry is thrown when there is no pending deposit
     * @custom:error SourceDepositFailed is thrown when the source refuses the deposit
     * @custom:access Only the SpokeBondManager
     */
    function retryDeposit() external onlyBondManager returns (uint256 amount) {
        amount = pendingDeposit;
        if (amount == 0) {
            revert NothingToRetry();
        }
        pendingDeposit = 0;
        if (!_depositToSource(amount)) {
            revert SourceDepositFailed();
        }
    }

    /**
     * @notice Pays the yield to the owner, as much as the source can pay now. Nothing is paid while a seizure is
     *   still owed
     * @return paid The amount paid
     * @custom:event Emits Paid when something is paid
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only the SpokeBondManager
     */
    function claimYield() external onlyBondManager returns (uint256 paid) {
        if (totalOwed != 0) {
            return 0;
        }
        _syncSource();
        paid = _payYield(owner);
    }

    /**
     * @notice Takes `amount` from the bond, yield first, then principal, and pays it to `receiver`. What cannot be
     *   paid now is owed and paid by `payOwed`, such as XVS principal during the XVSVault's lock period
     * @param amount The amount to take
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event Emits Paid for what is paid now and PaymentOwed for what is owed
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:error InsufficientBond is thrown when the bond holds less than `amount`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only the SpokeBondManager
     */
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _syncSource();

        // 1. Take the amount off the books: yield first, then principal
        uint256 bondAssets = _bondAssets();
        if (amount > bondAssets) {
            revert InsufficientBond(amount, bondAssets);
        }
        uint256 yield = bondAssets > principal ? bondAssets - principal : 0;
        if (amount > yield) {
            principal -= amount - yield;
        }

        // 2. Pay what can be paid now: the account's balance, the pending deposit last, then the source
        uint256 balance = asset.balanceOf(address(this));
        paidNow = amount < balance ? amount : balance;
        uint256 freeBalance = balance - pendingDeposit;
        if (paidNow > freeBalance) {
            pendingDeposit -= paidNow - freeBalance;
        }
        _transferOut(receiver, paidNow);
        if (paidNow < amount) {
            paidNow += _withdrawFromSource(amount - paidNow, receiver);
        }

        // 3. Owe the rest, paid by `payOwed`
        uint256 owed = amount - paidNow;
        if (owed != 0) {
            owedPayments.push(OwedPayment(receiver, owed));
            totalOwed += owed;
            emit PaymentOwed(receiver, owed);
        }
    }

    /**
     * @notice Releases the bond: what the source can pay now goes to the seizures still owed, then to the owner, and
     *   the owner is paid the rest by `payOwed`
     * @return paidToOwner The amount paid to the owner now
     * @custom:event Emits Paid for every payment
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only the SpokeBondManager
     */
    function release() external onlyBondManager returns (uint256 paidToOwner) {
        _syncSource();
        released = true;
        principal = 0;
        pendingDeposit = 0;
        paidToOwner = _payOwed();
    }

    /**
     * @notice Pays what the source can pay now to the seizures still owed, in order, and after release the rest to
     *   the owner
     * @return paidToOwner The amount paid to the owner
     * @custom:event Emits Paid for every payment
     * @custom:error NotBondManager is thrown when the caller is not the SpokeBondManager
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only the SpokeBondManager
     */
    function payOwed() external onlyBondManager returns (uint256 paidToOwner) {
        _syncSource();
        paidToOwner = _payOwed();
    }

    /**
     * @notice Returns whether `source_` can hold `asset_` for this kind of account; with no source, it must be zero
     * @param source_ The source
     * @return Whether it fits
     */
    function isValidSource(address, address source_) external view virtual returns (bool) {
        return source_ == address(0);
    }

    /**
     * @notice Returns the principal the bond still covers
     * @return The amount, in the asset
     */
    function value() external view virtual returns (uint256) {
        return principal;
    }

    /**
     * @notice Returns the most a seizure can take: everything the bond holds beyond the seizures owed. It is read
     *   before the source is brought up to date, so it can differ slightly from what `seize` sees
     * @return The amount, in the asset
     */
    function seizableAmount() external view returns (uint256) {
        return _bondAssets();
    }

    /**
     * @notice Returns the kind of source this account puts the bond to work in
     * @return The source type
     */
    function sourceType() public pure virtual returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.Idle;
    }

    /**
     * @dev Collects what the source can pay now, pays the seizures owed in order, and after release pays the owner
     *   everything left once every seizure is paid
     * @return paidToOwner The amount paid to the owner
     */
    function _payOwed() internal returns (uint256 paidToOwner) {
        uint256 funds = _collectFromSource();
        if (released) {
            funds = asset.balanceOf(address(this));
        }

        uint256 count = owedPayments.length;
        uint256 i = firstUnpaid;
        for (; i < count && funds != 0; ++i) {
            OwedPayment storage payment = owedPayments[i];
            uint256 paid = payment.amount < funds ? payment.amount : funds;
            payment.amount -= paid;
            totalOwed -= paid;
            funds -= paid;
            _transferOut(payment.receiver, paid);
            if (payment.amount != 0) {
                break;
            }
        }
        firstUnpaid = i;

        if (released && i == count) {
            paidToOwner = asset.balanceOf(address(this));
            _transferOut(owner, paidToOwner);
        }
    }

    /**
     * @dev Sends `amount` of the asset to `receiver` if it is nonzero
     * @param receiver The receiver
     * @param amount The amount
     */
    function _transferOut(address receiver, uint256 amount) internal {
        if (amount != 0) {
            asset.safeTransfer(receiver, amount);
            emit Paid(receiver, amount);
        }
    }

    /**
     * @dev Puts an amount to work in the source, returning false instead of reverting when the source refuses it. An
     *   asset with no source is simply held, which counts as deposited
     * @return Whether the amount was deposited
     */
    function _depositToSource(uint256) internal virtual returns (bool) {
        return true;
    }

    /// @dev Brings the source up to date before the bond is valued, such as by collecting rewards
    // solhint-disable-next-line no-empty-blocks
    function _syncSource() internal virtual {}

    /**
     * @dev Pays the yield the source has earned on the bond to a receiver, as much as the source can pay now. An
     *   asset with no source earns none
     * @return The amount paid
     */
    function _payYield(address) internal virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Takes an amount out of the source for a receiver: pays what the source can pay now, never more than the
     *   amount, and asks it for the rest, for `payOwed` to collect
     * @return The amount paid now
     */
    function _withdrawFromSource(uint256, address) internal virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Collects into the account what the source can pay now: the seizures owed, and after release everything
     * @return The amount received
     */
    function _collectFromSource() internal virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Returns what the bond holds beyond the seizures owed: its balance plus its position in the source
     * @return The amount, in the asset
     */
    function _bondAssets() internal view virtual returns (uint256) {
        return asset.balanceOf(address(this)) + _sourceAssets() - totalOwed;
    }

    /**
     * @dev Returns the bond's position in the source, in the asset
     * @return The amount
     */
    function _sourceAssets() internal view virtual returns (uint256) {
        return 0;
    }
}

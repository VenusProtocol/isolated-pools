// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ensureNonzeroAddress } from "../../../../lib/validators.sol";
import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";

/**
 * @title BondAccount
 * @author Venus
 * @notice Holds one open spoke pool bond. This contract holds an asset with no source as it is; the accounts for a
 * source, such as `XVSVaultBondAccount` and `LiquidityHubBondAccount`, inherit it and put the bond to work there. The
 * source sees the account as the staker, so it keeps this bond's rewards, shares and withdrawals apart from every
 * other bond's. The yield is everything the account holds beyond its principal and what it owes receivers, including
 * assets sent to the account directly, and is paid only once no receiver is owed. A seizure takes yield first, then
 * principal; a release gives the bond holder everything the seizures leave. What a seizure cannot pay at once is
 * queued and paid by `payReceivers`, in the order of the seizures and before the bond holder; a later seizure is still
 * paid at once from what is liquid then, ahead of the queue
 * @dev An EIP-1167 clone created by `BOND_MANAGER`, its only caller; `BOND_MANAGER` is an immutable of the
 * implementation, so its clones share it. A source account overrides the source steps (`_depositToSource`,
 * `_accrueYield`, `_payYield`, `_withdrawFromSource`, `_collectFromSource`, `_assetsInSource`), plus `sourceType` and
 * `isValidSource`; the defaults here are those of an asset with no source. A source whose position can lose value
 * also overrides `value` and `_bondAssets`
 */
contract BondAccount is Initializable, IBondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc IBondAccount
    address public immutable BOND_MANAGER;

    /// @inheritdoc IBondAccount
    address public bondHolder;

    /// @inheritdoc IBondAccount
    IERC20Upgradeable public asset;

    /// @inheritdoc IBondAccount
    bool public released;

    /// @inheritdoc IBondAccount
    address public source;

    /// @inheritdoc IBondAccount
    uint256 public principal;

    /// @inheritdoc IBondAccount
    uint256 public pendingDeposit;

    /// @inheritdoc IBondAccount
    uint256 public owedToReceivers;

    /// @inheritdoc IBondAccount
    uint256 public nextPaymentIndex;

    /// @inheritdoc IBondAccount
    Payment[] public receiverPayments;

    /// @dev Reverts unless the caller is `BOND_MANAGER`
    modifier onlyBondManager() {
        if (msg.sender != BOND_MANAGER) {
            revert NotBondManager(msg.sender);
        }
        _;
    }

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    constructor(address bondManager) {
        ensureNonzeroAddress(bondManager);
        BOND_MANAGER = bondManager;
        _disableInitializers();
    }

    /// @inheritdoc IBondAccount
    function initialize(address bondHolder_, IERC20Upgradeable asset_, address source_) external initializer {
        bondHolder = bondHolder_;
        asset = asset_;
        source = source_;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Bond manager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function deposit(uint256 amount) external onlyBondManager {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        principal += amount;
        if (!_depositToSource(amount)) {
            pendingDeposit += amount;
            emit SourceDepositRefused(amount);
        }
    }

    /// @inheritdoc IBondAccount
    function claimYield() external onlyBondManager returns (uint256 paid) {
        if (owedToReceivers != 0) {
            return 0;
        }
        _accrueYield();
        uint256 bondAssets = _bondAssets();
        if (bondAssets > principal) {
            paid = _payYield(bondAssets - principal, bondHolder);
        }
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _accrueYield();

        // 1. Take the amount off the books: yield first, then principal
        uint256 bondAssets = _bondAssets();
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
        uint256 yield = bondAssets > principal ? bondAssets - principal : 0;
        // If the yield is not enough, take the rest from the principal
        if (amount > yield) {
            principal -= amount - yield;
        }

        // 2. Pay what can be paid now: the account's balance, the pending deposit last, then the source
        uint256 balance = asset.balanceOf(address(this));
        paidNow = amount < balance ? amount : balance;
        // The pending deposit is always in the balance
        uint256 yieldInAccount = balance - pendingDeposit;
        if (paidNow > yieldInAccount) {
            pendingDeposit -= paidNow - yieldInAccount;
        }
        if (paidNow < amount) {
            // The source covers the rest, as far as it can now, into the account
            paidNow += _withdrawFromSource(amount - paidNow);
        }
        if (paidNow != 0) {
            _transferOut(receiver, paidNow);
        }

        // 3. Owe the rest, paid by `payReceivers`
        uint256 owed = amount - paidNow;
        if (owed != 0) {
            receiverPayments.push(Payment(receiver, owed));
            owedToReceivers += owed;
            emit PaymentQueued(receiver, owed);
        }
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager returns (uint256 paidToBondHolder) {
        _accrueYield();
        released = true;
        principal = 0;
        pendingDeposit = 0;
        paidToBondHolder = _payReceivers();
    }

    /// @inheritdoc IBondAccount
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

    /// @inheritdoc IBondAccount
    function payReceivers() external onlyBondManager returns (uint256 paidToBondHolder) {
        _accrueYield();
        paidToBondHolder = _payReceivers();
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function isValidSource(address, address source_) external view virtual returns (bool) {
        return source_ == address(0);
    }

    /// @inheritdoc IBondAccount
    function value() external view virtual returns (uint256) {
        return principal;
    }

    /// @inheritdoc IBondAccount
    function seizableAmount() external view returns (uint256) {
        return _bondAssets();
    }

    /// @inheritdoc IBondAccount
    function sourceType() public pure virtual returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.Idle;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Collects what the source can pay now, pays the receivers owed in order, and after release pays the
     *   bond holder everything left once every receiver is paid
     * @return paidToBondHolder The amount paid to the bond holder
     */
    function _payReceivers() internal returns (uint256 paidToBondHolder) {
        uint256 funds = _collectFromSource();
        if (released) {
            funds = asset.balanceOf(address(this));
        }

        uint256 count = receiverPayments.length;
        uint256 i = nextPaymentIndex;
        uint256 paidToReceivers;
        for (; i < count && funds != 0; ++i) {
            Payment storage payment = receiverPayments[i];
            uint256 paid = payment.amount < funds ? payment.amount : funds;
            payment.amount -= paid;
            funds -= paid;
            paidToReceivers += paid;
            _transferOut(payment.receiver, paid);
            // The funds ran out on a partly paid payment: stop on it so the next call resumes it
            if (payment.amount != 0) {
                break;
            }
        }
        nextPaymentIndex = i;
        owedToReceivers -= paidToReceivers;

        if (released && i == count) {
            paidToBondHolder = asset.balanceOf(address(this));
            if (paidToBondHolder != 0) {
                _transferOut(bondHolder, paidToBondHolder);
            }
        }
    }

    /**
     * @dev Sends `amount` of the asset to `receiver`
     * @param receiver The receiver
     * @param amount The amount
     */
    function _transferOut(address receiver, uint256 amount) internal {
        asset.safeTransfer(receiver, amount);
        emit Paid(receiver, amount);
    }

    /**
     * @dev Puts an amount to work in the source, returning false instead of reverting when the source refuses it. An
     *   asset with no source is simply held, which counts as deposited
     * @return Whether the amount was deposited
     */
    function _depositToSource(uint256) internal virtual returns (bool) {
        return true;
    }

    /// @dev Brings the bond's yield up to date before the bond is valued or paid out, such as by claiming rewards
    // solhint-disable-next-line no-empty-blocks
    function _accrueYield() internal virtual {}

    /**
     * @dev Pays `amount` of yield to `receiver` from the account's balance, where the yield is held unless the source
     *   keeps it
     * @param amount The amount
     * @param receiver The receiver
     * @return The amount paid
     */
    function _payYield(uint256 amount, address receiver) internal virtual returns (uint256) {
        _transferOut(receiver, amount);
        return amount;
    }

    /**
     * @dev Takes an amount out of the source into the account, as much as the source can pay now and never more than
     *   the amount; the rest is collected later by `payReceivers`, after any request the source needs
     * @return The amount withdrawn now
     */
    function _withdrawFromSource(uint256) internal virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Collects into the account what the source can pay now: what receivers are owed, and after release everything
     * @return The amount received
     */
    function _collectFromSource() internal virtual returns (uint256) {
        return 0;
    }

    /**
     * @dev Returns what the bond holds beyond what it owes receivers: its balance plus its position in the source
     * @return The amount, in the asset
     */
    function _bondAssets() internal view virtual returns (uint256) {
        return asset.balanceOf(address(this)) + _assetsInSource() - owedToReceivers;
    }

    /**
     * @dev Returns the bond's position in the source, in the asset
     * @return The amount
     */
    function _assetsInSource() internal view virtual returns (uint256) {
        return 0;
    }
}

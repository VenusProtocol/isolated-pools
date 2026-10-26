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
 * @notice Holds one open spoke pool bond, kept apart from every other bond in its source; this base holds an asset
 * with no source. The yield is everything beyond the principal and what is owed to receivers, including assets sent
 * here directly. It is paid only while no receiver is owed. A seizure takes yield first and pays what is liquid now,
 * even ahead of earlier seizures still owed. The rest is queued: `payReceivers` pays the queue in seizure order, then,
 * after release, the bond holder
 * @dev An EIP-1167 clone created by `BOND_MANAGER`, its only caller; clones share the implementation's immutables. The
 * books are kept here: a source account overrides only the steps that talk to its source, plus `sourceType` and
 * `isValidSource`
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
    // SpokeBondManager functions
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
    function claimYield() external onlyBondManager returns (uint256 amount) {
        if (owedToReceivers != 0) {
            return 0;
        }
        _accrueYield();
        uint256 balance = asset.balanceOf(address(this));
        uint256 inSource = _assetsInSource();
        uint256 bondAssets = _bondAssets(balance, inSource);
        if (bondAssets > principal) {
            // The pending deposit is principal, so the yield comes from the rest of the balance, then the source
            amount = _payNow(bondHolder, bondAssets - principal, balance - pendingDeposit, inSource);
        }
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _accrueYield();

        // 1. Take the amount off the books: yield first, then principal
        uint256 balance = asset.balanceOf(address(this));
        uint256 inSource = _assetsInSource();
        uint256 bondAssets = _bondAssets(balance, inSource);
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
        uint256 yield = bondAssets > principal ? bondAssets - principal : 0;
        if (amount > yield) {
            principal -= amount - yield;
        }

        // 2. Pay what can be paid now: the balance, spending the pending deposit last, then the source
        // The pending deposit is always in the balance and spent last, so whatever the payment leaves is still pending
        if (amount > balance - pendingDeposit) {
            pendingDeposit = amount < balance ? balance - amount : 0;
        }
        paidNow = _payNow(receiver, amount, balance, inSource);

        // 3. Owe the rest: request it from the source, and pay it by `payReceivers`
        uint256 owed = amount - paidNow;
        if (owed != 0) {
            _requestFromSource(owed);
            receiverPayments.push(Payment(receiver, owed));
            owedToReceivers += owed;
            emit PaymentQueued(receiver, owed);
        }
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        principal = 0;
        pendingDeposit = 0;
    }

    /// @inheritdoc IBondAccount
    function payReceivers() external onlyBondManager {
        _accrueYield();
        uint256 needed = owedToReceivers;
        if (released) {
            needed = type(uint256).max;
            // Starts withdrawing what is left from a source that pays after a delay
            _requestFromSource(needed);
        }
        uint256 funds = _claimFromSource();
        if (funds < needed) {
            funds += _withdrawFromSource(needed - funds, _assetsInSource());
        }
        if (released) {
            funds = asset.balanceOf(address(this));
        }

        uint256 paymentCount = receiverPayments.length;
        uint256 i = nextPaymentIndex;
        uint256 paidToReceivers;
        for (; i < paymentCount && funds != 0; ++i) {
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

        if (released && i == paymentCount) {
            uint256 remaining = asset.balanceOf(address(this));
            if (remaining != 0) {
                _transferOut(bondHolder, remaining);
            }
        }
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

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function isValidSource(address, address source_) external view virtual returns (bool) {
        return source_ == address(0);
    }

    /// @inheritdoc IBondAccount
    function value() external view returns (uint256) {
        uint256 bondAssets = _bondAssets(asset.balanceOf(address(this)), _assetsInSource());
        return bondAssets < principal ? bondAssets : principal;
    }

    /// @inheritdoc IBondAccount
    function seizableAmount() external view returns (uint256) {
        return _bondAssets(asset.balanceOf(address(this)), _assetsInSource());
    }

    /// @inheritdoc IBondAccount
    function sourceType() public pure virtual returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.Idle;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Pays `receiver` up to `amount` now: up to `available` of the balance, then what the source pays at once.
     *   `inSource` is the position `_assetsInSource` returns
     */
    function _payNow(
        address receiver,
        uint256 amount,
        uint256 available,
        uint256 inSource
    ) internal returns (uint256 paid) {
        paid = amount < available ? amount : available;
        if (paid < amount) {
            paid += _withdrawFromSource(amount - paid, inSource);
        }
        if (paid != 0) {
            _transferOut(receiver, paid);
        }
    }

    /// @dev Sends `amount` of the asset to `receiver`
    function _transferOut(address receiver, uint256 amount) internal {
        asset.safeTransfer(receiver, amount);
        emit Paid(receiver, amount);
    }

    /// @dev Puts an amount to work in the source, returning false if it refuses; with no source the amount is held
    function _depositToSource(uint256) internal virtual returns (bool) {
        return true;
    }

    /// @dev Brings the yield up to date, such as by claiming rewards, before the account pays out
    // solhint-disable-next-line no-empty-blocks
    function _accrueYield() internal virtual {}

    /**
     * @dev Withdraws up to an amount from the source into the account, as much as the source pays at once. The second
     *   argument is the position `_assetsInSource` returns, so a source need not read it again
     */
    function _withdrawFromSource(uint256, uint256) internal virtual returns (uint256) {
        return 0;
    }

    /// @dev Requests up to an amount from a source that pays after a delay; `_claimFromSource` collects it
    // solhint-disable-next-line no-empty-blocks
    function _requestFromSource(uint256) internal virtual {}

    /// @dev Collects into the account what the source pays now for earlier requests
    function _claimFromSource() internal virtual returns (uint256) {
        return 0;
    }

    /// @dev Returns what the bond holds beyond what it owes receivers, or zero after a loss in the source leaves less
    function _bondAssets(uint256 balance, uint256 inSource) internal view returns (uint256) {
        uint256 holdings = balance + inSource;
        return holdings > owedToReceivers ? holdings - owedToReceivers : 0;
    }

    /// @dev Returns the bond's position in the source, in the asset, including what is requested but not collected
    function _assetsInSource() internal view virtual returns (uint256) {
        return 0;
    }
}

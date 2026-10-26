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
 * here directly. It is paid only while no receiver is owed. A seizure takes yield first. This base pays a seizure, and
 * the bond holder at release, from its balance at once; a source account overrides `seize` to fit how its source pays
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
        principal += amount;
        uint256 free = _bondAssets(asset.balanceOf(address(this)), 0);
        if (!released && free != 0 && !_depositToSource(free)) {
            emit SourceDepositRefused(free);
        }
    }

    /// @inheritdoc IBondAccount
    function claimYield() external onlyBondManager returns (uint256 amount) {
        if (_totalPendingSeizedAmount() != 0) {
            return 0;
        }
        _accrueYield();
        uint256 balance = asset.balanceOf(address(this));
        uint256 inSource = _assetsInSource();
        uint256 bondAssets = _bondAssets(balance, inSource);
        if (bondAssets > principal) {
            amount = _payNow(bondHolder, bondAssets - principal, balance, inSource);
        }
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external virtual onlyBondManager returns (uint256 paidNow) {
        (uint256 balance, uint256 inSource) = _recordSeizure(amount);
        paidNow = _payNow(receiver, amount, balance, inSource);
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        principal = 0;
        _releaseFunds();
    }

    /// @inheritdoc IBondAccount
    // solhint-disable-next-line no-empty-blocks
    function payReceiver(address receiver) external virtual onlyBondManager {}

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

    /**
     * @dev Accrues the yield, then records a seizure against the bond, yield first, then principal. Returns the
     *   balance and the source position the payment starts from
     */
    function _recordSeizure(uint256 amount) internal returns (uint256 balance, uint256 inSource) {
        _accrueYield();
        balance = asset.balanceOf(address(this));
        inSource = _assetsInSource();
        uint256 bondAssets = _bondAssets(balance, inSource);
        if (amount > bondAssets) {
            revert InsufficientFunds(amount, bondAssets);
        }
        uint256 yield = bondAssets > principal ? bondAssets - principal : 0;
        if (amount > yield) {
            principal -= amount - yield;
        }
    }

    /// @dev Pays the released bond holder everything at once, reverting when the source cannot pay it all now
    function _releaseFunds() internal virtual {
        _accrueYield();
        uint256 balance = asset.balanceOf(address(this));
        uint256 inSource = _assetsInSource();
        uint256 total = balance + inSource;
        uint256 paid = _payNow(bondHolder, total, balance, inSource);
        if (paid < total) {
            revert InsufficientLiquidity(total - paid);
        }
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

    /// @dev Returns what the bond holds beyond what it owes receivers, or zero after a loss in the source leaves less
    function _bondAssets(uint256 balance, uint256 inSource) internal view returns (uint256) {
        uint256 holdings = balance + inSource;
        uint256 pending = _totalPendingSeizedAmount();
        return holdings > pending ? holdings - pending : 0;
    }

    /// @dev Returns the seized amount not paid yet; only an account whose source pays later has any
    function _totalPendingSeizedAmount() internal view virtual returns (uint256) {
        return 0;
    }

    /// @dev Returns the bond's position in the source, in the asset, including what is requested but not collected
    function _assetsInSource() internal view virtual returns (uint256) {
        return 0;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";
import { ILiquidityHub } from "../../../interfaces/external/ILiquidityHub.sol";
import { BondAccount } from "./BondAccount.sol";

/**
 * @title LiquidityHubBondAccount
 * @author Venus
 * @notice A bond account that deposits its stablecoin in the stablecoin's Liquidity Hub and holds the Hub's shares. The
 * Hub pays in the stablecoin as far as it is liquid; what it cannot pay at once is paid by `payReceivers`. The Hub's
 * exit fee comes out of the bond, and the position is valued net of it. A Hub loss lowers the bond's value, and a later
 * recovery refills it before any yield is paid
 * @dev Clones run this implementation's code, so they share its `BOND_MANAGER`
 */
contract LiquidityHubBondAccount is BondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    // solhint-disable-next-line no-empty-blocks
    constructor(address bondManager) BondAccount(bondManager) {}

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns whether `source_` is a Hub for `asset_`
     * @param asset_ The asset
     * @param source_ The Hub
     * @return Whether it fits
     */
    function isValidSource(address asset_, address source_) external view override returns (bool) {
        return source_ != address(0) && ILiquidityHub(source_).asset() == asset_;
    }

    /**
     * @notice Returns the principal the bond still covers: its principal, or what it holds beyond what it owes
     *   receivers if that is less, after a Hub loss
     * @return The amount, in the asset
     */
    function value() external view override returns (uint256) {
        uint256 bondAssets = _bondAssets();
        return bondAssets < principal ? bondAssets : principal;
    }

    /// @inheritdoc IBondAccount
    function sourceType() public pure override returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.LiquidityHub;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Deposits `amount` in the Hub; the Hub refuses it while paused or at its cap
     * @param amount The amount
     * @return Whether the Hub took it
     */
    function _depositToSource(uint256 amount) internal override returns (bool) {
        asset.forceApprove(source, amount);
        try ILiquidityHub(source).deposit(amount, address(this)) {
            return true;
        } catch {
            asset.forceApprove(source, 0);
            return false;
        }
    }

    /// @dev Settles the Hub's fees so its share price is current; skipped while it is paused, when it pays nothing
    function _accrueYield() internal override {
        if (!ILiquidityHub(source).hubPaused()) {
            ILiquidityHub(source).accrueFees();
        }
    }

    /**
     * @dev Pays `amount` of yield to `receiver` from the Hub, where the yield is held, as far as the Hub is liquid
     * @param amount The amount
     * @param receiver The receiver
     * @return paid The amount paid
     */
    function _payYield(uint256 amount, address receiver) internal override returns (uint256 paid) {
        paid = _withdrawFromSource(amount);
        if (paid != 0) {
            _transferOut(receiver, paid);
        }
    }

    /**
     * @dev Withdraws `amount` from the Hub into the account, as far as the Hub can pay now; the Hub pays the rest once
     *   it is liquid again, so it needs no request. An amount that covers the whole position redeems its shares
     *   instead, as `maxWithdraw` rounds the exit fee up and would leave a wei behind. `_accrueYield` has already
     *   accrued the Hub's fees this block, and the Hub accrues at most once per block, so the limits read here hold
     * @param amount The amount
     * @return withdrawn The amount withdrawn
     */
    function _withdrawFromSource(uint256 amount) internal override returns (uint256 withdrawn) {
        ILiquidityHub hub = ILiquidityHub(source);
        if (amount >= _assetsInSource()) {
            uint256 shares = hub.maxRedeem(address(this));
            if (shares != 0) {
                withdrawn = hub.redeem(shares, address(this), address(this));
            }
        } else {
            uint256 liquid = hub.maxWithdraw(address(this));
            withdrawn = amount < liquid ? amount : liquid;
            if (withdrawn != 0) {
                hub.withdraw(withdrawn, address(this), address(this));
            }
        }
    }

    /**
     * @dev Collects from the Hub what it can pay now: what receivers are owed, and after release everything
     * @return The amount received
     */
    function _collectFromSource() internal override returns (uint256) {
        return _withdrawFromSource(released ? type(uint256).max : owedToReceivers);
    }

    /**
     * @dev Returns what the bond holds beyond what it owes receivers, or zero after a Hub loss leaves it less
     * @return The amount, in the asset
     */
    function _bondAssets() internal view override returns (uint256) {
        uint256 holdings = asset.balanceOf(address(this)) + _assetsInSource();
        return holdings > owedToReceivers ? holdings - owedToReceivers : 0;
    }

    /**
     * @dev Returns the Hub position, net of the exit fee
     * @return The amount, in the asset
     */
    function _assetsInSource() internal view override returns (uint256) {
        ILiquidityHub hub = ILiquidityHub(source);
        return hub.previewRedeem(hub.balanceOf(address(this)));
    }
}

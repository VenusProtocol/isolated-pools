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
     * @dev Returns the Hub position, net of the exit fee
     * @return The amount, in the asset
     */
    function _assetsInSource() internal view override returns (uint256) {
        ILiquidityHub hub = ILiquidityHub(source);
        return hub.previewRedeem(hub.balanceOf(address(this)));
    }
}

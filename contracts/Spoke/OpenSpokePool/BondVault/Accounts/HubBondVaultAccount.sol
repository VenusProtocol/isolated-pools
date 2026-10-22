// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";
import { ILiquidityHub } from "../../../interfaces/external/ILiquidityHub.sol";
import { BondVaultAccount } from "./BondVaultAccount.sol";

/**
 * @title HubBondVaultAccount
 * @author Venus
 * @notice A bond account that deposits its stablecoin in the asset's Liquidity Hub and holds the Hub's shares. The
 * Hub pays in the underlying as far as it is liquid; what it cannot pay at once is paid by `payOwed`. The
 * Hub's exit fee comes out of the bond, and the position is valued net of it. A Hub loss lowers the bond's value, and
 * a later recovery refills it before any yield is paid
 */
contract HubBondVaultAccount is BondVaultAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

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
     * @notice Returns the principal the bond still covers: its principal, or what it holds beyond the seizures owed
     *   if that is less, after a Hub loss
     * @return The amount, in the asset
     */
    function value() external view override returns (uint256) {
        uint256 bondAssets = _bondAssets();
        return bondAssets < principal ? bondAssets : principal;
    }

    /// @inheritdoc BondVaultAccount
    function sourceType() public pure override returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.Hub;
    }

    /**
     * @dev Deposits `amount` in the Hub; the Hub refuses it while paused or at its cap
     * @param amount The amount
     * @return Whether the Hub took it
     */
    function _depositToSource(uint256 amount) internal override returns (bool) {
        asset.forceApprove(source, amount);
        try ILiquidityHub(source).deposit(amount, address(this)) returns (uint256) {
            return true;
        } catch {
            asset.forceApprove(source, 0);
            return false;
        }
    }

    /// @dev Settles the Hub's fees so its share price is current; skipped while it is paused, when it pays nothing
    function _syncSource() internal override {
        if (!ILiquidityHub(source).hubPaused()) {
            ILiquidityHub(source).accrueFees();
        }
    }

    /**
     * @dev Pays `receiver` what the Hub holds beyond the principal deposited in it, as far as the Hub is liquid
     * @param receiver The receiver
     * @return paid The amount paid
     */
    function _payYield(address receiver) internal override returns (uint256 paid) {
        uint256 held = _sourceAssets();
        uint256 principalInHub = principal - pendingDeposit;
        if (held > principalInHub) {
            paid = _withdrawFromSource(held - principalInHub, receiver);
        }
    }

    /**
     * @dev Pays `receiver` from the Hub as far as it is liquid; the Hub pays the rest once it is liquid again, so it
     *   needs no request
     * @param amount The amount
     * @param receiver The receiver
     * @return paid The amount paid now
     */
    function _withdrawFromSource(uint256 amount, address receiver) internal override returns (uint256 paid) {
        paid = _withdrawFromHub(amount, receiver);
        if (paid != 0) {
            emit Paid(receiver, paid);
        }
    }

    /**
     * @dev Collects from the Hub what it can pay now: the seizures owed, and after release everything
     * @return amount The amount received
     */
    function _collectFromSource() internal override returns (uint256 amount) {
        if (!released) {
            return _withdrawFromHub(totalOwed, address(this));
        }
        ILiquidityHub hub = ILiquidityHub(source);
        uint256 shares = hub.maxRedeem(address(this));
        if (shares != 0) {
            amount = hub.redeem(shares, address(this), address(this));
        }
    }

    /**
     * @dev Withdraws `assets` from the Hub to `receiver`, as far as the Hub can pay now. `_syncSource` has already
     *   accrued the Hub's fees this block, and the Hub accrues at most once per block, so `maxWithdraw` still holds
     *   inside `withdraw`
     * @param assets The amount to withdraw
     * @param receiver The receiver
     * @return amount The amount withdrawn
     */
    function _withdrawFromHub(uint256 assets, address receiver) internal returns (uint256 amount) {
        ILiquidityHub hub = ILiquidityHub(source);
        uint256 liquid = hub.maxWithdraw(address(this));
        amount = assets < liquid ? assets : liquid;
        if (amount != 0) {
            hub.withdraw(amount, receiver, address(this));
        }
    }

    /**
     * @dev Returns what the bond holds beyond the seizures owed, or zero after a Hub loss leaves it less than them
     * @return The amount, in the asset
     */
    function _bondAssets() internal view override returns (uint256) {
        uint256 holdings = asset.balanceOf(address(this)) + _sourceAssets();
        return holdings > totalOwed ? holdings - totalOwed : 0;
    }

    /**
     * @dev Returns the Hub position, net of the exit fee
     * @return The amount, in the asset
     */
    function _sourceAssets() internal view override returns (uint256) {
        ILiquidityHub hub = ILiquidityHub(source);
        return hub.previewRedeem(hub.balanceOf(address(this)));
    }
}

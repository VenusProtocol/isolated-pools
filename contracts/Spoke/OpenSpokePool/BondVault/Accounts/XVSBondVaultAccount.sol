// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";
import { IXVSVaultStaking } from "../../../interfaces/external/IXVSVaultStaking.sol";
import { BondVaultAccount } from "./BondVaultAccount.sol";

/**
 * @title XVSBondVaultAccount
 * @author Venus
 * @notice A bond account that stakes its XVS in the XVSVault. Rewards are claimed into the account as yield; principal
 * leaves through a withdrawal request, paid by `payOwed` once the XVSVault's lock period has passed. The
 * account never delegates, so the bond carries no voting power
 * @dev Clones run this implementation's code, so they share its `XVS_POOL_ID`
 */
contract XVSBondVaultAccount is BondVaultAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The XVSVault pool that stakes XVS with XVS as its reward token; it differs between networks
    uint256 public immutable XVS_POOL_ID;

    /**
     * @param xvsPoolId The XVSVault pool that stakes XVS with XVS as its reward token
     */
    constructor(uint256 xvsPoolId) {
        XVS_POOL_ID = xvsPoolId;
    }

    /**
     * @notice Returns whether `source_` is an XVSVault whose `XVS_POOL_ID` pool stakes `asset_`, which must be its XVS
     * @param asset_ The asset
     * @param source_ The XVSVault
     * @return Whether it fits
     */
    function isValidSource(address asset_, address source_) external view override returns (bool) {
        if (source_ == address(0) || IXVSVaultStaking(source_).xvsAddress() != asset_) {
            return false;
        }
        (address token, , , , ) = IXVSVaultStaking(source_).poolInfos(asset_, XVS_POOL_ID);
        return token == asset_;
    }

    /// @inheritdoc BondVaultAccount
    function sourceType() public pure override returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.XVSVault;
    }

    /**
     * @dev Stakes `amount` in the XVSVault; the XVSVault refuses it while paused
     * @param amount The amount
     * @return Whether the XVSVault took it
     */
    function _depositToSource(uint256 amount) internal override returns (bool) {
        asset.forceApprove(source, amount);
        try IXVSVaultStaking(source).deposit(address(asset), XVS_POOL_ID, amount) {
            return true;
        } catch {
            asset.forceApprove(source, 0);
            return false;
        }
    }

    /// @dev Claims the XVSVault's pending rewards into the account, where they count as yield
    function _syncSource() internal override {
        IXVSVaultStaking(source).claim(address(this), address(asset), XVS_POOL_ID);
    }

    /**
     * @dev Pays the rewards `_syncSource` claimed into the account: everything there beyond the pending deposit
     * @param receiver The receiver
     * @return paid The amount paid
     */
    function _payYield(address receiver) internal override returns (uint256 paid) {
        paid = asset.balanceOf(address(this)) - pendingDeposit;
        _transferOut(receiver, paid);
    }

    /**
     * @dev Requests `amount` from the XVSVault, which pays it only after its lock period, so nothing is paid now
     * @param amount The amount, nonzero
     * @return The amount paid now: none
     */
    function _withdrawFromSource(uint256 amount, address) internal override returns (uint256) {
        IXVSVaultStaking(source).requestWithdrawal(address(asset), XVS_POOL_ID, amount);
        return 0;
    }

    /**
     * @dev After release, requests the stake not requested yet; then executes the XVSVault's withdrawal requests whose
     *   lock period has passed
     * @return amount The amount received
     */
    function _collectFromSource() internal override returns (uint256 amount) {
        IXVSVaultStaking vault = IXVSVaultStaking(source);
        if (released) {
            (uint256 staked, , uint256 requested) = vault.getUserInfo(address(asset), XVS_POOL_ID, address(this));
            if (staked > requested) {
                vault.requestWithdrawal(address(asset), XVS_POOL_ID, staked - requested);
            }
        }
        amount = vault.getEligibleWithdrawalAmount(address(asset), XVS_POOL_ID, address(this));
        if (amount != 0) {
            vault.executeWithdrawal(address(asset), XVS_POOL_ID);
        }
    }

    /**
     * @dev Returns the XVSVault stake, including requested withdrawals
     * @return staked The amount, in XVS
     */
    function _sourceAssets() internal view override returns (uint256 staked) {
        (staked, , ) = IXVSVaultStaking(source).getUserInfo(address(asset), XVS_POOL_ID, address(this));
    }
}

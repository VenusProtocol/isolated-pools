// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../../interfaces/ISpokeBondManager.sol";
import { IXVSVault } from "../../../interfaces/external/IXVSVault.sol";
import { BondAccount } from "./BondAccount.sol";

/**
 * @title XVSVaultBondAccount
 * @author Venus
 * @notice A bond account that stakes its XVS in the XVSVault. Rewards are claimed into the account as yield; principal
 * leaves through a withdrawal request, paid by `payReceivers` once the XVSVault's lock period has passed. The
 * account never delegates, so the bond carries no voting power
 * @dev Clones run this implementation's code, so they share its `XVS_POOL_ID` and `BOND_MANAGER`
 */
contract XVSVaultBondAccount is BondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The XVSVault pool that stakes XVS with XVS as its reward token; it differs between networks
    uint256 public immutable XVS_POOL_ID;

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @param xvsPoolId The XVSVault pool that stakes XVS with XVS as its reward token
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    constructor(address bondManager, uint256 xvsPoolId) BondAccount(bondManager) {
        XVS_POOL_ID = xvsPoolId;
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns whether `source_` is an XVSVault whose `XVS_POOL_ID` pool stakes `asset_`, which must be its XVS
     * @param asset_ The asset
     * @param source_ The XVSVault
     * @return Whether it fits
     */
    function isValidSource(address asset_, address source_) external view override returns (bool) {
        if (source_ == address(0) || IXVSVault(source_).xvsAddress() != asset_) {
            return false;
        }
        (address token, , , , ) = IXVSVault(source_).poolInfos(asset_, XVS_POOL_ID);
        return token == asset_;
    }

    /// @inheritdoc IBondAccount
    function sourceType() public pure override returns (ISpokeBondManager.SourceType) {
        return ISpokeBondManager.SourceType.XVSVault;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Stakes `amount` in the XVSVault; the XVSVault refuses it while paused
     * @param amount The amount
     * @return Whether the XVSVault took it
     */
    function _depositToSource(uint256 amount) internal override returns (bool) {
        asset.forceApprove(source, amount);
        try IXVSVault(source).deposit(address(asset), XVS_POOL_ID, amount) {
            return true;
        } catch {
            asset.forceApprove(source, 0);
            return false;
        }
    }

    /// @dev Claims the XVSVault's pending rewards into the account, where they count as yield
    function _accrueYield() internal override {
        IXVSVault(source).claim(address(this), address(asset), XVS_POOL_ID);
    }

    /**
     * @dev Requests `amount` from the XVSVault, which pays it only after its lock period, so nothing is withdrawn now
     * @param amount The amount, nonzero
     * @return The amount withdrawn now: none
     */
    function _withdrawFromSource(uint256 amount) internal override returns (uint256) {
        IXVSVault(source).requestWithdrawal(address(asset), XVS_POOL_ID, amount);
        return 0;
    }

    /**
     * @dev After release, requests the stake not requested yet; then executes the XVSVault's withdrawal requests whose
     *   lock period has passed
     * @return amount The amount received
     */
    function _collectFromSource() internal override returns (uint256 amount) {
        IXVSVault vault = IXVSVault(source);
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
    function _assetsInSource() internal view override returns (uint256 staked) {
        (staked, , ) = IXVSVault(source).getUserInfo(address(asset), XVS_POOL_ID, address(this));
    }
}

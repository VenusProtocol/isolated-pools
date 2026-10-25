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
 * @notice A bond account that stakes its XVS in the XVSVault, with rewards claimed into it as yield. Principal leaves
 * through a withdrawal request, paid by `payReceivers` after the lock period. It never delegates, so the bond has no
 * voting power
 * @dev Clones share this implementation's `XVS_POOL_ID` and `BOND_MANAGER`
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

    /// @inheritdoc IBondAccount
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

    /// @dev Stakes `amount` in the XVSVault, which refuses it while paused
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

    /// @dev Requests up to `amount` of the stake not requested yet; the XVSVault pays it after its lock period
    function _requestFromSource(uint256 amount) internal override {
        IXVSVault vault = IXVSVault(source);
        (uint256 staked, , uint256 requested) = vault.getUserInfo(address(asset), XVS_POOL_ID, address(this));
        uint256 free = staked - requested;
        uint256 toRequest = amount < free ? amount : free;
        if (toRequest != 0) {
            vault.requestWithdrawal(address(asset), XVS_POOL_ID, toRequest);
        }
    }

    /// @dev Executes the XVSVault's withdrawal requests whose lock period has passed
    function _claimFromSource() internal override returns (uint256 amount) {
        IXVSVault vault = IXVSVault(source);
        amount = vault.getEligibleWithdrawalAmount(address(asset), XVS_POOL_ID, address(this));
        if (amount != 0) {
            vault.executeWithdrawal(address(asset), XVS_POOL_ID);
        }
    }

    /// @dev Returns the XVSVault stake, including requested withdrawals
    function _assetsInSource() internal view override returns (uint256 staked) {
        (staked, , ) = IXVSVault(source).getUserInfo(address(asset), XVS_POOL_ID, address(this));
    }
}

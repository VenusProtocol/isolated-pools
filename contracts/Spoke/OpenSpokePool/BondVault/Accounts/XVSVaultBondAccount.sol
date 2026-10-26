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
 * @notice A bond account that stakes its XVS in the XVSVault, with rewards claimed into it as yield. A seizure pays its
 * balance now and owes the rest to its receiver, requested from the XVSVault and paid by `payReceiver` after the lock
 * period; release requests the whole stake, which `payReceiver` pays the bond holder after it, less what unpaid
 * seizures still hold. Anyone can call `payReceiver` for any receiver. It never delegates, so the bond has no voting
 * power
 * @dev Clones share this implementation's `XVS_POOL_ID` and `BOND_MANAGER`
 */
contract XVSVaultBondAccount is BondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The XVSVault pool that stakes XVS with XVS as its reward token; it differs between networks
    uint256 public immutable XVS_POOL_ID;

    /// @notice Each receiver's seized XVS not paid yet, waiting for the XVSVault's lock period
    mapping(address => uint256) public pendingSeizedAmounts;

    /// @notice The total seized XVS not paid yet
    uint256 public totalPendingSeizedAmount;

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @param xvsPoolId The XVSVault pool that stakes XVS with XVS as its reward token
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    constructor(address bondManager, uint256 xvsPoolId) BondAccount(bondManager) {
        XVS_POOL_ID = xvsPoolId;
    }

    // ──────────────────────────────────────────────────────────────────────
    // SpokeBondManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external override onlyBondManager returns (uint256 paidNow) {
        (uint256 balance, uint256 inSource) = _recordSeizure(amount);
        // Earlier receivers' matured withdrawals in the balance stay theirs
        paidNow = _payNow(receiver, amount, _bondAssets(balance, 0), inSource);
        uint256 pending = amount - paidNow;
        if (pending != 0) {
            _requestFromSource(pending);
            pendingSeizedAmounts[receiver] += pending;
            totalPendingSeizedAmount += pending;
            emit PaymentQueued(receiver, pending);
        }
    }

    /// @inheritdoc IBondAccount
    function payReceiver(address receiver) external override onlyBondManager {
        _accrueYield();
        _claimFromSource();
        uint256 balance = asset.balanceOf(address(this));
        uint256 pending = pendingSeizedAmounts[receiver];
        uint256 paid = pending < balance ? pending : balance;
        if (paid != 0) {
            pendingSeizedAmounts[receiver] = pending - paid;
            totalPendingSeizedAmount -= paid;
            balance -= paid;
            _transferOut(receiver, paid);
        }
        // After release the bond holder takes the balance beyond what is still reserved for unpaid seizures
        if (receiver == bondHolder && released && balance > totalPendingSeizedAmount) {
            _transferOut(bondHolder, balance - totalPendingSeizedAmount);
        }
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

    /// @dev Requests the whole stake; `payReceiver` pays it to the bond holder after the lock period
    function _releaseFunds() internal override {
        _requestFromSource(type(uint256).max);
    }

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
    function _requestFromSource(uint256 amount) internal {
        IXVSVault vault = IXVSVault(source);
        (uint256 staked, , uint256 requested) = vault.getUserInfo(address(asset), XVS_POOL_ID, address(this));
        uint256 free = staked - requested;
        uint256 toRequest = amount < free ? amount : free;
        if (toRequest != 0) {
            vault.requestWithdrawal(address(asset), XVS_POOL_ID, toRequest);
        }
    }

    /// @dev Executes the XVSVault's withdrawal requests whose lock period has passed
    function _claimFromSource() internal {
        IXVSVault vault = IXVSVault(source);
        if (vault.getEligibleWithdrawalAmount(address(asset), XVS_POOL_ID, address(this)) != 0) {
            vault.executeWithdrawal(address(asset), XVS_POOL_ID);
        }
    }

    /// @dev Returns the seized XVS not paid yet
    function _totalPendingSeizedAmount() internal view override returns (uint256) {
        return totalPendingSeizedAmount;
    }

    /// @dev Returns the XVSVault stake, including requested withdrawals
    function _assetsInSource() internal view override returns (uint256 staked) {
        (staked, , ) = IXVSVault(source).getUserInfo(address(asset), XVS_POOL_ID, address(this));
    }
}

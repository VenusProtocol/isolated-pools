// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IBondAccount } from "../../../interfaces/IBondAccount.sol";
import { IXVSVault } from "../../../interfaces/external/IXVSVault.sol";
import { BaseBondAccount } from "./BaseBondAccount.sol";

/**
 * @title XVSVaultBondAccount
 * @author Venus
 * @notice A bond account that stakes its XVS in the XVSVault, with rewards claimed into it as yield. A seizure pays
 * from its balance now and owes the rest to its receiver, requesting the part of the stake that the balance and earlier
 * requests do not cover; `payReceiver` pays it once the request unlocks. Release requests the whole stake, and
 * `payReceiver` pays the bond holder the balance beyond what seizures still hold, the stake included once it unlocks.
 * What the balance owes receivers is never staked or paid to anyone else. Anyone can call `payReceiver` for any
 * receiver. It never delegates, so the bond has no voting power
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract XVSVaultBondAccount is BaseBondAccount {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The XVSVault pool that stakes XVS with XVS as its reward token; it differs between networks
    uint256 public immutable XVS_POOL_ID;

    /// @notice Each receiver's seized XVS not paid yet
    mapping(address => uint256) public owedAmounts;

    /// @notice The total seized XVS not paid yet
    uint256 public totalOwedAmount;

    /**
     * @param bondManager The SpokeBondManager, the only caller of this implementation's clones
     * @param xvsPoolId The XVSVault pool that stakes XVS with XVS as its reward token
     * @custom:error ZeroAddressNotAllowed is thrown when the bond manager is zero
     */
    constructor(address bondManager, uint256 xvsPoolId) BaseBondAccount(bondManager) {
        XVS_POOL_ID = xvsPoolId;
    }

    // ──────────────────────────────────────────────────────────────────────
    // SpokeBondManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc IBondAccount
    function deposit(uint256 amount) external onlyBondManager {
        principal += amount;
        uint256 free = _freeAssets(asset.balanceOf(address(this)));
        if (released || free == 0) {
            return;
        }
        // The XVSVault refuses a deposit while paused
        asset.forceApprove(source, free);
        // solhint-disable-next-line no-empty-blocks
        try IXVSVault(source).deposit(address(asset), XVS_POOL_ID, free) {} catch {
            asset.forceApprove(source, 0);
            emit SourceDepositRefused(free);
        }
    }

    /// @inheritdoc IBondAccount
    function claimYield() external onlyBondManager returns (uint256 amount) {
        _claimRewards();
        uint256 balance = asset.balanceOf(address(this));
        uint256 bondAssets = _bondAssets();
        if (bondAssets > principal) {
            uint256 free = _freeAssets(balance);
            uint256 yield = bondAssets - principal;
            amount = yield < free ? yield : free;
            _transferOut(bondHolder, amount);
        }
    }

    /// @inheritdoc IBondAccount
    function seize(uint256 amount, address receiver) external onlyBondManager returns (uint256 paidNow) {
        _claimRewards();
        uint256 balance = asset.balanceOf(address(this));
        _recordSeizure(amount, _bondAssets());
        uint256 free = _freeAssets(balance);
        paidNow = amount < free ? amount : free;
        _transferOut(receiver, paidNow);
        uint256 owed = amount - paidNow;
        if (owed != 0) {
            owedAmounts[receiver] += owed;
            totalOwedAmount += owed;
            // What is owed beyond the balance left must come from the stake requested
            _requestWithdrawal(totalOwedAmount - (balance - paidNow));
            emit PaymentOwed(receiver, owed);
        }
    }

    /// @inheritdoc IBondAccount
    function release() external onlyBondManager {
        released = true;
        principal = 0;
        _requestWithdrawal(type(uint256).max);
    }

    /// @inheritdoc IBondAccount
    function payReceiver(address receiver) external override onlyBondManager {
        _claimRewards();
        IXVSVault vault = IXVSVault(source);
        if (vault.getEligibleWithdrawalAmount(address(asset), XVS_POOL_ID, address(this)) != 0) {
            vault.executeWithdrawal(address(asset), XVS_POOL_ID);
        }
        uint256 balance = asset.balanceOf(address(this));
        uint256 owed = owedAmounts[receiver];
        uint256 paid = owed < balance ? owed : balance;
        if (paid != 0) {
            owedAmounts[receiver] = owed - paid;
            totalOwedAmount -= paid;
            balance -= paid;
            _transferOut(receiver, paid);
        }
        // After release the bond holder takes the balance beyond what is still reserved for unpaid seizures
        if (receiver == bondHolder && released) {
            _transferOut(bondHolder, _freeAssets(balance));
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns the balance plus the stake, beyond the seized XVS not paid yet
    function _bondAssets() internal view override returns (uint256) {
        (uint256 staked, , ) = IXVSVault(source).getUserInfo(address(asset), XVS_POOL_ID, address(this));
        return _freeAssets(asset.balanceOf(address(this)) + staked);
    }

    /// @dev Claims the XVSVault's pending rewards into the account, where they count as yield
    function _claimRewards() private {
        IXVSVault(source).claim(address(this), address(asset), XVS_POOL_ID);
    }

    /**
     * @dev Requests more of the stake until `total` of it is requested, as far as the stake allows; the XVSVault pays
     *   it after its lock period
     */
    function _requestWithdrawal(uint256 total) private {
        IXVSVault vault = IXVSVault(source);
        (uint256 staked, , uint256 requested) = vault.getUserInfo(address(asset), XVS_POOL_ID, address(this));
        uint256 wanted = total > requested ? total - requested : 0;
        uint256 unrequested = staked - requested;
        uint256 toRequest = wanted < unrequested ? wanted : unrequested;
        if (toRequest != 0) {
            vault.requestWithdrawal(address(asset), XVS_POOL_ID, toRequest);
        }
    }

    /// @dev Returns what `holdings` leaves beyond the seized XVS not paid yet, or zero when it is less
    function _freeAssets(uint256 holdings) private view returns (uint256) {
        uint256 owed = totalOwedAmount;
        return holdings > owed ? holdings - owed : 0;
    }
}

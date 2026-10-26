// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { VToken } from "../../VToken.sol";
import { ISpokePoolManager } from "./ISpokePoolManager.sol";

/**
 * @title ISpokePoolShortfall
 * @author Venus
 * @notice Functions, events and errors of `SpokePoolShortfall`
 */
interface ISpokePoolShortfall {
    /**
     * @notice Emitted when a recoverer repays bad debt and is paid from the pool's bond
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param recoverer The account that repaid the bad debt
     * @param amount The bad debt repaid, in the market's asset
     * @param seizedAmount The amount taken from the bond for the recoverer, in the bond's asset
     * @param paidNow The part of it paid now; the bond manager's `payReceiver` pays the rest of an XVSVault bond
     */
    event BadDebtRecovered(
        address indexed comptroller,
        address indexed vToken,
        address indexed recoverer,
        uint256 amount,
        uint256 seizedAmount,
        uint256 paidNow
    );

    /**
     * @notice Emitted when Venus repays a market's bad debt with its own funds
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param payer The account that repaid the bad debt
     * @param amount The bad debt repaid, in the market's asset
     */
    event BadDebtRepaid(address indexed comptroller, address indexed vToken, address indexed payer, uint256 amount);

    /**
     * @notice Repays a market's bad debt with the caller's funds, then pays the caller its worth in the pool's bond
     *   asset at ResilientOracle prices; what the bond cannot pay out now is owed to the caller
     * @param vToken The market
     * @param amount The bad debt to repay, in the market's asset, which the caller must have approved; capped at the
     *   market's bad debt
     * @return paidNow The bond asset paid to the caller now
     * @custom:event Emits BadDebtRecovered; the market emits BadDebtRecovered and the bond manager BondSeized
     * @custom:error MarketNotListed is thrown when the market is not listed in its pool
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     * @custom:error The manager's `seizeBond` errors, such as when the bond holds less than the payout
     * @custom:error Reverts without data when the pool has no live bond
     * @custom:access Controlled by AccessControlManager, granted to the whitelisted recoverers
     */
    function recoverBadDebt(VToken vToken, uint256 amount) external returns (uint256 paidNow);

    /**
     * @notice Repays a market's bad debt with the caller's funds without touching the pool's bond, so Venus can cover
     *   what the bond cannot
     * @param vToken The market
     * @param amount The bad debt to repay, in the market's asset, which the caller must have approved; capped at the
     *   market's bad debt
     * @custom:event Emits BadDebtRepaid; the market emits BadDebtRecovered
     * @custom:error MarketNotListed is thrown when the market is not listed in its pool
     * @custom:error TransferAmountMismatch is thrown when the market receives a different amount
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function repayBadDebt(VToken vToken, uint256 amount) external;

    /**
     * @notice Returns the manager whose pools' bonds pay recoverers
     * @return The SpokePoolManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function SPOKE_POOL_MANAGER() external view returns (ISpokePoolManager);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokePoolValidator
 * @author Venus
 * @notice The `SpokePoolValidator` checks `SpokePoolManager` calls; each reverts with the manager's errors
 */
interface ISpokePoolValidator {
    /**
     * @notice Accrues interest in every market of a pool and checks its borrows and bad debt are within the manager's
     *   `maxResidualPoolDebtUsd`
     * @param comptroller The pool's comptroller
     */
    function accrueAndCheckResidualDebt(address comptroller) external;

    /**
     * @notice Checks a request's content against the pool it is for and that pool's tier
     * @param requestId The request
     */
    function verifyRequest(uint256 requestId) external view;

    /**
     * @notice Checks a live pool fits a tier
     * @param comptroller The pool's comptroller
     * @param tierId The tier
     */
    function checkPoolFitsTier(address comptroller, uint256 tierId) external view;

    /**
     * @notice Checks a deployer's new collateral factor and liquidation threshold for a collateral market
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     */
    function checkCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external view;

    /**
     * @notice Checks a deployer's new supply cap
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newSupplyCap The new supply cap
     */
    function checkSupplyCap(address comptroller, address vToken, uint256 newSupplyCap) external view;

    /**
     * @notice Checks a market is a listed loan market of the pool
     * @param comptroller The pool's comptroller
     * @param vToken The market
     */
    function checkLoanMarket(address comptroller, address vToken) external view;
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokePoolValidator
 * @author Venus
 * @notice The `SpokePoolValidator` checks `SpokePoolManager` calls; each reverts with the manager's errors
 */
interface ISpokePoolValidator {
    /**
     * @notice Accrues interest in every market of a pool and checks its borrows and bad debt, in USD, are within the
     *   manager's `maxResidualPoolDebtUsd`
     * @param comptroller The pool's comptroller
     * @custom:error ResidualDebtExceeded is thrown when the borrows and bad debt exceed `maxResidualPoolDebtUsd`
     */
    function accrueAndCheckResidualDebt(address comptroller) external;

    /**
     * @notice Checks a request's content against the pool it is for and that pool's tier
     * @param requestId The request
     * @custom:error InvalidRequestType is thrown for a tier request
     * @custom:error InvalidPoolParams is thrown when a new pool's close factor or liquidation incentive is zero
     * @custom:error InvalidTier is thrown when a pool request's stake is no longer its tier's
     * @custom:error InvalidPoolStatus is thrown when a markets request's pool is not live
     * @custom:error InvalidArrayLength is thrown when a markets request has no market
     * @custom:error TooManyMarkets is thrown when the pool would have more than `MAX_POOL_MARKETS` markets
     * @custom:error DuplicateAsset is thrown when a market's asset is already in the request or the pool
     * @custom:error InvalidMarketParams is thrown when a market's parameters are missing or do not fit its kind or seed
     * @custom:error UnsupportedAsset is thrown when a loan asset has no Hub source or a collateral asset has no bounded
     *   pricing
     * @custom:error ExceedsTierLimit is thrown when a collateral parameter or the loan liquidity is beyond the tier
     */
    function verifyRequest(uint256 requestId) external view;

    /**
     * @notice Checks a live pool fits a tier: every listed collateral market's risk parameters, the loan liquidity,
     *   and no bad debt
     * @param comptroller The pool's comptroller
     * @param tierId The tier
     * @custom:error ExceedsTierLimit is thrown when a risk parameter or the loan liquidity does not fit the tier
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     */
    function checkPoolFitsTier(address comptroller, uint256 tierId) external view;

    /**
     * @notice Checks a deployer's new collateral factor and liquidation threshold for a collateral market
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown when the market is a loan market
     * @custom:error InvalidLiquidationThreshold is thrown when the collateral factor is above the liquidation threshold
     * @custom:error ExceedsTierLimit is thrown when either value is beyond the tier
     */
    function checkCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external view;

    /**
     * @notice Checks a deployer's new supply cap: a loan market's raise must keep the loan markets' caps, in USD,
     *   within the tier, counting the caps published or registered in the receiver but not applied yet. Collateral
     *   caps are not bounded
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newSupplyCap The new supply cap
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error ExceedsTierLimit is thrown when a raise takes the loan liquidity beyond the tier
     */
    function checkSupplyCap(address comptroller, address vToken, uint256 newSupplyCap) external view;

    /**
     * @notice Checks a market is a listed loan market of the pool, the only kind whose borrow cap a deployer sets
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown when the market is a collateral market
     */
    function checkLoanMarket(address comptroller, address vToken) external view;
}

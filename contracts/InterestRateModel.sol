// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.20;

/**
 * @title Compound's InterestRateModel Interface
 * @author Compound
 */
abstract contract InterestRateModel {
    /**
     * @notice Calculates the current borrow interest rate per block
     * @param cash The total amount of cash the market has
     * @param borrows The total amount of borrows the market has outstanding
     * @param reserves The total amount of reserves the market has
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate per block (as a percentage, and scaled by 1e18)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) external view virtual returns (uint256);

    /**
     * @notice Calculates the current supply interest rate per block
     * @param cash The total amount of cash the market has
     * @param borrows The total amount of borrows the market has outstanding
     * @param reserves The total amount of reserves the market has
     * @param reserveFactorMantissa The current reserve factor the market has
     * @param badDebt The amount of badDebt in the market
     * @return The supply rate per block (as a percentage, and scaled by 1e18)
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa,
        uint256 badDebt
    ) external view virtual returns (uint256);

    /**
     * @notice Indicator that this is an InterestRateModel contract (for inspection)
     * @return Always true
     */
    function isInterestRateModel() external pure virtual returns (bool) {
        return true;
    }
}

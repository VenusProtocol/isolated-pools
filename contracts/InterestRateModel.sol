// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title Compound's InterestRateModel Interface
 * @author Compound
 */
abstract contract InterestRateModel {
    /**
     * @notice Indicator that this is an InterestRateModel contract (for inspection)
     * @return Always true
     */
    function isInterestRateModel() external pure virtual returns (bool) {
        return true;
    }

    /**
     * @notice Calculates the current borrow interest rate per block
     * @param utilizationRate The utilization rate per total borrows and cash available
     * @return The borrow rate per block (as a percentage, and scaled by 1e18)
     */
    function getBorrowRate(uint256 utilizationRate) external view virtual returns (uint256);
}

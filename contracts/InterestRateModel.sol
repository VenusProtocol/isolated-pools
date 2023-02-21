// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

/**
 * @title Compound's InterestRateModel Interface
 * @author Compound
 */
abstract contract InterestRateModel {
    /// @notice Indicator that this is an InterestRateModel contract (for inspection)
    bool public constant isInterestRateModel = true;

    /**
     * @notice Calculates the current borrow interest rate per block
     * @param utilizationRate The utilization rate as per total borrows and cash available
     * @return The borrow rate per block (as a percentage, and scaled by 1e18)
     */
    function getBorrowRate(uint256 utilizationRate) external view virtual returns (uint256);
}

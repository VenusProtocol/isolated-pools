// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "./InterestRateModel.sol";

/**
 * @title Compound's WhitePaperInterestRateModel Contract
 * @author Compound
 * @notice The parameterized model described in section 2.4 of the original Compound Protocol whitepaper
 */
contract WhitePaperInterestRateModel is InterestRateModel {
    event NewInterestParams(uint256 baseRatePerBlock, uint256 multiplierPerBlock);

    uint256 private constant BASE = 1e18;

    /**
     * @notice The approximate number of blocks per year that is assumed by the interest rate model
     */
    uint256 public constant blocksPerYear = 2102400;

    /**
     * @notice The multiplier of utilization rate that gives the slope of the interest rate
     */
    uint256 public multiplierPerBlock;

    /**
     * @notice The base interest rate which is the y-intercept when utilization rate is 0
     */
    uint256 public baseRatePerBlock;

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by BASE)
     * @param multiplierPerYear The rate of increase in interest rate with respect to utilization (scaled by BASE)
     */
    constructor(uint256 baseRatePerYear, uint256 multiplierPerYear) {
        baseRatePerBlock = baseRatePerYear / blocksPerYear;
        multiplierPerBlock = multiplierPerYear / blocksPerYear;

        emit NewInterestParams(baseRatePerBlock, multiplierPerBlock);
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param utilizationRate The utilization rate as per total borrows and cash available
     * @return The borrow rate percentage per block as a mantissa (scaled by BASE)
     */
    function getBorrowRate(uint256 utilizationRate) public view override returns (uint256) {
        return ((utilizationRate * multiplierPerBlock) / BASE) + baseRatePerBlock;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { InterestRateModel } from "./InterestRateModel.sol";
import { SECONDS_PER_YEAR, EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";

/**
 * @title Compound's WhitePaperInterestRateModel Contract
 * @author Compound
 * @notice The parameterized model described in section 2.4 of the original Compound Protocol whitepaper
 */
contract WhitePaperInterestRateModel is InterestRateModel {
    /**
     * @notice The multiplier of utilization rate that gives the slope of the interest rate
     */
    uint256 public immutable multiplierPerSecond;

    /**
     * @notice The base interest rate which is the y-intercept when utilization rate is 0
     */
    uint256 public immutable baseRatePerSecond;

    event NewInterestParams(uint256 baseRatePerSecond, uint256 multiplierPerSecond);

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     */
    constructor(uint256 baseRatePerYear, uint256 multiplierPerYear) {
        baseRatePerSecond = baseRatePerYear / SECONDS_PER_YEAR;
        multiplierPerSecond = multiplierPerYear / SECONDS_PER_YEAR;

        emit NewInterestParams(baseRatePerSecond, multiplierPerSecond);
    }

    /**
     * @notice Calculates the current borrow rate per second, with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate percentage per second as a mantissa (scaled by EXP_SCALE)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) public view override returns (uint256) {
        uint256 ur = utilizationRate(cash, borrows, reserves, badDebt);
        return ((ur * multiplierPerSecond) / EXP_SCALE) + baseRatePerSecond;
    }

    /**
     * @notice Calculates the current supply rate per second
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @param badDebt The amount of badDebt in the market
     * @return The supply rate percentage per second as a mantissa (scaled by EXP_SCALE)
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa,
        uint256 badDebt
    ) public view override returns (uint256) {
        uint256 oneMinusReserveFactor = MANTISSA_ONE - reserveFactorMantissa;
        uint256 borrowRate = getBorrowRate(cash, borrows, reserves, badDebt);
        uint256 rateToPool = (borrowRate * oneMinusReserveFactor) / EXP_SCALE;
        uint256 incomeToDistribute = borrows * rateToPool;
        uint256 supply = cash + borrows + badDebt - reserves;
        return incomeToDistribute / supply;
    }

    /**
     * @notice Calculates the utilization rate of the market: `(borrows + badDebt) / (cash + borrows + badDebt - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market (currently unused)
     * @param badDebt The amount of badDebt in the market
     * @return The utilization rate as a mantissa between [0, MANTISSA_ONE]
     */
    function utilizationRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) public pure returns (uint256) {
        // Utilization rate is 0 when there are no borrows and badDebt
        if ((borrows + badDebt) == 0) {
            return 0;
        }

        uint256 rate = ((borrows + badDebt) * EXP_SCALE) / (cash + borrows + badDebt - reserves);

        if (rate > EXP_SCALE) {
            rate = EXP_SCALE;
        }

        return rate;
    }
}

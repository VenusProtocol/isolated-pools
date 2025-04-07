// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../lib/constants.sol";
import { InterestRateModel } from "./InterestRateModel.sol";

/**
 * @title Compound's WhitePaperInterestRateModel Contract
 * @author Compound
 * @notice The parameterized model described in section 2.4 of the original Compound Protocol whitepaper
 */
contract WhitePaperInterestRateModel is InterestRateModel, TimeManagerV8 {
    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope of the interest rate
     */
    uint256 public immutable multiplierPerBlock;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate is 0
     */
    uint256 public immutable baseRatePerBlock;

    event NewInterestParams(uint256 baseRatePerBlockOrTimestamp, uint256 multiplierPerBlockOrTimestamp);

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * @param blocksPerYear_ The number of blocks per year
     */
    constructor(
        uint256 baseRatePerYear_,
        uint256 multiplierPerYear_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        baseRatePerBlock = baseRatePerYear_ / blocksOrSecondsPerYear;
        multiplierPerBlock = multiplierPerYear_ / blocksOrSecondsPerYear;

        emit NewInterestParams(baseRatePerBlock, multiplierPerBlock);
    }

    /**
     * @notice Calculates the current borrow rate per slot(block/second), with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate percentage per slot(block/second) as a mantissa (scaled by EXP_SCALE)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) public view override returns (uint256) {
        uint256 ur = utilizationRate(cash, borrows, reserves, badDebt);
        return ((ur * multiplierPerBlock) / EXP_SCALE) + baseRatePerBlock;
    }

    /**
     * @notice Calculates the current supply rate per slot(block/second)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @param badDebt The amount of badDebt in the market
     * @return The supply rate percentage per slot(block/second) as a mantissa (scaled by EXP_SCALE)
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

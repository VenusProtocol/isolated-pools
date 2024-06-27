// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { InterestRateModel } from "./InterestRateModel.sol";
import { EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";
import "hardhat/console.sol";

/**
 * @title TwoKinksInterestRateModel
 * @author Venus
 * @notice An interest rate model with two different steep increase each after a certain utilization threshold called **kink** is reached.
 */
contract TwoKinksInterestRateModel is InterestRateModel, TimeManagerV8 {
    ////////////////////// SLOPE 1 //////////////////////

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 1 of the interest rate
     */
    int256 public immutable MULTIPLIER_PER_BLOCK_OR_SECOND;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate is 0
     */
    int256 public immutable BASE_RATE_PER_BLOCK_OR_SECOND;

    ////////////////////// SLOPE 2 //////////////////////

    /**
     * @notice The utilization point at which the multiplier2 is applied
     */
    int256 public immutable KINK_1;

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 2 of the interest rate
     */
    int256 public immutable MULTIPLIER_2_PER_BLOCK_OR_SECOND;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate hits KINK_1
     */
    int256 public immutable BASE_RATE_2_PER_BLOCK_OR_SECOND;

    ////////////////////// SLOPE 3 //////////////////////

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    int256 public immutable KINK_2;

    /**
     * @notice The multiplier per block or second after hitting KINK_2
     */
    int256 public immutable JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND;

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear_ The rate of increase in interest rate wrt utilization after hitting KINK_1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear_ The approximate target base APR after hitting KINK_1, as a mantissa (scaled by EXP_SCALE)
     * @param kink2_ The utilization point at which the jump multiplier is applied
     * @param jumpMultiplierPerYear_ The multiplier after hitting KINK_2
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * @param blocksPerYear_ The number of blocks per year
     */
    constructor(
        int256 baseRatePerYear_,
        int256 multiplierPerYear_,
        int256 kink1_,
        int256 multiplier2PerYear_,
        int256 baseRate2PerYear_,
        int256 kink2_,
        int256 jumpMultiplierPerYear_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        int256 blocksOrSecondsPerYear_ = int256(blocksOrSecondsPerYear);
        BASE_RATE_PER_BLOCK_OR_SECOND = baseRatePerYear_ / blocksOrSecondsPerYear_;
        MULTIPLIER_PER_BLOCK_OR_SECOND = multiplierPerYear_ / blocksOrSecondsPerYear_;
        KINK_1 = kink1_;
        MULTIPLIER_2_PER_BLOCK_OR_SECOND = multiplier2PerYear_ / blocksOrSecondsPerYear_;
        BASE_RATE_2_PER_BLOCK_OR_SECOND = baseRate2PerYear_ / blocksOrSecondsPerYear_;
        KINK_2 = kink2_;
        JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND = jumpMultiplierPerYear_ / blocksOrSecondsPerYear_;
    }

    /**
     * @notice Calculates the current borrow rate per slot (block or second)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate percentage per slot (block or second) as a mantissa (scaled by 1e18)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) external view override returns (uint256) {
        return _getBorrowRate(cash, borrows, reserves, badDebt);
    }

    /**
     * @notice Calculates the current supply rate per slot (block or second)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @param badDebt The amount of badDebt in the market
     * @return The supply rate percentage per slot (block or second) as a mantissa (scaled by EXP_SCALE)
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa,
        uint256 badDebt
    ) public view virtual override returns (uint256) {
        uint256 oneMinusReserveFactor = MANTISSA_ONE - reserveFactorMantissa;
        uint256 borrowRate = _getBorrowRate(cash, borrows, reserves, badDebt);
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

    /**
     * @notice Calculates the current borrow rate per slot (block or second), with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate percentage per slot (block or second) as a mantissa (scaled by EXP_SCALE)
     */
    function _getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 badDebt
    ) internal view returns (uint256) {
        int256 util = int256(utilizationRate(cash, borrows, reserves, badDebt));
        int256 expScale = int256(EXP_SCALE);

        if (util < KINK_1) {
            return _max(0, ((util * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) + BASE_RATE_PER_BLOCK_OR_SECOND);
        } else if (util < KINK_2) {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_PER_BLOCK_OR_SECOND);
            int256 rate2 = (((util - KINK_1) * MULTIPLIER_2_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_2_PER_BLOCK_OR_SECOND;
            
            return _max(0, rate1 + rate2);
        } else {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_PER_BLOCK_OR_SECOND);
            int256 rate2 = (((KINK_2 - KINK_1) * MULTIPLIER_2_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_2_PER_BLOCK_OR_SECOND;
            int256 rate3 = (((util - KINK_2) * JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale);
            return _max(0, rate1 + rate2 + rate3);
        }
    }

    /**
     * @notice Returns the larger of two numbers
     * @param a The first number
     * @param b The second number
     * @return The larger of the two numbers
     */
    function _max(int256 a, int256 b) internal pure returns (uint256) {
        return uint256(a > b ? a : b);
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { InterestRateModel } from "./InterestRateModel.sol";
import { EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";

/**
 * @title TwoKinksInterestRateModel
 * @author Venus
 * @notice An interest rate model with two different slope increase or decrease each after a certain utilization threshold called **kink** is reached.
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
     * @notice The multiplier of utilization rate per block or second that gives the slope 3 of interest rate
     */
    int256 public immutable JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND;

    /**
     * @notice Thrown when a negative value is not allowed
     */
    error NegativeValueNotAllowed();

    /**
     * @notice Thrown when the kink points are not in the correct order
     */
    error InvalidKink();

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase or decrease in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear_ The rate of increase or decrease in interest rate wrt utilization after hitting KINK_1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear_ The additonal base APR after hitting KINK_1, as a mantissa (scaled by EXP_SCALE)
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
        if (baseRatePerYear_ < 0 || baseRate2PerYear_ < 0) {
            revert NegativeValueNotAllowed();
        }

        if (kink2_ <= kink1_ || kink1_ <= 0) {
            revert InvalidKink();
        }

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
     * @return The borrow rate percentage per slot (block or second) as a mantissa (scaled by EXP_SCALE)
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
            return _minCap(((util * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) + BASE_RATE_PER_BLOCK_OR_SECOND);
        } else if (util < KINK_2) {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) + BASE_RATE_PER_BLOCK_OR_SECOND);
            int256 slope2Util;
            unchecked {
                slope2Util = util - KINK_1;
            }
            int256 rate2 = ((slope2Util * MULTIPLIER_2_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_2_PER_BLOCK_OR_SECOND;

            return _minCap(rate1 + rate2);
        } else {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale) + BASE_RATE_PER_BLOCK_OR_SECOND);
            int256 slope2Util;
            unchecked {
                slope2Util = KINK_2 - KINK_1;
            }
            int256 rate2 = ((slope2Util * MULTIPLIER_2_PER_BLOCK_OR_SECOND) / expScale) +
                BASE_RATE_2_PER_BLOCK_OR_SECOND;
            int256 slope3Util;
            unchecked {
                slope3Util = util - KINK_2;
            }
            int256 rate3 = ((slope3Util * JUMP_MULTIPLIER_PER_BLOCK_OR_SECOND) / expScale);

            return _minCap(rate1 + rate2 + rate3);
        }
    }

    /**
     * @notice Returns 0 if number is less than 0, otherwise returns the input
     * @param number The first number
     * @return The maximum of 0 and input number
     */
    function _minCap(int256 number) internal pure returns (uint256) {
        int256 zero;
        return uint256(number > zero ? number : zero);
    }
}

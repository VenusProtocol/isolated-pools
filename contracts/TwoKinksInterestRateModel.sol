// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { InterestRateModel } from "./InterestRateModel.sol";
import { EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";

/**
 * @title TwoKinksInterestRateModel
 * @author Venus 
 * @notice An interest rate model with a steep increase after a certain utilization threshold called **kink** is reached.
 * The parameters of this interest rate model can be adjusted by the owner. Version 2 modifies Version 1 by enabling updateable parameters
 */
contract TwoKinksInterestRateModel is InterestRateModel, TimeManagerV8 {

    ////////////////////// SLOPE 1 //////////////////////

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 1 of the interest rate
     */
    uint256 public immutable multiplierPerBlockOrTimestamp;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate is 0
     */
    uint256 public immutable baseRatePerBlockOrTimestamp;

    ////////////////////// SLOPE 2 //////////////////////

    /**
     * @notice The utilization point at which the multiplier2 is applied
     */
    uint256 public immutable kink1;
 
    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 2 of the interest rate
     */
    uint256 public immutable multiplier2PerBlockOrTimestamp;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate hits kink1
     */
    uint256 public immutable baseRate2PerBlockOrTimestamp;

    ////////////////////// SLOPE 3 //////////////////////

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    uint256 public immutable kink2;


    /**
     * @notice The multiplier per block or second after hitting kink2
     */
    uint256 public jumpMultiplierPerBlockOrTimestamp;
    
    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear_ The rate of increase in interest rate wrt utilization after hitting kink1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear_ The approximate target base APR after hitting kink1, as a mantissa (scaled by EXP_SCALE)
     * @param kink2_ The utilization point at which the jump multiplier is applied
     * @param jumpMultiplierPerYear_ The multiplier after hitting kink2
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * @param blocksPerYear_ The number of blocks per year
     */
    constructor(
        uint256 baseRatePerYear_,
        uint256 multiplierPerYear_,
        uint256 kink1_,
        uint256 multiplier2PerYear_,
        uint256 baseRate2PerYear_,
        uint256 kink2_,
        uint256 jumpMultiplierPerYear_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        baseRatePerBlockOrTimestamp = baseRatePerYear_ / blocksOrSecondsPerYear;
        multiplierPerBlockOrTimestamp = multiplierPerYear_ / blocksOrSecondsPerYear;
        kink1 = kink1_;
        multiplier2PerBlockOrTimestamp = multiplier2PerYear_ / blocksOrSecondsPerYear;
        baseRate2PerBlockOrTimestamp = baseRate2PerYear_ / blocksOrSecondsPerYear;
        kink2 = kink2_;
        jumpMultiplierPerBlockOrTimestamp = jumpMultiplierPerYear_ / blocksOrSecondsPerYear;
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
     * @notice Internal function to update the parameters of the interest rate model
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear The rate of increase in interest rate wrt utilization after hitting kink1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear The approximate target base APR after hitting kink1, as a mantissa (scaled by EXP_SCALE)
     * @param kink2_ The utilization point at which the jump multiplier is applied
     * @param jumpMultiplierPerYear The multiplier after hitting kink2
     */
    function _updateJumpRateModel(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 kink1_,
        uint256 multiplier2PerYear,
        uint256 baseRate2PerYear,
        uint256 kink2_,
        uint256 jumpMultiplierPerYear
    ) internal {
        
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
        uint256 util = utilizationRate(cash, borrows, reserves, badDebt);

        if (util < kink1) {
            return ((util * multiplierPerBlockOrTimestamp) / EXP_SCALE) + baseRatePerBlockOrTimestamp;
        } else if (util < kink2) {
            uint256 rate1 = (((kink1 * multiplierPerBlockOrTimestamp) / EXP_SCALE) + baseRatePerBlockOrTimestamp);
            uint256 rate2 = (((util - kink1) * multiplier2PerBlockOrTimestamp) / EXP_SCALE) + baseRate2PerBlockOrTimestamp;
            return rate1 + rate2;
        } else {
            uint256 rate1 = (((kink1 * multiplierPerBlockOrTimestamp) / EXP_SCALE) + baseRatePerBlockOrTimestamp);
            uint256 rate2 = (((kink2 - kink1) * multiplier2PerBlockOrTimestamp) / EXP_SCALE) + baseRate2PerBlockOrTimestamp;
            uint256 rate3 = (((util - kink2) * jumpMultiplierPerBlockOrTimestamp) / EXP_SCALE);
            return rate1 + rate2 + rate3;
        }
    }
}

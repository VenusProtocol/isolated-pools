// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { TimeManager } from "./TimeManager.sol";
import { InterestRateModel } from "./InterestRateModel.sol";
import { EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";

/**
 * @title JumpRateModelV2
 * @author Compound (modified by Dharma Labs, Arr00 and Venus)
 * @notice An interest rate model with a steep increase after a certain utilization threshold called **kink** is reached.
 * The parameters of this interest rate model can be adjusted by the owner. Version 2 modifies Version 1 by enabling updateable parameters
 */
contract JumpRateModelV2 is TimeManager, InterestRateModel {
    /**
     * @notice The address of the AccessControlManager contract
     */
    IAccessControlManagerV8 public accessControlManager;

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope of the interest rate
     */
    uint256 public multiplierPerBlock;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate is 0
     */
    uint256 public baseRatePerBlock;

    /**
     * @notice The multiplier per block or second after hitting a specified utilization point
     */
    uint256 public jumpMultiplierPerBlock;

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    uint256 public kink;

    event NewInterestParams(
        uint256 baseRatePerBlockOrTimestamp,
        uint256 multiplierPerBlockOrTimestamp,
        uint256 jumpMultiplierPerBlockOrTimestamp,
        uint256 kink
    );

    /**
     * @notice Thrown when the action is prohibited by AccessControlManager
     */
    error Unauthorized(address sender, address calledContract, string methodSignature);

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param jumpMultiplierPerYear_ The multiplier after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     * @param accessControlManager_ The address of the AccessControlManager contract
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * @param blocksPerYear_ The number of blocks per year
     */
    constructor(
        uint256 baseRatePerYear_,
        uint256 multiplierPerYear_,
        uint256 jumpMultiplierPerYear_,
        uint256 kink_,
        IAccessControlManagerV8 accessControlManager_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManager(timeBased_, blocksPerYear_) {
        require(address(accessControlManager_) != address(0), "invalid ACM address");

        accessControlManager = accessControlManager_;

        _updateJumpRateModel(baseRatePerYear_, multiplierPerYear_, jumpMultiplierPerYear_, kink_);
    }

    /**
     * @notice Update the parameters of the interest rate model
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param jumpMultiplierPerYear The multiplierPerBlockOrTimestamp after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     * @custom:error Unauthorized if the sender is not allowed to call this function
     * @custom:access Controlled by AccessControlManager
     */
    function updateJumpRateModel(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_
    ) external virtual {
        string memory signature = "updateJumpRateModel(uint256,uint256,uint256,uint256)";
        bool isAllowedToCall = accessControlManager.isAllowedToCall(msg.sender, signature);

        if (!isAllowedToCall) {
            revert Unauthorized(msg.sender, address(this), signature);
        }

        _updateJumpRateModel(baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_);
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
     * @param jumpMultiplierPerYear The multiplierPerBlockOrTimestamp after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     */
    function _updateJumpRateModel(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_
    ) internal {
        baseRatePerBlock = baseRatePerYear / blocksOrSecondsPerYear;
        multiplierPerBlock = multiplierPerYear / blocksOrSecondsPerYear;
        jumpMultiplierPerBlock = jumpMultiplierPerYear / blocksOrSecondsPerYear;
        kink = kink_;

        emit NewInterestParams(baseRatePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kink);
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
        uint256 kink_ = kink;

        if (util <= kink_) {
            return ((util * multiplierPerBlock) / EXP_SCALE) + baseRatePerBlock;
        }
        uint256 normalRate = ((kink_ * multiplierPerBlock) / EXP_SCALE) + baseRatePerBlock;
        uint256 excessUtil;
        unchecked {
            excessUtil = util - kink_;
        }
        return ((excessUtil * jumpMultiplierPerBlock) / EXP_SCALE) + normalRate;
    }
}

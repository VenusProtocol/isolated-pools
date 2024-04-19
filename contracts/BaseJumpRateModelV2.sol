// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

import { InterestRateModel } from "./InterestRateModel.sol";
import { EXP_SCALE, MANTISSA_ONE } from "./lib/constants.sol";

/**
 * @title Logic for Compound's JumpRateModel Contract V2.
 * @author Compound (modified by Dharma Labs, Arr00 and Venus)
 * @notice An interest rate model with a steep increase after a certain utilization threshold called **kink** is reached.
 * The parameters of this interest rate model can be adjusted by the owner. Version 2 modifies Version 1 by enabling updateable parameters.
 */
abstract contract BaseJumpRateModelV2 is InterestRateModel {
    /**
     * @notice The approximate number of blocks per year that is assumed by the interest rate model
     */
    uint256 public immutable blocksPerYear;
    /**
     * @notice The address of the AccessControlManager contract
     */
    IAccessControlManagerV8 public accessControlManager;

    /**
     * @notice The multiplier of utilization rate that gives the slope of the interest rate
     */
    uint256 public multiplierPerBlock;

    /**
     * @notice The base interest rate which is the y-intercept when utilization rate is 0
     */
    uint256 public baseRatePerBlock;

    /**
     * @notice The multiplier per block after hitting a specified utilization point
     */
    uint256 public jumpMultiplierPerBlock;

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    uint256 public kink;

    event NewInterestParams(
        uint256 baseRatePerBlock,
        uint256 multiplierPerBlock,
        uint256 jumpMultiplierPerBlock,
        uint256 kink
    );

    /**
     * @notice Thrown when the action is prohibited by AccessControlManager
     */
    error Unauthorized(address sender, address calledContract, string methodSignature);

    /**
     * @notice Construct an interest rate model
     * @param blocksPerYear_  The approximate number of blocks per year that is assumed by the interest rate model.
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     * @param accessControlManager_ The address of the AccessControlManager contract
     */
    constructor(
        uint256 blocksPerYear_,
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_,
        IAccessControlManagerV8 accessControlManager_
    ) {
        require(address(accessControlManager_) != address(0), "invalid ACM address");
        require(blocksPerYear_ != 0, "Invalid blocks per year");
        accessControlManager = accessControlManager_;
        blocksPerYear = blocksPerYear_;

        _updateJumpRateModel(baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_);
    }

    /**
     * @notice Update the parameters of the interest rate model
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
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
     * @notice Calculates the current supply rate per block
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @param badDebt The amount of badDebt in the market
     * @return The supply rate percentage per block as a mantissa (scaled by EXP_SCALE)
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
     * @param jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     */
    function _updateJumpRateModel(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_
    ) internal {
        baseRatePerBlock = baseRatePerYear / blocksPerYear;
        multiplierPerBlock = multiplierPerYear / blocksPerYear;
        jumpMultiplierPerBlock = jumpMultiplierPerYear / blocksPerYear;
        kink = kink_;

        emit NewInterestParams(baseRatePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kink);
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param badDebt The amount of badDebt in the market
     * @return The borrow rate percentage per block as a mantissa (scaled by EXP_SCALE)
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

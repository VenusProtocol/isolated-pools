// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

import { InterestRateModel } from "./InterestRateModel.sol";
import { BLOCKS_PER_YEAR, EXP_SCALE } from "./lib/constants.sol";

/**
 * @title Logic for Compound's JumpRateModel Contract V2.
 * @author Compound (modified by Dharma Labs, Arr00 and Venus)
 * @notice An interest rate model with a steep increase after a certain utilization threshold called **kink** is reached.
 * The parameters of this interest rate model can be adjusted by the owner. Version 2 modifies Version 1 by enabling updateable parameters.
 */
abstract contract BaseJumpRateModelV2 is InterestRateModel {
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
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point at which the jump multiplier is applied
     * @param accessControlManager_ The address of the AccessControlManager contract
     */
    constructor(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_,
        IAccessControlManagerV8 accessControlManager_
    ) {
        require(address(accessControlManager_) != address(0), "invalid ACM address");

        accessControlManager = accessControlManager_;

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
        baseRatePerBlock = baseRatePerYear / BLOCKS_PER_YEAR;
        multiplierPerBlock = multiplierPerYear / BLOCKS_PER_YEAR;
        jumpMultiplierPerBlock = jumpMultiplierPerYear / BLOCKS_PER_YEAR;
        kink = kink_;

        emit NewInterestParams(baseRatePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kink);
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param utRate The utilization rate per total borrows and cash available
     * @return The borrow rate percentage per block as a mantissa (scaled by BASE)
     */
    function _getBorrowRate(uint256 utRate) internal view returns (uint256) {
        if (utRate <= kink) {
            return ((utRate * multiplierPerBlock) / EXP_SCALE) + baseRatePerBlock;
        } else {
            uint256 normalRate = ((kink * multiplierPerBlock) / EXP_SCALE) + baseRatePerBlock;
            uint256 excessUtil;
            unchecked {
                excessUtil = utRate - kink;
            }
            return ((excessUtil * jumpMultiplierPerBlock) / EXP_SCALE) + normalRate;
        }
    }
}

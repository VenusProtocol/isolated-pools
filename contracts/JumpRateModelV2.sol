// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "./BaseJumpRateModelV2.sol";
import "./InterestRateModel.sol";

/**
 * @title Compound's JumpRateModel Contract V2 for V2 vTokens
 * @author Arr00
 * @notice Supports only for V2 vTokens
 */
contract JumpRateModelV2 is InterestRateModel, BaseJumpRateModelV2 {
    /**
     * @notice Calculates the current borrow rate per block
     * @param utilizationRate The utilization rate per total borrows and cash available
     * @return The borrow rate percentage per block as a mantissa (scaled by 1e18)
     */
    function getBorrowRate(uint256 utilizationRate) external view override returns (uint256) {
        return getBorrowRateInternal(utilizationRate);
    }

    constructor(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_,
        address owner_
    ) BaseJumpRateModelV2(baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_, owner_) {}
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "./BaseJumpRateModelV2.sol";

/**
 * @title Compound's JumpRateModel Contract V2 for V2 vTokens
 * @author Arr00
 * @notice Supports only for V2 vTokens
 */
contract JumpRateModelV2 is BaseJumpRateModelV2 {
    constructor(
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_,
        IAccessControlManagerV8 accessControlManager_
    )
        BaseJumpRateModelV2(baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_, accessControlManager_)
    /* solhint-disable-next-line no-empty-blocks */
    {

    }

    /**
     * @notice Calculates the current borrow rate per block
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per block as a mantissa (scaled by 1e18)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves
    ) external view override returns (uint256) {
        return _getBorrowRate(cash, borrows, reserves);
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title Logic for Venus stable rate.
 */
contract StableRateModel {
    event NewStableInterestParams(
        uint256 baseRatePerBlockForStable,
        uint256 multiplierPerBlock,
        uint256 multiplierPerBlockForStable,
        uint256 jumpMultiplierPerBlockForStable,
        uint256 kink,
        uint256 stableRatePremium,
        uint256 optimalStableLoanRate
    );

    /// @notice Indicator that this is an InterestRateModel contract (for inspection)
    bool public constant isInterestRateModel = true;

    uint256 private constant BASE = 1e18;

    /// @notice The approximate number of blocks per year that is assumed by the interest rate model
    uint256 public constant blocksPerYear = 2102400;

    /// @notice The stable base interest rate which is the y-intercept when utilization rate is 0
    uint256 public baseRatePerBlockForStable;

    /// @notice The utilization rate multiplier that gives the slope to the interest rate
    uint256 public multiplierPerBlock;

    /// @notice The utilization rate multiplier that gives the slope to the stable interest rate
    uint256 public multiplierPerBlockForStable;

    /// @notice The stable rate multiplierPerBlock applied after hitting the specified utilization point
    uint256 public jumpMultiplierPerBlockForStable;

    /// @notice @notice The utilization point when the jump multiplier is applied to the stable rate
    uint256 public kink;

    /// @notice The premium rate applicable on optimal stable loan rate
    uint256 public stableRatePremium;

    /// @notice The factor to be applied to the stable rate premium before adding to the interest rate
    uint256 public optimalStableLoanRate;

    /// @notice The address of the owner, i.e. the Timelock contract, which can update parameters directly
    address public owner;

    /**
     * @param baseRatePerBlockForStable_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param multiplierPerBlock_ The rate the interest rate increases per utilization (scaled by BASE)
     * @param multiplierPerBlockForStable_ The rate of increase in interest rate with respect to utilization (scaled by BASE)
     * @param jumpMultiplierPerBlockForStable_ The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point where the jump multiplier is applied
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRate_ Optimal stable loan rate percentage.
     */
    constructor(
        uint256 baseRatePerBlockForStable_,
        uint256 multiplierPerBlock_,
        uint256 multiplierPerBlockForStable_,
        uint256 jumpMultiplierPerBlockForStable_,
        uint256 kink_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRate_,
        address owner_
    ) {
        owner = owner_;

        updateStableRateModelInternal(
            baseRatePerBlockForStable_,
            multiplierPerBlock_,
            multiplierPerBlockForStable_,
            jumpMultiplierPerBlockForStable_,
            kink_,
            stableRatePremium_,
            optimalStableLoanRate_
        );
    }

    /**
     * @notice Updates the parameters of the interest rate model (only callable by owner, i.e. Timelock)
     * @param baseRatePerBlockForStable_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param multiplierPerBlock_ The rate the interest rate increases per utilization (scaled by BASE)
     * @param multiplierPerBlockForStable_ The rate of increase in interest rate with respect to utilization (scaled by BASE)
     * @param jumpMultiplierPerBlockForStable_ The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point where the jump multiplier is applied
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRate_ Optimal stable loan rate percentage.
     * @custom:events Emits NewStableInterestParams, after updating the parameters
     * @custom:access Only governance
     */
    function updateStableRateModel(
        uint256 baseRatePerBlockForStable_,
        uint256 multiplierPerBlock_,
        uint256 multiplierPerBlockForStable_,
        uint256 jumpMultiplierPerBlockForStable_,
        uint256 kink_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRate_
    ) external virtual {
        require(msg.sender == owner, "StableRateModel: only owner may call this function.");

        updateStableRateModelInternal(
            baseRatePerBlockForStable_,
            multiplierPerBlock_,
            multiplierPerBlockForStable_,
            jumpMultiplierPerBlockForStable_,
            kink_,
            stableRatePremium_,
            optimalStableLoanRate_
        );
    }

    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The utilization rate as a mantissa between [0, BASE]
     */
    function utilizationRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves
    ) public pure returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (borrows == 0) {
            return 0;
        }

        return (borrows * BASE) / (cash + borrows - reserves);
    }

    /**
     * @notice Calculates the ratio of the stable borrows to total borrows
     * @param stableBorrows The amount of stable borrows in the market
     * @param totalBorrows The amount of total borrows in the market
     * @return The stable loan rate as a mantissa between [0, BASE]
     */
    function stableLoanRatio(uint256 stableBorrows, uint256 totalBorrows) public pure returns (uint256) {
        // Loan ratio is 0 when there are no stable borrows
        if (totalBorrows == 0) {
            return 0;
        }

        return (stableBorrows * BASE) / totalBorrows;
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param stableBorrows The amount of stable borrows in the market
     * @param totalBorrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per block as a mantissa (scaled by BASE)
     */
    function getBorrowRate(
        uint256 cash,
        uint256 stableBorrows,
        uint256 totalBorrows,
        uint256 reserves
    ) external view returns (uint256) {
        uint256 util = utilizationRate(cash, totalBorrows, reserves);
        uint256 loanRatio = stableLoanRatio(stableBorrows, totalBorrows);
        uint256 excessLoanRatio = calculateLoanRatioDiff(loanRatio);

        if (util <= kink) {
            return
                ((util * multiplierPerBlock) / BASE) +
                baseRatePerBlockForStable +
                ((util * multiplierPerBlockForStable) / BASE) +
                ((stableRatePremium * excessLoanRatio) / BASE);
        } else {
            uint256 excessUtil = util - kink;
            return
                ((kink * multiplierPerBlock) / BASE) +
                baseRatePerBlockForStable +
                ((kink * multiplierPerBlockForStable) / BASE) +
                ((excessUtil * jumpMultiplierPerBlockForStable) / BASE) +
                ((stableRatePremium * excessLoanRatio) / BASE);
        }
    }

    /**
     * @notice Internal function to update the parameters of the interest rate model
     * @param baseRatePerBlockForStable_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param multiplierPerBlock_ The rate the interest rate increases per utilization (scaled by BASE)
     * @param multiplierPerBlockForStable_ The rate of increase in interest rate with respect to utilization (scaled by BASE)
     * @param jumpMultiplierPerBlockForStable_ The multiplierPerBlock after hitting a specified utilization point
     * @param kink_ The utilization point where the jump multiplier is applied
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRate_ Optimal stable loan rate percentage.
     */
    function updateStableRateModelInternal(
        uint256 baseRatePerBlockForStable_,
        uint256 multiplierPerBlock_,
        uint256 multiplierPerBlockForStable_,
        uint256 jumpMultiplierPerBlockForStable_,
        uint256 kink_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRate_
    ) internal {
        baseRatePerBlockForStable = baseRatePerBlockForStable_ / blocksPerYear;
        multiplierPerBlock = (multiplierPerBlock_ * BASE) / (blocksPerYear * kink_);
        multiplierPerBlockForStable = (multiplierPerBlockForStable_ * BASE) / (blocksPerYear * kink_);
        jumpMultiplierPerBlockForStable = jumpMultiplierPerBlockForStable_ / blocksPerYear;
        kink = kink_;
        stableRatePremium = stableRatePremium_;
        optimalStableLoanRate = optimalStableLoanRate_;

        emit NewStableInterestParams(
            baseRatePerBlockForStable,
            multiplierPerBlock,
            multiplierPerBlockForStable,
            jumpMultiplierPerBlockForStable,
            kink,
            stableRatePremium,
            optimalStableLoanRate
        );
    }

    /**
     * @notice Calculates the difference of stableLoanRatio and the optimalStableLoanRate
     * @param loanRatio Stable loan ratio for stable borrows in the market
     * @return The difference between the stableLoanRatio and optimal loan rate as a mantissa between [0, BASE]
     */
    function calculateLoanRatioDiff(uint256 loanRatio) internal view returns (uint256) {
        if (loanRatio == 0) {
            return 0;
        }

        if (optimalStableLoanRate > loanRatio) {
            return 0;
        }

        return ((loanRatio - optimalStableLoanRate) * BASE) / (BASE - optimalStableLoanRate);
    }
}

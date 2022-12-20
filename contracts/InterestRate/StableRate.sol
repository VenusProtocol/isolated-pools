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

    /**
     * @notice The approximate number of blocks per year that is assumed by the interest rate model
     */
    uint256 public constant blocksPerYear = 2102400;

    /**
     * @notice The stable base interest rate which is the y-intercept when utilization rate is 0
     */
    uint256 public baseRatePerBlockForStable;

    /**
     * @notice The multiplier of utilization rate that gives the slope of the interest rate
     */
    uint256 public multiplierPerBlock;

    /**
     * @notice The multiplier of utilization rate that gives the slope of the stable interest rate
     */
    uint256 public multiplierPerBlockForStable;

    /**
     * @notice The multiplierPerBlock after hitting a specified utilization point for stable rate
     */
    uint256 public jumpMultiplierPerBlockForStable;

    /**
     * @notice The utilization point at which the jump multiplier is applied for stable rate
     */
    uint256 public kink;

    /**
     * @notice The premium rate applicable on optimal stable loan rate
     */
    uint256 public stableRatePremium;

    /**
     * @notice Optimal Stable Loan Rate
     */
    uint256 public optimalStableLoanRate;

    /**
     * @notice The address of the owner, i.e. the Timelock contract, which can update parameters directly
     */
    address public owner;

    /**
     * @param _baseRatePerBlockForStable The approximate target base APR, as a mantissa (scaled by BASE)
     * @param _multiplierPerBlock The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _multiplierPerBlockForStable The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _jumpMultiplierPerBlockForStable The multiplierPerBlock after hitting a specified utilization point
     * @param _kink The utilization point at which the jump multiplier is applied
     * @param _stableRatePremium The multiplierPerBlock after hitting a specified utilization point
     * @param _optimalStableLoanRate Optimal stable loan rate percentage.
     */
    constructor(
        uint256 _baseRatePerBlockForStable,
        uint256 _multiplierPerBlock,
        uint256 _multiplierPerBlockForStable,
        uint256 _jumpMultiplierPerBlockForStable,
        uint256 _kink,
        uint256 _stableRatePremium,
        uint256 _optimalStableLoanRate,
        address owner_
    ) {
        owner = owner_;

        updateStableRateModelInternal(
            _baseRatePerBlockForStable,
            _multiplierPerBlock,
            _multiplierPerBlockForStable,
            _jumpMultiplierPerBlockForStable,
            _kink,
            _stableRatePremium,
            _optimalStableLoanRate
        );
    }

    /**
     * @notice Update the parameters of the interest rate model (only callable by owner, i.e. Timelock)
     * @param _baseRatePerBlockForStable The approximate target base APR, as a mantissa (scaled by BASE)
     * @param _multiplierPerBlock The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _multiplierPerBlockForStable The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _jumpMultiplierPerBlockForStable The multiplierPerBlock after hitting a specified utilization point
     * @param _kink The utilization point at which the jump multiplier is applied
     * @param _stableRatePremium The multiplierPerBlock after hitting a specified utilization point
     * @param _optimalStableLoanRate Optimal stable loan rate percentage.
     */
    function updateStableRateModel(
        uint256 _baseRatePerBlockForStable,
        uint256 _multiplierPerBlock,
        uint256 _multiplierPerBlockForStable,
        uint256 _jumpMultiplierPerBlockForStable,
        uint256 _kink,
        uint256 _stableRatePremium,
        uint256 _optimalStableLoanRate
    ) external virtual {
        require(msg.sender == owner, "StableRateModel: only owner may call this function.");

        updateStableRateModelInternal(
            _baseRatePerBlockForStable,
            _multiplierPerBlock,
            _multiplierPerBlockForStable,
            _jumpMultiplierPerBlockForStable,
            _kink,
            _stableRatePremium,
            _optimalStableLoanRate
        );
    }

    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market (currently unused)
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
     * @notice Calculates the stable loan rate of the market: `stableborrows / totalborrows`
     * @param stableborrows The amount of stable borrows in the market
     * @param totalborrows The amount of total borrows in the market
     * @return The stable loan rate as a mantissa between [0, BASE]
     */
    function stableLoanRate(uint256 stableborrows, uint256 totalborrows) public pure returns (uint256) {
        // Loan rate is 0 when there are no stable borrows
        if (totalborrows == 0) {
            return 0;
        }

        return (stableborrows * BASE) / totalborrows;
    }

    /**
     * @notice Calculates the stable loan rate of the market: `stableborrows / totalborrows`
     * @param loanRate Loan rate for stable borrows in the market
     * @return The difference between the loan rate and optimal loan rate as a mantissa between [0, BASE]
     */
    function calculateLoanRateDiff(uint256 loanRate) internal view returns (uint256) {
        if (loanRate == 0) {
            return 0;
        }

        if (optimalStableLoanRate > loanRate) {
            return 0;
        }

        return ((loanRate - optimalStableLoanRate) * BASE) / (BASE - optimalStableLoanRate);
    }

    function getBorrowRate(
        uint256 cash,
        uint256 stableborrows,
        uint256 totalborrows,
        uint256 reserves
    ) external view returns (uint256) {
        uint256 util = utilizationRate(cash, totalborrows, reserves);
        uint256 loanRate = stableLoanRate(stableborrows, totalborrows);
        uint256 excessLoanRate = calculateLoanRateDiff(loanRate);

        if (util <= kink) {
            return
                ((util * multiplierPerBlock) / BASE) +
                baseRatePerBlockForStable +
                ((util * multiplierPerBlockForStable) / BASE) +
                ((stableRatePremium * excessLoanRate) / BASE);
        } else {
            uint256 excessUtil = util - kink;
            return
                ((kink * multiplierPerBlock) / BASE) +
                baseRatePerBlockForStable +
                ((kink * multiplierPerBlockForStable) / BASE) +
                ((excessUtil * jumpMultiplierPerBlockForStable) / BASE) +
                ((stableRatePremium * excessLoanRate) / BASE);
        }
    }

    /**
     * @notice Internal function to update the parameters of the interest rate model
     * @param _baseRatePerBlockForStable The approximate target base APR, as a mantissa (scaled by BASE)
     * @param _multiplierPerBlock The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _multiplierPerBlockForStable The rate of increase in interest rate wrt utilization (scaled by BASE)
     * @param _jumpMultiplierPerBlockForStable The multiplierPerBlock after hitting a specified utilization point
     * @param _kink The utilization point at which the jump multiplier is applied
     * @param _stableRatePremium The multiplierPerBlock after hitting a specified utilization point
     * @param _optimalStableLoanRate Optimal stable loan rate percentage.
     */
    function updateStableRateModelInternal(
        uint256 _baseRatePerBlockForStable,
        uint256 _multiplierPerBlock,
        uint256 _multiplierPerBlockForStable,
        uint256 _jumpMultiplierPerBlockForStable,
        uint256 _kink,
        uint256 _stableRatePremium,
        uint256 _optimalStableLoanRate
    ) internal {
        baseRatePerBlockForStable = _baseRatePerBlockForStable / blocksPerYear;
        multiplierPerBlock = (_multiplierPerBlock * BASE) / (blocksPerYear * _kink);
        multiplierPerBlockForStable = (_multiplierPerBlockForStable * BASE) / (blocksPerYear * _kink);
        jumpMultiplierPerBlockForStable = _jumpMultiplierPerBlockForStable / blocksPerYear;
        kink = _kink;
        stableRatePremium = _stableRatePremium;
        optimalStableLoanRate = _optimalStableLoanRate;

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
}

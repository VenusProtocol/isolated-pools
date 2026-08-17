// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { ComptrollerInterface, Action } from "../ComptrollerInterface.sol";
import { VToken } from "../VToken.sol";

/**
 * @title SpokeComptrollerInterface
 * @author Venus
 * @notice Interface implemented by the `SpokeComptroller` contract. It declares the events and errors that make up the
 * contract's observable surface, so integrators and off-chain consumers can decode them without depending on the
 * implementation.
 */
interface SpokeComptrollerInterface is ComptrollerInterface {
    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken indexed vToken, address indexed account);

    /// @notice Emitted when an account exits a market
    event MarketExited(VToken indexed vToken, address indexed account);

    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint256 oldCloseFactorMantissa, uint256 newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(VToken vToken, uint256 oldCollateralFactorMantissa, uint256 newCollateralFactorMantissa);

    /// @notice Emitted when liquidation threshold is changed by admin
    event NewLiquidationThreshold(
        VToken vToken,
        uint256 oldLiquidationThresholdMantissa,
        uint256 newLiquidationThresholdMantissa
    );

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(uint256 oldLiquidationIncentiveMantissa, uint256 newLiquidationIncentiveMantissa);

    /// @notice Emitted when the liquidation incentive of a single market is changed by admin
    event NewMarketLiquidationIncentive(
        address indexed vToken,
        uint256 oldLiquidationIncentiveMantissa,
        uint256 newLiquidationIncentiveMantissa
    );

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(ResilientOracleInterface oldPriceOracle, ResilientOracleInterface newPriceOracle);

    /// @notice Emitted when the deviation-bounded oracle is changed
    event NewDeviationBoundedOracle(IDeviationBoundedOracle oldBoundedOracle, IDeviationBoundedOracle newBoundedOracle);

    /// @notice Emitted when an action is paused on a market
    event ActionPausedMarket(VToken vToken, Action action, bool pauseState);

    /// @notice Emitted when borrow cap for a vToken is changed
    event NewBorrowCap(VToken indexed vToken, uint256 newBorrowCap);

    /// @notice Emitted when the collateral threshold (in USD) for non-batch liquidations is changed
    event NewMinLiquidatableCollateral(uint256 oldMinLiquidatableCollateral, uint256 newMinLiquidatableCollateral);

    /// @notice Emitted when supply cap for a vToken is changed
    event NewSupplyCap(VToken indexed vToken, uint256 newSupplyCap);

    /// @notice Emitted when a rewards distributor is added
    event NewRewardsDistributor(address indexed rewardsDistributor, address indexed rewardToken);

    /// @notice Emitted when a market is supported
    event MarketSupported(VToken vToken);

    /// @notice Emitted when forced liquidation is enabled or disabled for a market
    event IsForcedLiquidationEnabledUpdated(address indexed vToken, bool enable);

    /// @notice Emitted when a market is unlisted
    event MarketUnlisted(address indexed vToken);

    /// @notice Emitted when the borrowing or redeeming delegate rights are updated for an account
    event DelegateUpdated(address indexed approver, address indexed delegate, bool approved);

    /// @notice Emitted when a market's supply allowlist is enabled or disabled
    event SupplyAllowlistEnabledUpdated(address indexed vToken, bool enabled);

    /// @notice Emitted when an account is added to or removed from a market's supply allowlist
    event AllowedSupplierUpdated(address indexed vToken, address indexed supplier, bool allowed);

    /// @notice Emitted when the pool's liquidation allowlist is enabled or disabled
    event LiquidationAllowlistEnabledUpdated(bool enabled);

    /// @notice Emitted when an account is added to or removed from the pool's liquidation allowlist
    event AllowedLiquidatorUpdated(address indexed liquidator, bool allowed);

    /// @notice Thrown when the close factor is outside the bounds set by `MIN_CLOSE_FACTOR_MANTISSA` and
    ///   `MAX_CLOSE_FACTOR_MANTISSA`
    error InvalidCloseFactor();

    /// @notice Thrown when collateral factor exceeds the upper bound
    error InvalidCollateralFactor();

    /// @notice Thrown when liquidation threshold exceeds the collateral factor
    error InvalidLiquidationThreshold();

    /// @notice Thrown when a liquidation incentive is below 1e18, which would seize less value than was repaid
    error InvalidLiquidationIncentive();

    /// @notice Thrown when the action is only available to specific sender, but the real sender was different
    error UnexpectedSender(address expectedSender, address actualSender);

    /// @notice Thrown when the oracle returns an invalid price for some asset
    error PriceError(address vToken);

    /// @notice Thrown if VToken unexpectedly returned a nonzero error code while trying to get account snapshot
    error SnapshotError(address vToken, address user);

    /// @notice Thrown when the market is not listed
    error MarketNotListed(address market);

    /// @notice Thrown when a market has an unexpected comptroller
    error ComptrollerMismatch();

    /// @notice Thrown when user is not member of market
    error MarketNotCollateral(address vToken, address user);

    /// @notice Thrown when borrow action is not paused
    error BorrowActionNotPaused();

    /// @notice Thrown when mint action is not paused
    error MintActionNotPaused();

    /// @notice Thrown when redeem action is not paused
    error RedeemActionNotPaused();

    /// @notice Thrown when repay action is not paused
    error RepayActionNotPaused();

    /// @notice Thrown when seize action is not paused
    error SeizeActionNotPaused();

    /// @notice Thrown when exit market action is not paused
    error ExitMarketActionNotPaused();

    /// @notice Thrown when transfer action is not paused
    error TransferActionNotPaused();

    /// @notice Thrown when enter market action is not paused
    error EnterMarketActionNotPaused();

    /// @notice Thrown when liquidate action is not paused
    error LiquidateActionNotPaused();

    /// @notice Thrown when borrow cap is not zero
    error BorrowCapIsNotZero();

    /// @notice Thrown when supply cap is not zero
    error SupplyCapIsNotZero();

    /// @notice Thrown when collateral factor is not zero
    error CollateralFactorIsNotZero();

    /**
     * @notice Thrown during the liquidation if user's total collateral amount is lower than
     *   a predefined threshold. In this case only batch liquidations (either liquidateAccount
     *   or healAccount) are available.
     */
    error MinimalCollateralViolated(uint256 expectedGreaterThan, uint256 actual);

    /**
     * @notice Thrown by `healAccount` when a value that had to stay at or below a threshold exceeded it, either the
     *   account's total collateral against `minLiquidatableCollateral`, or `maxClearableDebt` against the account's
     *   total borrows. In the second case the collateral covers the whole debt, so `liquidateAccount` has to be used.
     */
    error CollateralExceedsThreshold(uint256 expectedLessThanOrEqualTo, uint256 actual);

    /// @notice Thrown when an account's debt is too large for its collateral to clear, so `healAccount` has to be
    ///   used instead of `liquidateAccount`. Reports the debt and the largest debt the collateral could have cleared.
    error InsufficientCollateral(uint256 borrows, uint256 maxClearableDebt);

    /// @notice Thrown when the account doesn't have enough liquidity to redeem or borrow
    error InsufficientLiquidity();

    /// @notice Thrown when trying to liquidate a healthy account
    error InsufficientShortfall();

    /// @notice Thrown if the liquidation allowlist is enabled and the account liquidating is not on it
    error LiquidationNotAllowed(address liquidator);

    /// @notice Thrown when trying to repay more than allowed by close factor
    error TooMuchRepay();

    /// @notice Thrown if the user is trying to exit a market in which they have an outstanding debt
    error NonzeroBorrowBalance();

    /// @notice Thrown if a debt remains in any of the borrower's markets once every liquidation order has been
    ///   executed, which means the orders passed to `liquidateAccount` did not cover the whole position
    error NonzeroBorrowBalanceAfterLiquidation();

    /// @notice Thrown when trying to perform an action that is paused
    error ActionPaused(address market, Action action);

    /// @notice Thrown when trying to add a market that is already listed
    error MarketAlreadyListed(address market);

    /// @notice Thrown when the market being listed does not identify itself as a VToken
    error InvalidVToken();

    /// @notice Thrown when an array argument is empty, or when two array arguments have different lengths
    error InvalidArrayLength();

    /// @notice Thrown if the supply cap is exceeded
    error SupplyCapExceeded(address market, uint256 cap);

    /// @notice Thrown if the account being credited with the minted vTokens is not on the market's supply allowlist
    error SupplyNotAllowed(address market, address supplier);

    /// @notice Thrown if the borrow cap is exceeded
    error BorrowCapExceeded(address market, uint256 cap);

    /// @notice Thrown if delegate approval status is already set to the requested value
    error DelegationStatusUnchanged();

    /// @notice Thrown when adding a rewards distributor that this pool already has
    error RewardsDistributorAlreadyExists();
}

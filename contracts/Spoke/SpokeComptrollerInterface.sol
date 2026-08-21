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
 * @dev The getters this fork adds are declared separately, in `SpokeComptrollerViewInterface` below. They cannot live
 * here: `SpokeComptroller` implements this interface, and it serves those getters from public variables declared in
 * `SpokeComptrollerStorage`, which is a sibling base rather than a derived one. Solidity will not let a public
 * variable in one base satisfy a function declared in another, so declaring them here would force
 * `SpokeComptrollerStorage` to inherit this interface and mark six variables `override` - noise in the file that has
 * to be diffed by hand against `ComptrollerStorage`, for no gain over a standalone view interface.
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

    /// @notice Thrown when a liquidation incentive is low enough that a liquidator would seize less value than it
    ///   repaid: below `1e18 + protocolSeizeShareMantissa` for a single market, below
    ///   `MIN_POOL_LIQUIDATION_INCENTIVE_MANTISSA` for the pool-wide fallback
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
     * @notice Thrown by the batch operations when the account's total collateral is above
     *   `minLiquidatableCollateral`, which means it is large enough for a regular `VToken.liquidateBorrow`
     * @dev Same name, arguments and meaning as the shared `Comptroller`, so a decoder written against either one
     *   reads this correctly.
     */
    error CollateralExceedsThreshold(uint256 expectedLessThanOrEqualTo, uint256 actual);

    /// @notice Thrown by `healAccount` when the collateral can clear the whole debt at each market's own liquidation
    ///   incentive, so healing would forgive nothing and `liquidateAccount` has to be used instead
    error CollateralCoversDebt(uint256 borrows, uint256 maxClearableDebt);

    /// @notice Thrown by `liquidateAccount` when the debt is too large for the collateral to clear, so `healAccount`
    ///   has to be used instead. Reports the debt and the largest debt the collateral could have cleared.
    /// @dev Deliberately not the shared `Comptroller`'s `InsufficientCollateral`: both arguments here are debt values
    ///   rather than collateral values, and reusing that name would leave the two versions sharing one selector.
    error DebtExceedsClearableAmount(uint256 borrows, uint256 maxClearableDebt);

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

/**
 * @title SpokeComptrollerViewInterface
 * @author Venus
 * @notice The getters `SpokeComptroller` adds on top of the pooled `Comptroller`, for integrators that read this pool
 * rather than implement it - the Liquidity Hub's spoke adapter, lenses, keepers and VIP tooling.
 * @dev Standalone and not implemented by `SpokeComptroller`, matching how `ComptrollerViewInterface` exposes the
 * shared pool's getters.
 *
 * Scope is the supply side: what an integrator that funds this pool has to read before and while it supplies, plus
 * the two allowlists and the per-market discount that only exist on this fork. `supplyCaps` and `actionPaused` are
 * repeated from `ComptrollerViewInterface` and `ComptrollerInterface` rather than inherited, so that a consumer of a
 * spoke pool needs one import and not three. `actionPaused` also has to be repeated on its own terms: the shared
 * declaration types its second argument as the `Action` enum, and a consumer that does not want this repo's enum in
 * its build needs the ABI-equivalent `uint8` form. The two share a selector, so they cannot both be declared in one
 * inheritance chain - which is the reason this interface inherits nothing.
 *
 * Anything else the fork shares with the pooled `Comptroller` - `borrowCaps`, `markets`, `oracle`,
 * `closeFactorMantissa`, `minLiquidatableCollateral` - is read through `ComptrollerViewInterface` as usual.
 */
interface SpokeComptrollerViewInterface {
    /**
     * @notice The most underlying a market will hold before it stops accepting supply
     * @dev `type(uint256).max` disables the check. Zero is a real cap of zero rather than an "unset" sentinel:
     *   `preMintHook` compares `nextTotalSupply > supplyCap`, so a market left at zero rejects every mint.
     * @param vToken The market to query
     * @return cap The market's supply cap, in underlying units
     */
    function supplyCaps(address vToken) external view returns (uint256 cap);

    /**
     * @notice Whether a market accepts supply only from the accounts on its supply allowlist
     * @dev Enforced in `preMintHook` alone. Redeeming is never restricted, and a market that has never had this
     *   enabled accepts supply from anyone.
     * @param vToken The market to read the setting of
     * @return enabled True if the market's supply allowlist is armed
     */
    function isSupplyAllowlistEnabled(address vToken) external view returns (bool enabled);

    /**
     * @notice Whether an account may supply to a market while that market's supply allowlist is enabled
     * @dev The account this meters is the one CREDITED with the newly minted vTokens, not the one paying for them:
     *   `mintBehalf` lets a third party fund a mint attributed to someone else, and metering the recipient is what
     *   bounds the market's supply.
     * @param vToken The market whose allowlist to read
     * @param supplier The account to test
     * @return allowed True if `supplier` may be credited with this market's vTokens
     */
    function isAllowedSupplier(address vToken, address supplier) external view returns (bool allowed);

    /**
     * @notice Whether seizing collateral in this pool is restricted to the accounts on the liquidation allowlist
     * @dev Pool-wide rather than per market, because `healAccount` seizes across every market the borrower is in and
     *   so cannot attribute a seizure to a single one of them.
     * @return enabled True if the pool's liquidation allowlist is armed
     */
    function isLiquidationAllowlistEnabled() external view returns (bool enabled);

    /**
     * @notice Whether an account may seize collateral in this pool while the liquidation allowlist is enabled
     * @param liquidator The account to test
     * @return allowed True if `liquidator` may seize collateral in this pool
     */
    function isAllowedLiquidator(address liquidator) external view returns (bool allowed);

    /**
     * @notice The discount a market has of its own, or zero when it takes the pool-wide one
     * @dev Zero is the "unset" sentinel rather than a real discount. Read `effectiveLiquidationIncentive` to get the
     *   value that actually applies to a market.
     * @param vToken The collateral market to read the discount of
     * @return incentiveMantissa The market's own discount scaled by 1e18, or zero if it has none
     */
    function liquidationIncentives(address vToken) external view returns (uint256 incentiveMantissa);

    /**
     * @notice The discount that applies to a market: its own if it has one, otherwise the pool-wide value
     * @param vToken The collateral market to read the discount of
     * @return incentiveMantissa The discount that prices this market's collateral, scaled by 1e18
     */
    function effectiveLiquidationIncentive(address vToken) external view returns (uint256 incentiveMantissa);

    /**
     * @notice The oracle that bounds an asset's price against a recent window
     * @dev Read only where the collateral factor weights a position. The liquidation-threshold paths stay on the
     *   `oracle`, because they route liquidations. Zero until governance sets it, and while it is zero borrowing and
     *   redeeming fail closed.
     * @return boundedOracle The deviation-bounded oracle this pool prices borrowing capacity through
     */
    function deviationBoundedOracle() external view returns (IDeviationBoundedOracle boundedOracle);

    /**
     * @notice Whether an action is paused on a market
     * @dev Typed as `uint8` rather than `Action` so that a consumer can read this without importing the enum. The
     *   encoding is identical; the deployed ordering is
     *   `{ MINT, REDEEM, BORROW, REPAY, SEIZE, LIQUIDATE, TRANSFER, ENTER_MARKET, EXIT_MARKET }`.
     * @param market The market to query
     * @param action The action, as its position in `Action`
     * @return paused True if the action is paused on this market
     */
    function actionPaused(address market, uint8 action) external view returns (bool paused);
}

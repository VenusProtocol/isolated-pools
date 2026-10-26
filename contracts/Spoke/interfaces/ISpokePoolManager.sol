// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ISpokeBondManager } from "./ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "./ISpokePoolProposalBuilder.sol";
import { ITierRegistry } from "./ITierRegistry.sol";
import { IRiskOracle } from "./external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "./external/IRiskStewardReceiver.sol";

/**
 * @title ISpokePoolManager
 * @author Venus
 * @notice Functions, events and errors of `SpokePoolManager`
 */
interface ISpokePoolManager {
    /// @notice What a request asks for
    enum RequestType {
        Pool,
        Markets,
        Tier
    }

    /// @notice Lifecycle of a request
    enum RequestStatus {
        None,
        Pending,
        Built,
        Rejected,
        Settled,
        Canceled
    }

    /// @notice Lifecycle of a pool
    enum PoolStatus {
        None,
        Live,
        ExitRequested,
        ExitProposed,
        WindingDown,
        Closed,
        HandedOver
    }

    /// @notice A collateral asset's Chainlink-compatible feed and the oracle it is set on
    struct OracleFeed {
        address oracle;
        address feed;
    }

    /// @notice A new collateral market's parameters set by the deployer
    struct CollateralMarketRequestParams {
        address asset;
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        // In the asset's units
        uint256 supplyCap;
        // The asset's feeds in the ResilientOracle's order: main, pivot, fallback, each on its own supported oracle. The VIP
        // sets them unless the ResilientOracle prices the asset already; the main feed is required then, the pivot and
        // fallback are optional, a zero feed leaving that slot unused
        OracleFeed[3] feeds;
    }

    /// @notice A new loan market's parameters set by the deployer; its caps come from its tier
    struct LoanMarketRequestParams {
        address asset;
        // One its tier allows for the asset
        address interestRateModel;
    }

    /// @notice A pool request's parameters set by the deployer, besides its markets
    struct PoolRequestParams {
        uint256 tierId;
        string poolName;
        // One the bond manager allows
        address bondAsset;
        uint256 bondAmount;
    }

    /// @notice A new market's parameters set by Venus
    struct ProtocolMarketParams {
        address collateralInterestRateModel;
        uint256 reserveFactor;
        uint256 reduceReservesBlockDelta;
        // A new collateral asset's oracle configs: its feeds' staleness limit, in seconds, set unless the ResilientOracle
        // prices the asset already, and its DeviationBoundedOracle config, set unless that oracle has the asset already
        uint256 maxStalePeriod;
        uint64 cooldownPeriod;
        uint256 triggerThreshold;
        uint256 resetThreshold;
        // The most the main or fallback price may deviate from the price it is checked against, scaled by 1e18, set on
        // the BoundValidator when a pivot or fallback feed is set; 0.05e18 is 5%
        uint256 boundDeviation;
    }

    /// @notice A new pool's comptroller parameters
    struct PoolParams {
        uint256 closeFactor;
        uint256 liquidationIncentive;
        uint256 minLiquidatableCollateral;
    }

    /// @notice A deployer's request; only the fields of its type are set
    struct Request {
        RequestType requestType;
        RequestStatus status;
        address deployer;
        // Zero for a pool request until its first build
        address comptroller;
        // Pool: the requested tier; markets: the pool's tier; tier: the target tier
        uint256 tierId;
        // The latest build; zero when there is none or after an oracle feed update
        uint256 buildId;
        // Pool requests only
        string poolName;
        address bondAsset;
        uint256 bondAmount;
        // Pool and markets requests
        CollateralMarketRequestParams[] collateralMarkets;
        LoanMarketRequestParams[] loanMarkets;
        // Each new market's escrowed seed, in its asset: the collateral markets', then the loan markets'
        uint256[] seeds;
    }

    /// @notice A pool created through the manager
    struct Pool {
        address deployer;
        PoolStatus status;
        bool deployerPaused;
        uint64 windDownStartedAt;
        // The deployer's changes are checked against this tier's current terms
        uint256 tierId;
        // The latest exit build; zero when there is none or after rejectExit
        uint256 exitBuildId;
    }

    /**
     * @notice Emitted when a deployer submits a request
     * @param requestId The request
     * @param requestType What the request asks for
     * @param deployer The deployer
     * @param comptroller The pool's comptroller; zero for a new pool
     */
    event RequestSubmitted(
        uint256 indexed requestId,
        RequestType requestType,
        address indexed deployer,
        address indexed comptroller
    );

    /**
     * @notice Emitted when a deployer cancels its request
     * @param requestId The request
     */
    event RequestCanceled(uint256 indexed requestId);

    /**
     * @notice Emitted when the Venus team replaces a request's collateral market oracle feeds
     * @param requestId The request
     * @param asset The collateral market's asset
     * @param feeds The new feeds: main, pivot, fallback; a zero feed for no pivot or fallback
     */
    event OracleFeedsUpdated(uint256 indexed requestId, address indexed asset, OracleFeed[3] feeds);

    /**
     * @notice Emitted when a request's VIP payload is built and stored
     * @param requestId The request
     * @param buildId The build
     * @param vTokens The markets deployed for it: the collateral markets', then the loan markets'
     */
    event RequestBuilt(uint256 indexed requestId, uint256 buildId, address[] vTokens);

    /**
     * @notice Emitted when a new pool goes live and its deployer's rights start
     * @param requestId The pool's request
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     */
    event PoolActivated(uint256 indexed requestId, address indexed comptroller, address indexed deployer);

    /**
     * @notice Emitted when a pool moves to a higher tier
     * @param comptroller The pool's comptroller
     * @param oldTierId The previous tier
     * @param newTierId The new tier
     */
    event PoolTierUpgraded(address indexed comptroller, uint256 oldTierId, uint256 newTierId);

    /**
     * @notice Emitted when a request is settled by its VIP
     * @param requestId The request
     * @param comptroller The pool's comptroller
     */
    event RequestSettled(uint256 indexed requestId, address indexed comptroller);

    /**
     * @notice Emitted when the Venus team rejects a request
     * @param requestId The request
     */
    event RequestRejected(uint256 indexed requestId);

    /**
     * @notice Emitted when a deployer asks to exit its pool
     * @param comptroller The pool's comptroller
     */
    event ExitRequested(address indexed comptroller);

    /**
     * @notice Emitted when a pool's exit VIP payload is built and stored
     * @param comptroller The pool's comptroller
     * @param buildId The build
     */
    event ExitBuilt(address indexed comptroller, uint256 buildId);

    /**
     * @notice Emitted when a pool's exit VIP starts its wind-down
     * @param comptroller The pool's comptroller
     */
    event WindDownStarted(address indexed comptroller);

    /**
     * @notice Emitted when a pool's force-close VIP payload is built and stored
     * @param comptroller The pool's comptroller
     */
    event ForceCloseBuilt(address indexed comptroller);

    /**
     * @notice Emitted when a winding-down pool is closed
     * @param comptroller The pool's comptroller
     */
    event PoolClosed(address indexed comptroller);

    /**
     * @notice Emitted when the Venus team turns down a pool's exit request or built exit VIP
     * @param comptroller The pool's comptroller
     */
    event ExitRejected(address indexed comptroller);

    /**
     * @notice Emitted when a pool is handed over to governance
     * @param comptroller The pool's comptroller
     */
    event PoolHandedOver(address indexed comptroller);

    /**
     * @notice Emitted when a pool's deployer is paused or unpaused
     * @param comptroller The pool's comptroller
     * @param paused Whether the deployer is paused
     */
    event DeployerPausedUpdated(address indexed comptroller, bool paused);

    /**
     * @notice Emitted when the proposal builder is changed
     * @param oldProposalBuilder The previous builder
     * @param newProposalBuilder The new builder
     */
    event ProposalBuilderUpdated(
        ISpokePoolProposalBuilder indexed oldProposalBuilder,
        ISpokePoolProposalBuilder indexed newProposalBuilder
    );

    /**
     * @notice Emitted when the bond manager is set
     * @param newBondManager The bond manager
     */
    event BondManagerSet(ISpokeBondManager indexed newBondManager);

    /**
     * @notice Emitted when an asset's Hub YieldGroup is changed
     * @param asset The loan asset
     * @param oldYieldGroup The previous YieldGroup
     * @param newYieldGroup The new YieldGroup
     */
    event HubYieldGroupUpdated(address indexed asset, address oldYieldGroup, address newYieldGroup);

    /**
     * @notice Emitted when the oracles new collateral feeds may be set on are changed
     * @param oldOracles The previous oracles
     * @param newOracles The new oracles
     */
    event SupportedOraclesUpdated(address[3] oldOracles, address[3] newOracles);

    /**
     * @notice Emitted when the parameters of new pools are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event PoolParamsUpdated(PoolParams oldParams, PoolParams newParams);

    /**
     * @notice Emitted when Venus's parameters of new markets are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event MarketParamsUpdated(ProtocolMarketParams oldParams, ProtocolMarketParams newParams);

    /**
     * @notice Emitted when the wind-down period is changed
     * @param oldWindDownPeriod The previous period, in seconds
     * @param newWindDownPeriod The new period, in seconds
     */
    event WindDownPeriodUpdated(uint256 oldWindDownPeriod, uint256 newWindDownPeriod);

    /**
     * @notice Emitted when the residual debt a closing pool may hold is changed
     * @param oldMaxResidualPoolDebtUsd The previous maximum, in USD
     * @param newMaxResidualPoolDebtUsd The new maximum, in USD
     */
    event MaxResidualPoolDebtUsdUpdated(uint256 oldMaxResidualPoolDebtUsd, uint256 newMaxResidualPoolDebtUsd);

    /**
     * @notice Emitted when tokens held by the manager are swept
     * @param token The token
     * @param to The receiver
     * @param amount The amount
     */
    event SweepToken(address indexed token, address indexed to, uint256 amount);

    /**
     * @notice Thrown when a RiskStewardReceiver reads another RiskOracle
     * @param receiver The receiver
     */
    error InvalidRiskStewardReceiver(address receiver);

    /**
     * @notice Thrown when a deployer requests a pool while it has an active one
     * @param deployer The deployer
     */
    error ActivePoolExists(address deployer);

    /**
     * @notice Thrown when a tier is disabled
     * @param tierId The tier
     */
    error TierDisabled(uint256 tierId);

    /**
     * @notice Thrown when the bond manager does not allow a bond asset
     * @param asset The bond asset
     */
    error InvalidBondAsset(address asset);

    /**
     * @notice Thrown when a bond is worth less than the tier requires
     * @param bondUsd The bond's value, in USD
     * @param requiredBondUsd The required bond, in USD
     */
    error InsufficientBondValue(uint256 bondUsd, uint256 requiredBondUsd);

    /// @notice Thrown when a request has no market
    error InvalidArrayLength();

    /**
     * @notice Thrown when a pool would have more markets than the builder's `MAX_POOL_MARKETS`, or more collateral
     *   markets than its tier allows
     * @param marketCount The markets
     * @param maxMarketCount The maximum
     */
    error TooManyMarkets(uint256 marketCount, uint256 maxMarketCount);

    /**
     * @notice Thrown when a market's asset is already in the request or the pool
     * @param asset The asset
     */
    error DuplicateAsset(address asset);

    /**
     * @notice Thrown when a collateral market's collateral factor is above its liquidation threshold, a seed is above its
     *   market's supply cap, or a request has no collateral market of the asset
     * @param asset The market's asset
     */
    error InvalidMarketParams(address asset);

    /**
     * @notice Thrown when a loan market's asset is not one the tier offers
     * @param asset The market's asset
     */
    error LoanAssetNotAllowed(address asset);

    /**
     * @notice Thrown when a loan market's interest rate model is not one its tier allows for its asset
     * @param interestRateModel The interest rate model
     */
    error InterestRateModelNotAllowed(address interestRateModel);

    /**
     * @notice Thrown when a value is above the limits of the pool's tier
     * @param vToken The market, or a new market's asset
     */
    error ExceedsTierLimit(address vToken);

    /**
     * @notice Thrown when the caller already has an open request
     * @param requestId The open request
     */
    error OpenRequestExists(uint256 requestId);

    /**
     * @notice Thrown when a transfer delivers a different amount than requested
     * @param token The token
     */
    error TransferAmountMismatch(address token);

    /**
     * @notice Thrown when the caller is not the deployer of the pool or request
     * @param caller The caller
     */
    error NotDeployer(address caller);

    /**
     * @notice Thrown when a pool is not in a status the function accepts
     * @param comptroller The pool's comptroller
     */
    error InvalidPoolStatus(address comptroller);

    /**
     * @notice Thrown while a pool's deployer is paused
     * @param comptroller The pool's comptroller
     */
    error DeployerPaused(address comptroller);

    /**
     * @notice Thrown when a tier is not an upgrade of the pool's tier
     * @param fromTierId The pool's tier
     * @param toTierId The target tier
     */
    error NotAnUpgrade(uint256 fromTierId, uint256 toTierId);

    /**
     * @notice Thrown when a request is not in a status the function accepts
     * @param requestId The request
     */
    error InvalidRequestStatus(uint256 requestId);

    /// @notice Thrown when pool parameters are outside the bounds the comptroller accepts
    error InvalidPoolParams();

    /**
     * @notice Thrown when a collateral asset has no main feed, its main feed has no live positive answer, two of its
     *   feeds share an oracle, or it has a fallback feed without a pivot feed
     * @param asset The asset
     */
    error InvalidOracleFeed(address asset);

    /**
     * @notice Thrown when a collateral asset's feed is set on an oracle the manager does not support
     * @param oracle The oracle
     */
    error UnsupportedOracle(address oracle);

    /**
     * @notice Thrown when a VIP carries a build that is not the latest
     * @param buildId The build
     */
    error InvalidBuild(uint256 buildId);

    /**
     * @notice Thrown when a market is not listed in the pool
     * @param vToken The market
     */
    error MarketNotListed(address vToken);

    /**
     * @notice Thrown when a deployer control targets a loan market
     * @param vToken The market
     */
    error InvalidMarketType(address vToken);

    /**
     * @notice Thrown when an earlier update of the same kind for a market can still be applied
     * @param vToken The market
     */
    error PreviousUpdatePending(address vToken);

    /**
     * @notice Thrown when a collateral factor is above its liquidation threshold, or the threshold would go down
     * @param vToken The market
     */
    error InvalidCollateralFactors(address vToken);

    /**
     * @notice Thrown when an update would leave a market's values unchanged, which the Risk Steward refuses
     * @param vToken The market
     */
    error RedundantUpdate(address vToken);

    /**
     * @notice Thrown when a pool's bond covers less than its tier's minimum coverage ratio
     * @param coverage The bond's value to required bond ratio, scaled by 1e18
     * @param minCoverageRatio The tier's minimum, scaled by 1e18
     */
    error CoverageTooLow(uint256 coverage, uint256 minCoverageRatio);

    /// @notice Thrown when a force close is built before the wind-down period has elapsed
    error WindDownPeriodNotElapsed();

    /**
     * @notice Thrown when a pool's borrows and bad debt exceed `maxResidualPoolDebtUsd`
     * @param debtUsd The borrows and bad debt, in USD
     */
    error ResidualDebtExceeded(uint256 debtUsd);

    /// @notice Thrown when the bond manager is already set
    error BondManagerAlreadySet();

    /**
     * @notice Thrown when a bond manager serves another manager
     * @param bondManager The bond manager
     */
    error InvalidBondManager(address bondManager);

    /**
     * @notice Thrown when Venus's market parameters have a zero model, block delta, staleness limit or bound deviation, a
     *   reserve factor above 1e18, or a bound deviation of 1e18 or above
     */
    error InvalidProtocolMarketParams();

    /**
     * @notice Thrown when the manager holds less than the amount beyond its escrowed bonds and seeds
     * @param token The token
     * @param amount The amount
     */
    error InsufficientAmount(address token, uint256 amount);

    /**
     * @notice Requests a new pool of a tier, pulling the bond and each market's seed worth $10; both are refunded on
     *   reject or cancel
     * @param pool The requested tier, the pool's name and the bond
     * @param collateralMarkets The pool's collateral markets
     * @param loanMarkets The pool's loan markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error ActivePoolExists is thrown while the caller has an active pool
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error TierDisabled is thrown when the tier is disabled
     * @custom:error InvalidBondAsset is thrown when the bond manager does not allow the bond asset
     * @custom:error InsufficientBondValue is thrown when the bond is worth less than the tier requires
     * @custom:error CoverageTooLow is thrown when the bond is worth less than the tier's minimum coverage ratio of it
     * @custom:error TransferAmountMismatch is thrown when a transfer delivers a different amount
     * @custom:error The `SpokePoolRequestLib._validateMarkets` errors
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when a collateral supply cap is worth more than the tier allows
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:access Not restricted
     */
    function requestPool(
        PoolRequestParams calldata pool,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests new markets in the caller's pool, pulling each one's seed worth $10
     * @param comptroller The pool's comptroller
     * @param collateralMarkets The new collateral markets
     * @param loanMarkets The new loan markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error InsufficientBondValue is thrown when the bond's principal is worth less than the tier requires
     * @custom:error CoverageTooLow is thrown when the bond covers less than the tier's minimum coverage ratio
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:error The `SpokePoolRequestLib._validateMarkets` errors
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when a collateral supply cap is worth more than the tier allows
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:access Only the pool's deployer
     */
    function requestNewMarkets(
        address comptroller,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests moving the caller's pool to a higher tier; top up the bond with `topUpBond` first
     * @param comptroller The pool's comptroller
     * @param tierId The target tier
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error NotAnUpgrade is thrown when the target tier is not an upgrade of the pool's tier
     * @custom:error InsufficientBondValue is thrown when the bond's principal is worth less than the target tier
     *   requires
     * @custom:error CoverageTooLow is thrown when the bond covers less than the target tier's minimum coverage ratio
     * @custom:access Only the pool's deployer
     */
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId);

    /**
     * @notice Cancels the caller's request before it is built, refunding its bond and seeds
     * @param requestId The request
     * @custom:event Emits RequestCanceled
     * @custom:error NotDeployer is thrown when the caller is not the request's deployer
     * @custom:error InvalidRequestStatus is thrown when the request is not pending
     * @custom:access Only the request's deployer
     */
    function cancelRequest(uint256 requestId) external;

    /**
     * @notice Replaces a pending or built request's collateral market oracle feeds without the deployer's approval; a
     *   built request goes back to pending, so its VIP no longer settles
     * @param requestId The request
     * @param asset The collateral market's asset
     * @param feeds The new feeds: main, pivot, fallback, each on its own supported oracle; a zero feed for no pivot or
     *   fallback
     * @custom:event Emits OracleFeedsUpdated
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:error InvalidMarketParams is thrown when the request has no collateral market of the asset
     * @custom:error InvalidOracleFeed is thrown when an unpriced asset's new main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when the supply cap, priced again, is worth more than the tier allows
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function setOracleFeeds(uint256 requestId, address asset, OracleFeed[3] calldata feeds) external;

    /**
     * @notice Builds a pending or built request's VIP under a new build id. For a pool or markets request it checks the
     *   markets again without prices, then pulls from the deployer what each seed now lacks of $10. The bond and the
     *   supply caps were priced at request and are not priced again
     * @param requestId The request
     * @param description The VIP's description
     * @custom:event Emits RequestBuilt
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:error InvalidPoolStatus is thrown when a markets or tier request's pool is not live
     * @custom:error The `SpokePoolRequestLib._validateMarkets` errors
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:error The builder's `buildRequestProposal` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function buildRequestProposal(uint256 requestId, string calldata description) external;

    /**
     * @notice Settles a request from its VIP, sending the seeds to the caller to list the markets with
     * @param requestId The request
     * @param buildId The build the VIP carries; only the latest settles
     * @custom:event Emits PoolActivated for a pool request, PoolTierUpgraded for a tier request, and RequestSettled
     * @custom:error InvalidBuild is thrown when the request is not built, or not with this build
     * @custom:error InvalidPoolStatus is thrown when a markets or tier request's pool is not live
     * @custom:error The bond manager's `createBond` errors
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function settleRequest(uint256 requestId, uint256 buildId) external;

    /**
     * @notice Rejects a request and refunds its bond and seeds; a VIP already built for it then reverts
     * @param requestId The request
     * @custom:event Emits RequestRejected
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function rejectRequest(uint256 requestId) external;

    /**
     * @notice Publishes a collateral market's new collateral factor and liquidation threshold to the RiskOracle
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown for a loan market
     * @custom:error PreviousUpdatePending is thrown while an earlier collateral factor update of the market can still
     *   be applied
     * @custom:error InvalidCollateralFactors is thrown when the collateral factor is above the liquidation threshold,
     *   or the liquidation threshold is below the applied one
     * @custom:error RedundantUpdate is thrown when both values equal the applied ones
     * @custom:error ExceedsTierLimit is thrown when either value is above the tier's limits
     * @custom:error CoverageTooLow is thrown when the bond covers less than the tier's minimum coverage ratio
     * @custom:access Only the pool's deployer
     */
    function setCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external;

    /**
     * @notice Publishes a collateral market's new supply cap to the RiskOracle
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param supplyCap The new supply cap
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown for a loan market
     * @custom:error PreviousUpdatePending is thrown while an earlier supply cap update of the market can still be
     *   applied
     * @custom:error RedundantUpdate is thrown when the cap equals the applied one
     * @custom:error ExceedsTierLimit is thrown when the cap is worth more than the tier's limit
     * @custom:error CoverageTooLow is thrown when the bond covers less than the tier's minimum coverage ratio
     * @custom:access Only the pool's deployer
     */
    function setCollateralSupplyCap(address comptroller, address vToken, uint256 supplyCap) external;

    /**
     * @notice Publishes a supply pause of a collateral market, which pauses MINT and sets its collateral factor to 0
     *   while keeping its liquidation threshold; coverage is not checked. Venus lifts it
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown for a loan market
     * @custom:access Only the pool's deployer
     */
    function pauseCollateralSupply(address comptroller, address vToken) external;

    /**
     * @notice Pays the pool's bond yield to its deployer, in any pool status while its bond is live, even while paused
     * @param comptroller The pool's comptroller
     * @custom:event The bond manager emits YieldClaimed when something is paid
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error The bond manager's `claimYield` errors
     * @custom:access Only the pool's deployer
     */
    function claimBondYield(address comptroller) external;

    /**
     * @notice Adds to the pool's bond from the caller, in any pool status while its bond is live, even while paused
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset
     * @custom:event The bond manager emits BondToppedUp
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error TransferAmountMismatch is thrown when the transfer delivers a different amount
     * @custom:error The bond manager's `topUp` errors
     * @custom:error Reverts without data when the pool has no live bond, for example once it is released
     * @custom:access Only the pool's deployer
     */
    function topUpBond(address comptroller, uint256 amount) external;

    /**
     * @notice Takes part of a pool's bond for a receiver; an XVSVault bond owes what it cannot pay now and pays it later,
     *   any other bond reverts
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event The bond manager emits BondSeized
     * @custom:error The bond manager's `seize` errors, such as ZeroAddressNotAllowed for a zero receiver
     * @custom:access Controlled by AccessControlManager, granted to `SpokePoolShortfall`
     */
    function seizeBond(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Releases a closed or handed-over pool's bond to its bond holder once governance accepts the pool's
     *   remaining debt; until then the bond stays seizable
     * @param comptroller The pool's comptroller
     * @custom:event The bond manager emits BondReleased
     * @custom:error InvalidPoolStatus is thrown unless the pool is closed or handed over
     * @custom:error The bond manager's `release` errors, such as BondNotFound once it is released
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function releaseBond(address comptroller) external;

    /**
     * @notice Asks Venus to wind the caller's pool down or hand it over to governance. The deployer's risk controls end
     *   here; `rejectExit` gives them back
     * @param comptroller The pool's comptroller
     * @custom:event Emits ExitRequested
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:access Only the pool's deployer
     */
    function requestExit(address comptroller) external;

    /**
     * @notice Builds a pool's exit VIP under a new build id; this ends the deployer's controls and voids earlier exit
     *   VIPs
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order; ignored
     *   for loan markets
     * @param description The VIP's description
     * @custom:event Emits ExitBuilt
     * @custom:error InvalidPoolStatus is thrown unless the pool is live or its exit is requested or built
     * @custom:error The builder's `buildExitProposal` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external;

    /**
     * @notice Starts a pool's wind-down; the last call of its exit VIP
     * @param comptroller The pool's comptroller
     * @param buildId The exit build the VIP carries; only the latest starts it
     * @custom:event Emits WindDownStarted
     * @custom:error InvalidBuild is thrown when the pool's exit is not built, or not with this build
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function startWindDown(address comptroller, uint256 buildId) external;

    /**
     * @notice Builds a winding-down pool's force-close VIP and stores it in place of the exit VIP
     * @param comptroller The pool's comptroller
     * @param description The VIP's description
     * @custom:event Emits ForceCloseBuilt
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error WindDownPeriodNotElapsed is thrown before the wind-down period ends
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function buildForceCloseProposal(address comptroller, string calldata description) external;

    /**
     * @notice Closes a winding-down pool whose residual debt is within `maxResidualPoolDebtUsd`. Its bond stays, still
     *   seizable for bad debt, until `releaseBond`
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolClosed
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error ResidualDebtExceeded is thrown when the pool's borrows and bad debt exceed `maxResidualPoolDebtUsd`
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function closePool(address comptroller) external;

    /**
     * @notice Turns down a pool's exit request or built exit VIP, and makes the pool live again
     * @param comptroller The pool's comptroller
     * @custom:event Emits ExitRejected
     * @custom:error InvalidPoolStatus is thrown when no exit is requested or built
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function rejectExit(address comptroller) external;

    /**
     * @notice Hands a pool whose exit is requested or built over to governance, even with bad debt. The pool keeps
     *   running, and a built exit VIP then fails. Its bond stays, still seizable for bad debt, until `releaseBond`
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolHandedOver
     * @custom:error InvalidPoolStatus is thrown unless the pool's exit is requested or built
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function handoverPoolToGovernance(address comptroller) external;

    /**
     * @notice Pauses a pool deployer's requests, risk controls and exit request until `unpauseDeployer`; it can still
     *   cancel open requests, claim yield and top up the bond
     * @param comptroller The pool's comptroller
     * @custom:event Emits DeployerPausedUpdated
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist
     * @custom:access Controlled by AccessControlManager, granted to the Venus team and the Guardian
     */
    function pauseDeployer(address comptroller) external;

    /**
     * @notice Gives a paused deployer its controls back
     * @param comptroller The pool's comptroller
     * @custom:event Emits DeployerPausedUpdated
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function unpauseDeployer(address comptroller) external;

    /**
     * @notice Sets the builder that builds the VIPs
     * @param newProposalBuilder The new builder
     * @custom:event Emits ProposalBuilderUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the builder is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setProposalBuilder(ISpokePoolProposalBuilder newProposalBuilder) external;

    /**
     * @notice Sets the bond manager, once
     * @param newBondManager The bond manager, whose `SPOKE_POOL_MANAGER` must be this contract
     * @custom:event Emits BondManagerSet
     * @custom:error BondManagerAlreadySet is thrown when the bond manager is already set
     * @custom:error InvalidBondManager is thrown when its `SPOKE_POOL_MANAGER` is another contract
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setBondManager(ISpokeBondManager newBondManager) external;

    /**
     * @notice Sets the Hub YieldGroup that supplies an asset's loan markets; listing and tier VIPs set its caps
     * @param asset The loan asset
     * @param yieldGroup The YieldGroup
     * @custom:event Emits HubYieldGroupUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setHubYieldGroup(address asset, address yieldGroup) external;

    /**
     * @notice Sets the oracles a new collateral asset's feeds may be set on, such as Venus's Chainlink, RedStone and
     *   Atlas oracles; a zero entry leaves that slot empty. Each must be ChainlinkOracle-compatible, and the Normal
     *   Timelock must be allowed to call its `setTokenConfig`. A removed oracle fails the build of a request whose unpriced
     *   asset has a feed on it
     * @param oracles The oracles
     * @custom:event Emits SupportedOraclesUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setSupportedOracles(address[3] calldata oracles) external;

    /**
     * @notice Sets the comptroller parameters of new pools, read when a pool's VIP is built
     * @param params The new parameters
     * @custom:event Emits PoolParamsUpdated
     * @custom:error InvalidPoolParams is thrown when the parameters are out of bounds
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setPoolParams(PoolParams calldata params) external;

    /**
     * @notice Sets Venus's parameters of new markets, read when a VIP is built
     * @param params The new parameters; the DeviationBoundedOracle checks its config when the VIP runs
     * @custom:event Emits MarketParamsUpdated
     * @custom:error InvalidProtocolMarketParams is thrown when the interest rate model, reduce reserves block delta,
     *   staleness limit or bound deviation is zero, the reserve factor is above 1e18, or the bound deviation is 1e18 or
     *   above
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMarketParams(ProtocolMarketParams calldata params) external;

    /**
     * @notice Sets the wind-down period
     * @param newWindDownPeriod The new period, in seconds
     * @custom:event Emits WindDownPeriodUpdated
     * @custom:error ZeroValueNotAllowed is thrown when the period is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setWindDownPeriod(uint256 newWindDownPeriod) external;

    /**
     * @notice Sets the borrows and bad debt a winding-down pool may hold when it closes
     * @param newMaxResidualPoolDebtUsd The new maximum, in USD
     * @custom:event Emits MaxResidualPoolDebtUsdUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMaxResidualPoolDebtUsd(uint256 newMaxResidualPoolDebtUsd) external;

    /**
     * @notice Sends tokens the manager holds beyond the escrowed bonds and seeds
     * @param token The token
     * @param to The receiver
     * @param amount The amount
     * @custom:event Emits SweepToken
     * @custom:error ZeroAddressNotAllowed is thrown when the receiver is zero
     * @custom:error InsufficientAmount is thrown when the amount would take escrowed tokens
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function sweepToken(address token, address to, uint256 amount) external;

    /**
     * @notice Returns a request
     * @param requestId The request
     * @return The request
     */
    function getRequest(uint256 requestId) external view returns (Request memory);

    /**
     * @notice Returns a pool
     * @param comptroller The pool's comptroller
     * @return The pool
     */
    function getPool(address comptroller) external view returns (Pool memory);

    /**
     * @notice Returns the oracle bonds, seeds, caps and debts are priced with
     * @return The ResilientOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RESILIENT_ORACLE() external view returns (ResilientOracleInterface);

    /**
     * @notice Returns the oracle deployer updates are published to
     * @return The RiskOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RISK_ORACLE() external view returns (IRiskOracle);

    /**
     * @notice Returns the receiver that applies the published updates
     * @return The RiskStewardReceiver
     */
    // solhint-disable-next-line func-name-mixedcase
    function RISK_STEWARD_RECEIVER() external view returns (IRiskStewardReceiver);

    /**
     * @notice Returns the registry of pool tiers
     * @return The TierRegistry
     */
    // solhint-disable-next-line func-name-mixedcase
    function TIER_REGISTRY() external view returns (ITierRegistry);

    /**
     * @notice Returns the builder that builds the VIPs
     * @return The builder
     */
    function proposalBuilder() external view returns (ISpokePoolProposalBuilder);

    /**
     * @notice Returns the bond manager
     * @return The bond manager; zero until set
     */
    function bondManager() external view returns (ISpokeBondManager);

    /**
     * @notice Returns the time after a wind-down starts before a force close can be built
     * @return The period, in seconds
     */
    function windDownPeriod() external view returns (uint256);

    /**
     * @notice Returns the borrows and bad debt a winding-down pool may hold when it closes
     * @return The maximum, in USD
     */
    function maxResidualPoolDebtUsd() external view returns (uint256);

    /**
     * @notice Returns the comptroller parameters of new pools
     * @return closeFactor The close factor
     * @return liquidationIncentive The liquidation incentive
     * @return minLiquidatableCollateral The minimum liquidatable collateral, in USD
     */
    function poolParams()
        external
        view
        returns (uint256 closeFactor, uint256 liquidationIncentive, uint256 minLiquidatableCollateral);

    /**
     * @notice Returns Venus's parameters of new markets
     * @return collateralInterestRateModel The interest rate model of collateral markets
     * @return reserveFactor The reserve factor
     * @return reduceReservesBlockDelta The blocks between reserve reductions
     * @return maxStalePeriod The staleness limit of a new collateral asset's feeds, in seconds
     * @return cooldownPeriod The DeviationBoundedOracle cooldown of a new collateral asset, in seconds
     * @return triggerThreshold Its DeviationBoundedOracle trigger threshold, scaled by 1e18
     * @return resetThreshold Its DeviationBoundedOracle reset threshold, scaled by 1e18
     * @return boundDeviation Its BoundValidator deviation, scaled by 1e18
     */
    function marketParams()
        external
        view
        returns (
            address collateralInterestRateModel,
            uint256 reserveFactor,
            uint256 reduceReservesBlockDelta,
            uint256 maxStalePeriod,
            uint64 cooldownPeriod,
            uint256 triggerThreshold,
            uint256 resetThreshold,
            uint256 boundDeviation
        );

    /**
     * @notice Returns the number of requests, which is also the latest request id
     * @return The count
     */
    function requestCount() external view returns (uint256);

    /**
     * @notice Returns the number of builds, which is also the latest build id; request and exit builds share it
     * @return The count
     */
    function buildCount() external view returns (uint256);

    /**
     * @notice Returns the Hub YieldGroup that supplies an asset's loan markets
     * @param asset The loan asset
     * @return The YieldGroup; zero when the asset has none
     */
    function hubYieldGroups(address asset) external view returns (address);

    /**
     * @notice Returns one of the three oracles a new collateral asset's feeds may be set on, such as Venus's Chainlink,
     *   RedStone and Atlas oracles
     * @param index The slot, from 0 to 2
     * @return The oracle; zero for an empty slot
     */
    function supportedOracles(uint256 index) external view returns (address);

    /**
     * @notice Returns whether a market was built as a loan market
     * @param vToken The market
     * @return Whether it is a loan market
     */
    function isLoanMarket(address vToken) external view returns (bool);

    /**
     * @notice Returns a deployer's latest request
     * @param deployer The deployer
     * @return The request; zero when there is none
     */
    function latestRequestIds(address deployer) external view returns (uint256);

    /**
     * @notice Returns a deployer's active pool, cleared when the pool closes or is handed over
     * @param deployer The deployer
     * @return The pool's comptroller; zero when there is none
     */
    function activePools(address deployer) external view returns (address);

    /**
     * @notice Returns the bonds and seeds of open requests the manager holds in a token
     * @param token The token
     * @return The amount
     */
    function escrowedAmounts(address token) external view returns (uint256);

    /**
     * @notice Returns a request's latest VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param requestId The request
     * @return The payload; empty before the first build
     */
    function requestProposals(uint256 requestId) external view returns (bytes memory);

    /**
     * @notice Returns a pool's latest exit or force-close VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param comptroller The pool's comptroller
     * @return The payload; empty before the first build
     */
    function exitProposals(address comptroller) external view returns (bytes memory);
}

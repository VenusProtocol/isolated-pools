// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ISpokeBondManager } from "./ISpokeBondManager.sol";
import { ISpokePoolBuilder } from "./ISpokePoolBuilder.sol";
import { ITierRegistry } from "./ITierRegistry.sol";
import { IRiskOracle } from "./external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "./external/IRiskStewardReceiver.sol";

/**
 * @title ISpokePoolManager
 * @author Venus
 * @notice Functions, events and errors of `SpokePoolManager`
 */
interface ISpokePoolManager {
    // ──────────────────────────────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────────────────────────────

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

    /// @notice A new market's parameters set by the deployer
    struct DeployerMarketParams {
        address asset;
        // Funded by the Hub and borrowable; otherwise a collateral market
        bool isLoanMarket;
        string name;
        string symbol;
        // Collateral only; zero for a loan market
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        // Collateral only, in the asset's units; zero for a loan market, whose caps come from its tier
        uint256 supplyCap;
        // Loan only: one its tier allows for the asset; zero for a collateral market
        address interestRateModel;
        // Escrowed while the request is approved and burned at listing
        uint256 seed;
    }

    /// @notice A new market's parameters set by Venus
    struct ProtocolMarketParams {
        address collateralInterestRateModel;
        uint256 reserveFactor;
        uint256 reduceReservesBlockDelta;
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
        // Cleared by every edit until the deployer approves the request again; the seeds are escrowed only while set
        bool approved;
        address deployer;
        // Zero for a pool request until its first build
        address comptroller;
        // Pool: the requested tier; markets: the pool's tier; tier: the target tier
        uint256 tierId;
        // The latest build; zero when there is none or after an edit
        uint256 buildId;
        // Pool requests only
        string poolName;
        PoolParams params;
        address bondAsset;
        uint256 bondAmount;
        // Pool and markets requests
        DeployerMarketParams[] markets;
        // The latest build's markets, in `markets` order
        address[] vTokens;
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

    // ──────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────

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
     * @notice Emitted when a deployer approves its request as it stands
     * @param requestId The request
     */
    event RequestApproved(uint256 indexed requestId);

    /**
     * @notice Emitted when a deployer cancels its request
     * @param requestId The request
     */
    event RequestCanceled(uint256 indexed requestId);

    /**
     * @notice Emitted when a deployer asks to exit its pool
     * @param comptroller The pool's comptroller
     */
    event ExitRequested(address indexed comptroller);

    /**
     * @notice Emitted when the Venus team edits a request
     * @param requestId The request
     */
    event RequestEdited(uint256 indexed requestId);

    /**
     * @notice Emitted when a request's VIP payload is built and stored
     * @param requestId The request
     * @param buildId The build
     * @param vTokens The markets deployed for it, in the request's market order
     */
    event RequestBuilt(uint256 indexed requestId, uint256 buildId, address[] vTokens);

    /**
     * @notice Emitted when a request is settled by its VIP
     * @param requestId The request
     * @param comptroller The pool's comptroller
     */
    event RequestSettled(uint256 indexed requestId, address indexed comptroller);

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
     * @notice Emitted when the Venus team rejects a request
     * @param requestId The request
     */
    event RequestRejected(uint256 indexed requestId);

    /**
     * @notice Emitted when a pool's deployer is paused or unpaused
     * @param comptroller The pool's comptroller
     * @param paused Whether the deployer is paused
     */
    event DeployerPausedUpdated(address indexed comptroller, bool paused);

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
     * @notice Emitted when a winding-down pool is closed and its bond released
     * @param comptroller The pool's comptroller
     */
    event PoolClosed(address indexed comptroller);

    /**
     * @notice Emitted when the Venus team turns down a pool's exit request or built exit VIP
     * @param comptroller The pool's comptroller
     */
    event ExitRejected(address indexed comptroller);

    /**
     * @notice Emitted when a pool is handed over to governance and its bond released
     * @param comptroller The pool's comptroller
     */
    event PoolHandedOver(address indexed comptroller);

    /**
     * @notice Emitted when the pool builder is changed
     * @param oldPoolBuilder The previous builder
     * @param newPoolBuilder The new builder
     */
    event PoolBuilderUpdated(ISpokePoolBuilder indexed oldPoolBuilder, ISpokePoolBuilder indexed newPoolBuilder);

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
     * @notice Emitted when the pool-wide parameters of new pools are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event PoolDefaultsUpdated(PoolParams oldParams, PoolParams newParams);

    /**
     * @notice Emitted when Venus's parameters of new markets are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event MarketDefaultsUpdated(ProtocolMarketParams oldParams, ProtocolMarketParams newParams);

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

    // ──────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────

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
     * @notice Thrown when the caller already has an open request
     * @param requestId The open request
     */
    error OpenRequestExists(uint256 requestId);

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
     * @notice Thrown when a request is neither pending nor built
     * @param requestId The request
     */
    error InvalidRequestStatus(uint256 requestId);

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
     * @notice Thrown when an earlier update of the same kind for a market is still being applied
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
     * @notice Thrown when a value is above the limits of the pool's tier
     * @param vToken The market
     */
    error ExceedsTierLimit(address vToken);

    /**
     * @notice Thrown when a pool's bond covers less than its tier's minimum coverage ratio
     * @param coverage The bond's value to required bond ratio, scaled by 1e18
     * @param minCoverageRatio The tier's minimum, scaled by 1e18
     */
    error CoverageTooLow(uint256 coverage, uint256 minCoverageRatio);

    /**
     * @notice Thrown when a request is not of a type the function accepts
     * @param requestId The request
     */
    error InvalidRequestType(uint256 requestId);

    /// @notice Thrown when pool parameters are outside the bounds the comptroller accepts
    error InvalidPoolParams();

    /**
     * @notice Thrown when a request is built before its deployer approved it
     * @param requestId The request
     */
    error RequestNotApproved(uint256 requestId);

    /**
     * @notice Thrown when a VIP carries a build that is not the latest
     * @param buildId The build
     */
    error InvalidBuild(uint256 buildId);

    /// @notice Thrown when a force close is built before the wind-down period has elapsed
    error WindDownPeriodNotElapsed();

    /**
     * @notice Thrown when a market has bad debt
     * @param vToken The market
     */
    error BadDebtOutstanding(address vToken);

    /// @notice Thrown when the bond manager is already set
    error BondManagerAlreadySet();

    /**
     * @notice Thrown when a bond manager serves another manager
     * @param bondManager The bond manager
     */
    error InvalidBondManager(address bondManager);

    /// @notice Thrown when market defaults have a zero model or block delta, or a reserve factor above 1e18
    error InvalidMarketDefaults();

    /**
     * @notice Thrown when the manager holds less than the amount beyond its escrowed bonds and seeds
     * @param token The token
     * @param amount The amount
     */
    error InsufficientAmount(address token, uint256 amount);

    // ──────────────────────────────────────────────────────────────────────
    // Deployer functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Requests a new pool of a tier, pulling the bond and the seeds; both are refunded on reject or cancel
     * @param tierId The tier
     * @param poolName The pool's name
     * @param bondAsset The bond's asset, one the bond manager allows
     * @param bondAmount The bond
     * @param markets The pool's markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error ActivePoolExists is thrown while the caller has an active pool
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error TierDisabled is thrown when the tier is disabled
     * @custom:error InvalidBondAsset is thrown when the bond manager does not allow the bond asset
     * @custom:error InsufficientBondValue is thrown when the bond is worth less than the tier requires
     * @custom:error TransferAmountMismatch is thrown when a transfer delivers a different amount
     * @custom:error The builder's `validateMarkets` errors
     * @custom:access Not restricted
     */
    function requestPool(
        uint256 tierId,
        string calldata poolName,
        address bondAsset,
        uint256 bondAmount,
        DeployerMarketParams[] calldata markets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests new markets in the caller's pool, pulling their seeds
     * @param comptroller The pool's comptroller
     * @param markets The new markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:error The builder's `validateMarkets` errors
     * @custom:access Only the pool's deployer
     */
    function requestNewMarkets(
        address comptroller,
        DeployerMarketParams[] calldata markets
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
     * @custom:access Only the pool's deployer
     */
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId);

    /**
     * @notice Approves the caller's request as it stands after an edit, pulling its seeds again
     * @param requestId The request
     * @custom:event Emits RequestApproved
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:error NotDeployer is thrown when the caller is not the request's deployer
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:access Only the request's deployer
     */
    function approveRequest(uint256 requestId) external;

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
     * @notice Publishes a MINT pause of a collateral market; coverage is not checked
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
    function pauseCollateralMint(address comptroller, address vToken) external;

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

    // ──────────────────────────────────────────────────────────────────────
    // Governance functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Replaces a pool or markets request's markets, and a pool request's parameters, and clears its approval,
     *   refunding its seeds until the deployer approves it again
     * @param requestId The request
     * @param params A pool request's pool parameters; ignored for a markets request
     * @param markets The request's new markets
     * @custom:event Emits RequestEdited
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:error InvalidRequestType is thrown for a tier request
     * @custom:error InvalidPoolParams is thrown when a pool request's parameters are out of bounds
     * @custom:error The builder's `validateMarkets` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function editRequest(
        uint256 requestId,
        PoolParams calldata params,
        DeployerMarketParams[] calldata markets
    ) external;

    /**
     * @notice Builds an approved request's VIP under a new build id. The bond was priced at request and is not priced
     *   again
     * @param requestId The request
     * @param description The VIP's description
     * @custom:event Emits RequestBuilt
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor built
     * @custom:error RequestNotApproved is thrown when the deployer has not approved it since the last edit
     * @custom:error InvalidPoolStatus is thrown when a markets or tier request's pool is not live
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
     * @notice Pauses a pool deployer's controls until `unpauseDeployer`; it still claims yield and tops up the bond
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
     * @notice Closes a winding-down pool whose residual debt is within `maxResidualPoolDebtUsd`, releasing its bond
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolClosed; the bond manager emits BondReleased
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error The builder's `accrueAndCheckResidualDebt` errors
     * @custom:error The bond manager's `release` errors
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
     * @notice Hands a pool whose deployer requested an exit over to governance and releases its bond; the pool keeps
     *   running
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolHandedOver; the bond manager emits BondReleased
     * @custom:error InvalidPoolStatus is thrown when the deployer has not requested an exit
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     * @custom:error The bond manager's `release` errors
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function handoverPoolToGovernance(address comptroller) external;

    /**
     * @notice Takes part of a pool's bond for a receiver; what cannot be paid now is owed and paid later
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event The bond manager emits BondSeized
     * @custom:error ZeroAddressNotAllowed is thrown when the receiver is zero
     * @custom:error The bond manager's `seize` errors
     * @custom:access Controlled by AccessControlManager, granted to `SpokePoolShortfall`
     */
    function seizeBond(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Sets the builder that checks requests' markets and builds the VIPs
     * @param newPoolBuilder The new builder
     * @custom:event Emits PoolBuilderUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the builder is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setPoolBuilder(ISpokePoolBuilder newPoolBuilder) external;

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
     * @notice Sets the pool-wide parameters of new pools
     * @param params The new parameters
     * @custom:event Emits PoolDefaultsUpdated
     * @custom:error InvalidPoolParams is thrown when the parameters are out of bounds
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setPoolDefaults(PoolParams calldata params) external;

    /**
     * @notice Sets Venus's parameters of new markets
     * @param params The new parameters
     * @custom:event Emits MarketDefaultsUpdated
     * @custom:error InvalidMarketDefaults is thrown when the interest rate model or reduce reserves block delta is
     *   zero, or the reserve factor is above 1e18
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMarketDefaults(ProtocolMarketParams calldata params) external;

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

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

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
     * @notice Returns a request's latest VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param requestId The request
     * @return The payload; empty before the first build
     */
    function getRequestProposal(uint256 requestId) external view returns (bytes memory);

    /**
     * @notice Returns a pool's latest exit or force-close VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param comptroller The pool's comptroller
     * @return The payload; empty before the first build
     */
    function getExitProposal(address comptroller) external view returns (bytes memory);

    /**
     * @notice Returns the oracle bonds and caps are priced with
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
     * @notice Returns the builder that checks requests' markets and builds the VIPs
     * @return The builder
     */
    function poolBuilder() external view returns (ISpokePoolBuilder);

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
     * @notice Returns the pool-wide parameters of new pools
     * @return closeFactor The close factor
     * @return liquidationIncentive The liquidation incentive
     * @return minLiquidatableCollateral The minimum liquidatable collateral, in USD
     */
    function poolDefaults()
        external
        view
        returns (uint256 closeFactor, uint256 liquidationIncentive, uint256 minLiquidatableCollateral);

    /**
     * @notice Returns Venus's parameters of new markets
     * @return collateralInterestRateModel The interest rate model of collateral markets
     * @return reserveFactor The reserve factor
     * @return reduceReservesBlockDelta The blocks between reserve reductions
     */
    function marketDefaults()
        external
        view
        returns (address collateralInterestRateModel, uint256 reserveFactor, uint256 reduceReservesBlockDelta);

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
}

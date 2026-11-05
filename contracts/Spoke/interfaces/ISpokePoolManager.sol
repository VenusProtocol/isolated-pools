// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ITwapOracle } from "../../Oracles/ITwapOracle.sol";

import { ISpokeBondManager } from "./ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "./ISpokePoolProposalBuilder.sol";
import { ISpokePoolPolicyRegistry } from "./ISpokePoolPolicyRegistry.sol";
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
        NewMarkets,
        TierUpgrade
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
        GovernanceOperated
    }

    /// @notice A collateral asset's oracle config: the oracle, the Chainlink-compatible feed set on it and its
    ///   staleness limit
    struct OracleConfig {
        address oracle;
        address feed;
        // In seconds; it depends on how often the feed updates
        uint256 maxStalePeriod;
    }

    /// @notice A new collateral market's parameters set by the deployer
    struct CollateralMarketRequestParams {
        address asset;
        uint256 collateralFactor;
        uint256 liquidationThreshold;
        uint256 supplyCap;
        // The asset's oracle config, on a supported oracle. Required unless the ResilientOracle prices the asset
        // already, in which case it is dropped
        OracleConfig oracleConfig;
    }

    /// @notice A new loan market's parameters set by the deployer; its caps come from its tier
    struct LoanMarketRequestParams {
        address asset;
        address interestRateModel;
    }

    /// @notice The manager's contracts its libraries read, passed to them on each call
    struct Contracts {
        ResilientOracleInterface resilientOracle;
        ITwapOracle twapOracle;
        IRiskOracle riskOracle;
        IRiskStewardReceiver riskStewardReceiver;
        ISpokePoolPolicyRegistry policyRegistry;
        ISpokeBondManager bondManager;
        ISpokePoolProposalBuilder proposalBuilder;
    }

    /// @notice A deployer's request; only the fields of its type are set
    struct Request {
        RequestType requestType;
        RequestStatus status;
        address deployer;
        // Zero for a pool request until it is built
        address comptroller;
        // Pool: the requested tier; markets: the pool's tier; tier: the target tier
        uint256 tierId;
        // Pool requests only
        address bondAsset;
        uint256 bondAmount;
        // Pool and markets requests
        CollateralMarketRequestParams[] collateralMarkets;
        LoanMarketRequestParams[] loanMarkets;
    }

    /// @notice A pool created through the manager
    struct Pool {
        address deployer;
        PoolStatus status;
        bool deployerPaused;
        uint64 windDownStartedAt;
        // The deployer's changes are checked against this tier's current terms
        uint256 tierId;
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
     * @notice Emitted when the Venus team replaces a request's collateral market oracle config
     * @param requestId The request
     * @param asset The collateral market's asset
     * @param oracleConfig The new oracle config
     * @param price The asset's price from the new feed, scaled like the ResilientOracle's
     */
    event OracleConfigUpdated(
        uint256 indexed requestId,
        address indexed asset,
        OracleConfig oracleConfig,
        uint256 price
    );

    /**
     * @notice Emitted when a request's VIP payload is built and stored
     * @param requestId The request
     * @param vTokens The markets deployed for it: the collateral markets', then the loan markets'
     */
    event RequestBuilt(uint256 indexed requestId, address[] vTokens);

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
     */
    event ExitBuilt(address indexed comptroller);

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
    event PoolGovernanceOperated(address indexed comptroller);

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
     * @notice Thrown when a collateral market's collateral factor is above its liquidation threshold, a seed is above
     *   its market's supply cap, or a request has no collateral market of the asset
     * @param asset The market's asset
     */
    error InvalidMarketParams(address asset);

    /**
     * @notice Thrown when a loan market's asset is not a loan asset
     * @param asset The market's asset
     */
    error LoanAssetNotAllowed(address asset);

    /**
     * @notice Thrown when a loan market's interest rate model is not one of its asset's
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
    error InvalidTierUpgrade(uint256 fromTierId, uint256 toTierId);

    /**
     * @notice Thrown when a request is not in a status the function accepts
     * @param requestId The request
     */
    error InvalidRequestStatus(uint256 requestId);

    /**
     * @notice Thrown when a collateral asset the ResilientOracle does not price has no feed, its feed has no staleness
     *   limit or no live positive answer, or it or its feed has more than 18 decimals
     * @param asset The asset
     */
    error InvalidOracleConfig(address asset);

    /**
     * @notice Thrown when the Venus team sets an oracle config for an asset the ResilientOracle already prices
     * @param asset The asset
     */
    error OracleAlreadySet(address asset);

    /**
     * @notice Thrown when a collateral asset's feed is set on an oracle the registry does not support
     * @param oracle The oracle
     */
    error UnsupportedOracle(address oracle);

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
     * @notice Thrown when a bond covers less than its tier's minimum coverage ratio
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

    /**
     * @notice Thrown when a market of the pool holds bad debt, which is recorded only once an underwater account is
     *   healed
     * @param vToken The market
     */
    error BadDebtExists(address vToken);

    /// @notice Thrown when the bond manager is already set
    error BondManagerAlreadySet();

    /**
     * @notice Requests a new pool of a tier, pulling the bond and each market's seed, worth $10 at current prices. The
     *   seeds are not priced again later. The bond and seeds are refunded on reject or cancel
     * @param tierId The requested tier
     * @param bondAsset The bond's asset
     * @param bondAmount The bond's amount
     * @param collateralMarkets The pool's collateral markets
     * @param loanMarkets The pool's loan markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error ActivePoolExists is thrown while the caller has an active pool
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error TierDisabled is thrown when the tier is disabled
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
     * @custom:error InsufficientBondValue is thrown when the bond is worth less than the tier requires
     * @custom:error The `SpokePoolValidationLib.validateMarkets` errors
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:access Not restricted
     */
    function requestPool(
        uint256 tierId,
        address bondAsset,
        uint256 bondAmount,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests new markets in the caller's pool, pulling each one's seed, worth $10 at current prices. The
     *   seeds are not priced again later, and are refunded on reject or cancel
     * @param comptroller The pool's comptroller
     * @param collateralMarkets The new collateral markets
     * @param loanMarkets The new loan markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the caller has an open request
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
     * @custom:error InsufficientBondValue is thrown when the bond is worth less than the tier requires
     * @custom:error BadDebtExists is thrown while a market of the pool holds recorded bad debt
     * @custom:error The `SpokePoolValidationLib.validateMarkets` errors
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
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
     * @custom:error InvalidTierUpgrade is thrown when the target tier is not an upgrade of the pool's tier
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
     * @custom:error InsufficientBondValue is thrown when the bond is worth less than the target tier
     *   requires
     * @custom:error BadDebtExists is thrown while a market of the pool holds recorded bad debt
     * @custom:access Only the pool's deployer
     */
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId);

    /**
     * @notice Cancels the caller's request before it is built, refunding its seeds and a pool request's bond
     * @param requestId The request
     * @custom:event Emits RequestCanceled
     * @custom:error NotDeployer is thrown when the caller is not the request's deployer
     * @custom:error InvalidRequestStatus is thrown when the request is not pending
     * @custom:access Only the request's deployer
     */
    function cancelRequest(uint256 requestId) external;

    /**
     * @notice Replaces a pending request's collateral market oracle config without the deployer's approval; a built
     *   request is final, and changing it takes a new request. The seed pulled at the request keeps its price, so a
     *   request whose seed was priced off a bad feed is rejected rather than fixed here. Only the config is checked
     *   here; the build checks the market's supply cap at the new price
     * @param requestId The request
     * @param asset The collateral market's asset
     * @param oracleConfig The new oracle config, on a supported oracle
     * @custom:event Emits OracleConfigUpdated
     * @custom:error InvalidRequestStatus is thrown when the request is not pending
     * @custom:error InvalidMarketParams is thrown when the request has no collateral market of the asset
     * @custom:error OracleAlreadySet is thrown when the ResilientOracle already prices the asset
     * @custom:error InvalidOracleConfig is thrown when the config has no feed or no staleness limit, the feed has no
     *   live positive answer, or it or the asset has more than 18 decimals
     * @custom:error UnsupportedOracle is thrown when the config's oracle is not one the registry supports
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function setOracleConfig(uint256 requestId, address asset, OracleConfig calldata oracleConfig) external;

    /**
     * @notice Builds a pending request's VIP, once; a built request is only settled or rejected. It checks the bond
     *   against the request's tier again at current prices. For a pool or markets request it also checks the markets
     *   again, but keeps the seeds pulled at the request
     * @param requestId The request
     * @param description The VIP's description
     * @custom:event Emits RequestBuilt
     * @custom:error InvalidRequestStatus is thrown when the request is not pending
     * @custom:error InvalidPoolStatus is thrown when a markets or tier request's pool is not live
     * @custom:error DeployerPaused is thrown when a markets or tier request's deployer is paused
     * @custom:error The `SpokePoolValidationLib.validateNewBond` errors for a pool request, else the `validateBond` ones
     * @custom:error The `SpokePoolValidationLib.validateMarkets` errors
     * @custom:error The builder's `buildRequestProposal` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function buildRequestProposal(uint256 requestId, string calldata description) external;

    /**
     * @notice Settles a request from its VIP, sending the seeds to the caller to list the markets with
     * @param requestId The request
     * @custom:event Emits PoolActivated for a pool request, PoolTierUpgraded for a tier request, and RequestSettled
     * @custom:error InvalidRequestStatus is thrown when the request is not built
     * @custom:error InvalidPoolStatus is thrown when a markets or tier request's pool is not live
     * @custom:error DeployerPaused is thrown when a markets or tier request's deployer is paused
     * @custom:error The bond manager's `createBond` errors
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function settleRequest(uint256 requestId) external;

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
     * @custom:error ExceedsTierLimit is thrown when the collateral factor, or a changed liquidation threshold, is above
     *   the tier's limits
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
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
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
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
     * @notice Pays the pool's deployer what its bond holds beyond the bond its tier requires at current prices, yield
     *   and extra top-ups alike. Only a live pool's deployer who is not paused can, as the bond backs a seizure
     *   until the pool closes
     * @param comptroller The pool's comptroller
     * @custom:event The bond manager emits ExcessWithdrawn
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer is paused
     * @custom:error OpenRequestExists is thrown while the deployer's latest request is still open
     * @custom:error BadDebtExists is thrown while a market of the pool holds recorded bad debt
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
     * @custom:error The bond manager's `withdrawExcess` errors
     * @custom:access Only the pool's deployer
     */
    function withdrawExcessBond(address comptroller) external;

    /**
     * @notice Adds to the pool's bond from the caller, in any pool status while its bond is live, even while paused
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset
     * @custom:event The bond manager emits BondToppedUp
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error The bond manager's `topUp` errors
     * @custom:error Reverts without data when the pool has no live bond, for example once it is released
     * @custom:access Only the pool's deployer
     */
    function topUpBond(address comptroller, uint256 amount) external;

    /**
     * @notice Takes part of a pool's bond and pays it to a receiver at once
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset
     * @param receiver The receiver
     * @custom:event The bond manager emits BondSeized
     * @custom:error The bond manager's `seize` errors, such as ZeroAddressNotAllowed for a zero receiver
     * @custom:access Controlled by AccessControlManager, granted to `SpokePoolShortfall`
     */
    function seizeBond(address comptroller, uint256 amount, address receiver) external;

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
     * @notice Builds a pool's exit VIP; this ends the deployer's controls. It can be built again, and the first exit
     *   VIP to execute starts the wind-down, so any other then reverts
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
     * @custom:event Emits WindDownStarted
     * @custom:error InvalidPoolStatus is thrown when the pool's exit is not built
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function startWindDown(address comptroller) external;

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
     * @notice Hands a pool over to governance: one that is live, exiting or winding down, with no recorded bad debt.
     *   The pool keeps running, and a built exit, markets or tier VIP then fails. Its bond stays, still seizable for bad
     *   debt, until `releaseBond`
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolGovernanceOperated
     * @custom:error InvalidPoolStatus is thrown when the pool is not live, exiting or winding down
     * @custom:error BadDebtExists is thrown when a market of the pool holds recorded bad debt
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function handoverPoolToGovernance(address comptroller) external;

    /**
     * @notice Pauses a pool deployer's requests, risk controls, exit request and excess bond withdrawals until
     *   `unpauseDeployer`; its open requests are not built or settled meanwhile. It can still cancel them and top up
     *   the bond
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
     * @param newBondManager The bond manager, serving this contract
     * @custom:event Emits BondManagerSet
     * @custom:error BondManagerAlreadySet is thrown when the bond manager is already set
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setBondManager(ISpokeBondManager newBondManager) external;

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
     * @notice Sends tokens the manager holds. It does not track the open requests' escrowed bonds and seeds, so the
     *   caller works them out off-chain and leaves them
     * @param token The token
     * @param to The receiver
     * @param amount The amount
     * @custom:event Emits SweepToken
     * @custom:error ZeroAddressNotAllowed is thrown when the receiver is zero
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
     * @notice Returns what `withdrawExcessBond` would pay the pool's deployer now: what its bond holds beyond the bond
     *   its tier requires at current prices. It is read before the Hub accrues its fees, so the withdrawal may differ
     *   slightly
     * @param comptroller The pool's comptroller
     * @return The amount, in the bond's asset
     * @custom:error BondNotFound is thrown by the bond manager when the pool has no live bond
     * @custom:error BondAssetNotAllowed is thrown by the policy registry when the bond asset has no factor
     */
    function getExcessBondAmount(address comptroller) external view returns (uint256);

    /**
     * @notice Returns how much a pool's bond is worth at current prices. It is read before the Hub accrues its fees, so
     *   it may differ slightly from what the bond pays out
     * @param comptroller The pool's comptroller
     * @return What the bond holds, net of a loss and a Hub's exit fee, in USD scaled by 1e18
     */
    function getBondValue(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the oracle bonds, seeds, caps and debts are priced with
     * @return The ResilientOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RESILIENT_ORACLE() external view returns (ResilientOracleInterface);

    /**
     * @notice Returns the oracle whose TWAP caps a bond asset's price, for the bond assets it has enabled
     * @return The TwapOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function TWAP_ORACLE() external view returns (ITwapOracle);

    /**
     * @notice Returns the oracle deployer updates are published to: the one `RISK_STEWARD_RECEIVER` reads
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
     * @notice Returns the registry of the policy open pools run under: tiers, bond assets and new pool and market
     *   parameters
     * @return The SpokePoolPolicyRegistry
     */
    // solhint-disable-next-line func-name-mixedcase
    function POLICY_REGISTRY() external view returns (ISpokePoolPolicyRegistry);

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
     * @notice Returns the number of requests, which is also the latest request id
     * @return The count
     */
    function requestCount() external view returns (uint256);

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
     * @notice Returns a request's escrowed seed for a new market, pulled at the request
     * @param requestId The request
     * @param asset The market's asset
     * @return The seed, in the asset; zero once the seed is released
     */
    function requestSeeds(uint256 requestId, address asset) external view returns (uint256);

    /**
     * @notice Returns a request's VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param requestId The request
     * @return The payload; empty before the build
     */
    function requestProposals(uint256 requestId) external view returns (bytes memory);

    /**
     * @notice Returns a pool's latest exit or force-close VIP payload, an ABI-encoded GovernorBravo `propose` call
     * @param comptroller The pool's comptroller
     * @return The payload; empty before the first build
     */
    function exitProposals(address comptroller) external view returns (bytes memory);
}

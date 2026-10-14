// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { VToken } from "../../VToken.sol";
import { SpokePoolManagerStorage } from "../OpenSpokePool/SpokePoolManagerStorage.sol";
import { ISpokePoolProposer } from "./ISpokePoolProposer.sol";
import { ISpokePoolValidator } from "./ISpokePoolValidator.sol";

/**
 * @title ISpokePoolManager
 * @author Venus
 * @notice Functions, events and errors of `SpokePoolManager`
 */
interface ISpokePoolManager {
    /*** Request events ***/

    /**
     * @notice Emitted when a deployer submits a request
     * @param requestId The request
     * @param requestType What the request asks for
     * @param deployer The deployer
     * @param comptroller The pool; zero for a new pool
     */
    event RequestSubmitted(
        uint256 indexed requestId,
        SpokePoolManagerStorage.RequestType requestType,
        address indexed deployer,
        address indexed comptroller
    );

    /**
     * @notice Emitted when the Venus team updates a request
     * @param requestId The request
     */
    event RequestUpdated(uint256 indexed requestId);

    /**
     * @notice Emitted when a deployer approves its request
     * @param requestId The request
     */
    event RequestApproved(uint256 indexed requestId);

    /**
     * @notice Emitted when a request's proposal is submitted
     * @param requestId The request
     * @param proposalId The proposal
     * @param vTokens The markets deployed for the proposal, in the request's market order
     */
    event RequestProposed(uint256 indexed requestId, uint256 proposalId, address[] vTokens);

    /**
     * @notice Emitted when a new pool's request is settled and its deployer's rights start
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     */
    event PoolActivated(uint256 indexed requestId, address indexed comptroller, address indexed deployer);

    /**
     * @notice Emitted when a request is settled
     * @param requestId The request
     * @param comptroller The pool's comptroller
     */
    event RequestSettled(uint256 indexed requestId, address indexed comptroller);

    /**
     * @notice Emitted when a request is rejected
     * @param requestId The request
     */
    event RequestRejected(uint256 indexed requestId);

    /**
     * @notice Emitted when a deployer cancels its request
     * @param requestId The request
     */
    event RequestCanceled(uint256 indexed requestId);

    /*** Live pool events ***/

    /**
     * @notice Emitted when a deployer locks more XVS to match its tier's stake again
     * @param comptroller The pool's comptroller
     * @param amount The XVS locked
     */
    event StakeToppedUp(address indexed comptroller, uint256 amount);

    /**
     * @notice Emitted when a pool moves to another tier
     * @param comptroller The pool's comptroller
     * @param tierId The new tier
     */
    event PoolTierUpdated(address indexed comptroller, uint256 indexed tierId);

    /**
     * @notice Emitted when a deployer's actions are paused or resumed
     * @param comptroller The pool's comptroller
     * @param paused Whether the actions are paused
     */
    event DeployerPausedUpdated(address indexed comptroller, bool paused);

    /**
     * @notice Emitted when XVS is taken from a pool's locked stake
     * @param comptroller The pool's comptroller
     * @param to The receiver
     * @param amount The XVS taken
     */
    event StakeSeized(address indexed comptroller, address indexed to, uint256 amount);

    /*** Exit events ***/

    /**
     * @notice Emitted when a deployer asks to exit its pool
     * @param comptroller The pool's comptroller
     */
    event ExitRequested(address indexed comptroller);

    /**
     * @notice Emitted when an exit's first proposal is submitted
     * @param comptroller The pool's comptroller
     * @param proposalId The proposal
     */
    event ExitProposed(address indexed comptroller, uint256 proposalId);

    /**
     * @notice Emitted when an exit's first proposal executes
     * @param comptroller The pool's comptroller
     */
    event WindDownStarted(address indexed comptroller);

    /**
     * @notice Emitted when an exit's force-close proposal is submitted
     * @param comptroller The pool's comptroller
     * @param proposalId The proposal
     */
    event ForceCloseProposed(address indexed comptroller, uint256 proposalId);

    /**
     * @notice Emitted when the Venus team turns down a requested or proposed exit
     * @param comptroller The pool's comptroller
     */
    event ExitRejected(address indexed comptroller);

    /**
     * @notice Emitted when a winding-down pool is closed and its stake unlocked
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     * @param amount The XVS unlocked
     */
    event StakeReleased(address indexed comptroller, address indexed deployer, uint256 amount);

    /**
     * @notice Emitted when governance takes a pool over and its stake is unlocked
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     * @param amount The XVS unlocked
     */
    event PoolTakenOverByGovernance(address indexed comptroller, address indexed deployer, uint256 amount);

    /*** Configuration events ***/

    /**
     * @notice Emitted when a tier is set
     * @param tierId The tier
     * @param oldTier The previous terms; zero for a new tier
     * @param tier The new terms
     */
    event TierUpdated(uint256 indexed tierId, SpokePoolManagerStorage.Tier oldTier, SpokePoolManagerStorage.Tier tier);

    /**
     * @notice Emitted when the proposer is changed
     * @param oldProposer The previous proposer
     * @param newProposer The new proposer
     */
    event ProposerUpdated(ISpokePoolProposer indexed oldProposer, ISpokePoolProposer indexed newProposer);

    /**
     * @notice Emitted when the validator is changed
     * @param oldValidator The previous validator
     * @param newValidator The new validator
     */
    event ValidatorUpdated(ISpokePoolValidator indexed oldValidator, ISpokePoolValidator indexed newValidator);

    /**
     * @notice Emitted when an asset's Hub source is changed
     * @param asset The loan asset
     * @param oldSource The previous source
     * @param newSource The new source
     */
    event SpokeSourceUpdated(address indexed asset, address oldSource, address newSource);

    /**
     * @notice Emitted when the pool-wide parameters of new pools are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event PoolDefaultsUpdated(
        SpokePoolManagerStorage.PoolParams oldParams,
        SpokePoolManagerStorage.PoolParams newParams
    );

    /**
     * @notice Emitted when Venus's parameters of new markets are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event MarketDefaultsUpdated(
        SpokePoolManagerStorage.ProtocolMarketParams oldParams,
        SpokePoolManagerStorage.ProtocolMarketParams newParams
    );

    /**
     * @notice Emitted when the wind-down period is changed
     * @param oldWindDownPeriod The previous period, in seconds
     * @param newWindDownPeriod The new period, in seconds
     */
    event WindDownPeriodUpdated(uint256 oldWindDownPeriod, uint256 newWindDownPeriod);

    /**
     * @notice Emitted when the residual debt a winding-down pool may hold is changed
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

    /*** Errors ***/

    /**
     * @notice Thrown when a tier is not set, has inconsistent limits, or does not fit the call, such as a requested
     *   tier whose terms changed
     * @param tierId The tier
     */
    error InvalidTier(uint256 tierId);

    /**
     * @notice Thrown when the caller already has a pending or proposed request
     * @param requestId The open request
     */
    error OpenRequestExists(uint256 requestId);

    /**
     * @notice Thrown when a request is not in a status the function accepts, or its proposal can still execute
     * @param requestId The request
     */
    error InvalidRequestStatus(uint256 requestId);

    /**
     * @notice Thrown when a request is not of a type the function accepts
     * @param requestId The request
     */
    error InvalidRequestType(uint256 requestId);

    /**
     * @notice Thrown when a request is proposed before its deployer approved it
     * @param requestId The request
     */
    error RequestNotApproved(uint256 requestId);

    /**
     * @notice Thrown when a pool would have more markets than allowed, or `MAX_POOL_MARKETS` markets would not fit a
     *   GovernorBravo proposal
     * @param count The markets
     * @param maxCount The maximum
     */
    error TooManyMarkets(uint256 count, uint256 maxCount);

    /**
     * @notice Thrown when a market's asset is already in the request or the pool
     * @param asset The asset
     */
    error DuplicateAsset(address asset);

    /**
     * @notice Thrown when a market's parameters are missing or do not fit its kind or seed
     * @param asset The market's asset
     */
    error InvalidMarketParams(address asset);

    /// @notice Thrown when a new pool's close factor or liquidation incentive is zero, or new pool defaults are outside
    ///   the comptroller's bounds
    error InvalidPoolParams();

    /// @notice Thrown when new market defaults have a zero interest rate model, a reserve factor above 1e18, or a seed
    ///   burn share outside (0, 1e18]
    error InvalidMarketDefaults();

    /**
     * @notice Thrown when a market's new interest rate model is zero
     * @param vToken The market
     */
    error InvalidInterestRateModel(address vToken);

    /**
     * @notice Thrown when a seed is worth less than `MIN_SEED_USD` or more than `MAX_SEED_USD`, or an update changes a
     *   market's asset or seed, which the manager already holds
     * @param asset The market's asset
     */
    error InvalidSeed(address asset);

    /**
     * @notice Thrown when a loan asset has no Hub source, or a collateral asset has no bounded pricing in the
     *   DeviationBoundedOracle
     * @param asset The asset
     */
    error UnsupportedAsset(address asset);

    /// @notice Thrown when a parameter is beyond the pool's tier
    error ExceedsTierLimit();

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
     * @notice Thrown while the deployer's actions are paused
     * @param comptroller The pool's comptroller
     */
    error DeployerPaused(address comptroller);

    /**
     * @notice Thrown when the locked stake is below the tier's stake, or below a payout from it
     * @param required The tier's stake, or the payout
     * @param available The pool's locked stake
     */
    error InsufficientLockedStake(uint256 required, uint256 available);

    /**
     * @notice Thrown when a pool is not in a status the function accepts
     * @param comptroller The pool's comptroller
     */
    error InvalidPoolStatus(address comptroller);

    /**
     * @notice Thrown when a market is not listed in the pool
     * @param vToken The market
     */
    error MarketNotListed(address vToken);

    /**
     * @notice Thrown when an update does not apply to the market's type, collateral or loan
     * @param vToken The market
     */
    error InvalidMarketType(address vToken);

    /**
     * @notice Thrown when a collateral factor is above its liquidation threshold, or an exit would raise a threshold
     * @param vToken The market
     */
    error InvalidLiquidationThreshold(address vToken);

    /// @notice Thrown when an array is empty, or two arrays that must match differ in length
    error InvalidArrayLength();

    /**
     * @notice Thrown when a pool changes tier while a market has bad debt
     * @param vToken The market
     */
    error BadDebtOutstanding(address vToken);

    /// @notice Thrown when a force close is proposed before the wind-down period has elapsed
    error WindDownPeriodNotElapsed();

    /// @notice Thrown when a force close is proposed while no loan market has borrows
    error NoOutstandingBorrows();

    /**
     * @notice Thrown when a pool's borrows and bad debt exceed `maxResidualPoolDebtUsd`
     * @param debtUsd The pool's borrows and bad debt, in USD
     */
    error ResidualDebtExceeded(uint256 debtUsd);

    /*** Requests ***/

    /**
     * @notice Requests a new pool of a tier, approved by the caller. Locks the tier's stake from the caller's XVSVault
     *   stake and pulls each market's seed, which is never returned, even if the request is rejected or canceled.
     *   Venus's parameters come from `poolDefaults` and `marketDefaults`
     * @param tierId The pool's tier
     * @param name The pool's name in the registry
     * @param markets The pool's markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted; the vault emits StakeLocked
     * @custom:error OpenRequestExists is thrown when the caller has a pending or proposed request
     * @custom:error InvalidTier is thrown when the tier is not set
     * @custom:error InvalidSeed is thrown when a seed is worth less than `MIN_SEED_USD` or more than `MAX_SEED_USD`
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:error The validator's `verifyRequest` errors
     * @custom:error The vault's `lock` errors, such as when the caller's free stake is too small
     * @custom:access Not restricted
     */
    function requestPool(
        uint256 tierId,
        string calldata name,
        SpokePoolManagerStorage.DeployerMarketParams[] calldata markets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests new markets in the caller's pool, as in `requestPool`
     * @param comptroller The pool's comptroller
     * @param markets The new markets
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error OpenRequestExists is thrown when the caller has a pending or proposed request
     * @custom:error InvalidArrayLength is thrown when no market is requested
     * @custom:error InvalidSeed is thrown when a seed is worth less than `MIN_SEED_USD` or more than `MAX_SEED_USD`
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount
     * @custom:error The validator's `verifyRequest` errors
     * @custom:access Only the pool's deployer
     */
    function requestMarkets(
        address comptroller,
        SpokePoolManagerStorage.DeployerMarketParams[] calldata markets
    ) external returns (uint256 requestId);

    /**
     * @notice Requests new pool-wide parameters or interest rate models in the caller's pool
     * @param comptroller The pool's comptroller
     * @param params The new pool-wide parameters; zero leaves a parameter as it is
     * @param interestRateModels The new interest rate models
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error OpenRequestExists is thrown when the caller has a pending or proposed request
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error The validator's `verifyRequest` errors
     * @custom:access Only the pool's deployer
     */
    function requestPoolConfigUpdate(
        address comptroller,
        SpokePoolManagerStorage.PoolParams calldata params,
        SpokePoolManagerStorage.MarketInterestRateModel[] calldata interestRateModels
    ) external returns (uint256 requestId);

    /**
     * @notice Requests moving the caller's pool to another tier at its current terms
     * @param comptroller The pool's comptroller
     * @param tierId The tier
     * @return requestId The request
     * @custom:event Emits RequestSubmitted
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error OpenRequestExists is thrown when the caller has a pending or proposed request
     * @custom:error InvalidTier is thrown when the tier is not set or is the pool's tier
     * @custom:access Only the pool's deployer
     */
    function requestTier(address comptroller, uint256 tierId) external returns (uint256 requestId);

    /**
     * @notice Replaces the content of an open request, which the deployer must approve again. Only the fields of the
     *   request's type are used. Markets keep their asset and seed, which the manager holds
     * @param requestId The request
     * @param params A pool request's pool parameters, or a pool config request's changes
     * @param markets The markets of a pool or markets request
     * @param interestRateModels The interest rate models of a pool config request
     * @custom:event Emits RequestUpdated
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     * @custom:error InvalidRequestType is thrown for a tier request
     * @custom:error InvalidArrayLength is thrown when the markets differ in number from the request's
     * @custom:error InvalidSeed is thrown when a market's asset or seed differs from the request's
     * @custom:error The validator's `verifyRequest` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function updateRequest(
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params,
        SpokePoolManagerStorage.MarketParams[] calldata markets,
        SpokePoolManagerStorage.MarketInterestRateModel[] calldata interestRateModels
    ) external;

    /**
     * @notice Approves an updated request as it is
     * @param requestId The request
     * @custom:event Emits RequestApproved
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     * @custom:error NotDeployer is thrown when the caller is not the request's deployer
     * @custom:access Only the request's deployer
     */
    function approveRequest(uint256 requestId) external;

    /**
     * @notice Proposes an approved request to GovernorBravo; the proposer deploys its contracts first, and the new loan
     *   markets are recorded. A request whose proposal failed can be proposed again, on the same comptroller and with
     *   new markets. Tier requests are applied with `setPoolTier` instead
     * @param requestId The request
     * @param description The proposal's description
     * @return proposalId The proposal
     * @custom:event Emits RequestProposed
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     * @custom:error RequestNotApproved is thrown when the deployer has not approved the request
     * @custom:error The validator's `verifyRequest` errors
     * @custom:error GovernorBravo's `propose` errors, such as while the proposer has a pending or active proposal
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeRequest(uint256 requestId, string calldata description) external returns (uint256 proposalId);

    /**
     * @notice Settles a request from its executing proposal: activates a new pool and sends the seeds to the caller,
     *   which lists the markets with them
     * @param requestId The request
     * @custom:event Emits PoolActivated for a new pool, and RequestSettled
     * @custom:error InvalidRequestStatus is thrown when the request is not proposed
     * @custom:error The validator's `verifyRequest` errors
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function settleRequest(uint256 requestId) external;

    /**
     * @notice Settles a tier request while the tier keeps the requested terms and the pool fits it. The locked
     *   stake becomes the new tier's stake
     * @param requestId The request
     * @custom:event Emits PoolTierUpdated and RequestSettled; the vault emits StakeLocked or StakeUnlocked
     * @custom:error InvalidRequestStatus is thrown when the request is not pending
     * @custom:error InvalidRequestType is thrown when the request is not a tier request
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error InvalidTier is thrown when the tier's terms changed since the request
     * @custom:error The validator's `checkPoolFitsTier` errors
     * @custom:error The vault's `lock` errors, such as when the deployer's free stake is too small
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function setPoolTier(uint256 requestId) external;

    /**
     * @notice Rejects a pending request, or one whose proposal failed. A new pool's stake is unlocked; seeds stay with
     *   the manager
     * @param requestId The request
     * @custom:event Emits RequestRejected; the vault emits StakeUnlocked for a new pool
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function rejectRequest(uint256 requestId) external;

    /**
     * @notice Cancels the caller's pending request, or one whose proposal failed. A new pool's stake is unlocked; seeds
     *   stay with the manager
     * @param requestId The request
     * @custom:event Emits RequestCanceled; the vault emits StakeUnlocked for a new pool
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     * @custom:error NotDeployer is thrown when the caller is not the request's deployer
     * @custom:access Only the request's deployer
     */
    function cancelRequest(uint256 requestId) external;

    /*** Live pools ***/

    /**
     * @notice Publishes a collateral market's new collateral factor and liquidation threshold to the RiskOracle;
     *   anyone can then apply it through the RiskStewardReceiver, within the CollateralFactorsRiskSteward's limits
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newCollateralFactor The new collateral factor
     * @param newLiquidationThreshold The new liquidation threshold
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error The validator's `checkCollateralFactor` errors
     * @custom:error The RiskOracle's `publishRiskParameterUpdate` errors, such as UpdateTypeNotActive
     * @custom:access Only the pool's deployer
     */
    function updateCollateralFactor(
        address comptroller,
        VToken vToken,
        uint256 newCollateralFactor,
        uint256 newLiquidationThreshold
    ) external;

    /**
     * @notice Publishes a market's new supply cap to the RiskOracle; anyone can then apply it through the
     *   RiskStewardReceiver, within the MarketCapsRiskSteward's limits
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newSupplyCap The new supply cap
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error The validator's `checkSupplyCap` errors
     * @custom:error The RiskOracle's `publishRiskParameterUpdate` errors, such as UpdateTypeNotActive
     * @custom:access Only the pool's deployer
     */
    function updateSupplyCap(address comptroller, VToken vToken, uint256 newSupplyCap) external;

    /**
     * @notice Publishes a loan market's new borrow cap to the RiskOracle; anyone can then apply it through the
     *   RiskStewardReceiver, within the MarketCapsRiskSteward's limits. The tier does not bound it: the tier bounds the
     *   loan markets' supply caps, which borrows draw from
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newBorrowCap The new borrow cap
     * @custom:event The RiskOracle emits UpdatePublished
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     * @custom:error The validator's `checkLoanMarket` errors
     * @custom:error The RiskOracle's `publishRiskParameterUpdate` errors, such as UpdateTypeNotActive
     * @custom:access Only the pool's deployer
     */
    function updateBorrowCap(address comptroller, VToken vToken, uint256 newBorrowCap) external;

    /**
     * @notice Locks more of the deployer's stake so the pool's locked stake matches its tier's stake again; does
     *   nothing when it already does
     * @param comptroller The pool's comptroller
     * @custom:event Emits StakeToppedUp; the vault emits StakeLocked
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:error The vault's `lock` errors, such as when the deployer's free stake is too small
     * @custom:access Only the pool's deployer
     */
    function topUpStake(address comptroller) external;

    /**
     * @notice Pauses or resumes a deployer's actions; the pool keeps running and its stake stays locked
     * @param comptroller The pool's comptroller
     * @param paused Whether to pause
     * @custom:event Emits DeployerPausedUpdated
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist
     * @custom:access Controlled by AccessControlManager, granted to the Venus team and the Guardian
     */
    function setDeployerPaused(address comptroller, bool paused) external;

    /**
     * @notice Pays XVS from a pool's locked stake
     * @param comptroller The pool's comptroller
     * @param amount The XVS to pay
     * @param to The receiver
     * @custom:event Emits StakeSeized; the vault emits Claim and LockedStakeSeized
     * @custom:error InsufficientLockedStake is thrown when the amount exceeds the locked stake
     * @custom:access Controlled by AccessControlManager, granted to `SpokePoolShortfall`
     */
    function seizeStake(address comptroller, uint256 amount, address to) external;

    /*** Exits ***/

    /**
     * @notice Asks the Venus team to exit the caller's pool, even while the deployer is paused or under-staked. The
     *   deployer's risk updates stay open until the exit is proposed; new requests wait for `rejectExit`
     * @param comptroller The pool's comptroller
     * @custom:event Emits ExitRequested
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:access Only the pool's deployer
     */
    function requestExit(address comptroller) external;

    /**
     * @notice Starts a pool's exit, ending its deployer's rights, and submits its first proposal: pause minting,
     *   borrowing and entering markets, zero the caps, zero the collateral factors and set liquidation thresholds no
     *   higher than now, then start the wind-down; a pool without listed markets only starts the wind-down. It can be
     *   called again, e.g. after that proposal fails
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order; ignored
     *   for loan markets
     * @param description The proposal's description
     * @return proposalId The proposal
     * @custom:event Emits ExitProposed
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor with its exit requested or proposed
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's listed markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     * @custom:error GovernorBravo's `propose` errors, such as while the proposer has a pending or active proposal
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId);

    /**
     * @notice Starts the wind-down period; the last action of an exit's first proposal
     * @param comptroller The pool's comptroller
     * @custom:event Emits WindDownStarted
     * @custom:error InvalidPoolStatus is thrown when the pool's exit is not proposed
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function startWindDown(address comptroller) external;

    /**
     * @notice Submits an exit's force-close proposal once the wind-down period has elapsed: zero the collateral
     *   factors and liquidation thresholds and enable forced liquidation on every loan market with borrows
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposalId The proposal
     * @custom:event Emits ForceCloseProposed
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error WindDownPeriodNotElapsed is thrown before the wind-down period ends
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     * @custom:error GovernorBravo's `propose` errors, such as while the proposer has a pending or active proposal
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId);

    /**
     * @notice Turns down a requested or proposed exit; the pool is live again. A queued exit proposal fails at
     *   `startWindDown` while the pool is live, but executes if the exit is proposed again, so cancel it first
     * @param comptroller The pool's comptroller
     * @custom:event Emits ExitRejected
     * @custom:error InvalidPoolStatus is thrown when the pool's exit is neither requested nor proposed
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function rejectExit(address comptroller) external;

    /**
     * @notice Closes a winding-down pool and unlocks its stake once its borrows and bad debt are within
     *   `maxResidualPoolDebtUsd`; the wind-down period need not have elapsed
     * @param comptroller The pool's comptroller
     * @custom:event Emits StakeReleased; the vault emits StakeUnlocked
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error The validator's `accrueAndCheckResidualDebt` errors
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function releaseStake(address comptroller) external;

    /**
     * @notice Makes a live pool an official Venus pool run by governance: the deployer's rights end and its stake is
     *   unlocked. The same proposal should point each market's `shortfall` away from `SpokePoolShortfall`, which can no
     *   longer pay recoverers from the unlocked stake
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolTakenOverByGovernance; the vault emits StakeUnlocked
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function takeOverByGovernance(address comptroller) external;

    /*** Configuration ***/

    /**
     * @notice Adds the next tier or updates one; pools are checked against the new terms from then on. A tier with no
     *   stake cannot be requested
     * @param tierId The tier: `tierCount` adds one
     * @param tier The tier's terms
     * @custom:event Emits TierUpdated
     * @custom:error InvalidTier is thrown when the id is above `tierCount` or 65535, or the limits are inconsistent
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setTier(uint256 tierId, SpokePoolManagerStorage.Tier calldata tier) external;

    /**
     * @notice Sets the proposer; the GovernorBravo votes must be delegated to it
     * @param newProposer The new proposer
     * @custom:event Emits ProposerUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the proposer is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setProposer(ISpokePoolProposer newProposer) external;

    /**
     * @notice Sets the validator
     * @param newValidator The new validator
     * @custom:event Emits ValidatorUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the validator is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setValidator(ISpokePoolValidator newValidator) external;

    /**
     * @notice Sets the Hub source (YieldGroup) that funds an asset's loan markets; zero blocks new loan markets of the
     *   asset
     * @param asset The loan asset
     * @param source The YieldGroup
     * @custom:event Emits SpokeSourceUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setSpokeSource(address asset, address source) external;

    /**
     * @notice Sets the pool-wide parameters of new pools
     * @param params The new parameters
     * @custom:event Emits PoolDefaultsUpdated
     * @custom:error InvalidPoolParams is thrown when the close factor or liquidation incentive is outside the
     *   comptroller's bounds
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setPoolDefaults(SpokePoolManagerStorage.PoolParams calldata params) external;

    /**
     * @notice Sets Venus's parameters of new markets
     * @param params The new parameters
     * @custom:event Emits MarketDefaultsUpdated
     * @custom:error InvalidMarketDefaults is thrown when the interest rate model is zero, the reserve factor is above
     *   1e18, or the seed burn share is zero or above 1e18
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMarketDefaults(SpokePoolManagerStorage.ProtocolMarketParams calldata params) external;

    /**
     * @notice Sets the wind-down period
     * @param newWindDownPeriod The new period, in seconds
     * @custom:event Emits WindDownPeriodUpdated
     * @custom:error ZeroValueNotAllowed is thrown when the period is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setWindDownPeriod(uint256 newWindDownPeriod) external;

    /**
     * @notice Sets the borrows and bad debt a winding-down pool may hold when its stake is released
     * @param newMaxResidualPoolDebtUsd The new maximum, in USD
     * @custom:event Emits MaxResidualPoolDebtUsdUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMaxResidualPoolDebtUsd(uint256 newMaxResidualPoolDebtUsd) external;

    /**
     * @notice Sends tokens held by the manager, such as the seeds of rejected or canceled requests; seeds of open
     *   requests are needed by `settleRequest`
     * @param token The token
     * @param to The receiver
     * @param amount The amount
     * @custom:event Emits SweepToken
     * @custom:error ZeroAddressNotAllowed is thrown when the receiver is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function sweepToken(address token, address to, uint256 amount) external;

    /*** Views ***/

    /**
     * @notice Returns a request
     * @param requestId The request
     * @return The request
     */
    function getRequest(uint256 requestId) external view returns (SpokePoolManagerStorage.Request memory);

    /**
     * @notice Returns a pool
     * @param comptroller The pool's comptroller
     * @return The pool
     */
    function getPool(address comptroller) external view returns (SpokePoolManagerStorage.Pool memory);

    /**
     * @notice Returns a tier's terms
     * @param tierId The tier
     * @return The terms
     */
    function getTier(uint256 tierId) external view returns (SpokePoolManagerStorage.Tier memory);
}

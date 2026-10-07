// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { VToken } from "../../VToken.sol";
import { SpokePoolFactory } from "../OpenSpokePool/SpokePoolFactory.sol";
import { SpokePoolManagerStorage } from "../OpenSpokePool/SpokePoolManagerStorage.sol";

/**
 * @title ISpokePoolManager
 * @author Venus
 * @notice Interface implemented by the `SpokePoolManager` contract: its functions, events and errors, so integrators
 * and off-chain consumers can call and decode it without depending on the implementation.
 */
interface ISpokePoolManager {
    /**
     * @notice Emitted when a tier is set
     * @param tierId The tier
     * @param tier The tier's stake and limits
     */
    event TierUpdated(uint256 indexed tierId, SpokePoolManagerStorage.Tier tier);

    /**
     * @notice Emitted when the factory is changed
     * @param oldFactory The previous factory
     * @param newFactory The new factory
     */
    event FactoryUpdated(SpokePoolFactory indexed oldFactory, SpokePoolFactory indexed newFactory);

    /**
     * @notice Emitted when the Hub source of an asset is changed
     * @param asset The loan asset
     * @param oldSource The previous source
     * @param newSource The new source
     */
    event SpokeSourceUpdated(address indexed asset, address oldSource, address newSource);

    /**
     * @notice Emitted when the Hub adapter is changed
     * @param oldAdapter The previous adapter
     * @param newAdapter The new adapter
     */
    event SpokeAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);

    /**
     * @notice Emitted when the minimum seed value is changed
     * @param oldMinSeedUsd The previous minimum, in USD scaled by 1e18
     * @param newMinSeedUsd The new minimum, in USD scaled by 1e18
     */
    event MinSeedUsdUpdated(uint256 oldMinSeedUsd, uint256 newMinSeedUsd);

    /**
     * @notice Emitted when the repayment window is changed
     * @param oldRepaymentWindow The previous window, in seconds
     * @param newRepaymentWindow The new window, in seconds
     */
    event RepaymentWindowUpdated(uint256 oldRepaymentWindow, uint256 newRepaymentWindow);

    /**
     * @notice Emitted when the residual debt a wound-down pool may hold is changed
     * @param oldMaxResidualDebtUsd The previous maximum, in USD scaled by 1e18
     * @param newMaxResidualDebtUsd The new maximum, in USD scaled by 1e18
     */
    event MaxResidualDebtUsdUpdated(uint256 oldMaxResidualDebtUsd, uint256 newMaxResidualDebtUsd);

    /**
     * @notice Emitted when the most markets a request may add is changed
     * @param oldMaxMarketsPerRequest The previous maximum
     * @param newMaxMarketsPerRequest The new maximum
     */
    event MaxMarketsPerRequestUpdated(uint256 oldMaxMarketsPerRequest, uint256 newMaxMarketsPerRequest);

    /**
     * @notice Emitted when a project submits a request
     * @param requestId The request
     * @param project The project that submitted it
     * @param comptroller The pool the markets are added to; zero for a request for a new pool
     * @param tierId The requested tier, or the pool's tier
     * @param params The requested pool or markets
     */
    event RequestSubmitted(
        uint256 indexed requestId,
        address indexed project,
        address indexed comptroller,
        uint256 tierId,
        SpokePoolManagerStorage.PoolParams params
    );

    /**
     * @notice Emitted when the proposal of a request is submitted
     * @param requestId The request
     * @param proposalId The proposal
     */
    event RequestProposed(uint256 indexed requestId, uint256 proposalId);

    /**
     * @notice Emitted when a request is rejected and its stake and seeds are returned
     * @param requestId The request
     */
    event RequestRejected(uint256 indexed requestId);

    /**
     * @notice Emitted when a request's pool is created and the deployer's rights start
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     */
    event PoolActivated(uint256 indexed requestId, address indexed comptroller, address indexed deployer);

    /**
     * @notice Emitted when a request's markets are added to its pool
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param vTokens The added markets
     */
    event MarketsAdded(uint256 indexed requestId, address indexed comptroller, address[] vTokens);

    /**
     * @notice Emitted when the deployer's functions are frozen or unfrozen
     * @param comptroller The pool's comptroller
     * @param frozen True if the deployer's functions are now frozen
     */
    event DeployerFrozenUpdated(address indexed comptroller, bool frozen);

    /**
     * @notice Emitted when a deployer asks to move its pool to another tier
     * @param comptroller The pool's comptroller
     * @param tierId The requested tier
     */
    event TierChangeRequested(address indexed comptroller, uint256 indexed tierId);

    /**
     * @notice Emitted when the Venus team moves a pool to another tier
     * @param comptroller The pool's comptroller
     * @param tierId The pool's new tier
     */
    event TierChanged(address indexed comptroller, uint256 indexed tierId);

    /**
     * @notice Emitted when a deployer asks to exit its pool
     * @param comptroller The pool's comptroller
     */
    event ExitRequested(address indexed comptroller);

    /**
     * @notice Emitted when the Venus team approves an exit and its first proposal is submitted
     * @param comptroller The pool's comptroller
     * @param proposalId The exit's first proposal
     */
    event ExitProposed(address indexed comptroller, uint256 proposalId);

    /**
     * @notice Emitted when an exit's first proposal executes and the repayment window opens
     * @param comptroller The pool's comptroller
     */
    event WindDownStarted(address indexed comptroller);

    /**
     * @notice Emitted when the proposal that force-closes the remaining borrows is submitted
     * @param comptroller The pool's comptroller
     * @param proposalId The exit's second proposal
     */
    event ForceCloseProposed(address indexed comptroller, uint256 proposalId);

    /**
     * @notice Emitted when a wound-down pool's stake is unlocked
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     * @param amount The XVS unlocked
     */
    event StakeReleased(address indexed comptroller, address indexed deployer, uint256 amount);

    /**
     * @notice Emitted when a pool is handed over to the DAO and its stake is unlocked
     * @param comptroller The pool's comptroller
     * @param deployer The pool's deployer
     * @param amount The XVS unlocked
     */
    event PoolHandedOver(address indexed comptroller, address indexed deployer, uint256 amount);

    /**
     * @notice Emitted when XVS is taken from a pool's locked stake for the account that covered its bad debt
     * @param comptroller The pool's comptroller
     * @param to The receiver of the XVS
     * @param amount The XVS taken
     */
    event StakeSeized(address indexed comptroller, address indexed to, uint256 amount);

    /**
     * @notice Thrown when `completeRequest` is called by an account other than the factory
     * @param caller The caller
     */
    error OnlyFactory(address caller);

    /**
     * @notice Thrown when a tier is not set, or is not a valid tier for the call
     * @param tierId The tier
     */
    error InvalidTier(uint256 tierId);

    /**
     * @notice Thrown when a request is not in a status the function accepts
     * @param requestId The request
     */
    error InvalidRequestStatus(uint256 requestId);

    /**
     * @notice Thrown when a request's markets are deployed for another pool than the request's
     * @param requestId The request
     * @param comptroller The pool the request adds markets to
     */
    error RequestPoolMismatch(uint256 requestId, address comptroller);

    /**
     * @notice Thrown when the completed parameters are not the ones the request was proposed with
     * @param requestId The request
     */
    error ParamsMismatch(uint256 requestId);

    /**
     * @notice Thrown when the proposed markets' assets or seeds differ from the request's escrowed seeds
     * @param requestId The request
     */
    error SeedsMismatch(uint256 requestId);

    /**
     * @notice Thrown when a request's proposal can still execute
     * @param proposalId The proposal
     */
    error ProposalNotFailed(uint256 proposalId);

    /// @notice Thrown when a pool would have no loan market
    error NoLoanMarket();

    /**
     * @notice Thrown when a request adds more markets than `maxMarketsPerRequest`
     * @param count The markets the request adds
     * @param maxCount The maximum
     */
    error TooManyMarkets(uint256 count, uint256 maxCount);

    /**
     * @notice Thrown when two markets of a pool share an asset
     * @param asset The asset
     */
    error DuplicateAsset(address asset);

    /**
     * @notice Thrown when a market's parameters are inconsistent with its kind, its seed or its seed burn share
     * @param asset The market's asset
     */
    error InvalidMarketParams(address asset);

    /**
     * @notice Thrown when a loan market's asset has no Hub source
     * @param asset The asset
     */
    error MissingSpokeSource(address asset);

    /// @notice Thrown when a parameter is beyond the pool's tier
    error ExceedsTierLimit();

    /**
     * @notice Thrown when a seed is worth less than `minSeedUsd`
     * @param asset The seed's asset
     */
    error SeedBelowMinimum(address asset);

    /**
     * @notice Thrown when a transfer delivers a different amount than requested
     * @param token The token
     */
    error TransferAmountMismatch(address token);

    /**
     * @notice Thrown when the caller is not the pool's deployer, or the deployer's rights have ended
     * @param comptroller The pool's comptroller
     * @param caller The caller
     */
    error NotDeployer(address comptroller, address caller);

    /**
     * @notice Thrown when a market is not listed in the pool
     * @param vToken The market
     */
    error MarketNotInPool(address vToken);

    /**
     * @notice Thrown when a collateral-only setting is applied to a loan market
     * @param vToken The market
     */
    error NotCollateralMarket(address vToken);

    /**
     * @notice Thrown when a loan-only setting is applied to a market that is not a loan market of the pool
     * @param vToken The market
     */
    error NotLoanMarket(address vToken);

    /**
     * @notice Thrown when the deployer's functions are frozen
     * @param comptroller The pool's comptroller
     */
    error DeployerFrozen(address comptroller);

    /**
     * @notice Thrown when a pool is not in a status the function accepts
     * @param comptroller The pool's comptroller
     */
    error InvalidPoolStatus(address comptroller);

    /// @notice Thrown when the repayment window has not elapsed
    error RepaymentWindowNotElapsed();

    /**
     * @notice Thrown when a pool's borrows and bad debt exceed `maxResidualDebtUsd`
     * @param debtUsd The pool's borrows and bad debt, in USD scaled by 1e18
     */
    error OutstandingDebt(uint256 debtUsd);

    /**
     * @notice Thrown when a pool changes tier while a market still has bad debt
     * @param vToken The market
     */
    error BadDebtOutstanding(address vToken);

    /**
     * @notice Thrown when the XVS owed to a coverer exceeds the pool's locked stake
     * @param required The XVS owed
     * @param available The pool's locked stake
     */
    error InsufficientLockedStake(uint256 required, uint256 available);

    /// @notice Thrown when the liquidation thresholds of an exit do not match the pool's markets
    error InvalidArrayLength();

    /**
     * @notice Thrown when an exit would raise a market's liquidation threshold
     * @param vToken The market
     */
    error InvalidLiquidationThreshold(address vToken);

    /// @notice Thrown when no loan market has borrows left to force-close
    error NoOutstandingBorrows();

    /**
     * @notice Requests a new pool of a tier, or new markets in the caller's pool. A request for a new pool locks the
     *   tier's stake of the caller's XVSVault stake, and every request escrows each market's seed from the caller. The
     *   stake and seeds are returned if the request is rejected; otherwise the seeds list the markets and the stake
     *   stays locked until the pool is wound down or handed over
     * @param comptroller The pool to add the markets to, or zero for a new pool
     * @param tierId The tier of a new pool; ignored for new markets, which follow their pool's tier
     * @param params The requested pool; only `params.markets` is used for new markets. The Venus team may change the
     *   parameters within the tier when it proposes the request, except each market's asset and seed
     * @return requestId The id of the request
     * @custom:event Emits RequestSubmitted; the vault emits StakeLocked for a new pool
     * @custom:error TooManyMarkets is thrown when the request has more than `maxMarketsPerRequest` markets
     * @custom:error InvalidTier is thrown when the tier of a new pool is not set
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error NoLoanMarket, DuplicateAsset, InvalidMarketParams, MissingSpokeSource or ExceedsTierLimit is thrown
     *   when the markets do not fit the tier
     * @custom:error SeedBelowMinimum is thrown when a seed is worth less than `minSeedUsd`
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount than requested
     * @custom:access Not restricted for a new pool; only the pool's deployer for new markets
     */
    function submitRequest(
        address comptroller,
        uint256 tierId,
        SpokePoolManagerStorage.PoolParams calldata params
    ) external returns (uint256 requestId);

    /**
     * @notice Sets the collateral factor and liquidation threshold of a collateral market of the deployer's pool,
     *   within the pool's tier
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @custom:event The comptroller emits NewCollateralFactor and NewLiquidationThreshold
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error NotCollateralMarket is thrown when the market is a loan market
     * @custom:error ExceedsTierLimit is thrown when either value is beyond the tier's maximum, or the liquidation
     *   threshold is below the tier's minimum
     * @custom:error The comptroller's `setCollateralFactor` errors, such as MarketNotListed for a market of another pool
     * @custom:access Only the pool's deployer, until the Venus team approves its exit
     */
    function setCollateralFactor(
        address comptroller,
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external;

    /**
     * @notice Sets supply caps of markets of the deployer's pool. A loan market's supply cap is the liquidity the Hub
     *   supplies it up to, so the loan markets' caps together must stay within the tier's liquidity in USD; collateral
     *   caps are not bounded
     * @param comptroller The pool's comptroller
     * @param vTokens The markets
     * @param newSupplyCaps The new supply caps, in each market's underlying
     * @custom:event The comptroller emits NewSupplyCap for each market
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error MarketNotInPool is thrown when a market is not listed in the pool
     * @custom:error ExceedsTierLimit is thrown when the loan markets' caps exceed the tier's liquidity
     * @custom:error InvalidArrayLength is thrown by the comptroller when the arrays are empty or differ in length
     * @custom:access Only the pool's deployer, until the Venus team approves its exit
     */
    function setMarketSupplyCaps(
        address comptroller,
        VToken[] calldata vTokens,
        uint256[] calldata newSupplyCaps
    ) external;

    /**
     * @notice Sets borrow caps of loan markets of the deployer's pool. Borrows are already bounded by the liquidity
     *   the tier allows, so the caps are not bounded further
     * @param comptroller The pool's comptroller
     * @param vTokens The loan markets
     * @param newBorrowCaps The new borrow caps, in each market's underlying
     * @custom:event The comptroller emits NewBorrowCap for each market
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error NotLoanMarket is thrown when a market is not a loan market of the pool
     * @custom:error InvalidArrayLength is thrown by the comptroller when the arrays are empty or differ in length
     * @custom:access Only the pool's deployer, until the Venus team approves its exit
     */
    function setMarketBorrowCaps(
        address comptroller,
        VToken[] calldata vTokens,
        uint256[] calldata newBorrowCaps
    ) external;

    /**
     * @notice Asks the Venus team to move the deployer's pool to another tier. The team moves it with `setPoolTier`
     *   once the pool's risk parameters fit the new tier; the stake difference is locked or unlocked then
     * @param comptroller The pool's comptroller
     * @param newTierId The requested tier
     * @custom:event Emits TierChangeRequested
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error InvalidTier is thrown when the tier is not set or is the pool's current tier
     * @custom:access Only the pool's deployer
     */
    function requestTierChange(address comptroller, uint256 newTierId) external;

    /**
     * @notice Asks the Venus team to wind the deployer's pool down. The deployer keeps its rights until the team
     *   approves the exit with `proposeExit`
     * @param comptroller The pool's comptroller
     * @custom:event Emits ExitRequested
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:access Only the pool's deployer
     */
    function requestExit(address comptroller) external;

    /**
     * @notice Proposes a request to GovernorBravo with its final parameters, agreed with the project off-chain. A
     *   request for a new pool gets a proposal that grants the pool's roles, deploys it through the factory, lists it
     *   and its markets with their seeds and registers each loan market with its asset's Hub source; a request for new
     *   markets gets one that deploys, lists and registers the markets. A request whose proposal was canceled, defeated
     *   or expired can be proposed again
     * @param requestId The request
     * @param params The final parameters; each market's asset and seed must match the request's, and only
     *   `params.markets` is used for new markets
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event Emits RequestProposed
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor proposed
     * @custom:error ProposalNotFailed is thrown when the request's proposal can still execute
     * @custom:error InvalidPoolStatus is thrown when the pool of a request for new markets is not live
     * @custom:error SeedsMismatch is thrown when the markets' assets or seeds differ from the request's
     * @custom:error NoLoanMarket, DuplicateAsset, InvalidMarketParams, MissingSpokeSource or ExceedsTierLimit is thrown
     *   when the markets do not fit the tier
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function propose(
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params,
        string calldata description
    ) external returns (uint256 proposalId);

    /**
     * @notice Rejects a request that is pending, or whose proposal was canceled, defeated or expired, and returns its
     *   stake and seeds to the project
     * @param requestId The request
     * @custom:event Emits RequestRejected; the vault emits StakeUnlocked for a request for a new pool
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor proposed
     * @custom:error ProposalNotFailed is thrown when the request's proposal can still execute
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function rejectRequest(uint256 requestId) external;

    /**
     * @notice Moves a pool to the tier its deployer asked for with `requestTierChange`, once the pool's current
     *   collateral factors, liquidation thresholds and loan liquidity fit that tier and no market has bad debt. The
     *   pool's locked stake becomes the new tier's stake: the difference is locked from or unlocked to the deployer's
     *   XVSVault stake. Only recorded bad debt is checked: the team heals or liquidates underwater accounts first
     * @param comptroller The pool's comptroller
     * @param newTierId The pool's new tier
     * @custom:event Emits TierChanged; the vault emits StakeLocked or StakeUnlocked
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     * @custom:error InvalidTier is thrown when the tier is not set or is the pool's current tier
     * @custom:error DeployerFrozen is thrown while the deployer's functions are frozen
     * @custom:error ExceedsTierLimit is thrown when a risk parameter or the loan liquidity does not fit the new tier
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function setPoolTier(address comptroller, uint256 newTierId) external;

    /**
     * @notice Approves a pool's exit, ending the deployer's rights, and submits the exit's first proposal. It pauses
     *   minting, borrowing and entering markets and zeroes the supply and borrow caps on every market, sets each
     *   collateral market's collateral factor to zero and its liquidation threshold to the given value, and starts the
     *   repayment window. Borrowers can still repay, redeem and be liquidated. Called again if that proposal fails
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds The new liquidation threshold of each market, in `getAllMarkets` order, scaled by
     *   1e18; each at most the market's current one. Entries of loan markets and unlisted markets are ignored
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event Emits ExitProposed
     * @custom:error InvalidPoolStatus is thrown unless the deployer asked to exit and the exit is not winding down yet
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId);

    /**
     * @notice Submits the exit's second proposal once the repayment window has elapsed with borrows left: collateral
     *   factors and liquidation thresholds go to zero and forced liquidation is enabled on every loan market with
     *   borrows, so liquidators can close them in full. Called again if that proposal fails
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event Emits ForceCloseProposed
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error RepaymentWindowNotElapsed is thrown before the repayment window ends
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId);

    /**
     * @notice Unlocks a wound-down pool's stake once its borrows and bad debt are worth at most `maxResidualDebtUsd`.
     *   The pool stays paused
     * @param comptroller The pool's comptroller
     * @custom:event Emits StakeReleased; the vault emits StakeUnlocked
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error OutstandingDebt is thrown when the pool's borrows and bad debt exceed `maxResidualDebtUsd`
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function releaseStake(address comptroller) external;

    /**
     * @notice Freezes or unfreezes a pool deployer's functions, e.g. while a compromised or misbehaving project is
     *   investigated. The pool itself keeps running and its stake stays locked
     * @param comptroller The pool's comptroller
     * @param frozen True to freeze the deployer's functions
     * @custom:event Emits DeployerFrozenUpdated
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist
     * @custom:access Controlled by AccessControlManager, granted to the Venus team and the Guardian
     */
    function setDeployerFrozen(address comptroller, bool frozen) external;

    /**
     * @notice Adds the next tier or updates an existing one, so tier ids stay sequential from 0. Pools of the tier are
     *   checked against the new limits from then on; values already set in them are not changed. A tier with a zero
     *   stake cannot be requested
     * @param tierId The tier to set: `tierCount` adds a tier, a lower id updates that tier
     * @param tier The tier's stake and limits
     * @custom:event Emits TierUpdated
     * @custom:error InvalidTier is thrown when the id is above `tierCount`
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setTier(uint256 tierId, SpokePoolManagerStorage.Tier calldata tier) external;

    /**
     * @notice Sets the factory that deploys pools. Proposals already submitted keep calling the factory they were
     *   built for, which can then no longer complete its request
     * @param newFactory The new factory
     * @custom:event Emits FactoryUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the factory is the zero address
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setFactory(SpokePoolFactory newFactory) external;

    /**
     * @notice Sets the Hub source (YieldGroup) that funds loan markets of an asset; zero disables loan markets of it
     * @param asset The loan asset
     * @param source The YieldGroup of the asset's Hub that holds spoke markets
     * @custom:event Emits SpokeSourceUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is the zero address
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setSpokeSource(address asset, address source) external;

    /**
     * @notice Sets the Hub adapter loan markets are registered with
     * @param adapter The new adapter
     * @custom:event Emits SpokeAdapterUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the adapter is the zero address
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setSpokeAdapter(address adapter) external;

    /**
     * @notice Sets the minimum USD value of each seed
     * @param newMinSeedUsd The new minimum, scaled by 1e18
     * @custom:event Emits MinSeedUsdUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMinSeedUsd(uint256 newMinSeedUsd) external;

    /**
     * @notice Sets the time borrowers have to repay after an exit's first proposal executes
     * @param newRepaymentWindow The new window, in seconds
     * @custom:event Emits RepaymentWindowUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setRepaymentWindow(uint256 newRepaymentWindow) external;

    /**
     * @notice Sets the borrows and bad debt a wound-down pool may still hold when its stake is released
     * @param newMaxResidualDebtUsd The new maximum, in USD scaled by 1e18
     * @custom:event Emits MaxResidualDebtUsdUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMaxResidualDebtUsd(uint256 newMaxResidualDebtUsd) external;

    /**
     * @notice Sets the most markets a request may add. It should keep the largest request's proposal within
     *   GovernorBravo's action limit
     * @param newMaxMarketsPerRequest The new maximum
     * @custom:event Emits MaxMarketsPerRequestUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMaxMarketsPerRequest(uint256 newMaxMarketsPerRequest) external;

    /**
     * @notice Opens the repayment window of an approved exit. Called by the exit's first proposal as its last action
     * @param comptroller The pool's comptroller
     * @custom:event Emits WindDownStarted
     * @custom:error InvalidPoolStatus is thrown when the exit is not approved
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function startWindDown(address comptroller) external;

    /**
     * @notice Hands a pool over to the DAO as an official pool: the deployer's rights end and its stake is unlocked,
     *   while the pool keeps running. The same proposal should revoke the manager's roles on the pool and point each
     *   market's `shortfall` at whatever recovers its bad debt from then on
     * @param comptroller The pool's comptroller
     * @custom:event Emits PoolHandedOver; the vault emits StakeUnlocked
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist, is closed or was handed over
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function releaseToDao(address comptroller) external;

    /**
     * @notice Completes a proposed request once the factory deployed its contracts: records the new pool and starts its
     *   deployer's rights, or records the new markets of the request's pool, then sends the seeds to the proposal's
     *   executor, which lists the markets with them in the same proposal
     * @param requestId The request
     * @param comptroller The new pool's comptroller, or the pool the markets were added to
     * @param params The parameters the request was proposed with
     * @param vTokens The deployed markets, in the order of `params.markets`
     * @param executor The timelock executing the proposal, as authorized by the factory
     * @custom:event Emits PoolActivated for a new pool, MarketsAdded otherwise
     * @custom:error OnlyFactory is thrown when the caller is not the factory
     * @custom:error InvalidRequestStatus is thrown when the request is not proposed
     * @custom:error ParamsMismatch is thrown when the parameters are not the proposed ones
     * @custom:error RequestPoolMismatch is thrown when the markets were deployed for another pool than the request's
     * @custom:error InvalidPoolStatus is thrown when a new pool's comptroller is already a pool, or the request's pool is
     *   no longer live
     * @custom:access Only the factory
     */
    function completeRequest(
        uint256 requestId,
        address comptroller,
        SpokePoolManagerStorage.PoolParams calldata params,
        address[] calldata vTokens,
        address executor
    ) external;

    /**
     * @notice Takes XVS from a pool's locked stake and sends it to the account that covered the pool's bad debt
     * @param comptroller The pool's comptroller
     * @param amount The XVS to take
     * @param to The receiver of the XVS
     * @custom:event Emits StakeSeized; the vault emits Claim and LockedStakeSeized
     * @custom:error InvalidPoolStatus is thrown when the pool does not exist
     * @custom:error InsufficientLockedStake is thrown when the amount exceeds the pool's locked stake
     * @custom:access Controlled by AccessControlManager, granted to the SpokePoolShortfallReceiver
     */
    function seizeStake(address comptroller, uint256 amount, address to) external;
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

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
     * @notice Thrown when the caller is not the pool's deployer
     * @param comptroller The pool's comptroller
     * @param caller The caller
     */
    error NotDeployer(address comptroller, address caller);

    /**
     * @notice Thrown when a pool is not in a status the function accepts
     * @param comptroller The pool's comptroller
     */
    error InvalidPoolStatus(address comptroller);

    /**
     * @notice Requests a new pool of a tier, or new markets in the caller's pool. A request for a new pool locks the
     *   tier's stake of the caller's XVSVault stake, and every request escrows each market's seed from the caller. The
     *   stake and seeds are returned if the request is rejected; otherwise the seeds list the markets and the stake
     *   stays locked for the pool
     * @param comptroller The pool to add the markets to, or zero for a new pool
     * @param tierId The tier of a new pool; ignored for new markets, which follow their pool's tier
     * @param params The requested pool; only `params.markets` is used for new markets. The Venus team may change the
     *   parameters within the tier when it proposes the request, except each market's asset and seed
     * @return requestId The id of the request
     * @custom:event Emits RequestSubmitted; the vault emits StakeLocked for a new pool
     * @custom:error TooManyMarkets is thrown when the request has more than `maxMarketsPerRequest` markets
     * @custom:error InvalidTier is thrown when the tier of a new pool is not set
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
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
     * @notice Sets the most markets a request may add. It should keep the largest request's proposal within
     *   GovernorBravo's action limit
     * @param newMaxMarketsPerRequest The new maximum
     * @custom:event Emits MaxMarketsPerRequestUpdated
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMaxMarketsPerRequest(uint256 newMaxMarketsPerRequest) external;

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
}

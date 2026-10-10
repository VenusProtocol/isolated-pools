// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistryInterface } from "../../Pool/PoolRegistryInterface.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IGovernorBravo, PROPOSAL_STATE_CANCELED, PROPOSAL_STATE_DEFEATED, PROPOSAL_STATE_EXPIRED } from "../interfaces/IGovernorBravo.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { SpokePoolFactory } from "./SpokePoolFactory.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools for projects. A project stakes XVS in the XVSVault and requests a pool of a
 * tier: the manager locks the tier's stake in the vault. A pool's deployer requests new markets the same way, and
 * tunes its pool within its tier: the manager checks the deployer and the tier and writes to the pool's comptroller
 * with the pool-specific ACM roles it holds. The deployer can sunset a market by zeroing its caps and collateral
 * factor. The manager keeps every request's and pool's state: `SpokePoolProposer` puts requests and exits to a vote
 * and records them here, `SpokePoolFactory` completes a request when its proposal executes, and `SpokePoolShortfall`
 * pays bad debt coverers from a pool's locked stake.
 * @dev The manager needs the XVSVault `lock`, `unlock` and `seizeLocked` roles. Public variable getters are not in
 * `ISpokePoolManager`: they live in the sibling base `SpokePoolManagerStorage`.
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolManager is
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    SpokePoolManagerStorage,
    ISpokePoolManager
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The vault project stakes are locked in
    IXVSVault public immutable XVS_VAULT;

    /// @notice The governor the pools' proposals are submitted to; the manager reads their states
    IGovernorBravo public immutable GOVERNOR_BRAVO;

    /// @notice The registry spoke pools are listed in
    address public immutable POOL_REGISTRY;

    /// @notice The oracle every pool prices with
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @notice The oracle every pool bounds collateral prices with; a collateral asset needs bounded pricing enabled
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

    /// @notice Most markets a pool may have. `SpokePoolProposer` checks that a pool-creation proposal listing this many
    ///   fits GovernorBravo's action limit, so every proposal of a pool does
    uint256 public immutable MAX_POOL_MARKETS;

    /**
     * @param xvsVault The vault project stakes are locked in
     * @param governorBravo The governor the pools' proposals are submitted to
     * @param poolRegistry The registry spoke pools are listed in
     * @param resilientOracle The oracle every pool prices with
     * @param deviationBoundedOracle The oracle every pool bounds collateral prices with
     * @param maxPoolMarkets The most markets a pool may have; 12 at most with GovernorBravo's 100 actions
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        IXVSVault xvsVault,
        IGovernorBravo governorBravo,
        address poolRegistry,
        ResilientOracleInterface resilientOracle,
        IDeviationBoundedOracle deviationBoundedOracle,
        uint256 maxPoolMarkets
    ) {
        ensureNonzeroAddress(address(xvsVault));
        ensureNonzeroAddress(address(governorBravo));
        ensureNonzeroAddress(poolRegistry);
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(address(deviationBoundedOracle));

        XVS_VAULT = xvsVault;
        GOVERNOR_BRAVO = governorBravo;
        POOL_REGISTRY = poolRegistry;
        RESILIENT_ORACLE = resilientOracle;
        DEVIATION_BOUNDED_ORACLE = deviationBoundedOracle;
        MAX_POOL_MARKETS = maxPoolMarkets;

        _disableInitializers();
    }

    /**
     * @notice Initializes the manager
     * @param accessControlManager_ The AccessControlManager the manager checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
        __ReentrancyGuard_init();
    }

    /*** Project functions ***/

    /// @inheritdoc ISpokePoolManager
    function submitRequest(
        address comptroller,
        uint256 tierId,
        PoolParams calldata params
    ) external nonReentrant returns (uint256 requestId) {
        uint256 stakeAmount;
        if (comptroller == address(0)) {
            stakeAmount = _ensureTier(tierId).stakeAmount;
        } else {
            tierId = _ensureDeployer(comptroller).tierId;
        }
        _validateMarkets(comptroller, tierId, params.markets);

        requestId = ++requestCount;
        Request storage request = requests[requestId];
        request.project = msg.sender;
        request.status = RequestStatus.Pending;
        request.comptroller = comptroller;
        request.tierId = tierId;
        request.stakeAmount = stakeAmount;
        if (stakeAmount != 0) {
            XVS_VAULT.lock(msg.sender, stakeAmount);
        }

        emit RequestSubmitted(requestId, msg.sender, comptroller, tierId, params);
    }

    /// @inheritdoc ISpokePoolManager
    function claimSeeds(uint256 requestId) external nonReentrant {
        Request storage request = _ensureRequestStatus(requestId, RequestStatus.Rejected);
        _sendSeeds(request, request.project);

        emit SeedsClaimed(requestId);
    }

    /*** Deployer functions ***/

    /// @inheritdoc ISpokePoolManager
    function setCollateralFactor(
        address comptroller,
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external {
        Pool storage pool = _ensureDeployer(comptroller);
        (, uint256 liquidationThreshold) = _collateralMarket(comptroller, vToken);
        _checkCollateralParams(tiers[pool.tierId], newCollateralFactorMantissa, newLiquidationThresholdMantissa);
        if (newLiquidationThresholdMantissa < liquidationThreshold) {
            revert InvalidLiquidationThreshold(address(vToken));
        }

        SpokeComptroller(comptroller).setCollateralFactor(
            vToken,
            newCollateralFactorMantissa,
            newLiquidationThresholdMantissa
        );
        if (
            newLiquidationThresholdMantissa > liquidationThreshold &&
            pendingLiquidationThresholds[address(vToken)].scheduledAt != 0
        ) {
            delete pendingLiquidationThresholds[address(vToken)];
            emit LiquidationThresholdDecreaseCancelled(comptroller, address(vToken));
        }
    }

    /// @inheritdoc ISpokePoolManager
    function scheduleLiquidationThresholdDecrease(
        address comptroller,
        VToken vToken,
        uint256 newLiquidationThresholdMantissa
    ) external {
        Pool storage pool = _ensureDeployer(comptroller);
        (uint256 collateralFactor, uint256 liquidationThreshold) = _collateralMarket(comptroller, vToken);
        _checkCollateralParams(tiers[pool.tierId], collateralFactor, newLiquidationThresholdMantissa);
        if (
            newLiquidationThresholdMantissa >= liquidationThreshold ||
            newLiquidationThresholdMantissa < collateralFactor
        ) {
            revert InvalidLiquidationThreshold(address(vToken));
        }

        pendingLiquidationThresholds[address(vToken)] = PendingLiquidationThreshold(
            newLiquidationThresholdMantissa,
            block.timestamp
        );

        emit LiquidationThresholdDecreaseScheduled(comptroller, address(vToken), newLiquidationThresholdMantissa);
    }

    /// @inheritdoc ISpokePoolManager
    function applyLiquidationThresholdDecrease(address comptroller, VToken vToken) external {
        Pool storage pool = _ensureDeployer(comptroller);
        PendingLiquidationThreshold memory pending = pendingLiquidationThresholds[address(vToken)];
        uint256 readyAt = pending.scheduledAt + liquidationThresholdDelay;
        if (pending.scheduledAt == 0 || block.timestamp < readyAt) {
            revert LiquidationThresholdDelayNotElapsed(address(vToken));
        }
        if (block.timestamp > readyAt + liquidationThresholdBufferPeriod) {
            revert LiquidationThresholdDecreaseExpired(address(vToken));
        }
        delete pendingLiquidationThresholds[address(vToken)];

        (uint256 collateralFactor, ) = _collateralMarket(comptroller, vToken);
        _checkCollateralParams(tiers[pool.tierId], collateralFactor, pending.liquidationThreshold);
        SpokeComptroller(comptroller).setCollateralFactor(vToken, collateralFactor, pending.liquidationThreshold);
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketSupplyCaps(
        address comptroller,
        VToken[] calldata vTokens,
        uint256[] calldata newSupplyCaps
    ) external {
        Pool storage pool = _ensureDeployer(comptroller);
        uint256 marketCount = vTokens.length;
        if (marketCount != newSupplyCaps.length) {
            revert InvalidArrayLength();
        }
        bool loanCapRaised;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = vTokens[i];
            if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
                revert MarketNotInPool(address(vToken));
            }
            if (
                isLoanMarket[address(vToken)] &&
                newSupplyCaps[i] > SpokeComptroller(comptroller).supplyCaps(address(vToken))
            ) {
                loanCapRaised = true;
            }
        }

        SpokeComptroller(comptroller).setMarketSupplyCaps(vTokens, newSupplyCaps);

        if (
            loanCapRaised &&
            _loanLiquidityUsd(comptroller, SpokeComptroller(comptroller).getAllMarkets()) >
            tiers[pool.tierId].maxLiquidityUsd
        ) {
            revert ExceedsTierLimit();
        }
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketBorrowCaps(
        address comptroller,
        VToken[] calldata vTokens,
        uint256[] calldata newBorrowCaps
    ) external {
        _ensureDeployer(comptroller);
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = vTokens[i];
            if (!isLoanMarket[address(vToken)] || !SpokeComptroller(comptroller).isMarketListed(vToken)) {
                revert NotLoanMarket(address(vToken));
            }
        }

        SpokeComptroller(comptroller).setMarketBorrowCaps(vTokens, newBorrowCaps);
    }

    /// @inheritdoc ISpokePoolManager
    function topUpStake(address comptroller) external nonReentrant {
        Pool storage pool = _ensureCallerIsDeployer(comptroller);
        uint256 required = tiers[pool.tierId].stakeAmount;
        uint256 lockedStake = pool.lockedStake;
        if (lockedStake >= required) {
            return;
        }
        uint256 amount = required - lockedStake;
        pool.lockedStake = required;
        XVS_VAULT.lock(msg.sender, amount);

        emit StakeToppedUp(comptroller, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierChange(address comptroller, uint256 newTierId) external {
        Pool storage pool = _ensureDeployer(comptroller);
        _ensureTier(newTierId);
        if (newTierId == pool.tierId) {
            revert InvalidTier(newTierId);
        }

        emit TierChangeRequested(comptroller, newTierId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        _ensureDeployer(comptroller).status = PoolStatus.ExitRequested;
        emit ExitRequested(comptroller);
    }

    /*** Venus team functions ***/

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");

        Request storage request = _ensureOpenRequest(requestId);
        request.status = RequestStatus.Rejected;
        uint256 stakeAmount = request.stakeAmount;
        if (stakeAmount != 0) {
            XVS_VAULT.unlock(request.project, stakeAmount);
        }

        emit RequestRejected(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolTier(address comptroller, uint256 newTierId) external nonReentrant {
        _checkAccessAllowed("setPoolTier(address,uint256)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.Live);
        Tier storage tier = _ensureTier(newTierId);
        if (newTierId == pool.tierId) {
            revert InvalidTier(newTierId);
        }
        if (pool.deployerActionsPaused) {
            revert DeployerActionsPaused(comptroller);
        }
        _checkPoolFitsTier(comptroller, tier);

        uint256 newStake = tier.stakeAmount;
        uint256 lockedStake = pool.lockedStake;
        pool.tierId = newTierId;
        pool.lockedStake = newStake;
        if (newStake > lockedStake) {
            XVS_VAULT.lock(pool.deployer, newStake - lockedStake);
        } else if (newStake < lockedStake) {
            XVS_VAULT.unlock(pool.deployer, lockedStake - newStake);
        }

        emit TierChanged(comptroller, newTierId);
    }

    /// @inheritdoc ISpokePoolManager
    function setDeployerActionsPaused(address comptroller, bool paused) external {
        _checkAccessAllowed("setDeployerActionsPaused(address,bool)");

        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }
        emit DeployerActionsPausedUpdated(comptroller, paused);
        pool.deployerActionsPaused = paused;
    }

    /// @inheritdoc ISpokePoolManager
    function rejectExit(address comptroller) external {
        _checkAccessAllowed("rejectExit(address)");

        Pool storage pool = pools[comptroller];
        if (pool.status != PoolStatus.ExitRequested && pool.status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.Live;

        emit ExitRejected(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function releaseStake(address comptroller) external {
        _checkAccessAllowed("releaseStake(address)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        uint256 debtUsd = _poolDebtUsd(comptroller);
        if (debtUsd > maxResidualDebtUsd) {
            revert OutstandingDebt(debtUsd);
        }

        pool.status = PoolStatus.Closed;
        uint256 amount = _unlockStake(pool);

        emit StakeReleased(comptroller, pool.deployer, amount);
    }

    /*** Governance functions ***/

    /// @inheritdoc ISpokePoolManager
    function setTier(uint256 tierId, Tier calldata tier) external {
        _checkAccessAllowed("setTier(uint256,Tier)");
        if (tierId > tierCount) {
            revert InvalidTier(tierId);
        }
        if (tierId == tierCount) {
            ++tierCount;
        }
        emit TierUpdated(tierId, tier);
        tiers[tierId] = tier;
    }

    /// @inheritdoc ISpokePoolManager
    function setFactory(SpokePoolFactory newFactory) external {
        _checkAccessAllowed("setFactory(address)");
        ensureNonzeroAddress(address(newFactory));
        emit FactoryUpdated(SpokePoolFactory(factory), newFactory);
        factory = address(newFactory);
    }

    /// @inheritdoc ISpokePoolManager
    function setSpokeSource(address asset, address source) external {
        _checkAccessAllowed("setSpokeSource(address,address)");
        ensureNonzeroAddress(asset);
        emit SpokeSourceUpdated(asset, spokeSources[asset], source);
        spokeSources[asset] = source;
    }

    /// @inheritdoc ISpokePoolManager
    function setSpokeAdapter(address adapter) external {
        _checkAccessAllowed("setSpokeAdapter(address)");
        ensureNonzeroAddress(adapter);
        emit SpokeAdapterUpdated(spokeAdapter, adapter);
        spokeAdapter = adapter;
    }

    /// @inheritdoc ISpokePoolManager
    function setMinSeedUsd(uint256 newMinSeedUsd) external {
        _checkAccessAllowed("setMinSeedUsd(uint256)");
        emit MinSeedUsdUpdated(minSeedUsd, newMinSeedUsd);
        minSeedUsd = newMinSeedUsd;
    }

    /// @inheritdoc ISpokePoolManager
    function setLiquidationThresholdDelay(uint256 newDelay) external {
        _checkAccessAllowed("setLiquidationThresholdDelay(uint256)");
        emit LiquidationThresholdDelayUpdated(liquidationThresholdDelay, newDelay);
        liquidationThresholdDelay = newDelay;
    }

    /// @inheritdoc ISpokePoolManager
    function setLiquidationThresholdBufferPeriod(uint256 newBufferPeriod) external {
        _checkAccessAllowed("setLiquidationThresholdBufferPeriod(uint256)");
        emit LiquidationThresholdBufferPeriodUpdated(liquidationThresholdBufferPeriod, newBufferPeriod);
        liquidationThresholdBufferPeriod = newBufferPeriod;
    }

    /// @inheritdoc ISpokePoolManager
    function setRepaymentWindow(uint256 newRepaymentWindow) external {
        _checkAccessAllowed("setRepaymentWindow(uint256)");
        emit RepaymentWindowUpdated(repaymentWindow, newRepaymentWindow);
        repaymentWindow = newRepaymentWindow;
    }

    /// @inheritdoc ISpokePoolManager
    function setMaxResidualDebtUsd(uint256 newMaxResidualDebtUsd) external {
        _checkAccessAllowed("setMaxResidualDebtUsd(uint256)");
        emit MaxResidualDebtUsdUpdated(maxResidualDebtUsd, newMaxResidualDebtUsd);
        maxResidualDebtUsd = newMaxResidualDebtUsd;
    }

    /// @inheritdoc ISpokePoolManager
    function startWindDown(address comptroller) external {
        _checkAccessAllowed("startWindDown(address)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.ExitProposed);
        pool.status = PoolStatus.WindingDown;
        pool.windDownStartedAt = block.timestamp;

        emit WindDownStarted(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function takeOverPool(address comptroller) external {
        _checkAccessAllowed("takeOverPool(address)");

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.TakenOver;
        uint256 amount = _unlockStake(pool);

        emit PoolTakenOver(comptroller, pool.deployer, amount);
    }

    /*** Proposer functions ***/

    /// @inheritdoc ISpokePoolManager
    function recordRequestProposal(
        uint256 requestId,
        MarketParams[] calldata markets,
        uint256 proposalId
    ) external nonReentrant {
        _checkAccessAllowed("recordRequestProposal(uint256,MarketParams[],uint256)");
        _ensureCallerProposed(proposalId);

        Request storage request = _ensureOpenRequest(requestId);
        _validateRequestMarkets(request, markets);
        _pullSeeds(request, markets);
        request.status = RequestStatus.Proposed;
        request.proposalId = proposalId;

        emit RequestProposed(requestId, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function recordExitProposal(address comptroller, uint256 proposalId) external {
        _checkAccessAllowed("recordExitProposal(address,uint256)");
        _ensureCallerProposed(proposalId);

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.ExitProposed;

        emit ExitProposed(comptroller, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function recordForceCloseProposal(address comptroller, uint256 proposalId) external {
        _checkAccessAllowed("recordForceCloseProposal(address,uint256)");
        _ensureCallerProposed(proposalId);

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + repaymentWindow) {
            revert RepaymentWindowNotElapsed();
        }

        emit ForceCloseProposed(comptroller, proposalId);
    }

    /*** Factory functions ***/

    /// @inheritdoc ISpokePoolManager
    function completeRequest(
        uint256 requestId,
        address comptroller,
        PoolParams calldata params,
        address[] calldata vTokens,
        address executor
    ) external nonReentrant {
        if (msg.sender != factory) {
            revert OnlyFactory(msg.sender);
        }
        Request storage request = _ensureRequestStatus(requestId, RequestStatus.Proposed);
        _checkSeeds(requestId, request, params.markets);

        request.status = RequestStatus.Executed;
        address requestPool = request.comptroller;
        if (requestPool != address(0) && requestPool != comptroller) {
            revert RequestPoolMismatch(requestId, requestPool);
        }
        // The pool and its tier may have changed during the vote; the new markets are not listed yet
        uint256 tierId = _validateRequestMarkets(request, params.markets);

        address project = request.project;
        if (requestPool == address(0)) {
            Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.None);
            pool.deployer = project;
            pool.status = PoolStatus.Live;
            pool.tierId = tierId;
            pool.lockedStake = request.stakeAmount;
            emit PoolActivated(requestId, comptroller, project);
        } else {
            emit MarketsAdded(requestId, comptroller, vTokens);
        }

        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (params.markets[i].isLoanMarket) {
                isLoanMarket[vTokens[i]] = true;
            }
        }
        _sendSeeds(request, executor);
    }

    /*** Shortfall functions ***/

    /// @inheritdoc ISpokePoolManager
    function seizeStake(address comptroller, uint256 amount, address to) external {
        _checkAccessAllowed("seizeStake(address,uint256,address)");

        Pool storage pool = pools[comptroller];
        uint256 lockedStake = pool.lockedStake;
        if (amount > lockedStake) {
            revert InsufficientLockedStake(amount, lockedStake);
        }
        pool.lockedStake = lockedStake - amount;
        XVS_VAULT.seizeLocked(pool.deployer, amount, to);

        emit StakeSeized(comptroller, to, amount);
    }

    /*** Internal functions ***/

    /**
     * @dev Returns a failed proposal's seeds to a request's project, then pulls each market's seed from the project into
     * the manager and records it, rejecting assets that deliver a different amount
     * @param request The request's storage
     * @param markets The final markets
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount than requested
     */
    function _pullSeeds(Request storage request, MarketParams[] calldata markets) internal {
        address project = request.project;
        _sendSeeds(request, project);
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            MarketParams calldata market = markets[i];
            request.seedAssets.push(market.asset);
            request.seedAmounts.push(market.seed);
            IERC20Upgradeable asset = IERC20Upgradeable(market.asset);
            uint256 balanceBefore = asset.balanceOf(address(this));
            asset.safeTransferFrom(project, address(this), market.seed);
            if (asset.balanceOf(address(this)) - balanceBefore != market.seed) {
                revert TransferAmountMismatch(market.asset);
            }
        }
    }

    /**
     * @dev Sends the seeds the manager holds for a request and clears the record; nothing when it holds none
     * @param request The request's storage
     * @param to The receiver
     */
    function _sendSeeds(Request storage request, address to) internal {
        uint256 seedCount = request.seedAssets.length;
        for (uint256 i; i < seedCount; ++i) {
            IERC20Upgradeable(request.seedAssets[i]).safeTransfer(to, request.seedAmounts[i]);
        }
        delete request.seedAssets;
        delete request.seedAmounts;
    }

    /**
     * @dev Unlocks whatever stake is still locked for a pool
     * @param pool The pool's storage
     * @return amount The amount unlocked
     */
    function _unlockStake(Pool storage pool) internal returns (uint256 amount) {
        amount = pool.lockedStake;
        if (amount != 0) {
            pool.lockedStake = 0;
            XVS_VAULT.unlock(pool.deployer, amount);
        }
    }

    /**
     * @dev Accrues interest in every market of a pool, then returns its borrows and bad debt in USD; markets without
     * either are not priced
     * @param comptroller The pool's comptroller
     * @return debtUsd The borrows and bad debt, in USD scaled by 1e18
     */
    function _poolDebtUsd(address comptroller) internal returns (uint256 debtUsd) {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            vToken.accrueInterest();
            uint256 debt = vToken.totalBorrows() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * RESILIENT_ORACLE.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }
    }

    /**
     * @dev Returns a tier after checking it is set
     * @param tierId The tier
     * @return tier The tier's storage
     * @custom:error InvalidTier is thrown when the tier is not set
     */
    function _ensureTier(uint256 tierId) internal view returns (Tier storage tier) {
        tier = tiers[tierId];
        if (tier.stakeAmount == 0) {
            revert InvalidTier(tierId);
        }
    }

    /**
     * @dev Returns a pool after checking the caller holds its deployer rights and may use them
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer is thrown as in `_ensureCallerIsDeployer`
     * @custom:error DeployerActionsPaused is thrown while the Venus team has paused the deployer's actions
     * @custom:error InsufficientLockedStake is thrown while the pool's locked stake is below its tier's stake
     */
    function _ensureDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = _ensureCallerIsDeployer(comptroller);
        if (pool.deployerActionsPaused) {
            revert DeployerActionsPaused(comptroller);
        }
        uint256 required = tiers[pool.tierId].stakeAmount;
        if (pool.lockedStake < required) {
            revert InsufficientLockedStake(required, pool.lockedStake);
        }
    }

    /**
     * @dev Returns a pool after checking the caller is its deployer and still holds its rights: the pool is live, or
     *   live with an exit requested
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     */
    function _ensureCallerIsDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (
            pool.deployer != msg.sender || (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested)
        ) {
            revert NotDeployer(comptroller, msg.sender);
        }
    }

    /**
     * @dev Returns a pool after checking its status
     * @param comptroller The pool's comptroller
     * @param status The status the pool must be in
     * @return pool The pool's storage
     * @custom:error InvalidPoolStatus is thrown when the pool is in another status
     */
    function _ensurePoolStatus(address comptroller, PoolStatus status) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.status != status) {
            revert InvalidPoolStatus(comptroller);
        }
    }

    /**
     * @dev Returns a request after checking its status
     * @param requestId The request
     * @param status The status the request must be in
     * @return request The request's storage
     * @custom:error InvalidRequestStatus is thrown when the request is in another status
     */
    function _ensureRequestStatus(
        uint256 requestId,
        RequestStatus status
    ) internal view returns (Request storage request) {
        request = requests[requestId];
        if (request.status != status) {
            revert InvalidRequestStatus(requestId);
        }
    }

    /**
     * @dev Returns a request after checking it is open: pending, or proposed with a proposal that can no longer execute
     * @param requestId The request
     * @return request The request's storage
     * @custom:error InvalidRequestStatus is thrown when the request is neither pending nor proposed
     * @custom:error ProposalNotFailed is thrown when the request's proposal can still execute
     */
    function _ensureOpenRequest(uint256 requestId) internal view returns (Request storage request) {
        request = requests[requestId];
        if (request.status == RequestStatus.Proposed) {
            uint8 state = GOVERNOR_BRAVO.state(request.proposalId);
            if (
                state != PROPOSAL_STATE_CANCELED && state != PROPOSAL_STATE_DEFEATED && state != PROPOSAL_STATE_EXPIRED
            ) {
                revert ProposalNotFailed(request.proposalId);
            }
        } else if (request.status != RequestStatus.Pending) {
            revert InvalidRequestStatus(requestId);
        }
    }

    /**
     * @dev Checks that a proposal is the caller's latest GovernorBravo proposal, so only a proposal the caller
     * submitted is recorded
     * @param proposalId The proposal
     * @custom:error NotLatestProposal is thrown when the caller's latest proposal is another one
     */
    function _ensureCallerProposed(uint256 proposalId) internal view {
        if (proposalId == 0 || GOVERNOR_BRAVO.latestProposalIds(msg.sender) != proposalId) {
            revert NotLatestProposal(proposalId);
        }
    }

    /**
     * @dev Checks a request's markets against the tier they join: the request's tier for a new pool, or the live pool's
     * current tier for new markets
     * @param request The request's storage
     * @param markets The markets
     * @return tierId The tier
     * @custom:error InvalidPoolStatus is thrown when the pool of a request for new markets is not live
     * @custom:error The errors of `_validateMarkets`
     */
    function _validateRequestMarkets(
        Request storage request,
        MarketParams[] calldata markets
    ) internal view returns (uint256 tierId) {
        address comptroller = request.comptroller;
        tierId = request.tierId;
        if (comptroller != address(0)) {
            tierId = _ensurePoolStatus(comptroller, PoolStatus.Live).tierId;
        }
        _validateMarkets(comptroller, tierId, markets);
    }

    /**
     * @dev Checks a request's markets against a tier, as described in `submitRequest`
     * @param comptroller The pool the markets are added to, or zero for a new pool
     * @param tierId The tier
     * @param markets The markets
     * @custom:error TooManyMarkets is thrown when the pool would have more than `MAX_POOL_MARKETS` markets
     * @custom:error NoLoanMarket is thrown when a new pool has no loan market
     * @custom:error ExceedsTierLimit is thrown when the loan markets' supply caps, together with the pool's, are beyond
     *   the tier's liquidity
     * @custom:error The errors of `_checkNewAsset` and `_validateMarket`
     */
    function _validateMarkets(address comptroller, uint256 tierId, MarketParams[] calldata markets) internal view {
        Tier storage tier = tiers[tierId];
        uint256 marketCount = markets.length;
        uint256 poolMarketCount = marketCount;
        uint256 liquidityUsd;
        if (comptroller != address(0)) {
            VToken[] memory poolMarkets = SpokeComptroller(comptroller).getAllMarkets();
            poolMarketCount += poolMarkets.length;
            liquidityUsd = _loanLiquidityUsd(comptroller, poolMarkets);
        }
        if (poolMarketCount > MAX_POOL_MARKETS) {
            revert TooManyMarkets(poolMarketCount, MAX_POOL_MARKETS);
        }
        bool hasLoanMarket = comptroller != address(0);
        for (uint256 i; i < marketCount; ++i) {
            MarketParams calldata market = markets[i];
            _checkNewAsset(comptroller, markets, i);
            liquidityUsd += _validateMarket(tier, market);
            hasLoanMarket = hasLoanMarket || market.isLoanMarket;
        }
        if (!hasLoanMarket) {
            revert NoLoanMarket();
        }
        if (liquidityUsd > tier.maxLiquidityUsd) {
            revert ExceedsTierLimit();
        }
    }

    /**
     * @dev Checks that a request's market has an asset no earlier market of the request has, and that the pool does not
     * already list
     * @param comptroller The pool the markets are added to, or zero for a new pool
     * @param markets The request's markets
     * @param index The market to check
     * @custom:error DuplicateAsset is thrown when the asset is taken
     */
    function _checkNewAsset(address comptroller, MarketParams[] calldata markets, uint256 index) internal view {
        address asset = markets[index].asset;
        // A nested loop is fine here: a pool has at most `MAX_POOL_MARKETS` markets
        for (uint256 j; j < index; ++j) {
            if (markets[j].asset == asset) {
                revert DuplicateAsset(asset);
            }
        }
        if (
            comptroller != address(0) &&
            PoolRegistryInterface(POOL_REGISTRY).getVTokenForAsset(comptroller, asset) != address(0)
        ) {
            revert DuplicateAsset(asset);
        }
    }

    /**
     * @dev Checks one market against a tier, as described in `submitRequest`
     * @param tier The tier
     * @param market The market
     * @return liquidityUsd The USD value of a loan market's supply cap, scaled by 1e18; zero for a collateral market
     * @custom:error InvalidMarketParams is thrown when the market's parameters do not fit its kind, its seed or its
     *   seed burn share
     * @custom:error SeedBelowMinimum is thrown when the seed is worth less than `minSeedUsd`
     * @custom:error MissingSpokeSource is thrown when a loan asset has no Hub source
     * @custom:error ExceedsTierLimit is thrown when a collateral parameter is beyond the tier
     * @custom:error BoundedPricingDisabled is thrown when a collateral asset has no bounded pricing
     */
    function _validateMarket(
        Tier storage tier,
        MarketParams calldata market
    ) internal view returns (uint256 liquidityUsd) {
        if (
            market.seed == 0 ||
            market.seed > market.supplyCap ||
            market.seedBurnShare > MANTISSA_ONE ||
            market.initialExchangeRate == 0
        ) {
            revert InvalidMarketParams(market.asset);
        }
        uint256 price = RESILIENT_ORACLE.getPrice(market.asset);
        if ((market.seed * price) / EXP_SCALE < minSeedUsd) {
            revert SeedBelowMinimum(market.asset);
        }
        if (market.isLoanMarket) {
            if (market.collateralFactor != 0 || market.liquidationThreshold != 0) {
                revert InvalidMarketParams(market.asset);
            }
            if (spokeSources[market.asset] == address(0)) {
                revert MissingSpokeSource(market.asset);
            }
            return (market.supplyCap * price) / EXP_SCALE;
        }
        if (market.borrowCap != 0 || market.collateralFactor > market.liquidationThreshold) {
            revert InvalidMarketParams(market.asset);
        }
        _checkCollateralParams(tier, market.collateralFactor, market.liquidationThreshold);
        if (!DEVIATION_BOUNDED_ORACLE.isBoundedPricingEnabled(market.asset)) {
            revert BoundedPricingDisabled(market.asset);
        }
    }

    /**
     * @dev Checks a live pool against a tier: every listed collateral market's collateral factor and liquidation
     * threshold within the tier, the loan markets' supply caps within the tier's liquidity in USD, and no bad debt
     * @param comptroller The pool's comptroller
     * @param tier The tier
     * @custom:error ExceedsTierLimit is thrown when a risk parameter or the loan liquidity does not fit the tier
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     */
    function _checkPoolFitsTier(address comptroller, Tier storage tier) internal view {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            if (!isLoanMarket[address(vToken)]) {
                (bool isListed, uint256 collateralFactor, uint256 liquidationThreshold) = SpokeComptroller(comptroller)
                    .markets(address(vToken));
                if (isListed) {
                    _checkCollateralParams(tier, collateralFactor, liquidationThreshold);
                }
            }
            if (vToken.badDebt() != 0) {
                revert BadDebtOutstanding(address(vToken));
            }
        }
        if (_loanLiquidityUsd(comptroller, markets) > tier.maxLiquidityUsd) {
            revert ExceedsTierLimit();
        }
    }

    /**
     * @dev Returns the summed USD value of a pool's loan market supply caps. An uncapped (`type(uint256).max`) loan
     * market overflows and reverts, since it cannot fit any tier
     * @param comptroller The pool's comptroller
     * @param markets The pool's markets
     * @return liquidityUsd The value, scaled by 1e18
     */
    function _loanLiquidityUsd(
        address comptroller,
        VToken[] memory markets
    ) internal view returns (uint256 liquidityUsd) {
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(markets[i]);
            if (isLoanMarket[vToken]) {
                liquidityUsd +=
                    (SpokeComptroller(comptroller).supplyCaps(vToken) * RESILIENT_ORACLE.getUnderlyingPrice(vToken)) /
                    EXP_SCALE;
            }
        }
    }

    /**
     * @dev Returns a collateral market's collateral factor and liquidation threshold
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @return collateralFactor The collateral factor, scaled by 1e18; zero for a market outside the pool
     * @return liquidationThreshold The liquidation threshold, scaled by 1e18; zero for a market outside the pool
     * @custom:error NotCollateralMarket is thrown when the market is a loan market
     */
    function _collateralMarket(
        address comptroller,
        VToken vToken
    ) internal view returns (uint256 collateralFactor, uint256 liquidationThreshold) {
        if (isLoanMarket[address(vToken)]) {
            revert NotCollateralMarket(address(vToken));
        }
        (, collateralFactor, liquidationThreshold) = SpokeComptroller(comptroller).markets(address(vToken));
    }

    /**
     * @dev Checks a collateral factor and liquidation threshold against a tier's bounds
     * @param tier The tier
     * @param collateralFactor The collateral factor, scaled by 1e18
     * @param liquidationThreshold The liquidation threshold, scaled by 1e18
     * @custom:error ExceedsTierLimit is thrown when either value is above the tier's maximum, or the liquidation
     *   threshold is below the tier's minimum
     */
    function _checkCollateralParams(
        Tier storage tier,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) internal view {
        if (
            collateralFactor > tier.maxCollateralFactor ||
            liquidationThreshold > tier.maxLiquidationThreshold ||
            liquidationThreshold < tier.minLiquidationThreshold
        ) {
            revert ExceedsTierLimit();
        }
    }

    /**
     * @dev Checks that the executed markets carry exactly the seeds the manager holds for the request, in order
     * @param requestId The request
     * @param request The request's storage
     * @param markets The executed markets
     * @custom:error SeedsMismatch is thrown when an asset or seed differs
     */
    function _checkSeeds(uint256 requestId, Request storage request, MarketParams[] calldata markets) internal view {
        uint256 marketCount = markets.length;
        if (marketCount != request.seedAssets.length) {
            revert SeedsMismatch(requestId);
        }
        for (uint256 i; i < marketCount; ++i) {
            if (markets[i].asset != request.seedAssets[i] || markets[i].seed != request.seedAmounts[i]) {
                revert SeedsMismatch(requestId);
            }
        }
    }
}

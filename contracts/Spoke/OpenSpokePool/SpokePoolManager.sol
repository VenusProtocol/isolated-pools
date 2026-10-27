// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";
import { IRiskOracle } from "../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/external/IRiskStewardReceiver.sol";
import { SpokePoolProposalLib } from "./Libraries/SpokePoolProposalLib.sol";
import { SpokePoolRequestLib } from "./Libraries/SpokePoolRequestLib.sol";
import { SpokePoolRiskLib } from "./Libraries/SpokePoolRiskLib.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer requests a pool of a tier, escrowing a bond and its markets'
 * seeds; the Venus team builds the request's VIP through the proposal builder, and the VIP's `settleRequest` starts the
 * pool and moves the bond to the bond manager. The deployer tunes the pool's collateral markets through the
 * RiskOracle, within its tier's current terms
 * @dev Needs to be a RiskOracle authorized sender. Three linked libraries keep it under the EIP-170 size limit:
 * `SpokePoolRequestLib` checks requests and moves the escrowed bonds and seeds, `SpokePoolRiskLib` checks and publishes
 * the deployer's risk updates and checks a closing pool's debt, and `SpokePoolProposalLib` builds and records the VIPs.
 * This contract keeps the access checks, the counters and every other state change
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolManager is AccessControlledV8, ReentrancyGuardUpgradeable, SpokePoolManagerStorage {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @dev Bounds of a new pool's close factor and liquidation incentive, as the comptroller accepts them
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18;
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18;
    uint256 internal constant MIN_LIQUIDATION_INCENTIVE_MANTISSA = 1.05e18;

    /// @inheritdoc ISpokePoolManager
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskOracle public immutable RISK_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskStewardReceiver public immutable RISK_STEWARD_RECEIVER;

    /// @inheritdoc ISpokePoolManager
    ITierRegistry public immutable TIER_REGISTRY;

    /**
     * @param resilientOracle The oracle bonds, seeds, caps and debts are priced with
     * @param riskStewardReceiver The receiver that applies the published updates; deployer updates are published to the
     *   RiskOracle it reads
     * @param tierRegistry The registry of pool tiers
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        ResilientOracleInterface resilientOracle,
        IRiskStewardReceiver riskStewardReceiver,
        ITierRegistry tierRegistry
    ) {
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(address(riskStewardReceiver));
        ensureNonzeroAddress(address(tierRegistry));

        RESILIENT_ORACLE = resilientOracle;
        RISK_ORACLE = IRiskOracle(riskStewardReceiver.RISK_ORACLE());
        RISK_STEWARD_RECEIVER = riskStewardReceiver;
        TIER_REGISTRY = tierRegistry;

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

    // ──────────────────────────────────────────────────────────────────────
    // Request functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function requestPool(
        PoolRequestParams calldata pool,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external nonReentrant returns (uint256 requestId) {
        if (activePools[msg.sender] != address(0)) {
            revert ActivePoolExists(msg.sender);
        }

        SpokePoolRequestLib.Contracts memory contracts = _contracts();
        SpokePoolRequestLib.validateTierAndBond(contracts, pool.tierId, pool.bondAsset, pool.bondAmount);

        requestId = ++requestCount;
        Request storage request = _newRequest(requestId, RequestType.Pool, address(0), pool.tierId);
        request.poolName = pool.poolName;
        request.bondAsset = pool.bondAsset;
        request.bondAmount = pool.bondAmount;
        _storeMarkets(request, collateralMarkets, loanMarkets);
        request.seeds = new uint256[](collateralMarkets.length + loanMarkets.length);

        SpokePoolRequestLib.validateNewRequest(contracts, isLoanMarket, request);
        SpokePoolRequestLib.pullSeeds(contracts, escrowedAmounts, request);
        SpokePoolRequestLib.escrowBond(escrowedAmounts, pool.bondAsset, msg.sender, pool.bondAmount);

        emit RequestSubmitted(requestId, RequestType.Pool, msg.sender, address(0));
    }

    /// @inheritdoc ISpokePoolManager
    function requestNewMarkets(
        address comptroller,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external nonReentrant returns (uint256 requestId) {
        uint256 tierId = _ensureActiveDeployer(comptroller).tierId;

        SpokePoolRequestLib.Contracts memory contracts = _contracts();
        SpokePoolRequestLib.validateBond(contracts, comptroller, tierId);

        requestId = ++requestCount;
        Request storage request = _newRequest(requestId, RequestType.Markets, comptroller, tierId);

        _storeMarkets(request, collateralMarkets, loanMarkets);
        request.seeds = new uint256[](collateralMarkets.length + loanMarkets.length);

        SpokePoolRequestLib.validateNewRequest(contracts, isLoanMarket, request);
        SpokePoolRequestLib.pullSeeds(contracts, escrowedAmounts, request);

        emit RequestSubmitted(requestId, RequestType.Markets, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        uint256 fromTierId = _ensureActiveDeployer(comptroller).tierId;
        if (!TIER_REGISTRY.isUpgrade(fromTierId, tierId)) {
            revert NotAnUpgrade(fromTierId, tierId);
        }
        SpokePoolRequestLib.validateBond(_contracts(), comptroller, tierId);

        requestId = ++requestCount;
        _newRequest(requestId, RequestType.Tier, comptroller, tierId);

        emit RequestSubmitted(requestId, RequestType.Tier, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function cancelRequest(uint256 requestId) external nonReentrant {
        Request storage request = requests[requestId];
        _ensureDeployer(request.deployer);
        if (request.status != RequestStatus.Pending) {
            revert InvalidRequestStatus(requestId);
        }

        request.status = RequestStatus.Canceled;
        SpokePoolRequestLib.refund(request, escrowedAmounts);

        emit RequestCanceled(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function setOracleFeeds(uint256 requestId, address asset, OracleFeed[3] calldata feeds) external {
        _checkAccessAllowed("setOracleFeeds(uint256,address,(address,address)[3])");
        Request storage request = requests[requestId];
        if (!_isRequestOpen(request)) {
            revert InvalidRequestStatus(requestId);
        }
        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            CollateralMarketRequestParams storage market = request.collateralMarkets[i];
            if (market.asset == asset) {
                for (uint256 j; j < 3; ++j) {
                    market.feeds[j] = feeds[j];
                }
                SpokePoolRequestLib.checkSupplyCapUsd(_contracts(), request.tierId, market);
                request.buildId = 0;
                request.status = RequestStatus.Pending;

                emit OracleFeedsUpdated(requestId, asset, feeds);
                return;
            }
        }
        revert InvalidMarketParams(asset);
    }

    /// @inheritdoc ISpokePoolManager
    function buildRequestProposal(uint256 requestId, string calldata description) external nonReentrant {
        _checkAccessAllowed("buildRequestProposal(uint256,string)");
        Request storage request = requests[requestId];
        if (!_isRequestOpen(request)) {
            revert InvalidRequestStatus(requestId);
        }

        RequestType requestType = request.requestType;
        if (requestType != RequestType.Pool) {
            _ensurePoolStatus(request.comptroller, PoolStatus.Live);
        }
        if (requestType != RequestType.Tier) {
            SpokePoolRequestLib.Contracts memory contracts = _contracts();
            SpokePoolRequestLib.validateBuild(contracts, isLoanMarket, request);
            SpokePoolRequestLib.pullSeeds(contracts, escrowedAmounts, request);
        }

        SpokePoolProposalLib.buildRequestProposal(
            proposalBuilder,
            request,
            isLoanMarket,
            requestProposals,
            requestId,
            ++buildCount,
            description
        );
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId, uint256 buildId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256,uint256)");
        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Built || buildId != request.buildId) {
            revert InvalidBuild(buildId);
        }

        address comptroller = request.comptroller;
        RequestType requestType = request.requestType;
        if (requestType != RequestType.Pool) {
            _ensurePoolStatus(comptroller, PoolStatus.Live);
        }

        request.status = RequestStatus.Settled;
        if (requestType == RequestType.Pool) {
            _activatePool(request, requestId);
        } else if (requestType == RequestType.Tier) {
            Pool storage pool = pools[comptroller];
            emit PoolTierUpgraded(comptroller, pool.tierId, request.tierId);
            pool.tierId = request.tierId;
        }
        // Sends the seeds to the caller, the Normal Timelock, which lists the markets with them in the rest of the VIP.
        // A no-op for a tier request, which has no markets
        SpokePoolRequestLib.releaseSeeds(request, escrowedAmounts, msg.sender);

        emit RequestSettled(requestId, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");
        Request storage request = requests[requestId];
        if (!_isRequestOpen(request)) {
            revert InvalidRequestStatus(requestId);
        }

        request.status = RequestStatus.Rejected;
        SpokePoolRequestLib.refund(request, escrowedAmounts);

        emit RequestRejected(requestId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Risk control functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function setCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external {
        uint256 tierId = _ensureActiveDeployer(comptroller).tierId;
        SpokePoolRiskLib.publishCollateralFactorUpdate(
            _contracts(),
            isLoanMarket,
            tierId,
            comptroller,
            vToken,
            collateralFactor,
            liquidationThreshold
        );
    }

    /// @inheritdoc ISpokePoolManager
    function setCollateralSupplyCap(address comptroller, address vToken, uint256 supplyCap) external {
        uint256 tierId = _ensureActiveDeployer(comptroller).tierId;
        SpokePoolRiskLib.publishSupplyCapUpdate(_contracts(), isLoanMarket, tierId, comptroller, vToken, supplyCap);
    }

    /// @inheritdoc ISpokePoolManager
    function pauseCollateralSupply(address comptroller, address vToken) external {
        _ensureActiveDeployer(comptroller);
        SpokePoolRiskLib.publishSupplyPause(_contracts(), isLoanMarket, comptroller, vToken);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Bond functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function claimBondYield(address comptroller) external nonReentrant {
        _ensureDeployer(pools[comptroller].deployer);

        bondManager.claimYield(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function topUpBond(address comptroller, uint256 amount) external nonReentrant {
        _ensureDeployer(pools[comptroller].deployer);
        IERC20Upgradeable bondAsset = IBondAccount(bondManager.bondAccounts(comptroller)).asset();

        uint256 balanceBefore = bondAsset.balanceOf(address(this));
        bondAsset.safeTransferFrom(msg.sender, address(this), amount);
        if (bondAsset.balanceOf(address(this)) - balanceBefore != amount) {
            revert TransferAmountMismatch(address(bondAsset));
        }

        bondAsset.forceApprove(address(bondManager), amount);
        bondManager.topUp(comptroller, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function seizeBond(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow) {
        _checkAccessAllowed("seizeBond(address,uint256,address)");

        paidNow = bondManager.seize(comptroller, amount, receiver);
    }

    /// @inheritdoc ISpokePoolManager
    function releaseBond(address comptroller) external {
        _checkAccessAllowed("releaseBond(address)");

        // The bond stays after a close or handover, still seizable, until governance accepts the pool's remaining debt
        PoolStatus status = pools[comptroller].status;
        if (status != PoolStatus.Closed && status != PoolStatus.HandedOver) {
            revert InvalidPoolStatus(comptroller);
        }

        bondManager.release(comptroller);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Exit functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        Pool storage pool = _ensureActiveDeployer(comptroller);

        // A markets or tier VIP settles only on a live pool
        uint256 latestRequestId = latestRequestIds[msg.sender];
        if (_isRequestOpen(requests[latestRequestId])) {
            revert OpenRequestExists(latestRequestId);
        }

        pool.status = PoolStatus.ExitRequested;

        emit ExitRequested(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external {
        _checkAccessAllowed("buildExitProposal(address,uint256[],string)");

        SpokePoolProposalLib.buildExitProposal(
            proposalBuilder,
            pools[comptroller],
            exitProposals,
            comptroller,
            ++buildCount,
            liquidationThresholds,
            description
        );
    }

    /// @inheritdoc ISpokePoolManager
    function startWindDown(address comptroller, uint256 buildId) external {
        _checkAccessAllowed("startWindDown(address,uint256)");
        Pool storage pool = pools[comptroller];
        if (pool.status != PoolStatus.ExitProposed || buildId != pool.exitBuildId) {
            revert InvalidBuild(buildId);
        }

        pool.status = PoolStatus.WindingDown;
        pool.windDownStartedAt = uint64(block.timestamp);

        emit WindDownStarted(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function buildForceCloseProposal(address comptroller, string calldata description) external {
        _checkAccessAllowed("buildForceCloseProposal(address,string)");

        SpokePoolProposalLib.buildForceCloseProposal(
            proposalBuilder,
            pools[comptroller],
            exitProposals,
            comptroller,
            windDownPeriod,
            description
        );
    }

    /// @inheritdoc ISpokePoolManager
    function closePool(address comptroller) external {
        _checkAccessAllowed("closePool(address)");
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        SpokePoolRiskLib.ensureResidualDebtBelowMax(RESILIENT_ORACLE, comptroller, maxResidualPoolDebtUsd);

        pool.status = PoolStatus.Closed;
        delete activePools[pool.deployer];

        emit PoolClosed(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectExit(address comptroller) external {
        _checkAccessAllowed("rejectExit(address)");
        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }

        pool.status = PoolStatus.Live;
        pool.exitBuildId = 0;

        emit ExitRejected(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function handoverPoolToGovernance(address comptroller) external {
        _checkAccessAllowed("handoverPoolToGovernance(address)");
        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }

        pool.status = PoolStatus.HandedOver;
        delete activePools[pool.deployer];

        emit PoolHandedOver(comptroller);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Admin functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function pauseDeployer(address comptroller) external {
        _checkAccessAllowed("pauseDeployer(address)");

        _setDeployerPaused(comptroller, true);
    }

    /// @inheritdoc ISpokePoolManager
    function unpauseDeployer(address comptroller) external {
        _checkAccessAllowed("unpauseDeployer(address)");

        _setDeployerPaused(comptroller, false);
    }

    /// @inheritdoc ISpokePoolManager
    function setProposalBuilder(ISpokePoolProposalBuilder newProposalBuilder) external {
        _checkAccessAllowed("setProposalBuilder(address)");
        ensureNonzeroAddress(address(newProposalBuilder));

        emit ProposalBuilderUpdated(proposalBuilder, newProposalBuilder);
        proposalBuilder = newProposalBuilder;
    }

    /// @inheritdoc ISpokePoolManager
    function setBondManager(ISpokeBondManager newBondManager) external {
        _checkAccessAllowed("setBondManager(address)");
        if (address(bondManager) != address(0)) {
            revert BondManagerAlreadySet();
        }
        if (newBondManager.SPOKE_POOL_MANAGER() != address(this)) {
            revert InvalidBondManager(address(newBondManager));
        }

        bondManager = newBondManager;

        emit BondManagerSet(newBondManager);
    }

    /// @inheritdoc ISpokePoolManager
    function setHubYieldGroup(address asset, address yieldGroup) external {
        _checkAccessAllowed("setHubYieldGroup(address,address)");
        ensureNonzeroAddress(asset);

        emit HubYieldGroupUpdated(asset, hubYieldGroups[asset], yieldGroup);
        hubYieldGroups[asset] = yieldGroup;
    }

    /// @inheritdoc ISpokePoolManager
    function setSupportedOracles(address[3] calldata oracles) external {
        _checkAccessAllowed("setSupportedOracles(address[3])");

        emit SupportedOraclesUpdated(supportedOracles, oracles);
        supportedOracles = oracles;
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolParams(PoolParams calldata params) external {
        _checkAccessAllowed("setPoolParams(PoolParams)");
        if (
            params.closeFactor < MIN_CLOSE_FACTOR_MANTISSA ||
            params.closeFactor > MAX_CLOSE_FACTOR_MANTISSA ||
            params.liquidationIncentive < MIN_LIQUIDATION_INCENTIVE_MANTISSA
        ) {
            revert InvalidPoolParams();
        }

        emit PoolParamsUpdated(poolParams, params);
        poolParams = params;
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketParams(ProtocolMarketParams calldata params) external {
        _checkAccessAllowed("setMarketParams(ProtocolMarketParams)");
        if (
            params.collateralInterestRateModel == address(0) ||
            params.reserveFactor > MANTISSA_ONE ||
            params.reduceReservesBlockDelta == 0 ||
            params.maxStalePeriod == 0 ||
            params.boundDeviation == 0 ||
            params.boundDeviation >= MANTISSA_ONE
        ) {
            revert InvalidProtocolMarketParams();
        }

        emit MarketParamsUpdated(marketParams, params);
        marketParams = params;
    }

    /// @inheritdoc ISpokePoolManager
    function setWindDownPeriod(uint256 newWindDownPeriod) external {
        _checkAccessAllowed("setWindDownPeriod(uint256)");
        ensureNonzeroValue(newWindDownPeriod);

        emit WindDownPeriodUpdated(windDownPeriod, newWindDownPeriod);
        windDownPeriod = newWindDownPeriod;
    }

    /// @inheritdoc ISpokePoolManager
    function setMaxResidualPoolDebtUsd(uint256 newMaxResidualPoolDebtUsd) external {
        _checkAccessAllowed("setMaxResidualPoolDebtUsd(uint256)");

        emit MaxResidualPoolDebtUsdUpdated(maxResidualPoolDebtUsd, newMaxResidualPoolDebtUsd);
        maxResidualPoolDebtUsd = newMaxResidualPoolDebtUsd;
    }

    /// @inheritdoc ISpokePoolManager
    function sweepToken(address token, address to, uint256 amount) external {
        _checkAccessAllowed("sweepToken(address,address,uint256)");
        ensureNonzeroAddress(to);
        if (amount > IERC20Upgradeable(token).balanceOf(address(this)) - escrowedAmounts[token]) {
            revert InsufficientAmount(token, amount);
        }

        IERC20Upgradeable(token).safeTransfer(to, amount);

        emit SweepToken(token, to, amount);
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }

    /// @inheritdoc ISpokePoolManager
    function getPool(address comptroller) external view returns (Pool memory) {
        return pools[comptroller];
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Opens a pending request from the caller, unless its latest request is still open
    function _newRequest(
        uint256 requestId,
        RequestType requestType,
        address comptroller,
        uint256 tierId
    ) private returns (Request storage request) {
        uint256 latestRequestId = latestRequestIds[msg.sender];
        if (_isRequestOpen(requests[latestRequestId])) {
            revert OpenRequestExists(latestRequestId);
        }

        latestRequestIds[msg.sender] = requestId;
        request = requests[requestId];
        request.requestType = requestType;
        request.status = RequestStatus.Pending;
        request.deployer = msg.sender;
        request.comptroller = comptroller;
        request.tierId = tierId;
    }

    /// @dev Stores a new request's markets
    function _storeMarkets(
        Request storage request,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) private {
        uint256 collateralCount = collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            request.collateralMarkets.push(collateralMarkets[i]);
        }
        uint256 loanCount = loanMarkets.length;
        for (uint256 i; i < loanCount; ++i) {
            request.loanMarkets.push(loanMarkets[i]);
        }
    }

    /// @dev Starts a pool request's pool on its tier and moves the escrowed bond to the bond manager
    function _activatePool(Request storage request, uint256 requestId) private {
        address comptroller = request.comptroller;
        address deployer = request.deployer;
        Pool storage pool = pools[comptroller];
        pool.deployer = deployer;
        pool.status = PoolStatus.Live;
        pool.tierId = request.tierId;
        activePools[deployer] = comptroller;

        SpokePoolRequestLib.createBond(request, escrowedAmounts, bondManager);

        emit PoolActivated(requestId, comptroller, deployer);
    }

    /// @dev Pauses or unpauses the controls of an existing pool's deployer
    function _setDeployerPaused(address comptroller, bool paused) private {
        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }

        pool.deployerPaused = paused;

        emit DeployerPausedUpdated(comptroller, paused);
    }

    /// @dev Returns whether a request is open: pending or built, so it can still be built, settled or closed
    function _isRequestOpen(Request storage request) private view returns (bool) {
        RequestStatus status = request.status;
        return status == RequestStatus.Pending || status == RequestStatus.Built;
    }

    /// @dev Checks the caller is `deployer`
    function _ensureDeployer(address deployer) private view {
        if (msg.sender != deployer) {
            revert NotDeployer(msg.sender);
        }
    }

    /// @dev Returns a live pool after checking the caller is its deployer and is not paused
    function _ensureActiveDeployer(address comptroller) private view returns (Pool storage pool) {
        pool = pools[comptroller];
        _ensureDeployer(pool.deployer);
        if (pool.status != PoolStatus.Live) {
            revert InvalidPoolStatus(comptroller);
        }
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
    }

    /// @dev Returns a pool after checking its status
    function _ensurePoolStatus(address comptroller, PoolStatus status) private view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.status != status) {
            revert InvalidPoolStatus(comptroller);
        }
    }

    /// @dev Returns the manager's contracts the library checks read
    function _contracts() private view returns (SpokePoolRequestLib.Contracts memory) {
        return
            SpokePoolRequestLib.Contracts(
                RESILIENT_ORACLE,
                RISK_ORACLE,
                RISK_STEWARD_RECEIVER,
                TIER_REGISTRY,
                bondManager,
                proposalBuilder
            );
    }
}

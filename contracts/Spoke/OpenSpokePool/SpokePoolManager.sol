// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { Action } from "../../ComptrollerInterface.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolBuilder } from "../interfaces/ISpokePoolBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";
import { IRiskOracle } from "../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/external/IRiskStewardReceiver.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer requests a pool of a tier, escrowing a bond and its markets'
 * seeds; the Venus team builds the request's VIP through the pool builder, and the VIP's `settleRequest` starts the
 * pool and moves the bond to the bond manager. The deployer tunes the pool's collateral markets through the
 * RiskOracle, within its tier's current terms
 * @dev Needs to be a RiskOracle authorized sender
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolManager is AccessControlledV8, ReentrancyGuardUpgradeable, SpokePoolManagerStorage {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @dev Bounds of a new pool's close factor and liquidation incentive, as the comptroller accepts them
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18;
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18;
    uint256 internal constant MIN_LIQUIDATION_INCENTIVE_MANTISSA = 1.05e18;

    /// @dev RiskOracle update types of the deployer controls, which select the Risk Steward that applies them
    string internal constant COLLATERAL_FACTORS_UPDATE = "collateralFactors";
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";
    string internal constant PAUSE_ACTIONS_UPDATE = "pauseActions";

    /// @inheritdoc ISpokePoolManager
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskOracle public immutable RISK_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskStewardReceiver public immutable RISK_STEWARD_RECEIVER;

    /// @inheritdoc ISpokePoolManager
    ITierRegistry public immutable TIER_REGISTRY;

    /**
     * @param resilientOracle The oracle bonds and caps are priced with
     * @param riskOracle The oracle deployer updates are published to
     * @param riskStewardReceiver The receiver that applies the published updates
     * @param tierRegistry The registry of pool tiers
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     * @custom:error InvalidRiskStewardReceiver is thrown when the receiver reads another RiskOracle
     */
    constructor(
        ResilientOracleInterface resilientOracle,
        IRiskOracle riskOracle,
        IRiskStewardReceiver riskStewardReceiver,
        ITierRegistry tierRegistry
    ) {
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(address(riskOracle));
        ensureNonzeroAddress(address(riskStewardReceiver));
        ensureNonzeroAddress(address(tierRegistry));
        if (riskStewardReceiver.RISK_ORACLE() != address(riskOracle)) {
            revert InvalidRiskStewardReceiver(address(riskStewardReceiver));
        }

        RESILIENT_ORACLE = resilientOracle;
        RISK_ORACLE = riskOracle;
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
    // Deployer functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function requestPool(
        uint256 tierId,
        string calldata poolName,
        address bondAsset,
        uint256 bondAmount,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        if (activePools[msg.sender] != address(0)) {
            revert ActivePoolExists(msg.sender);
        }
        _checkBond(tierId, bondAsset, bondAmount);
        poolBuilder.validateMarkets(address(0), tierId, markets);

        Request storage request;
        (requestId, request) = _newRequest(RequestType.Pool, address(0), tierId);
        request.poolName = poolName;
        request.params = poolDefaults;
        request.bondAsset = bondAsset;
        request.bondAmount = bondAmount;
        _storeMarkets(request, markets);
        _pullSeeds(request);
        _escrow(bondAsset, bondAmount);

        emit RequestSubmitted(requestId, RequestType.Pool, msg.sender, address(0));
    }

    /// @inheritdoc ISpokePoolManager
    function requestNewMarkets(
        address comptroller,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        _ensureActiveDeployer(comptroller);
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.Live);
        poolBuilder.validateMarkets(comptroller, pool.tierId, markets);

        Request storage request;
        (requestId, request) = _newRequest(RequestType.Markets, comptroller, pool.tierId);
        _storeMarkets(request, markets);
        _pullSeeds(request);

        emit RequestSubmitted(requestId, RequestType.Markets, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        _ensureActiveDeployer(comptroller);
        _ensurePoolStatus(comptroller, PoolStatus.Live);
        _ensureUpgrade(comptroller, tierId);

        (requestId, ) = _newRequest(RequestType.Tier, comptroller, tierId);

        emit RequestSubmitted(requestId, RequestType.Tier, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function approveRequest(uint256 requestId) external nonReentrant {
        Request storage request = _ensureEditableRequest(requestId);
        if (msg.sender != request.deployer) {
            revert NotDeployer(msg.sender);
        }

        if (!request.approved) {
            _pullSeeds(request);
        }
        request.approved = true;

        emit RequestApproved(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function cancelRequest(uint256 requestId) external nonReentrant {
        Request storage request = _ensureEditableRequest(requestId);
        if (msg.sender != request.deployer) {
            revert NotDeployer(msg.sender);
        }

        _closeRequest(request, RequestStatus.Canceled);

        emit RequestCanceled(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function setCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external {
        Pool storage pool = _ensureActiveDeployer(comptroller);
        _ensureCollateralMarket(comptroller, vToken);
        _ensureNoPendingUpdate(COLLATERAL_FACTORS_UPDATE, vToken);
        (, , uint256 marketLiquidationThreshold) = SpokeComptroller(comptroller).markets(vToken);
        if (collateralFactor > liquidationThreshold || liquidationThreshold < marketLiquidationThreshold) {
            revert InvalidLiquidationThreshold(vToken);
        }
        ITierRegistry.PoolLimits memory limits = TIER_REGISTRY.getTier(pool.tierId).limits;
        if (collateralFactor > limits.maxCollateralFactor || liquidationThreshold > limits.maxLiquidationThreshold) {
            revert ExceedsTierLimit(vToken);
        }
        _checkCoverage(comptroller, pool.tierId, limits.minCoverageRatio);

        _publishUpdate(COLLATERAL_FACTORS_UPDATE, vToken, abi.encode(collateralFactor, liquidationThreshold));
    }

    /// @inheritdoc ISpokePoolManager
    function setCollateralSupplyCap(address comptroller, address vToken, uint256 supplyCap) external {
        Pool storage pool = _ensureActiveDeployer(comptroller);
        _ensureCollateralMarket(comptroller, vToken);
        _ensureNoPendingUpdate(SUPPLY_CAP_UPDATE, vToken);
        ITierRegistry.PoolLimits memory limits = TIER_REGISTRY.getTier(pool.tierId).limits;
        uint256 supplyCapUsd = (supplyCap * RESILIENT_ORACLE.getUnderlyingPrice(vToken)) / EXP_SCALE;
        if (supplyCapUsd > limits.maxCollateralSupplyCapUsd) {
            revert ExceedsTierLimit(vToken);
        }
        _checkCoverage(comptroller, pool.tierId, limits.minCoverageRatio);

        _publishUpdate(SUPPLY_CAP_UPDATE, vToken, abi.encode(supplyCap));
    }

    /// @inheritdoc ISpokePoolManager
    function pauseCollateralMint(address comptroller, address vToken) external {
        _ensureActiveDeployer(comptroller);
        _ensureCollateralMarket(comptroller, vToken);
        uint8[] memory actions = new uint8[](1);
        actions[0] = uint8(Action.MINT);

        _publishUpdate(PAUSE_ACTIONS_UPDATE, vToken, abi.encode(actions));
    }

    /// @inheritdoc ISpokePoolManager
    function claimBondYield(address comptroller) external nonReentrant {
        if (msg.sender != pools[comptroller].deployer) {
            revert NotDeployer(msg.sender);
        }

        bondManager.claimYield(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function topUpBond(address comptroller, uint256 amount) external nonReentrant {
        if (msg.sender != pools[comptroller].deployer) {
            revert NotDeployer(msg.sender);
        }
        address bondAsset = address(IBondAccount(bondManager.bondAccounts(comptroller)).asset());

        // Not escrowed, as it leaves in this call
        _transferIn(bondAsset, amount);
        IERC20Upgradeable(bondAsset).forceApprove(address(bondManager), amount);
        bondManager.topUp(comptroller, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        _ensureActiveDeployer(comptroller);
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.Live);

        pool.status = PoolStatus.ExitRequested;

        emit ExitRequested(comptroller);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Governance functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function editRequest(
        uint256 requestId,
        PoolParams calldata params,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant {
        _checkAccessAllowed("editRequest(uint256,PoolParams,DeployerMarketParams[])");
        Request storage request = _ensureEditableRequest(requestId);
        if (request.requestType == RequestType.Tier) {
            revert InvalidRequestType(requestId);
        }
        poolBuilder.validateMarkets(request.comptroller, request.tierId, markets);
        if (request.requestType == RequestType.Pool) {
            _checkPoolParams(params);
            request.params = params;
        }

        // Refunded here and pulled again when the deployer approves the edited request
        if (request.approved) {
            _releaseSeeds(request, request.deployer);
        }
        delete request.markets;
        _storeMarkets(request, markets);
        request.approved = false;
        request.buildId = 0;
        request.status = RequestStatus.Pending;

        emit RequestEdited(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function buildRequestProposal(uint256 requestId, string calldata description) external nonReentrant {
        _checkAccessAllowed("buildRequestProposal(uint256,string)");
        Request storage request = _ensureEditableRequest(requestId);
        if (!request.approved) {
            revert RequestNotApproved(requestId);
        }
        // A new pool's bond is checked against its tier; a live pool's bond was checked on a tier upgrade
        if (request.requestType == RequestType.Pool) {
            _checkBond(request.tierId, request.bondAsset, request.bondAmount);
        } else {
            _ensurePoolStatus(request.comptroller, PoolStatus.Live);
        }
        if (request.requestType == RequestType.Tier) {
            _ensureUpgrade(request.comptroller, request.tierId);
        }

        uint256 buildId = ++buildCount;
        (address comptroller, address[] memory vTokens, bytes memory proposal) = poolBuilder.buildRequestProposal(
            requestId,
            buildId,
            description
        );

        request.comptroller = comptroller;
        request.status = RequestStatus.Built;
        request.buildId = buildId;
        request.vTokens = vTokens;
        requestProposals[requestId] = proposal;
        uint256 marketCount = vTokens.length;
        // Recorded at build; a superseded build's markets are never listed, so their records are never read
        for (uint256 i; i < marketCount; ++i) {
            if (request.markets[i].isLoanMarket) {
                isLoanMarket[vTokens[i]] = true;
            }
        }

        emit RequestBuilt(requestId, buildId, vTokens);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");
        Request storage request = _ensureEditableRequest(requestId);

        _closeRequest(request, RequestStatus.Rejected);

        emit RequestRejected(requestId);
    }

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
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external {
        _checkAccessAllowed("buildExitProposal(address,uint256[],string)");
        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }

        uint256 buildId = ++buildCount;
        pool.status = PoolStatus.ExitProposed;
        pool.exitBuildId = buildId;
        exitProposals[comptroller] = poolBuilder.buildExitProposal(
            comptroller,
            buildId,
            liquidationThresholds,
            description
        );

        emit ExitBuilt(comptroller, buildId);
    }

    /// @inheritdoc ISpokePoolManager
    function buildForceCloseProposal(address comptroller, string calldata description) external {
        _checkAccessAllowed("buildForceCloseProposal(address,string)");
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert WindDownPeriodNotElapsed();
        }

        exitProposals[comptroller] = poolBuilder.buildForceCloseProposal(comptroller, description);

        emit ForceCloseBuilt(comptroller);
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
    function releaseBond(address comptroller) external {
        _checkAccessAllowed("releaseBond(address)");
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        poolBuilder.accrueAndCheckResidualDebt(comptroller);

        pool.status = PoolStatus.Closed;
        delete activePools[pool.deployer];
        bondManager.release(comptroller);

        emit PoolClosed(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId, uint256 buildId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256,uint256)");
        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Built || buildId != request.buildId) {
            revert InvalidBuild(buildId);
        }
        address comptroller = request.comptroller;
        if (request.requestType != RequestType.Pool) {
            _ensurePoolStatus(comptroller, PoolStatus.Live);
        }

        request.status = RequestStatus.Settled;
        if (request.requestType == RequestType.Pool) {
            _activatePool(requestId, request);
        } else if (request.requestType == RequestType.Tier) {
            Pool storage pool = pools[comptroller];
            emit PoolTierUpgraded(comptroller, pool.tierId, request.tierId);
            pool.tierId = request.tierId;
        }
        // Transfers the seeds to the timelock, which lists the markets with them in the rest of the VIP. A no-op for a
        // tier request, whose `markets` is empty
        _releaseSeeds(request, msg.sender);

        emit RequestSettled(requestId, comptroller);
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
    function handoverPoolToGovernance(address comptroller) external {
        _checkAccessAllowed("handoverPoolToGovernance(address)");
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.ExitRequested);
        // The bond is the first loss, so it stays until every market's bad debt is repaid
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (vTokens[i].badDebt() != 0) {
                revert BadDebtOutstanding(address(vTokens[i]));
            }
        }

        pool.status = PoolStatus.HandedOver;
        delete activePools[pool.deployer];
        bondManager.release(comptroller);

        emit PoolHandedOver(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function seizeBond(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow) {
        _checkAccessAllowed("seizeBond(address,uint256,address)");
        ensureNonzeroAddress(receiver);

        paidNow = bondManager.seize(comptroller, amount, receiver);
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolBuilder(ISpokePoolBuilder newPoolBuilder) external {
        _checkAccessAllowed("setPoolBuilder(address)");
        ensureNonzeroAddress(address(newPoolBuilder));

        emit PoolBuilderUpdated(poolBuilder, newPoolBuilder);
        poolBuilder = newPoolBuilder;
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
    function setPoolDefaults(PoolParams calldata params) external {
        _checkAccessAllowed("setPoolDefaults(PoolParams)");
        _checkPoolParams(params);

        emit PoolDefaultsUpdated(poolDefaults, params);
        poolDefaults = params;
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketDefaults(ProtocolMarketParams calldata params) external {
        _checkAccessAllowed("setMarketDefaults(ProtocolMarketParams)");
        if (
            params.collateralInterestRateModel == address(0) ||
            params.reserveFactor > MANTISSA_ONE ||
            params.reduceReservesBlockDelta == 0
        ) {
            revert InvalidMarketDefaults();
        }

        emit MarketDefaultsUpdated(marketDefaults, params);
        marketDefaults = params;
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
            revert ExceedsEscrow(token, amount);
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

    /// @inheritdoc ISpokePoolManager
    function getRequestProposal(uint256 requestId) external view returns (bytes memory) {
        return requestProposals[requestId];
    }

    /// @inheritdoc ISpokePoolManager
    function getExitProposal(address comptroller) external view returns (bytes memory) {
        return exitProposals[comptroller];
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Opens a pending request from the caller, accepted by it, unless its latest request is still open
    function _newRequest(
        RequestType requestType,
        address comptroller,
        uint256 tierId
    ) internal returns (uint256 requestId, Request storage request) {
        uint256 latestRequestId = latestRequestIds[msg.sender];
        RequestStatus latestStatus = requests[latestRequestId].status;
        if (latestStatus == RequestStatus.Pending || latestStatus == RequestStatus.Built) {
            revert OpenRequestExists(latestRequestId);
        }

        requestId = ++requestCount;
        latestRequestIds[msg.sender] = requestId;
        request = requests[requestId];
        request.requestType = requestType;
        request.status = RequestStatus.Pending;
        request.approved = true;
        request.deployer = msg.sender;
        request.comptroller = comptroller;
        request.tierId = tierId;
    }

    /// @dev Adds markets to a request
    function _storeMarkets(Request storage request, DeployerMarketParams[] calldata markets) internal {
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            request.markets.push(markets[i]);
        }
    }

    /// @dev Pulls a request's seeds from the caller into escrow
    function _pullSeeds(Request storage request) internal {
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            DeployerMarketParams storage market = request.markets[i];
            _escrow(market.asset, market.seed);
        }
    }

    /// @dev Starts a pool request's pool on its tier and moves the escrowed bond to the bond manager
    function _activatePool(uint256 requestId, Request storage request) internal {
        address comptroller = request.comptroller;
        address deployer = request.deployer;
        Pool storage pool = pools[comptroller];
        pool.deployer = deployer;
        pool.status = PoolStatus.Live;
        pool.tierId = request.tierId;
        activePools[deployer] = comptroller;

        address bondAsset = request.bondAsset;
        uint256 bondAmount = request.bondAmount;
        escrowedAmounts[bondAsset] -= bondAmount;
        IERC20Upgradeable(bondAsset).forceApprove(address(bondManager), bondAmount);
        bondManager.createBond(comptroller, deployer, bondAsset, bondAmount);

        emit PoolActivated(requestId, comptroller, deployer);
    }

    /// @dev Closes an open request and refunds its bond and seeds to its deployer
    function _closeRequest(Request storage request, RequestStatus status) internal {
        request.status = status;
        address deployer = request.deployer;
        if (request.requestType == RequestType.Pool) {
            _releaseEscrow(request.bondAsset, deployer, request.bondAmount);
        }
        // An unapproved request's seeds were refunded at its edit
        if (request.approved) {
            _releaseSeeds(request, deployer);
        }
    }

    /// @dev Sends a request's escrowed seeds to `to`
    function _releaseSeeds(Request storage request, address to) internal {
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            DeployerMarketParams storage market = request.markets[i];
            _releaseEscrow(market.asset, to, market.seed);
        }
    }

    /// @dev Pulls tokens from the caller into escrow
    function _escrow(address token, uint256 amount) internal {
        _transferIn(token, amount);
        escrowedAmounts[token] += amount;
    }

    /// @dev Sends escrowed tokens
    function _releaseEscrow(address token, address to, uint256 amount) internal {
        escrowedAmounts[token] -= amount;
        IERC20Upgradeable(token).safeTransfer(to, amount);
    }

    /// @dev Pulls tokens from the caller, reverting unless exactly `amount` arrives
    function _transferIn(address token, uint256 amount) internal {
        IERC20Upgradeable asset = IERC20Upgradeable(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - balanceBefore != amount) {
            revert TransferAmountMismatch(token);
        }
    }

    /// @dev Pauses or unpauses the controls of an existing pool's deployer
    function _setDeployerPaused(address comptroller, bool paused) internal {
        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }

        pool.deployerPaused = paused;

        emit DeployerPausedUpdated(comptroller, paused);
    }

    /// @dev Publishes a deployer's update of a collateral market to the RiskOracle
    function _publishUpdate(string memory updateType, address vToken, bytes memory newValue) internal {
        RISK_ORACLE.publishRiskParameterUpdate("", newValue, updateType, vToken, 0, 0, "");
    }

    /// @dev Checks a new pool's tier is enabled, its bond asset allowed and its bond worth what the tier requires
    function _checkBond(uint256 tierId, address bondAsset, uint256 bondAmount) internal view {
        if (!TIER_REGISTRY.getTier(tierId).enabled) {
            revert InvalidTier(tierId);
        }
        (, , bool allowed, ) = bondManager.assetConfigs(bondAsset);
        if (!allowed) {
            revert InvalidBondAsset(bondAsset);
        }
        _checkBondAmount(tierId, bondAsset, bondAmount);
    }

    /**
     * @dev Checks a bond amount is worth the bond a tier requires. The amount is checked, not the bond's value, which
     *   a Hub's exit fee lowers
     */
    function _checkBondAmount(uint256 tierId, address bondAsset, uint256 bondAmount) internal view {
        uint256 bondUsd = (bondAmount * RESILIENT_ORACLE.getPrice(bondAsset)) / EXP_SCALE;
        uint256 requiredBondUsd = _requiredBondUsd(tierId, bondAsset);
        if (bondUsd < requiredBondUsd) {
            revert InsufficientBondValue(bondUsd, requiredBondUsd);
        }
    }

    /**
     * @dev Checks a tier is an upgrade of a pool's tier that the bond's principal pays for. It is priced at request and
     *   build, never at settle, so a price move cannot revert the VIP
     */
    function _ensureUpgrade(address comptroller, uint256 tierId) internal view {
        uint256 fromTierId = pools[comptroller].tierId;
        if (!TIER_REGISTRY.isUpgrade(fromTierId, tierId)) {
            revert NotAnUpgrade(fromTierId, tierId);
        }
        IBondAccount bondAccount = IBondAccount(bondManager.bondAccounts(comptroller));
        _checkBondAmount(tierId, address(bondAccount.asset()), bondAccount.principal());
    }

    /// @dev Checks a pool's bond is worth at least `minCoverageRatio` of the bond its tier requires
    function _checkCoverage(address comptroller, uint256 tierId, uint256 minCoverageRatio) internal view {
        address bondAsset = address(IBondAccount(bondManager.bondAccounts(comptroller)).asset());
        uint256 requiredBondUsd = _requiredBondUsd(tierId, bondAsset);
        uint256 bondUsd = bondManager.getBondValueUsd(comptroller);
        if (bondUsd * EXP_SCALE < requiredBondUsd * minCoverageRatio) {
            revert CoverageTooLow((bondUsd * EXP_SCALE) / requiredBondUsd, minCoverageRatio);
        }
    }

    /// @dev Returns a tier's minimum bond times a bond asset's factor, in USD
    function _requiredBondUsd(uint256 tierId, address bondAsset) internal view returns (uint256) {
        (, , , uint256 factor) = bondManager.assetConfigs(bondAsset);
        return (TIER_REGISTRY.getTier(tierId).minBondUsd * factor) / EXP_SCALE;
    }

    /**
     * @dev Reverts while an update of a market is still on its way: the latest published one until the receiver
     *   processes it, or the last registered one while pending, which the receiver still executes after a newer one is
     *   published. A new update then always lands after the current values, so it is checked against them
     */
    function _ensureNoPendingUpdate(string memory updateType, address vToken) internal view {
        uint256 publishedId = RISK_ORACLE.getLatestUpdateIdByTypeAndMarket(updateType, vToken);
        uint256 registeredId = RISK_STEWARD_RECEIVER.getLastRegisteredUpdate(updateType, vToken);
        if (
            (publishedId != 0 &&
                RISK_STEWARD_RECEIVER.updates(publishedId).status == IRiskStewardReceiver.UpdateStatus.None) ||
            (registeredId != 0 &&
                RISK_STEWARD_RECEIVER.updates(registeredId).status == IRiskStewardReceiver.UpdateStatus.Pending)
        ) {
            revert PreviousUpdatePending(vToken);
        }
    }

    /// @dev Checks a market is listed in the pool and is not a loan market
    function _ensureCollateralMarket(address comptroller, address vToken) internal view {
        if (!SpokeComptroller(comptroller).isMarketListed(VToken(vToken))) {
            revert MarketNotListed(vToken);
        }
        if (isLoanMarket[vToken]) {
            revert InvalidMarketType(vToken);
        }
    }

    /// @dev Returns a pool after checking the caller is its deployer, with its controls in force
    function _ensureActiveDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.deployer != msg.sender) {
            revert NotDeployer(msg.sender);
        }
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
    }

    /// @dev Returns a pool after checking its status
    function _ensurePoolStatus(address comptroller, PoolStatus status) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.status != status) {
            revert InvalidPoolStatus(comptroller);
        }
    }

    /// @dev Returns a request after checking it is pending or built, so it can still change
    function _ensureEditableRequest(uint256 requestId) internal view returns (Request storage request) {
        request = requests[requestId];
        if (request.status != RequestStatus.Pending && request.status != RequestStatus.Built) {
            revert InvalidRequestStatus(requestId);
        }
    }

    /// @dev Checks a new pool's parameters are within the bounds the comptroller accepts
    function _checkPoolParams(PoolParams calldata params) internal pure {
        if (
            params.closeFactor < MIN_CLOSE_FACTOR_MANTISSA ||
            params.closeFactor > MAX_CLOSE_FACTOR_MANTISSA ||
            params.liquidationIncentive < MIN_LIQUIDATION_INCENTIVE_MANTISSA
        ) {
            revert InvalidPoolParams();
        }
    }
}

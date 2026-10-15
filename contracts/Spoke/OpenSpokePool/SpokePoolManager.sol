// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { IGovernorBravo, PROPOSAL_STATE_CANCELED, PROPOSAL_STATE_DEFEATED, PROPOSAL_STATE_EXPIRED } from "../interfaces/IGovernorBravo.sol";
import { IRiskOracle } from "../interfaces/IRiskOracle.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolProposer } from "../interfaces/ISpokePoolProposer.sol";
import { ISpokePoolValidator } from "../interfaces/ISpokePoolValidator.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer stakes XVS in the XVSVault and requests a pool of a tier: the
 * manager locks the tier's stake, pulls the markets' seeds and stores the request. The Venus team may update it, the
 * deployer approves it, and the team proposes it through `SpokePoolProposer`; the proposal calls `settleRequest`,
 * which starts the deployer's rights. A deployer requests new markets or pool parameters the same way, and another
 * tier, which the team applies with `setPoolTier`. It tunes risk parameters within its tier through the Risk Stewards,
 * and can ask to exit. `SpokePoolValidator` checks requests and updates against the tiers, and `SpokePoolShortfall`
 * pays bad debt recoverers from the locked stake.
 * @dev Needs the XVSVault `lock`, `unlock` and `seizeLocked` roles and to be a RiskOracle authorized sender. It submits
 * the proposals `SpokePoolProposer` builds, so the GovernorBravo votes they need are delegated to it; GovernorBravo
 * allows one live proposal per proposer, so the votes run one after another
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolManager is
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    SpokePoolManagerStorage,
    ISpokePoolManager
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice ERC-20 decimals of a new market's vToken
    uint8 public constant VTOKEN_DECIMALS = 8;

    /// @notice Lowest USD value of a market's seed
    uint256 public constant MIN_SEED_USD = 90e18;

    /// @notice Highest USD value of a market's seed
    uint256 public constant MAX_SEED_USD = 150e18;

    /// @dev Bounds for close factor and liquidation incentive
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18;
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18;
    uint256 internal constant MIN_LIQUIDATION_INCENTIVE_MANTISSA = 1.05e18;

    /// @dev RiskOracle update types the Risk Stewards apply
    string internal constant COLLATERAL_FACTORS_UPDATE = "collateralFactors";
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";
    string internal constant BORROW_CAP_UPDATE = "borrowCap";

    /// @notice The vault deployer stakes are locked in
    IXVSVault public immutable XVS_VAULT;

    /// @notice The governor the proposals are submitted to
    IGovernorBravo public immutable GOVERNOR_BRAVO;

    /// @notice The registry spoke pools are listed in
    address public immutable POOL_REGISTRY;

    /// @notice The oracle every pool prices with
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @notice The oracle every pool bounds collateral prices with
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

    /// @notice The oracle deployer updates are published to
    IRiskOracle public immutable RISK_ORACLE;

    /// @notice Most markets a pool may have
    uint256 public immutable MAX_POOL_MARKETS;

    /**
     * @param xvsVault The vault deployer stakes are locked in
     * @param governorBravo The governor the proposals are submitted to
     * @param poolRegistry The registry spoke pools are listed in
     * @param resilientOracle The oracle every pool prices with
     * @param deviationBoundedOracle The oracle every pool bounds collateral prices with
     * @param riskOracle The oracle deployer updates are published to
     * @param maxPoolMarkets Most markets a pool may have; the proposer checks a pool-creation proposal fits it
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        IXVSVault xvsVault,
        IGovernorBravo governorBravo,
        address poolRegistry,
        ResilientOracleInterface resilientOracle,
        IDeviationBoundedOracle deviationBoundedOracle,
        IRiskOracle riskOracle,
        uint256 maxPoolMarkets
    ) {
        ensureNonzeroAddress(address(xvsVault));
        ensureNonzeroAddress(address(governorBravo));
        ensureNonzeroAddress(poolRegistry);
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(address(deviationBoundedOracle));
        ensureNonzeroAddress(address(riskOracle));

        XVS_VAULT = xvsVault;
        GOVERNOR_BRAVO = governorBravo;
        POOL_REGISTRY = poolRegistry;
        RESILIENT_ORACLE = resilientOracle;
        DEVIATION_BOUNDED_ORACLE = deviationBoundedOracle;
        RISK_ORACLE = riskOracle;
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

    /*** Requests ***/

    /// @inheritdoc ISpokePoolManager
    function requestPool(
        uint256 tierId,
        string calldata name,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        uint256 stake = tiers[tierId].stakeAmount;
        if (stake == 0) {
            revert InvalidTier(tierId);
        }
        Request storage request;
        (requestId, request) = _newRequest(RequestType.Pool, address(0));
        PoolRequest storage pool = request.pool;
        pool.tierId = tierId;
        pool.stake = stake;
        pool.name = name;
        pool.params = poolDefaults;
        _storeMarketsAndPullSeeds(request, markets);
        _verifyRequest(requestId);
        XVS_VAULT.lock(msg.sender, stake);
    }

    /// @inheritdoc ISpokePoolManager
    function requestMarkets(
        address comptroller,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        _ensureActiveDeployerAndSyncStake(comptroller);
        Request storage request;
        (requestId, request) = _newRequest(RequestType.Markets, comptroller);
        _storeMarketsAndPullSeeds(request, markets);
        _verifyRequest(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestPoolConfigUpdate(
        address comptroller,
        PoolParams calldata params,
        MarketInterestRateModel[] calldata interestRateModels
    ) external returns (uint256 requestId) {
        _ensureActiveDeployerAndSyncStake(comptroller);
        Request storage request;
        (requestId, request) = _newRequest(RequestType.PoolConfig, comptroller);
        _storePoolConfig(request, params, interestRateModels);
        _verifyRequest(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTier(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        // Not synced, so a deployer whose free stake cannot cover a raised stake can still ask for a cheaper tier;
        // `setPoolTier` syncs to the new tier's stake
        Pool storage pool = _ensureDeployer(comptroller);
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
        // A pool with its exit requested cannot be moved by `setPoolTier`
        if (pool.status != PoolStatus.Live) {
            revert InvalidPoolStatus(comptroller);
        }
        if (tiers[tierId].stakeAmount == 0 || tierId == pool.tierId) {
            revert InvalidTier(tierId);
        }
        Request storage request;
        (requestId, request) = _newRequest(RequestType.Tier, comptroller);
        request.tier = TierRequest(tierId, _tierHash(tierId));
    }

    /// @inheritdoc ISpokePoolManager
    function updateRequest(
        uint256 requestId,
        PoolParams calldata params,
        MarketParams[] calldata markets,
        MarketInterestRateModel[] calldata interestRateModels
    ) external {
        _checkAccessAllowed("updateRequest(uint256,PoolParams,MarketParams[],MarketInterestRateModel[])");

        Request storage request = _ensureEditableRequest(requestId);
        RequestType requestType = request.requestType;
        uint256 marketCount = markets.length;
        if (marketCount != request.markets.length) {
            revert InvalidArrayLength();
        }
        for (uint256 i; i < marketCount; ++i) {
            MarketParams storage market = request.markets[i];
            if (markets[i].asset != market.asset || markets[i].seed != market.seed) {
                revert InvalidSeed(market.asset);
            }
            request.markets[i] = markets[i];
        }
        if (requestType == RequestType.Pool) {
            request.pool.params = params;
        } else if (requestType == RequestType.PoolConfig) {
            _storePoolConfig(request, params, interestRateModels);
        }
        request.approved = false;
        _verifyRequest(requestId);

        emit RequestUpdated(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function approveRequest(uint256 requestId) external {
        Request storage request = _ensureEditableRequest(requestId);
        if (msg.sender != request.deployer) {
            revert NotDeployer(msg.sender);
        }
        request.approved = true;

        emit RequestApproved(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function proposeRequest(uint256 requestId, string calldata description) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeRequest(uint256,string)");

        Request storage request = _ensureEditableRequest(requestId);
        if (!request.approved) {
            revert RequestNotApproved(requestId);
        }
        _verifyRequest(requestId);
        address[] memory vTokens;
        bytes memory proposal;
        (request.comptroller, vTokens, proposal) = ISpokePoolProposer(proposer).buildRequestProposal(
            requestId,
            description
        );
        proposalId = _submitProposal(proposal);
        request.status = RequestStatus.Proposed;
        request.proposalId = proposalId;
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (request.markets[i].isLoanMarket) {
                isLoanMarket[vTokens[i]] = true;
            }
        }

        emit RequestProposed(requestId, proposalId, vTokens);
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256)");

        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Proposed) {
            revert InvalidRequestStatus(requestId);
        }
        _verifyRequest(requestId);
        request.status = RequestStatus.Settled;

        address comptroller = request.comptroller;
        if (request.requestType == RequestType.Pool) {
            Pool storage pool = pools[comptroller];
            pool.deployer = request.deployer;
            pool.status = PoolStatus.Live;
            pool.tierId = uint16(request.pool.tierId);
            pool.lockedStake = request.pool.stake;
            emit PoolActivated(requestId, comptroller, request.deployer);
        }
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            MarketParams storage market = request.markets[i];
            IERC20Upgradeable(market.asset).safeTransfer(msg.sender, market.seed);
        }

        emit RequestSettled(requestId, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolTier(uint256 requestId) external {
        _checkAccessAllowed("setPoolTier(uint256)");

        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Pending) {
            revert InvalidRequestStatus(requestId);
        }
        if (request.requestType != RequestType.Tier) {
            revert InvalidRequestType(requestId);
        }
        address comptroller = request.comptroller;
        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.Live);
        uint256 tierId = request.tier.tierId;
        if (request.tier.termsHash != _tierHash(tierId)) {
            revert InvalidTier(tierId);
        }
        ISpokePoolValidator(validator).checkPoolFitsTier(comptroller, tierId);
        request.status = RequestStatus.Settled;

        pool.tierId = uint16(tierId);
        _syncLockedStake(comptroller, pool);

        emit PoolTierUpdated(comptroller, tierId);
        emit RequestSettled(requestId, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external {
        _checkAccessAllowed("rejectRequest(uint256)");

        _closeRequest(_ensureEditableRequest(requestId), RequestStatus.Rejected);

        emit RequestRejected(requestId);
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

    /*** Live pools ***/

    /// @inheritdoc ISpokePoolManager
    function updateCollateralFactor(
        address comptroller,
        VToken vToken,
        uint256 newCollateralFactor,
        uint256 newLiquidationThreshold
    ) external {
        _ensureActiveDeployerAndSyncStake(comptroller);
        ISpokePoolValidator(validator).checkCollateralFactor(
            comptroller,
            address(vToken),
            newCollateralFactor,
            newLiquidationThreshold
        );
        _publishUpdate(COLLATERAL_FACTORS_UPDATE, vToken, abi.encode(newCollateralFactor, newLiquidationThreshold));
    }

    /// @inheritdoc ISpokePoolManager
    function updateSupplyCap(address comptroller, VToken vToken, uint256 newSupplyCap) external {
        _ensureActiveDeployerAndSyncStake(comptroller);
        ISpokePoolValidator(validator).checkSupplyCap(comptroller, address(vToken), newSupplyCap);
        _publishUpdate(SUPPLY_CAP_UPDATE, vToken, abi.encode(newSupplyCap));
    }

    /// @inheritdoc ISpokePoolManager
    function updateBorrowCap(address comptroller, VToken vToken, uint256 newBorrowCap) external {
        _ensureActiveDeployerAndSyncStake(comptroller);
        ISpokePoolValidator(validator).checkLoanMarket(comptroller, address(vToken));
        _publishUpdate(BORROW_CAP_UPDATE, vToken, abi.encode(newBorrowCap));
    }

    /// @inheritdoc ISpokePoolManager
    function syncLockedStake(address comptroller) external {
        Pool storage pool = pools[comptroller];
        if (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
        _syncLockedStake(comptroller, pool);
    }

    /// @inheritdoc ISpokePoolManager
    function setDeployerPaused(address comptroller, bool paused) external {
        _checkAccessAllowed("setDeployerPaused(address,bool)");

        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }
        emit DeployerPausedUpdated(comptroller, paused);
        pool.deployerPaused = paused;
    }

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

    /*** Exits ***/

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        _ensureDeployer(comptroller).status = PoolStatus.ExitRequested;
        emit ExitRequested(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeExit(address,uint256[],string)");

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.ExitProposed;
        proposalId = _submitProposal(
            ISpokePoolProposer(proposer).buildExitProposal(comptroller, liquidationThresholds, description)
        );

        emit ExitProposed(comptroller, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function startWindDown(address comptroller) external {
        _checkAccessAllowed("startWindDown(address)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.ExitProposed);
        pool.status = PoolStatus.WindingDown;
        pool.windDownStartedAt = uint64(block.timestamp);

        emit WindDownStarted(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeForceClose(address,string)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert WindDownPeriodNotElapsed();
        }
        proposalId = _submitProposal(ISpokePoolProposer(proposer).buildForceCloseProposal(comptroller, description));

        emit ForceCloseProposed(comptroller, proposalId);
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
        ISpokePoolValidator(validator).accrueAndCheckResidualDebt(comptroller);
        pool.status = PoolStatus.Closed;
        uint256 amount = _unlockStake(pool);

        emit StakeReleased(comptroller, pool.deployer, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function takeOverByGovernance(address comptroller) external {
        _checkAccessAllowed("takeOverByGovernance(address)");

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.TakenOverByGovernance;
        uint256 amount = _unlockStake(pool);

        emit PoolTakenOverByGovernance(comptroller, pool.deployer, amount);
    }

    /*** Configuration ***/

    /// @inheritdoc ISpokePoolManager
    function setTier(uint256 tierId, Tier calldata tier) external {
        _checkAccessAllowed("setTier(uint256,Tier)");
        if (
            tierId > tierCount ||
            tierId > type(uint16).max ||
            tier.maxLiquidationThreshold > MANTISSA_ONE ||
            tier.maxCollateralFactor > tier.maxLiquidationThreshold ||
            tier.minLiquidationThreshold > tier.maxLiquidationThreshold
        ) {
            revert InvalidTier(tierId);
        }
        if (tierId == tierCount) {
            ++tierCount;
        }
        emit TierUpdated(tierId, tiers[tierId], tier);
        tiers[tierId] = tier;
    }

    /// @inheritdoc ISpokePoolManager
    function setProposer(ISpokePoolProposer newProposer) external {
        _checkAccessAllowed("setProposer(address)");
        ensureNonzeroAddress(address(newProposer));
        emit ProposerUpdated(ISpokePoolProposer(proposer), newProposer);
        proposer = address(newProposer);
    }

    /// @inheritdoc ISpokePoolManager
    function setValidator(ISpokePoolValidator newValidator) external {
        _checkAccessAllowed("setValidator(address)");
        ensureNonzeroAddress(address(newValidator));
        emit ValidatorUpdated(ISpokePoolValidator(validator), newValidator);
        validator = address(newValidator);
    }

    /// @inheritdoc ISpokePoolManager
    function setSpokeSource(address asset, address source) external {
        _checkAccessAllowed("setSpokeSource(address,address)");
        ensureNonzeroAddress(asset);
        emit SpokeSourceUpdated(asset, spokeSources[asset], source);
        spokeSources[asset] = source;
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolDefaults(PoolParams calldata params) external {
        _checkAccessAllowed("setPoolDefaults(PoolParams)");
        if (
            params.closeFactor < MIN_CLOSE_FACTOR_MANTISSA ||
            params.closeFactor > MAX_CLOSE_FACTOR_MANTISSA ||
            params.liquidationIncentive < MIN_LIQUIDATION_INCENTIVE_MANTISSA
        ) {
            revert InvalidPoolParams();
        }
        emit PoolDefaultsUpdated(poolDefaults, params);
        poolDefaults = params;
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketDefaults(ProtocolMarketParams calldata params) external {
        _checkAccessAllowed("setMarketDefaults(ProtocolMarketParams)");
        if (
            params.interestRateModel == address(0) ||
            params.reserveFactor > MANTISSA_ONE ||
            params.seedBurnPercent == 0 ||
            params.seedBurnPercent > MANTISSA_ONE
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
        IERC20Upgradeable(token).safeTransfer(to, amount);
        emit SweepToken(token, to, amount);
    }

    /*** Views ***/

    /// @inheritdoc ISpokePoolManager
    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }

    /// @inheritdoc ISpokePoolManager
    function getPool(address comptroller) external view returns (Pool memory) {
        return pools[comptroller];
    }

    /// @inheritdoc ISpokePoolManager
    function getTier(uint256 tierId) external view returns (Tier memory) {
        return tiers[tierId];
    }

    /*** Internal functions ***/

    /**
     * @dev Stores a new pending request from the caller, approved by it
     * @param requestType What the request asks for
     * @param comptroller The pool; zero for a new pool
     * @return requestId The request's id
     * @return request The request's storage
     * @custom:error OpenRequestExists is thrown while the caller's latest request is pending or proposed
     */
    function _newRequest(
        RequestType requestType,
        address comptroller
    ) internal returns (uint256 requestId, Request storage request) {
        uint256 latestRequestId = latestRequestIds[msg.sender];
        RequestStatus latestStatus = requests[latestRequestId].status;
        if (latestStatus == RequestStatus.Pending || latestStatus == RequestStatus.Proposed) {
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

        emit RequestSubmitted(requestId, requestType, msg.sender, comptroller);
    }

    /**
     * @dev Adds the deployer's markets to a request with Venus's parameters, and pulls each market's seed
     * @param request The request's storage
     * @param markets The deployer's markets
     */
    function _storeMarketsAndPullSeeds(Request storage request, DeployerMarketParams[] calldata markets) internal {
        ProtocolMarketParams memory defaults = marketDefaults;
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            DeployerMarketParams calldata params = markets[i];
            MarketParams storage market = request.markets.push();
            market.asset = params.asset;
            market.name = params.name;
            market.symbol = params.symbol;
            market.isLoanMarket = params.isLoanMarket;
            market.collateralFactor = params.collateralFactor;
            market.liquidationThreshold = params.liquidationThreshold;
            market.supplyCap = params.supplyCap;
            market.borrowCap = params.borrowCap;
            market.seed = params.seed;
            market.interestRateModel = defaults.interestRateModel;
            market.decimals = VTOKEN_DECIMALS;
            market.reserveFactor = defaults.reserveFactor;
            market.seedBurnPercent = defaults.seedBurnPercent;
            // One vToken per unit of the underlying
            market.initialExchangeRate =
                uint256(10) ** (18 + IERC20MetadataUpgradeable(params.asset).decimals() - VTOKEN_DECIMALS);
            _pullSeed(params.asset, params.seed);
        }
    }

    /**
     * @dev Pulls a market's seed from the caller after checking its USD value
     * @param asset The market's asset
     * @param seed The seed
     * @custom:error InvalidSeed is thrown when the seed is worth less than `MIN_SEED_USD` or more than `MAX_SEED_USD`
     * @custom:error TransferAmountMismatch is thrown when the transfer delivers a different amount
     */
    function _pullSeed(address asset, uint256 seed) internal {
        uint256 seedUsd = (seed * RESILIENT_ORACLE.getPrice(asset)) / EXP_SCALE;
        if (seedUsd < MIN_SEED_USD || seedUsd > MAX_SEED_USD) {
            revert InvalidSeed(asset);
        }
        IERC20Upgradeable token = IERC20Upgradeable(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), seed);
        if (token.balanceOf(address(this)) - balanceBefore != seed) {
            revert TransferAmountMismatch(asset);
        }
    }

    /**
     * @dev Replaces a pool config request's content
     * @param request The request's storage
     * @param params The pool-wide parameter changes
     * @param interestRateModels The new interest rate models
     */
    function _storePoolConfig(
        Request storage request,
        PoolParams calldata params,
        MarketInterestRateModel[] calldata interestRateModels
    ) internal {
        PoolConfigRequest storage config = request.poolConfig;
        config.params = params;
        delete config.interestRateModels;
        uint256 modelCount = interestRateModels.length;
        for (uint256 i; i < modelCount; ++i) {
            config.interestRateModels.push(interestRateModels[i]);
        }
    }

    /**
     * @dev Submits a proposal the proposer built
     * @param proposal The ABI-encoded GovernorBravo `propose` call
     * @return The proposal's id
     */
    function _submitProposal(bytes memory proposal) internal returns (uint256) {
        return abi.decode(AddressUpgradeable.functionCall(address(GOVERNOR_BRAVO), proposal), (uint256));
    }

    /**
     * @dev Publishes a deployer's market update to the RiskOracle
     * @param updateType The update type, which selects the Risk Steward that applies it
     * @param vToken The market
     * @param newValue The ABI-encoded new value
     */
    function _publishUpdate(string memory updateType, VToken vToken, bytes memory newValue) internal {
        RISK_ORACLE.publishRiskParameterUpdate("", newValue, updateType, address(vToken), 0, 0, "");
    }

    /**
     * @dev Closes an open request; a pool request's stake is unlocked, and its seeds stay with the manager
     * @param request The request's storage
     * @param status The closing status
     */
    function _closeRequest(Request storage request, RequestStatus status) internal {
        request.status = status;
        uint256 stake = request.pool.stake;
        if (stake != 0) {
            XVS_VAULT.unlock(request.deployer, stake);
        }
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
     * @dev Returns a pool after checking the caller is its deployer with its rights in force (`_ensureDeployer`'s
     * checks and the deployer is not paused), then syncs the pool's locked stake to its tier's with `_syncLockedStake`
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error The vault's `lock` errors, such as when the deployer's free stake cannot cover the tier's stake
     */
    function _ensureActiveDeployerAndSyncStake(address comptroller) internal returns (Pool storage pool) {
        pool = _ensureDeployer(comptroller);
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
        _syncLockedStake(comptroller, pool);
    }

    /**
     * @dev Locks or unlocks the difference between a pool's locked stake and its tier's current stake, so a tier
     * change or a seizure is followed without a separate top-up
     * @param comptroller The pool's comptroller
     * @param pool The pool's storage
     * @custom:event Emits LockedStakeUpdated when the locked stake changes
     * @custom:error The vault's `lock` errors, such as when the deployer's free stake cannot cover the tier's stake
     */
    function _syncLockedStake(address comptroller, Pool storage pool) internal {
        uint256 lockedStake = pool.lockedStake;
        uint256 requiredStake = tiers[pool.tierId].stakeAmount;
        if (requiredStake == lockedStake) {
            return;
        }
        pool.lockedStake = requiredStake;
        if (requiredStake > lockedStake) {
            XVS_VAULT.lock(pool.deployer, requiredStake - lockedStake);
        } else {
            XVS_VAULT.unlock(pool.deployer, lockedStake - requiredStake);
        }

        emit LockedStakeUpdated(comptroller, lockedStake, requiredStake);
    }

    /**
     * @dev Checks a request against its pool and tier through the validator
     * @param requestId The request
     */
    function _verifyRequest(uint256 requestId) internal view {
        ISpokePoolValidator(validator).verifyRequest(requestId);
    }

    /**
     * @dev Returns the hash of a tier's id and current terms, which a tier request commits to
     * @param tierId The tier
     * @return The hash
     */
    function _tierHash(uint256 tierId) internal view returns (bytes32) {
        return keccak256(abi.encode(tierId, tiers[tierId]));
    }

    /**
     * @dev Returns a request after checking it can still be updated, approved, proposed, rejected or canceled: it is
     * pending, or proposed with a proposal that can no longer execute
     * @param requestId The request
     * @return request The request's storage
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     */
    function _ensureEditableRequest(uint256 requestId) internal view returns (Request storage request) {
        request = requests[requestId];
        if (request.status == RequestStatus.Proposed) {
            uint8 state = GOVERNOR_BRAVO.state(request.proposalId);
            if (
                state != PROPOSAL_STATE_CANCELED && state != PROPOSAL_STATE_DEFEATED && state != PROPOSAL_STATE_EXPIRED
            ) {
                revert InvalidRequestStatus(requestId);
            }
        } else if (request.status != RequestStatus.Pending) {
            revert InvalidRequestStatus(requestId);
        }
    }

    /**
     * @dev Returns a pool after checking the caller is its deployer and the pool is live, with or without an exit
     * requested
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     */
    function _ensureDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.deployer != msg.sender) {
            revert NotDeployer(msg.sender);
        }
        if (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
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
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
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
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";
import { SpokePoolProposer } from "./SpokePoolProposer.sol";
import { SpokePoolValidator } from "./SpokePoolValidator.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer stakes XVS in the XVSVault and requests a pool of a tier: the
 * manager locks the tier's stake, pulls the markets' seeds and stores the request. The Venus team may update it, the
 * deployer approves it, and the team proposes it through `SpokePoolProposer`; the proposal calls `settleRequest`,
 * which starts the deployer's rights. A deployer requests new markets, pool parameters or another tier the same way,
 * tunes risk parameters within its tier through the Risk Stewards, and can ask to exit. `SpokePoolValidator` checks
 * requests and updates against the tiers, and `SpokePoolShortfall` pays bad debt recoverers from the locked stake.
 * @dev Needs the XVSVault `lock`, `unlock` and `seizeLocked` roles and to be a RiskOracle authorized sender. The
 * GovernorBravo votes the proposals need are delegated to the proposer
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
        _storeMarkets(request, markets);
        _verifyRequest(requestId);
        XVS_VAULT.lock(msg.sender, stake);
    }

    /// @inheritdoc ISpokePoolManager
    function requestMarkets(
        address comptroller,
        DeployerMarketParams[] calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        _ensureActiveDeployer(comptroller);
        if (markets.length == 0) {
            revert InvalidArrayLength();
        }
        Request storage request;
        (requestId, request) = _newRequest(RequestType.Markets, comptroller);
        _storeMarkets(request, markets);
        _verifyRequest(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestPoolConfigUpdate(
        address comptroller,
        PoolParams calldata params,
        MarketInterestRateModel[] calldata interestRateModels
    ) external returns (uint256 requestId) {
        _ensureActiveDeployer(comptroller);
        Request storage request;
        (requestId, request) = _newRequest(RequestType.PoolConfig, comptroller);
        _storePoolConfig(request, params, interestRateModels);
        _verifyRequest(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTier(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        Pool storage pool = _ensureActiveDeployer(comptroller);
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

        Request storage request = _ensureOpenRequest(requestId);
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
        Request storage request = _ensureOpenRequest(requestId);
        if (msg.sender != request.deployer) {
            revert NotDeployer(msg.sender);
        }
        request.approved = true;

        emit RequestApproved(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function proposeRequest(
        uint256 requestId,
        string calldata description
    ) external nonReentrant returns (uint256 proposalId) {
        _checkAccessAllowed("proposeRequest(uint256,string)");

        Request storage request = _ensureOpenRequest(requestId);
        if (!request.approved) {
            revert RequestNotApproved(requestId);
        }
        _verifyRequest(requestId);
        address[] memory vTokens;
        (proposalId, request.comptroller, vTokens) = SpokePoolProposer(proposer).proposeRequest(requestId, description);
        request.vTokens = vTokens;
        request.status = RequestStatus.Proposed;
        request.proposalId = proposalId;

        emit RequestProposed(requestId, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256)");

        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Proposed) {
            revert InvalidRequestStatus(requestId);
        }
        _verifyRequest(requestId);
        request.status = RequestStatus.Executed;

        address comptroller = request.comptroller;
        if (request.requestType == RequestType.Pool) {
            Pool storage pool = pools[comptroller];
            pool.deployer = request.deployer;
            pool.status = PoolStatus.Live;
            pool.tierId = request.pool.tierId;
            pool.lockedStake = request.pool.stake;
            emit PoolActivated(requestId, comptroller, request.deployer);
        }
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            MarketParams storage market = request.markets[i];
            if (market.isLoanMarket) {
                isLoanMarket[request.vTokens[i]] = true;
            }
            IERC20Upgradeable(market.asset).safeTransfer(msg.sender, market.seed);
        }

        emit RequestSettled(requestId, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function setPoolTier(uint256 requestId) external nonReentrant {
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
        SpokePoolValidator(validator).checkPoolFitsTier(comptroller, tierId);
        request.status = RequestStatus.Executed;

        uint256 newStake = tiers[tierId].stakeAmount;
        uint256 lockedStake = pool.lockedStake;
        pool.tierId = tierId;
        pool.lockedStake = newStake;
        if (newStake > lockedStake) {
            XVS_VAULT.lock(pool.deployer, newStake - lockedStake);
        } else if (newStake < lockedStake) {
            XVS_VAULT.unlock(pool.deployer, lockedStake - newStake);
        }

        emit PoolTierUpdated(comptroller, tierId);
        emit RequestSettled(requestId, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");

        Request storage request = _ensureOpenRequest(requestId);
        request.status = RequestStatus.Rejected;
        uint256 stake = request.pool.stake;
        if (stake != 0) {
            XVS_VAULT.unlock(request.deployer, stake);
        }

        emit RequestRejected(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function cancelRequest(uint256 requestId) external nonReentrant {
        Request storage request = _ensureOpenRequest(requestId);
        if (msg.sender != request.deployer) {
            revert NotDeployer(msg.sender);
        }
        request.status = RequestStatus.Canceled;
        uint256 stake = request.pool.stake;
        if (stake != 0) {
            XVS_VAULT.unlock(msg.sender, stake);
        }

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
        _ensureActiveDeployer(comptroller);
        SpokePoolValidator(validator).checkCollateralFactor(
            comptroller,
            address(vToken),
            newCollateralFactor,
            newLiquidationThreshold
        );
        _publishUpdate(COLLATERAL_FACTORS_UPDATE, vToken, abi.encode(newCollateralFactor, newLiquidationThreshold));
    }

    /// @inheritdoc ISpokePoolManager
    function updateSupplyCap(address comptroller, VToken vToken, uint256 newSupplyCap) external {
        _ensureActiveDeployer(comptroller);
        SpokePoolValidator(validator).checkSupplyCap(comptroller, address(vToken), newSupplyCap);
        _publishUpdate(SUPPLY_CAP_UPDATE, vToken, abi.encode(newSupplyCap));
    }

    /// @inheritdoc ISpokePoolManager
    function updateBorrowCap(address comptroller, VToken vToken, uint256 newBorrowCap) external {
        _ensureActiveDeployer(comptroller);
        SpokePoolValidator(validator).checkLoanMarket(comptroller, address(vToken));
        _publishUpdate(BORROW_CAP_UPDATE, vToken, abi.encode(newBorrowCap));
    }

    /// @inheritdoc ISpokePoolManager
    function topUpStake(address comptroller) external nonReentrant {
        Pool storage pool = pools[comptroller];
        if (pool.deployer != msg.sender) {
            revert NotDeployer(msg.sender);
        }
        if (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
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
        _ensureActiveDeployer(comptroller).status = PoolStatus.ExitRequested;
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
        // `ExitProposed` is accepted so the exit can be proposed again when its earlier proposal fails
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.ExitProposed;
        proposalId = SpokePoolProposer(proposer).proposeExit(comptroller, liquidationThresholds, description);

        emit ExitProposed(comptroller, proposalId);
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
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeForceClose(address,string)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert WindDownPeriodNotElapsed();
        }
        proposalId = SpokePoolProposer(proposer).proposeForceClose(comptroller, description);

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
        SpokePoolValidator(validator).checkResidualDebt(comptroller);
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
    function setProposer(SpokePoolProposer newProposer) external {
        _checkAccessAllowed("setProposer(address)");
        ensureNonzeroAddress(address(newProposer));
        emit ProposerUpdated(SpokePoolProposer(proposer), newProposer);
        proposer = address(newProposer);
    }

    /// @inheritdoc ISpokePoolManager
    function setValidator(SpokePoolValidator newValidator) external {
        _checkAccessAllowed("setValidator(address)");
        ensureNonzeroAddress(address(newValidator));
        emit ValidatorUpdated(SpokePoolValidator(validator), newValidator);
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
        emit PoolDefaultsUpdated(poolDefaults, params);
        poolDefaults = params;
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketDefaults(ProtocolMarketParams calldata params) external {
        _checkAccessAllowed("setMarketDefaults(ProtocolMarketParams)");
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

    /*** Internal functions ***/

    /**
     * @dev Stores a new pending request from the caller, approved by it, once the caller's latest request is closed
     * @param requestType What the request asks for
     * @param comptroller The pool; zero for a new pool
     * @return requestId The request's id
     * @return request The request's storage
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
    function _storeMarkets(Request storage request, DeployerMarketParams[] calldata markets) internal {
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
     * @dev Publishes a deployer's market update to the RiskOracle
     * @param updateType The update type, which selects the Risk Steward that applies it
     * @param vToken The market
     * @param newValue The ABI-encoded new value
     */
    function _publishUpdate(string memory updateType, VToken vToken, bytes memory newValue) internal {
        RISK_ORACLE.publishRiskParameterUpdate("", newValue, updateType, address(vToken), 0, 0, "");
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
     * @dev Checks a request against its pool and tier through the validator
     * @param requestId The request
     */
    function _verifyRequest(uint256 requestId) internal view {
        SpokePoolValidator(validator).verifyRequest(requestId);
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
     * @dev Returns a request after checking it is open: pending, or proposed with a proposal that can no longer execute
     * @param requestId The request
     * @return request The request's storage
     * @custom:error InvalidRequestStatus is thrown when the request is not pending and has no failed proposal
     */
    function _ensureOpenRequest(uint256 requestId) internal view returns (Request storage request) {
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
     * @dev Returns a pool after checking the caller is its deployer with its rights in force: the pool is live, with or
     * without an exit requested, the deployer is not paused, and its tier's stake is locked
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer
     * @custom:error InvalidPoolStatus is thrown when the pool is neither live nor live with an exit requested
     * @custom:error DeployerPaused is thrown while the deployer's actions are paused
     * @custom:error InsufficientLockedStake is thrown while the locked stake is below the tier's stake
     */
    function _ensureActiveDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (pool.deployer != msg.sender) {
            revert NotDeployer(msg.sender);
        }
        if (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested) {
            revert InvalidPoolStatus(comptroller);
        }
        if (pool.deployerPaused) {
            revert DeployerPaused(comptroller);
        }
        // Falls short after `setTier` raises the stake or `seizeStake` takes part of it, until `topUpStake`
        uint256 requiredStake = tiers[pool.tierId].stakeAmount;
        if (pool.lockedStake < requiredStake) {
            revert InsufficientLockedStake(requiredStake, pool.lockedStake);
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

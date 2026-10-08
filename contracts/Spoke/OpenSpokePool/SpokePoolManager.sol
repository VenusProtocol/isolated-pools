// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistryInterface } from "../../Pool/PoolRegistryInterface.sol";
import { VToken } from "../../VToken.sol";
import { SpokeProposalBuilder } from "../../lib/SpokeProposalBuilder.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IGovernorBravo } from "../interfaces/IGovernorBravo.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { SpokePoolFactory } from "./SpokePoolFactory.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A project stakes XVS in the XVSVault and requests a pool of a tier: the
 * manager locks the tier's stake in the vault and escrows one seed per market. A pool's deployer requests new markets
 * the same way, escrowing their seeds. The Venus team proposes an approved request to GovernorBravo on the Normal route
 * with its final parameters; the proposal deploys, lists and funds the pool or the markets. The deployer then tunes the
 * pool within its tier through the manager, which holds the pool-specific ACM roles the deployer does not, and can
 * sunset a market by zeroing its caps and collateral factor. The team also proposes the pool's exit.
 * @dev The manager must hold GovernorBravo's Normal proposal threshold in votes (delegated, or whitelisted) and the
 * XVSVault `lock`, `unlock` and `seizeLocked` roles. Bad debt is covered through `SpokePoolShortfallReceiver`, every
 * market's `shortfall`, which pays coverers from the pool's locked stake through `seizeStake`. GovernorBravo allows one
 * live proposal per proposer, so the manager's proposals run one after another. The proposals' actions are built by
 * the linked `SpokeProposalBuilder`. Public variable getters are not in `ISpokePoolManager`: they live in the sibling
 * base `SpokePoolManagerStorage`.
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable external-library-linking
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

    /// @notice The governor the manager proposes through
    IGovernorBravo public immutable GOVERNOR_BRAVO;

    /// @notice The registry spoke pools are listed in
    address public immutable POOL_REGISTRY;

    /// @notice The oracle every pool prices with, and the manager values seeds, caps and debt with
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @notice The receiver of the seed vTokens that are not burned
    address public immutable TREASURY;

    /**
     * @param xvsVault The vault project stakes are locked in
     * @param governorBravo The governor the manager proposes through
     * @param poolRegistry The registry spoke pools are listed in
     * @param resilientOracle The oracle every pool prices with
     * @param treasury The receiver of the seed vTokens that are not burned
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        IXVSVault xvsVault,
        IGovernorBravo governorBravo,
        address poolRegistry,
        ResilientOracleInterface resilientOracle,
        address treasury
    ) {
        ensureNonzeroAddress(address(xvsVault));
        ensureNonzeroAddress(address(governorBravo));
        ensureNonzeroAddress(poolRegistry);
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(treasury);

        XVS_VAULT = xvsVault;
        GOVERNOR_BRAVO = governorBravo;
        POOL_REGISTRY = poolRegistry;
        RESILIENT_ORACLE = resilientOracle;
        TREASURY = treasury;

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
        _checkMarketCount(params.markets.length);
        uint256 stakeAmount;
        if (comptroller == address(0)) {
            stakeAmount = _ensureTier(tierId).stakeAmount;
        } else {
            tierId = _ensureLiveDeployer(comptroller).tierId;
        }
        _validateMarkets(comptroller, tiers[tierId], params.markets);

        requestId = ++requestCount;
        Request storage request = requests[requestId];
        request.project = msg.sender;
        request.status = RequestStatus.Pending;
        request.comptroller = comptroller;
        request.tierId = tierId;
        request.stakeAmount = stakeAmount;
        _escrowSeeds(request, params.markets);
        if (stakeAmount != 0) {
            XVS_VAULT.lock(msg.sender, stakeAmount);
        }

        emit RequestSubmitted(requestId, msg.sender, comptroller, tierId, params);
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
        if (isLoanMarket[address(vToken)]) {
            revert NotCollateralMarket(address(vToken));
        }
        _checkCollateralParams(tiers[pool.tierId], newCollateralFactorMantissa, newLiquidationThresholdMantissa);

        SpokeComptroller(comptroller).setCollateralFactor(
            vToken,
            newCollateralFactorMantissa,
            newLiquidationThresholdMantissa
        );
    }

    /// @inheritdoc ISpokePoolManager
    function setMarketSupplyCaps(
        address comptroller,
        VToken[] calldata vTokens,
        uint256[] calldata newSupplyCaps
    ) external {
        Pool storage pool = _ensureDeployer(comptroller);
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (!SpokeComptroller(comptroller).isMarketListed(vTokens[i])) {
                revert MarketNotInPool(address(vTokens[i]));
            }
        }

        SpokeComptroller(comptroller).setMarketSupplyCaps(vTokens, newSupplyCaps);

        if (_loanLiquidityUsd(comptroller) > tiers[pool.tierId].maxLiquidityUsd) {
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
            if (!isLoanMarket[address(vTokens[i])] || !SpokeComptroller(comptroller).isMarketListed(vTokens[i])) {
                revert NotLoanMarket(address(vTokens[i]));
            }
        }

        SpokeComptroller(comptroller).setMarketBorrowCaps(vTokens, newBorrowCaps);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierChange(address comptroller, uint256 newTierId) external {
        Pool storage pool = _ensureLiveDeployer(comptroller);
        _ensureTier(newTierId);
        if (newTierId == pool.tierId) {
            revert InvalidTier(newTierId);
        }

        emit TierChangeRequested(comptroller, newTierId);
    }

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        _ensureLiveDeployer(comptroller).status = PoolStatus.ExitRequested;
        emit ExitRequested(comptroller);
    }

    /*** Venus team functions ***/

    /// @inheritdoc ISpokePoolManager
    function propose(
        uint256 requestId,
        PoolParams calldata params,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("propose(uint256,PoolParams,string)");

        Request storage request = _ensureOpenRequest(requestId);
        address comptroller = request.comptroller;
        if (comptroller != address(0)) {
            _ensurePoolStatus(comptroller, PoolStatus.Live);
        }
        _checkSeeds(requestId, request, params.markets);
        _validateMarkets(comptroller, tiers[request.tierId], params.markets);

        address[] memory targets;
        string[] memory signatures;
        bytes[] memory calldatas;
        if (comptroller == address(0)) {
            (targets, signatures, calldatas) = SpokeProposalBuilder.buildPoolCreationProposal(this, requestId, params);
        } else {
            (targets, signatures, calldatas) = SpokeProposalBuilder.buildMarketAdditionProposal(
                this,
                requestId,
                comptroller,
                params
            );
        }
        request.status = RequestStatus.Proposed;
        request.paramsHash = keccak256(abi.encode(params));
        proposalId = _propose(targets, signatures, calldatas, description);
        request.proposalId = proposalId;

        emit RequestProposed(requestId, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");

        Request storage request = _ensureOpenRequest(requestId);
        request.status = RequestStatus.Rejected;
        _returnEscrow(request);

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
        if (pool.deployerFrozen) {
            revert DeployerFrozen(comptroller);
        }
        uint256 newStake = tier.stakeAmount;
        uint256 lockedStake = pool.lockedStake;
        _checkPoolFitsTier(comptroller, tier);

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
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeExit(address,uint256[],string)");

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitApproved) {
            revert InvalidPoolStatus(comptroller);
        }
        (address[] memory targets, string[] memory signatures, bytes[] memory calldatas) = SpokeProposalBuilder
            .buildExitProposal(this, comptroller, liquidationThresholds);
        pool.status = PoolStatus.ExitApproved;
        proposalId = _propose(targets, signatures, calldatas, description);

        emit ExitProposed(comptroller, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeForceClose(address,string)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + repaymentWindow) {
            revert RepaymentWindowNotElapsed();
        }
        (address[] memory targets, string[] memory signatures, bytes[] memory calldatas) = SpokeProposalBuilder
            .buildForceCloseProposal(this, comptroller);
        proposalId = _propose(targets, signatures, calldatas, description);

        emit ForceCloseProposed(comptroller, proposalId);
    }

    /// @inheritdoc ISpokePoolManager
    function releaseStake(address comptroller) external {
        _checkAccessAllowed("releaseStake(address)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.WindingDown);
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            markets[i].accrueInterest();
            debtUsd += _debtUsd(markets[i]);
        }
        if (debtUsd > maxResidualDebtUsd) {
            revert OutstandingDebt(debtUsd);
        }

        pool.status = PoolStatus.Closed;
        uint256 amount = _unlockStake(pool);

        emit StakeReleased(comptroller, pool.deployer, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function setDeployerFrozen(address comptroller, bool frozen) external {
        _checkAccessAllowed("setDeployerFrozen(address,bool)");

        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.deployerFrozen = frozen;

        emit DeployerFrozenUpdated(comptroller, frozen);
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
        tiers[tierId] = tier;
        emit TierUpdated(tierId, tier);
    }

    /// @inheritdoc ISpokePoolManager
    function setFactory(SpokePoolFactory newFactory) external {
        _checkAccessAllowed("setFactory(address)");
        ensureNonzeroAddress(address(newFactory));
        emit FactoryUpdated(factory, newFactory);
        factory = newFactory;
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
    function setMaxMarketsPerRequest(uint256 newMaxMarketsPerRequest) external {
        _checkAccessAllowed("setMaxMarketsPerRequest(uint256)");
        emit MaxMarketsPerRequestUpdated(maxMarketsPerRequest, newMaxMarketsPerRequest);
        maxMarketsPerRequest = newMaxMarketsPerRequest;
    }

    /// @inheritdoc ISpokePoolManager
    function startWindDown(address comptroller) external {
        _checkAccessAllowed("startWindDown(address)");

        Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.ExitApproved);
        pool.status = PoolStatus.WindingDown;
        pool.windDownStartedAt = block.timestamp;

        emit WindDownStarted(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function releaseToDao(address comptroller) external {
        _checkAccessAllowed("releaseToDao(address)");

        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status == PoolStatus.None || status == PoolStatus.Closed || status == PoolStatus.HandedOver) {
            revert InvalidPoolStatus(comptroller);
        }
        pool.status = PoolStatus.HandedOver;
        uint256 amount = _unlockStake(pool);

        emit PoolHandedOver(comptroller, pool.deployer, amount);
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
        if (msg.sender != address(factory)) {
            revert OnlyFactory(msg.sender);
        }
        Request storage request = requests[requestId];
        if (request.status != RequestStatus.Proposed) {
            revert InvalidRequestStatus(requestId);
        }
        if (request.paramsHash != keccak256(abi.encode(params))) {
            revert ParamsMismatch(requestId);
        }

        request.status = RequestStatus.Executed;
        if (request.comptroller == address(0)) {
            Pool storage pool = _ensurePoolStatus(comptroller, PoolStatus.None);
            pool.deployer = request.project;
            pool.status = PoolStatus.Live;
            pool.tierId = request.tierId;
            pool.lockedStake = request.stakeAmount;
            emit PoolActivated(requestId, comptroller, request.project);
        } else {
            if (request.comptroller != comptroller) {
                revert RequestPoolMismatch(requestId, request.comptroller);
            }
            _ensurePoolStatus(comptroller, PoolStatus.Live);
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

    /*** Shortfall receiver functions ***/

    /// @inheritdoc ISpokePoolManager
    function seizeStake(address comptroller, uint256 amount, address to) external {
        _checkAccessAllowed("seizeStake(address,uint256,address)");

        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }
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
     * @dev Escrows each market's seed from the caller into a request
     * @param request The request's storage
     * @param markets The markets whose seeds are escrowed
     * @custom:error SeedBelowMinimum is thrown when a seed is worth less than `minSeedUsd`
     * @custom:error TransferAmountMismatch is thrown when a seed transfer delivers a different amount than requested
     */
    function _escrowSeeds(Request storage request, MarketParams[] calldata markets) internal {
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            MarketParams calldata market = markets[i];
            if ((market.seed * RESILIENT_ORACLE.getPrice(market.asset)) / EXP_SCALE < minSeedUsd) {
                revert SeedBelowMinimum(market.asset);
            }
            request.seedAssets.push(market.asset);
            request.seedAmounts.push(market.seed);
            _transferIn(IERC20Upgradeable(market.asset), msg.sender, address(this), market.seed);
        }
    }

    /**
     * @dev Pulls an exact amount of an asset, rejecting assets that deliver less
     * @param asset The asset to pull
     * @param from The account the token is pulled from
     * @param to The receiver
     * @param amount The amount to pull
     * @custom:error TransferAmountMismatch is thrown when the receiver gets a different amount
     */
    function _transferIn(IERC20Upgradeable asset, address from, address to, uint256 amount) internal {
        uint256 balanceBefore = asset.balanceOf(to);
        asset.safeTransferFrom(from, to, amount);
        if (asset.balanceOf(to) - balanceBefore != amount) {
            revert TransferAmountMismatch(address(asset));
        }
    }

    /**
     * @dev Returns a request's locked stake and escrowed seeds to its project
     * @param request The request's storage
     */
    function _returnEscrow(Request storage request) internal {
        address project = request.project;
        uint256 stakeAmount = request.stakeAmount;
        if (stakeAmount != 0) {
            XVS_VAULT.unlock(project, stakeAmount);
        }
        _sendSeeds(request, project);
    }

    /**
     * @dev Sends a request's escrowed seeds out of the manager
     * @param request The request's storage
     * @param to The receiver
     */
    function _sendSeeds(Request storage request, address to) internal {
        uint256 seedCount = request.seedAssets.length;
        for (uint256 i; i < seedCount; ++i) {
            IERC20Upgradeable(request.seedAssets[i]).safeTransfer(to, request.seedAmounts[i]);
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
     * @dev Submits actions to GovernorBravo as a Normal proposal
     * @param targets The contract each action calls
     * @param signatures The function signature each action calls
     * @param calldatas The ABI-encoded arguments of each action
     * @param description The proposal's description
     * @return The id of the proposal
     */
    function _propose(
        address[] memory targets,
        string[] memory signatures,
        bytes[] memory calldatas,
        string calldata description
    ) internal returns (uint256) {
        return
            GOVERNOR_BRAVO.propose(
                targets,
                new uint256[](targets.length),
                signatures,
                calldatas,
                description,
                NORMAL_PROPOSAL
            );
    }

    /**
     * @dev Validates a request's markets against a tier: each market as in `_validateMarket`, assets unique and not
     * already in the pool, a loan market in a new pool, and the loan markets' supply caps, together with the pool's,
     * within the tier's liquidity in USD
     * @param comptroller The pool the markets are added to, or zero for a new pool
     * @param tier The tier
     * @param markets The markets
     * @custom:error DuplicateAsset is thrown when two markets share an asset, or the pool already has the asset
     * @custom:error NoLoanMarket is thrown when a new pool has no loan market
     * @custom:error ExceedsTierLimit is thrown when a parameter or the loan liquidity is beyond the tier
     * @custom:error InvalidMarketParams or MissingSpokeSource is thrown as in `_validateMarket`
     */
    function _validateMarkets(address comptroller, Tier storage tier, MarketParams[] calldata markets) internal view {
        uint256 liquidityUsd = comptroller == address(0) ? 0 : _loanLiquidityUsd(comptroller);
        bool hasLoanMarket = comptroller != address(0);
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            MarketParams calldata market = markets[i];
            // A nested loop is fine here: a request has only a few markets
            for (uint256 j; j < i; ++j) {
                if (markets[j].asset == market.asset) {
                    revert DuplicateAsset(market.asset);
                }
            }
            if (
                comptroller != address(0) &&
                PoolRegistryInterface(POOL_REGISTRY).getVTokenForAsset(comptroller, market.asset) != address(0)
            ) {
                revert DuplicateAsset(market.asset);
            }
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
     * @dev Validates one market against a tier: an asset priced by the ResilientOracle, a seed within the supply cap, a
     * seed burn share of at most 1e18, a nonzero initial exchange rate, and either a loan market with a Hub source and
     * no collateral parameters, or a collateral market with no borrow cap and a collateral factor and liquidation
     * threshold within the tier
     * @param tier The tier
     * @param market The market
     * @return liquidityUsd The USD value of a loan market's supply cap, scaled by 1e18; zero for a collateral market
     * @custom:error InvalidMarketParams is thrown when the market's parameters do not fit its kind, its seed or its
     *   seed burn share
     * @custom:error MissingSpokeSource is thrown when a loan asset has no Hub source
     * @custom:error ExceedsTierLimit is thrown when a collateral parameter is beyond the tier
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
    }

    /**
     * @dev Checks a live pool against a tier: every collateral market's collateral factor and liquidation threshold
     * within the tier, the loan markets' supply caps within the tier's liquidity in USD, and no bad debt in any market
     * @param comptroller The pool's comptroller
     * @param tier The tier
     * @custom:error ExceedsTierLimit is thrown when a parameter or the loan liquidity does not fit the tier
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     */
    function _checkPoolFitsTier(address comptroller, Tier storage tier) internal view {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(markets[i]);
            if (!isLoanMarket[vToken]) {
                (bool isListed, uint256 collateralFactor, uint256 liquidationThreshold) = SpokeComptroller(comptroller)
                    .markets(vToken);
                if (isListed) {
                    _checkCollateralParams(tier, collateralFactor, liquidationThreshold);
                }
            }
            if (markets[i].badDebt() != 0) {
                revert BadDebtOutstanding(vToken);
            }
        }
        if (_loanLiquidityUsd(comptroller) > tier.maxLiquidityUsd) {
            revert ExceedsTierLimit();
        }
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
     * @dev Returns the summed USD value of a pool's loan market supply caps. An uncapped (`type(uint256).max`) loan
     * market overflows and reverts, since it cannot fit any tier
     * @param comptroller The pool's comptroller
     * @return liquidityUsd The value, scaled by 1e18
     */
    function _loanLiquidityUsd(address comptroller) internal view returns (uint256 liquidityUsd) {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
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
     * @dev Returns a market's borrows and bad debt in USD, as last accrued; a market without either is not priced
     * @param vToken The market
     * @return The borrows and bad debt, in USD scaled by 1e18
     */
    function _debtUsd(VToken vToken) internal view returns (uint256) {
        uint256 debt = vToken.totalBorrows() + vToken.badDebt();
        if (debt == 0) {
            return 0;
        }
        return (debt * RESILIENT_ORACLE.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
    }

    /**
     * @dev Checks that the proposed markets carry exactly the request's escrowed seeds, in order
     * @param requestId The request
     * @param request The request's storage
     * @param markets The proposed markets
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

    /**
     * @dev Reverts when a request adds more markets than `maxMarketsPerRequest`
     * @param count The markets the request adds
     * @custom:error TooManyMarkets is thrown when `count` exceeds `maxMarketsPerRequest`
     */
    function _checkMarketCount(uint256 count) internal view {
        uint256 maxCount = maxMarketsPerRequest;
        if (count > maxCount) {
            revert TooManyMarkets(count, maxCount);
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
     * @dev Returns a live pool after checking the caller holds its deployer rights
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer or DeployerFrozen is thrown as in `_ensureDeployer`
     * @custom:error InvalidPoolStatus is thrown when the pool is not live
     */
    function _ensureLiveDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = _ensureDeployer(comptroller);
        if (pool.status != PoolStatus.Live) {
            revert InvalidPoolStatus(comptroller);
        }
    }

    /**
     * @dev Returns a pool after checking the caller holds its deployer rights
     * @param comptroller The pool's comptroller
     * @return pool The pool's storage
     * @custom:error NotDeployer is thrown when the caller is not the pool's deployer or its rights have ended
     * @custom:error DeployerFrozen is thrown while the Venus team has frozen the deployer's functions
     */
    function _ensureDeployer(address comptroller) internal view returns (Pool storage pool) {
        pool = pools[comptroller];
        if (
            pool.deployer != msg.sender || (pool.status != PoolStatus.Live && pool.status != PoolStatus.ExitRequested)
        ) {
            revert NotDeployer(comptroller, msg.sender);
        }
        if (pool.deployerFrozen) {
            revert DeployerFrozen(comptroller);
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
            if (state != PROPOSAL_CANCELED && state != PROPOSAL_DEFEATED && state != PROPOSAL_EXPIRED) {
                revert ProposalNotFailed(request.proposalId);
            }
        } else if (request.status != RequestStatus.Pending) {
            revert InvalidRequestStatus(requestId);
        }
    }
}

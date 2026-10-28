// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolPolicyRegistry } from "../interfaces/ISpokePoolPolicyRegistry.sol";
import { IRiskOracle } from "../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/external/IRiskStewardReceiver.sol";
import { SpokePoolGovernanceLib } from "./Libraries/SpokePoolGovernanceLib.sol";
import { SpokePoolValidationLib } from "./Libraries/SpokePoolValidationLib.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer requests a pool of a tier, escrowing a bond; the Venus team
 * builds the request's VIP through the proposal builder, pulling each new market's seed from the deployer, and the
 * VIP's `settleRequest` starts the pool and moves the bond to the bond manager. The deployer tunes the pool's
 * collateral markets through the RiskOracle, within its tier's current terms
 * @dev Needs to be a RiskOracle authorized sender. Two linked libraries keep it under the EIP-170 size limit:
 * `SpokePoolValidationLib` checks requests and a closing pool's debt and writes no state; `SpokePoolGovernanceLib`
 * builds the VIPs, writing only what a build records, and publishes the deployer's risk updates to the RiskOracle.
 * This contract owns every other write: requests, escrow, pools and settings
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolManager is AccessControlledV8, ReentrancyGuardUpgradeable, SpokePoolManagerStorage {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @inheritdoc ISpokePoolManager
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskOracle public immutable RISK_ORACLE;

    /// @inheritdoc ISpokePoolManager
    IRiskStewardReceiver public immutable RISK_STEWARD_RECEIVER;

    /// @inheritdoc ISpokePoolManager
    ISpokePoolPolicyRegistry public immutable POLICY_REGISTRY;

    /**
     * @param resilientOracle The oracle bonds, seeds, caps and debts are priced with
     * @param riskStewardReceiver The receiver that applies deployer updates published to the RiskOracle it reads
     * @param policyRegistry The registry of the policy pools run under
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(
        ResilientOracleInterface resilientOracle,
        IRiskStewardReceiver riskStewardReceiver,
        ISpokePoolPolicyRegistry policyRegistry
    ) {
        ensureNonzeroAddress(address(resilientOracle));
        ensureNonzeroAddress(address(riskStewardReceiver));
        ensureNonzeroAddress(address(policyRegistry));

        RESILIENT_ORACLE = resilientOracle;
        RISK_ORACLE = IRiskOracle(riskStewardReceiver.RISK_ORACLE());
        RISK_STEWARD_RECEIVER = riskStewardReceiver;
        POLICY_REGISTRY = policyRegistry;

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
        uint256 tierId,
        address bondAsset,
        uint256 bondAmount,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external nonReentrant returns (uint256 requestId) {
        if (activePools[msg.sender] != address(0)) {
            revert ActivePoolExists(msg.sender);
        }

        Contracts memory contracts = _contracts();
        SpokePoolValidationLib.validateNewBond(contracts, tierId, bondAsset, bondAmount);

        requestId = ++requestCount;
        Request storage request = _newRequest(requestId, RequestType.Pool, address(0), tierId);
        request.bondAsset = bondAsset;
        request.bondAmount = bondAmount;
        _pushRequestMarkets(request, collateralMarkets, loanMarkets);

        // Checked once stored: the library reads the markets from the request, which is cheaper than encoding them
        SpokePoolValidationLib.validateMarkets(contracts, request);
        IERC20Upgradeable(bondAsset).safeTransferFrom(msg.sender, address(this), bondAmount);

        emit RequestSubmitted(requestId, RequestType.Pool, msg.sender, address(0));
    }

    /// @inheritdoc ISpokePoolManager
    function requestNewMarkets(
        address comptroller,
        CollateralMarketRequestParams[] calldata collateralMarkets,
        LoanMarketRequestParams[] calldata loanMarkets
    ) external returns (uint256 requestId) {
        uint256 tierId = _ensureActiveDeployer(comptroller).tierId;

        Contracts memory contracts = _contracts();
        SpokePoolValidationLib.validateBond(contracts, comptroller, tierId);

        requestId = ++requestCount;
        Request storage request = _newRequest(requestId, RequestType.Markets, comptroller, tierId);
        _pushRequestMarkets(request, collateralMarkets, loanMarkets);
        // Checked once stored: the library reads the markets from the request, which is cheaper than encoding them
        SpokePoolValidationLib.validateMarkets(contracts, request);

        emit RequestSubmitted(requestId, RequestType.Markets, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        uint256 fromTierId = _ensureActiveDeployer(comptroller).tierId;
        if (!POLICY_REGISTRY.isUpgrade(fromTierId, tierId)) {
            revert NotAnUpgrade(fromTierId, tierId);
        }

        SpokePoolValidationLib.validateBond(_contracts(), comptroller, tierId);

        requestId = ++requestCount;
        _newRequest(requestId, RequestType.Tier, comptroller, tierId);

        emit RequestSubmitted(requestId, RequestType.Tier, msg.sender, comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function cancelRequest(uint256 requestId) external nonReentrant {
        Request storage request = requests[requestId];
        _ensureDeployer(request.deployer);
        _ensureRequestStatus(requestId, RequestStatus.Pending);

        request.status = RequestStatus.Canceled;
        _refund(request, requestSeeds[requestId]);

        emit RequestCanceled(requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function setOracleFeeds(uint256 requestId, address asset, OracleFeed[3] calldata feeds) external {
        _checkAccessAllowed("setOracleFeeds(uint256,address,OracleFeed[3])");
        Request storage request = _ensureRequestStatus(requestId, RequestStatus.Pending);

        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            CollateralMarketRequestParams storage market = request.collateralMarkets[i];
            if (market.asset == asset) {
                for (uint256 j; j < 3; ++j) {
                    market.feeds[j] = feeds[j];
                }
                SpokePoolValidationLib.checkSupplyCapUsd(_contracts(), request.tierId, market);

                emit OracleFeedsUpdated(requestId, asset, feeds);
                return;
            }
        }

        revert InvalidMarketParams(asset);
    }

    /// @inheritdoc ISpokePoolManager
    function buildRequestProposal(uint256 requestId, string calldata description) external nonReentrant {
        _checkAccessAllowed("buildRequestProposal(uint256,string)");
        Request storage request = _ensureRequestStatus(requestId, RequestStatus.Pending);

        RequestType requestType = request.requestType;
        if (requestType != RequestType.Pool) {
            _ensurePoolStatus(request.comptroller, PoolStatus.Live);
        }
        if (requestType != RequestType.Tier) {
            Contracts memory contracts = _contracts();
            SpokePoolValidationLib.validateMarkets(contracts, request);
            _pullSeeds(contracts, request, requestSeeds[requestId]);
        }

        SpokePoolGovernanceLib.buildRequestProposal(proposalBuilder, request, requestProposals, requestId, description);
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256)");
        Request storage request = _ensureRequestStatus(requestId, RequestStatus.Built);

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
        _releaseSeeds(request, requestSeeds[requestId], msg.sender);

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
        _refund(request, requestSeeds[requestId]);

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
        SpokePoolGovernanceLib.publishCollateralFactorUpdate(
            _contracts(),
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
        SpokePoolGovernanceLib.publishSupplyCapUpdate(_contracts(), tierId, comptroller, vToken, supplyCap);
    }

    /// @inheritdoc ISpokePoolManager
    function pauseCollateralSupply(address comptroller, address vToken) external {
        _ensureActiveDeployer(comptroller);
        SpokePoolGovernanceLib.publishSupplyPause(_contracts(), comptroller, vToken);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Bond functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function withdrawBondExcess(address comptroller) external nonReentrant {
        Pool storage pool = pools[comptroller];
        _ensureDeployer(pool.deployer);

        uint256 floor = SpokePoolValidationLib.requiredBondAmount(_contracts(), pool.tierId, comptroller);
        bondManager.withdrawExcess(comptroller, floor);
    }

    /// @inheritdoc ISpokePoolManager
    function topUpBond(address comptroller, uint256 amount) external nonReentrant {
        _ensureDeployer(pools[comptroller].deployer);
        IERC20Upgradeable bondAsset = IBondAccount(bondManager.bondAccounts(comptroller)).asset();

        bondAsset.safeTransferFrom(msg.sender, address(this), amount);
        bondAsset.forceApprove(address(bondManager), amount);
        bondManager.topUp(comptroller, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function seizeBond(address comptroller, uint256 amount, address receiver) external nonReentrant {
        _checkAccessAllowed("seizeBond(address,uint256,address)");

        bondManager.seize(comptroller, amount, receiver);
    }

    /// @inheritdoc ISpokePoolManager
    function releaseBond(address comptroller) external nonReentrant {
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
        _ensureNoOpenRequest(msg.sender);

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

        SpokePoolGovernanceLib.buildExitProposal(
            proposalBuilder,
            pools[comptroller],
            exitProposals,
            comptroller,
            liquidationThresholds,
            description
        );
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
    function buildForceCloseProposal(address comptroller, string calldata description) external {
        _checkAccessAllowed("buildForceCloseProposal(address,string)");

        SpokePoolGovernanceLib.buildForceCloseProposal(
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
        SpokePoolValidationLib.ensureResidualDebtBelowMax(RESILIENT_ORACLE, comptroller, maxResidualPoolDebtUsd);

        pool.status = PoolStatus.Closed;
        delete activePools[pool.deployer];

        emit PoolClosed(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function rejectExit(address comptroller) external {
        _checkAccessAllowed("rejectExit(address)");
        Pool storage pool = _ensureExitingPool(comptroller);

        pool.status = PoolStatus.Live;

        emit ExitRejected(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function handoverPoolToGovernance(address comptroller) external {
        _checkAccessAllowed("handoverPoolToGovernance(address)");
        Pool storage pool = _ensureExitingPool(comptroller);

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
    function sweepToken(address token, address to, uint256 amount) external nonReentrant {
        _checkAccessAllowed("sweepToken(address,address,uint256)");
        ensureNonzeroAddress(to);
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
    function getExcessBondAmount(address comptroller) external view returns (uint256) {
        uint256 bond = bondManager.getSeizableAmount(comptroller);
        uint256 floor = SpokePoolValidationLib.requiredBondAmount(_contracts(), pools[comptroller].tierId, comptroller);
        return bond > floor ? bond - floor : 0;
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
        _ensureNoOpenRequest(msg.sender);
        latestRequestIds[msg.sender] = requestId;
        request = requests[requestId];
        request.requestType = requestType;
        request.status = RequestStatus.Pending;
        request.deployer = msg.sender;
        request.comptroller = comptroller;
        request.tierId = tierId;
    }

    /// @dev Pushes a new request's markets one by one, as an array of structs cannot be copied to storage at once
    function _pushRequestMarkets(
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

        // Moves the escrowed bond to the bond manager, in the deployer's name
        address bondAsset = request.bondAsset;
        uint256 bondAmount = request.bondAmount;
        IERC20Upgradeable(bondAsset).forceApprove(address(bondManager), bondAmount);
        bondManager.createBond(comptroller, deployer, bondAsset, bondAmount);

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

    /// @dev Pulls each new market's seed, as the library prices it, from the request's deployer into escrow
    function _pullSeeds(
        Contracts memory contracts,
        Request storage request,
        mapping(address => uint256) storage seeds
    ) private {
        (address[] memory assets, uint256[] memory amounts) = SpokePoolValidationLib.computeSeeds(contracts, request);
        address deployer = request.deployer;
        uint256 count = assets.length;
        for (uint256 i; i < count; ++i) {
            _transferIn(assets[i], deployer, amounts[i]);
            seeds[assets[i]] = amounts[i];
        }
    }

    /// @dev Refunds a canceled or rejected request's escrowed bond, for a pool request, and seeds to its deployer
    function _refund(Request storage request, mapping(address => uint256) storage seeds) private {
        address deployer = request.deployer;
        if (request.requestType == RequestType.Pool) {
            IERC20Upgradeable(request.bondAsset).safeTransfer(deployer, request.bondAmount);
        }
        _releaseSeeds(request, seeds, deployer);
    }

    /// @dev Sends a request's escrowed seeds to `to`
    function _releaseSeeds(Request storage request, mapping(address => uint256) storage seeds, address to) private {
        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            _releaseSeed(seeds, request.collateralMarkets[i].asset, to);
        }

        uint256 loanCount = request.loanMarkets.length;
        for (uint256 i; i < loanCount; ++i) {
            _releaseSeed(seeds, request.loanMarkets[i].asset, to);
        }
    }

    /// @dev Sends the seed escrowed in `asset` to `to`; a request not built yet has none
    function _releaseSeed(mapping(address => uint256) storage seeds, address asset, address to) private {
        uint256 seed = seeds[asset];
        if (seed != 0) {
            IERC20Upgradeable(asset).safeTransfer(to, seed);
        }
    }

    /// @dev Pulls tokens from `from`, reverting unless exactly `amount` arrives
    function _transferIn(address token, address from, uint256 amount) private {
        IERC20Upgradeable asset = IERC20Upgradeable(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(from, address(this), amount);
        if (asset.balanceOf(address(this)) - balanceBefore != amount) {
            revert TransferAmountMismatch(token);
        }
    }

    /// @dev Returns whether a request is open: pending or built, so it can be built, settled, canceled or rejected
    function _isRequestOpen(Request storage request) private view returns (bool) {
        RequestStatus status = request.status;
        return status == RequestStatus.Pending || status == RequestStatus.Built;
    }

    /// @dev Checks a deployer's latest request is not still open
    function _ensureNoOpenRequest(address deployer) private view {
        uint256 latestRequestId = latestRequestIds[deployer];
        if (_isRequestOpen(requests[latestRequestId])) {
            revert OpenRequestExists(latestRequestId);
        }
    }

    /// @dev Returns a request after checking its status
    function _ensureRequestStatus(
        uint256 requestId,
        RequestStatus status
    ) private view returns (Request storage request) {
        request = requests[requestId];
        if (request.status != status) {
            revert InvalidRequestStatus(requestId);
        }
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

    /// @dev Returns a pool after checking its exit is requested or proposed, so it can be rejected or handed over
    function _ensureExitingPool(address comptroller) private view returns (Pool storage pool) {
        pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }
    }

    /// @dev Returns the manager's contracts the libraries read
    function _contracts() private view returns (Contracts memory) {
        return
            Contracts(
                RESILIENT_ORACLE,
                RISK_ORACLE,
                RISK_STEWARD_RECEIVER,
                POLICY_REGISTRY,
                bondManager,
                proposalBuilder
            );
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ensureNonzeroValue } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";
import { IRiskOracle } from "../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/external/IRiskStewardReceiver.sol";
import { SpokePoolManagerLib } from "./SpokePoolManagerLib.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolManager
 * @author Venus
 * @notice Entry point of open spoke pools. A deployer requests a pool of a tier, escrowing a bond and its markets'
 * seeds; the Venus team builds the request's VIP through the proposal builder, and the VIP's `settleRequest` starts the
 * pool and moves the bond to the bond manager. The deployer tunes the pool's collateral markets through the
 * RiskOracle, within its tier's current terms
 * @dev Needs to be a RiskOracle authorized sender. The request and risk-control functions run in `SpokePoolManagerLib`;
 * this contract keeps their access checks, reentrancy guard and id counters
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
    ITierRegistry public immutable TIER_REGISTRY;

    /**
     * @param resilientOracle The oracle bonds, seeds, caps and debts are priced with
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
    // Request functions, run in SpokePoolManagerLib
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function requestPool(
        DeployerPoolParams calldata pool,
        DeployerMarkets calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        requestId = ++requestCount;
        SpokePoolManagerLib.requestPool(
            _contracts(),
            requests,
            latestRequestIds,
            activePools,
            escrowedAmounts,
            isLoanMarket,
            requestId,
            pool,
            markets
        );
    }

    /// @inheritdoc ISpokePoolManager
    function requestNewMarkets(
        address comptroller,
        DeployerMarkets calldata markets
    ) external nonReentrant returns (uint256 requestId) {
        requestId = ++requestCount;
        SpokePoolManagerLib.requestNewMarkets(
            _contracts(),
            pools,
            isLoanMarket,
            requests,
            latestRequestIds,
            escrowedAmounts,
            requestId,
            comptroller,
            markets
        );
    }

    /// @inheritdoc ISpokePoolManager
    function requestTierUpgrade(address comptroller, uint256 tierId) external returns (uint256 requestId) {
        requestId = ++requestCount;
        SpokePoolManagerLib.requestTierUpgrade(
            _contracts(),
            pools,
            requests,
            latestRequestIds,
            requestId,
            comptroller,
            tierId
        );
    }

    /// @inheritdoc ISpokePoolManager
    function cancelRequest(uint256 requestId) external nonReentrant {
        SpokePoolManagerLib.cancelRequest(requests, escrowedAmounts, requestId);
    }

    /// @inheritdoc ISpokePoolManager
    function setOracleFeed(uint256 requestId, address asset, address feed) external {
        _checkAccessAllowed("setOracleFeed(uint256,address,address)");

        SpokePoolManagerLib.setOracleFeed(_contracts(), requests, requestId, asset, feed);
    }

    /// @inheritdoc ISpokePoolManager
    function buildRequestProposal(uint256 requestId, string calldata description) external nonReentrant {
        _checkAccessAllowed("buildRequestProposal(uint256,string)");

        SpokePoolManagerLib.buildRequestProposal(
            _contracts(),
            pools,
            isLoanMarket,
            requests,
            escrowedAmounts,
            requestProposals,
            requestId,
            ++buildCount,
            description
        );
    }

    /// @inheritdoc ISpokePoolManager
    function settleRequest(uint256 requestId, uint256 buildId) external nonReentrant {
        _checkAccessAllowed("settleRequest(uint256,uint256)");

        SpokePoolManagerLib.settleRequest(
            _contracts(),
            pools,
            requests,
            activePools,
            escrowedAmounts,
            requestId,
            buildId
        );
    }

    /// @inheritdoc ISpokePoolManager
    function rejectRequest(uint256 requestId) external nonReentrant {
        _checkAccessAllowed("rejectRequest(uint256)");

        SpokePoolManagerLib.rejectRequest(requests, escrowedAmounts, requestId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Risk control functions, run in SpokePoolManagerLib
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function setCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external {
        SpokePoolManagerLib.setCollateralFactor(
            _contracts(),
            pools,
            isLoanMarket,
            comptroller,
            vToken,
            collateralFactor,
            liquidationThreshold
        );
    }

    /// @inheritdoc ISpokePoolManager
    function setCollateralSupplyCap(address comptroller, address vToken, uint256 supplyCap) external {
        SpokePoolManagerLib.setCollateralSupplyCap(_contracts(), pools, isLoanMarket, comptroller, vToken, supplyCap);
    }

    /// @inheritdoc ISpokePoolManager
    function pauseCollateralSupply(address comptroller, address vToken) external {
        SpokePoolManagerLib.pauseCollateralSupply(_contracts(), pools, isLoanMarket, comptroller, vToken);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Bond functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function claimBondYield(address comptroller) external nonReentrant {
        SpokePoolManagerLib.ensureDeployer(pools[comptroller].deployer);

        bondManager.claimYield(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function topUpBond(address comptroller, uint256 amount) external nonReentrant {
        SpokePoolManagerLib.ensureDeployer(pools[comptroller].deployer);
        address bondAsset = address(IBondAccount(bondManager.bondAccounts(comptroller)).asset());

        SpokePoolManagerLib.transferIn(bondAsset, msg.sender, amount);
        IERC20Upgradeable(bondAsset).forceApprove(address(bondManager), amount);
        bondManager.topUp(comptroller, amount);
    }

    /// @inheritdoc ISpokePoolManager
    function seizeBond(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow) {
        _checkAccessAllowed("seizeBond(address,uint256,address)");
        ensureNonzeroAddress(receiver);

        paidNow = bondManager.seize(comptroller, amount, receiver);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Exit functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolManager
    function requestExit(address comptroller) external {
        Pool storage pool = SpokePoolManagerLib.ensureActiveDeployer(pools, comptroller);
        // A markets or tier VIP settles only on a live pool
        SpokePoolManagerLib.ensureNoOpenRequest(requests, latestRequestIds);

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
        Pool storage pool = pools[comptroller];
        PoolStatus status = pool.status;
        if (status != PoolStatus.Live && status != PoolStatus.ExitRequested && status != PoolStatus.ExitProposed) {
            revert InvalidPoolStatus(comptroller);
        }

        uint256 buildId = ++buildCount;
        pool.status = PoolStatus.ExitProposed;
        pool.exitBuildId = buildId;
        exitProposals[comptroller] = proposalBuilder.buildExitProposal(
            comptroller,
            buildId,
            liquidationThresholds,
            description
        );

        emit ExitBuilt(comptroller, buildId);
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
        Pool storage pool = SpokePoolManagerLib.ensurePoolStatus(pools, comptroller, PoolStatus.WindingDown);
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert WindDownPeriodNotElapsed();
        }

        exitProposals[comptroller] = proposalBuilder.buildForceCloseProposal(comptroller, description);

        emit ForceCloseBuilt(comptroller);
    }

    /// @inheritdoc ISpokePoolManager
    function closePool(address comptroller) external {
        _checkAccessAllowed("closePool(address)");
        Pool storage pool = SpokePoolManagerLib.ensurePoolStatus(pools, comptroller, PoolStatus.WindingDown);
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = vTokens[i];
            uint256 debt = vToken.totalBorrowsCurrent() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * RESILIENT_ORACLE.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }
        if (debtUsd > maxResidualPoolDebtUsd) {
            revert ResidualDebtExceeded(debtUsd);
        }

        pool.status = PoolStatus.Closed;
        delete activePools[pool.deployer];
        bondManager.release(comptroller);

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
    function setPoolParams(PoolParams calldata params) external {
        _checkAccessAllowed("setPoolParams(PoolParams)");
        SpokePoolManagerLib.checkPoolParams(params);

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
            params.maxStalePeriod == 0
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

    /// @dev Pauses or unpauses the controls of an existing pool's deployer
    function _setDeployerPaused(address comptroller, bool paused) internal {
        Pool storage pool = pools[comptroller];
        if (pool.status == PoolStatus.None) {
            revert InvalidPoolStatus(comptroller);
        }

        pool.deployerPaused = paused;

        emit DeployerPausedUpdated(comptroller, paused);
    }

    /// @dev Returns the manager's contracts the library calls
    function _contracts() internal view returns (SpokePoolManagerLib.Contracts memory) {
        return
            SpokePoolManagerLib.Contracts(
                RESILIENT_ORACLE,
                RISK_ORACLE,
                RISK_STEWARD_RECEIVER,
                TIER_REGISTRY,
                bondManager,
                proposalBuilder
            );
    }
}

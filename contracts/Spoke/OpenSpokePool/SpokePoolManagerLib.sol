// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { Action } from "../../ComptrollerInterface.sol";
import { PoolRegistry } from "../../Pool/PoolRegistry.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE } from "../../lib/constants.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IBondAccount } from "../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";
import { IRiskOracle } from "../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/external/IRiskStewardReceiver.sol";

/**
 * @title SpokePoolManagerLib
 * @author Venus
 * @notice The request and risk-control functions of `SpokePoolManager`, linked to keep the manager under the EIP-170
 * size limit. The manager keeps their access checks, reentrancy guard and id counters, and runs the rest here
 * @dev The manager calls it through DELEGATECALL, so the storage, `msg.sender`, `address(this)` and events are the
 * manager's. It holds no state. The events and errors of each function are documented on `ISpokePoolManager`
 */
library SpokePoolManagerLib {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The manager's contracts the functions call
    struct Contracts {
        ResilientOracleInterface resilientOracle;
        IRiskOracle riskOracle;
        IRiskStewardReceiver riskStewardReceiver;
        ITierRegistry tierRegistry;
        ISpokeBondManager bondManager;
        ISpokePoolProposalBuilder proposalBuilder;
    }

    /// @notice A pool request's parameters set by the deployer, besides its markets
    struct DeployerPoolParams {
        uint256 tierId;
        string poolName;
        address bondAsset;
        uint256 bondAmount;
    }

    /// @dev Lowest USD value of a market's seed, scaled by 1e18
    uint256 internal constant MIN_SEED_USD = 10e18;

    /// @dev Bounds of a new pool's close factor and liquidation incentive, as the comptroller accepts them
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18;
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18;
    uint256 internal constant MIN_LIQUIDATION_INCENTIVE_MANTISSA = 1.05e18;

    /// @dev The RiskOracle update types the deployer publishes; each one selects the Risk Steward that applies it
    string internal constant COLLATERAL_FACTORS_UPDATE = "collateralFactors";
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";
    string internal constant PAUSE_ACTIONS_UPDATE = "pauseActions";

    // ──────────────────────────────────────────────────────────────────────
    // Request functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Opens a pool request from the caller and escrows its bond and seeds
     * @param contracts The manager's contracts
     * @param poolDefaults The manager's parameters for new pools
     * @param requests The manager's requests by id
     * @param latestRequestIds The manager's latest request id by deployer
     * @param activePools The manager's active pool by deployer
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param requestId The new request's id
     * @param pool The requested tier, the pool's name and the bond
     * @param markets The pool's markets
     * @custom:event See `ISpokePoolManager.requestPool`
     * @custom:error See `ISpokePoolManager.requestPool`
     */
    function requestPool(
        Contracts memory contracts,
        ISpokePoolManager.PoolParams storage poolDefaults,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage latestRequestIds,
        mapping(address => address) storage activePools,
        mapping(address => uint256) storage escrowedAmounts,
        mapping(address => bool) storage isLoanMarket,
        uint256 requestId,
        DeployerPoolParams memory pool,
        ISpokePoolManager.DeployerMarketParams[] calldata markets
    ) external {
        if (activePools[msg.sender] != address(0)) {
            revert ISpokePoolManager.ActivePoolExists(msg.sender);
        }
        ITierRegistry.PoolLimits memory limits = _validateTierAndBond(
            contracts,
            pool.tierId,
            pool.bondAsset,
            pool.bondAmount
        );
        _validateMarkets(contracts, isLoanMarket, address(0), pool.tierId, limits, markets);

        ISpokePoolManager.Request storage request = _newRequest(
            requests,
            latestRequestIds,
            requestId,
            ISpokePoolManager.RequestType.Pool,
            address(0),
            pool.tierId
        );
        request.poolName = pool.poolName;
        request.params = poolDefaults;
        request.bondAsset = pool.bondAsset;
        request.bondAmount = pool.bondAmount;
        _storeMarkets(request, markets);
        _pullSeeds(request, escrowedAmounts);
        transferIn(pool.bondAsset, pool.bondAmount);
        escrowedAmounts[pool.bondAsset] += pool.bondAmount;

        emit ISpokePoolManager.RequestSubmitted(requestId, ISpokePoolManager.RequestType.Pool, msg.sender, address(0));
    }

    /**
     * @notice Opens a markets request for the caller's pool and escrows its seeds
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param requests The manager's requests by id
     * @param latestRequestIds The manager's latest request id by deployer
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The new request's id
     * @param comptroller The pool's comptroller
     * @param markets The new markets
     * @custom:event See `ISpokePoolManager.requestNewMarkets`
     * @custom:error See `ISpokePoolManager.requestNewMarkets`
     */
    function requestNewMarkets(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => bool) storage isLoanMarket,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage latestRequestIds,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId,
        address comptroller,
        ISpokePoolManager.DeployerMarketParams[] calldata markets
    ) external {
        uint256 tierId = ensureActiveDeployer(pools, comptroller).tierId;
        (, , ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        _validateMarkets(contracts, isLoanMarket, comptroller, tierId, limits, markets);

        ISpokePoolManager.Request storage request = _newRequest(
            requests,
            latestRequestIds,
            requestId,
            ISpokePoolManager.RequestType.Markets,
            comptroller,
            tierId
        );
        _storeMarkets(request, markets);
        _pullSeeds(request, escrowedAmounts);

        emit ISpokePoolManager.RequestSubmitted(
            requestId,
            ISpokePoolManager.RequestType.Markets,
            msg.sender,
            comptroller
        );
    }

    /**
     * @notice Opens a tier request for the caller's pool, after checking the tier is an upgrade and the bond's
     * principal pays for it. The bond is priced here only
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param requests The manager's requests by id
     * @param latestRequestIds The manager's latest request id by deployer
     * @param requestId The new request's id
     * @param comptroller The pool's comptroller
     * @param tierId The target tier
     * @custom:event See `ISpokePoolManager.requestTierUpgrade`
     * @custom:error See `ISpokePoolManager.requestTierUpgrade`
     */
    function requestTierUpgrade(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage latestRequestIds,
        uint256 requestId,
        address comptroller,
        uint256 tierId
    ) external {
        uint256 fromTierId = ensureActiveDeployer(pools, comptroller).tierId;
        if (!contracts.tierRegistry.isUpgrade(fromTierId, tierId)) {
            revert ISpokePoolManager.NotAnUpgrade(fromTierId, tierId);
        }
        (, uint256 minBondUsd, ) = contracts.tierRegistry.getTierTerms(tierId);
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));
        address bondAsset = address(bondAccount.asset());
        (, , , uint256 factor) = contracts.bondManager.assetConfigs(bondAsset);
        _checkBondAmount(contracts, bondAsset, bondAccount.principal(), (minBondUsd * factor) / EXP_SCALE);

        _newRequest(requests, latestRequestIds, requestId, ISpokePoolManager.RequestType.Tier, comptroller, tierId);

        emit ISpokePoolManager.RequestSubmitted(requestId, ISpokePoolManager.RequestType.Tier, msg.sender, comptroller);
    }

    /**
     * @notice Approves the caller's request as it stands, pulling its seeds again when an edit refunded them
     * @param requests The manager's requests by id
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The request's id
     * @custom:event See `ISpokePoolManager.approveRequest`
     * @custom:error See `ISpokePoolManager.approveRequest`
     */
    function approveRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId
    ) external {
        ISpokePoolManager.Request storage request = _ensureEditableRequest(requests, requestId);
        ensureDeployer(request.deployer);

        if (!request.approved) {
            _pullSeeds(request, escrowedAmounts);
        }
        request.approved = true;

        emit ISpokePoolManager.RequestApproved(requestId);
    }

    /**
     * @notice Cancels the caller's pending request and refunds its bond and seeds
     * @param requests The manager's requests by id
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The request's id
     * @custom:event See `ISpokePoolManager.cancelRequest`
     * @custom:error See `ISpokePoolManager.cancelRequest`
     */
    function cancelRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId
    ) external {
        ISpokePoolManager.Request storage request = requests[requestId];
        ensureDeployer(request.deployer);
        if (request.status != ISpokePoolManager.RequestStatus.Pending) {
            revert ISpokePoolManager.InvalidRequestStatus(requestId);
        }

        _closeRequest(request, escrowedAmounts, ISpokePoolManager.RequestStatus.Canceled);

        emit ISpokePoolManager.RequestCanceled(requestId);
    }

    /**
     * @notice Replaces a pool or markets request's markets, and a pool request's parameters, and clears its approval
     * @param contracts The manager's contracts
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param requests The manager's requests by id
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The request's id
     * @param params A pool request's new parameters
     * @param markets The request's new markets
     * @custom:event See `ISpokePoolManager.editRequest`
     * @custom:error See `ISpokePoolManager.editRequest`
     */
    function editRequest(
        Contracts memory contracts,
        mapping(address => bool) storage isLoanMarket,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId,
        ISpokePoolManager.PoolParams calldata params,
        ISpokePoolManager.DeployerMarketParams[] calldata markets
    ) external {
        ISpokePoolManager.Request storage request = _ensureEditableRequest(requests, requestId);
        if (request.requestType == ISpokePoolManager.RequestType.Tier) {
            revert ISpokePoolManager.InvalidRequestType(requestId);
        }
        (, , ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(request.tierId);
        _validateMarkets(contracts, isLoanMarket, request.comptroller, request.tierId, limits, markets);
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            checkPoolParams(params);
            request.params = params;
        }

        // Refunded here and pulled again when the deployer approves the edited request
        if (request.approved) {
            _releaseSeeds(request, escrowedAmounts, request.deployer);
        }
        _storeMarkets(request, markets);
        request.approved = false;
        request.buildId = 0;
        request.status = ISpokePoolManager.RequestStatus.Pending;

        emit ISpokePoolManager.RequestEdited(requestId);
    }

    /**
     * @notice Checks an approved request's markets again, with prices, then builds its VIP through the proposal
     * builder and records the build: the pool's comptroller and which of the new markets are loan markets
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param requests The manager's requests by id
     * @param requestProposals The manager's VIP payloads by request id
     * @param requestId The request's id
     * @param buildId The new build's id
     * @param description The VIP's description
     * @custom:event See `ISpokePoolManager.buildRequestProposal`
     * @custom:error See `ISpokePoolManager.buildRequestProposal`
     */
    function buildRequestProposal(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => bool) storage isLoanMarket,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(uint256 => bytes) storage requestProposals,
        uint256 requestId,
        uint256 buildId,
        string calldata description
    ) external {
        ISpokePoolManager.Request storage request = _ensureEditableRequest(requests, requestId);
        if (!request.approved) {
            revert ISpokePoolManager.RequestNotApproved(requestId);
        }
        ISpokePoolManager.RequestType requestType = request.requestType;
        if (requestType != ISpokePoolManager.RequestType.Pool) {
            ensurePoolStatus(pools, request.comptroller, ISpokePoolManager.PoolStatus.Live);
        }
        if (requestType != ISpokePoolManager.RequestType.Tier) {
            ISpokePoolManager.DeployerMarketParams[] memory markets = request.markets;
            (, , ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(request.tierId);
            _validateMarkets(contracts, isLoanMarket, request.comptroller, request.tierId, limits, markets);
            _validateMarketPricesAndSeeds(contracts, limits, markets);
        }

        (address comptroller, address[] memory vTokens, bytes memory proposal) = contracts
            .proposalBuilder
            .buildRequestProposal(requestId, buildId, description);
        request.comptroller = comptroller;
        request.status = ISpokePoolManager.RequestStatus.Built;
        request.buildId = buildId;
        requestProposals[requestId] = proposal;
        // Recorded at build; a superseded build's markets are never listed, so their records are never read
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (request.markets[i].isLoanMarket) {
                isLoanMarket[vTokens[i]] = true;
            }
        }

        emit ISpokePoolManager.RequestBuilt(requestId, buildId, vTokens);
    }

    /**
     * @notice Settles a request from its VIP: starts a pool request's pool and moves its bond to the bond manager, or
     * moves a tier request's pool to its tier, then sends the seeds to the caller, which lists the markets with them
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param requests The manager's requests by id
     * @param activePools The manager's active pool by deployer
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The request's id
     * @param buildId The build the VIP carries
     * @custom:event See `ISpokePoolManager.settleRequest`
     * @custom:error See `ISpokePoolManager.settleRequest`
     */
    function settleRequest(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => address) storage activePools,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId,
        uint256 buildId
    ) external {
        ISpokePoolManager.Request storage request = requests[requestId];
        if (request.status != ISpokePoolManager.RequestStatus.Built || buildId != request.buildId) {
            revert ISpokePoolManager.InvalidBuild(buildId);
        }
        address comptroller = request.comptroller;
        ISpokePoolManager.RequestType requestType = request.requestType;
        if (requestType != ISpokePoolManager.RequestType.Pool) {
            ensurePoolStatus(pools, comptroller, ISpokePoolManager.PoolStatus.Live);
        }

        request.status = ISpokePoolManager.RequestStatus.Settled;
        if (requestType == ISpokePoolManager.RequestType.Pool) {
            _activatePool(contracts, pools, activePools, escrowedAmounts, request, requestId);
        } else if (requestType == ISpokePoolManager.RequestType.Tier) {
            ISpokePoolManager.Pool storage pool = pools[comptroller];
            emit ISpokePoolManager.PoolTierUpgraded(comptroller, pool.tierId, request.tierId);
            pool.tierId = request.tierId;
        }
        // Sends the seeds to the caller, the Normal Timelock, which lists the markets with them in the rest of the VIP.
        // A no-op for a tier request, which has no markets
        _releaseSeeds(request, escrowedAmounts, msg.sender);

        emit ISpokePoolManager.RequestSettled(requestId, comptroller);
    }

    /**
     * @notice Rejects a pending or built request and refunds its bond and seeds
     * @param requests The manager's requests by id
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param requestId The request's id
     * @custom:event See `ISpokePoolManager.rejectRequest`
     * @custom:error See `ISpokePoolManager.rejectRequest`
     */
    function rejectRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage escrowedAmounts,
        uint256 requestId
    ) external {
        ISpokePoolManager.Request storage request = _ensureEditableRequest(requests, requestId);

        _closeRequest(request, escrowedAmounts, ISpokePoolManager.RequestStatus.Rejected);

        emit ISpokePoolManager.RequestRejected(requestId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Risk control functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks the caller's new collateral factor and liquidation threshold for a collateral market against the
     * market, the pool's tier and its bond's coverage, then publishes them to the RiskOracle
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:error See `ISpokePoolManager.setCollateralFactor`
     */
    function setCollateralFactor(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => bool) storage isLoanMarket,
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external {
        uint256 tierId = ensureActiveDeployer(pools, comptroller).tierId;
        (bool isListed, uint256 marketCollateralFactor, uint256 marketLiquidationThreshold) = SpokeComptroller(
            comptroller
        ).markets(vToken);
        _ensureCollateralMarket(isLoanMarket, vToken, isListed);
        _ensureNoPendingUpdate(contracts, COLLATERAL_FACTORS_UPDATE, vToken);
        if (collateralFactor > liquidationThreshold || liquidationThreshold < marketLiquidationThreshold) {
            revert ISpokePoolManager.InvalidCollateralFactors(vToken);
        }
        if (collateralFactor == marketCollateralFactor && liquidationThreshold == marketLiquidationThreshold) {
            revert ISpokePoolManager.RedundantUpdate(vToken);
        }
        (, uint256 minBondUsd, ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        if (collateralFactor > limits.maxCollateralFactor || liquidationThreshold > limits.maxLiquidationThreshold) {
            revert ISpokePoolManager.ExceedsTierLimit(vToken);
        }
        _checkBondCoverage(contracts, comptroller, minBondUsd, limits.minCoverageRatio);

        _publishUpdate(
            contracts,
            COLLATERAL_FACTORS_UPDATE,
            vToken,
            abi.encode(collateralFactor, liquidationThreshold)
        );
    }

    /**
     * @notice Checks the caller's new supply cap for a collateral market against the market, the pool's tier and its
     * bond's coverage, then publishes it to the RiskOracle
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param supplyCap The new supply cap, in the market's underlying units
     * @custom:error See `ISpokePoolManager.setCollateralSupplyCap`
     */
    function setCollateralSupplyCap(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => bool) storage isLoanMarket,
        address comptroller,
        address vToken,
        uint256 supplyCap
    ) external {
        uint256 tierId = ensureActiveDeployer(pools, comptroller).tierId;
        _ensureCollateralMarket(isLoanMarket, vToken, SpokeComptroller(comptroller).isMarketListed(VToken(vToken)));
        _ensureNoPendingUpdate(contracts, SUPPLY_CAP_UPDATE, vToken);
        if (supplyCap == SpokeComptroller(comptroller).supplyCaps(vToken)) {
            revert ISpokePoolManager.RedundantUpdate(vToken);
        }
        (, uint256 minBondUsd, ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        uint256 supplyCapUsd = (supplyCap * contracts.resilientOracle.getUnderlyingPrice(vToken)) / EXP_SCALE;
        if (supplyCapUsd > limits.maxCollateralSupplyCapUsd) {
            revert ISpokePoolManager.ExceedsTierLimit(vToken);
        }
        _checkBondCoverage(contracts, comptroller, minBondUsd, limits.minCoverageRatio);

        _publishUpdate(contracts, SUPPLY_CAP_UPDATE, vToken, abi.encode(supplyCap));
    }

    /**
     * @notice Publishes a MINT pause of the caller's collateral market to the RiskOracle
     * @param contracts The manager's contracts
     * @param pools The manager's pools by comptroller
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @custom:error See `ISpokePoolManager.pauseCollateralMint`
     */
    function pauseCollateralMint(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => bool) storage isLoanMarket,
        address comptroller,
        address vToken
    ) external {
        ensureActiveDeployer(pools, comptroller);
        _ensureCollateralMarket(isLoanMarket, vToken, SpokeComptroller(comptroller).isMarketListed(VToken(vToken)));
        uint8[] memory actions = new uint8[](1);
        actions[0] = uint8(Action.MINT);

        _publishUpdate(contracts, PAUSE_ACTIONS_UPDATE, vToken, abi.encode(actions));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions, also used by the manager
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Pulls tokens from the caller, reverting unless exactly `amount` arrives
    function transferIn(address token, uint256 amount) internal {
        IERC20Upgradeable asset = IERC20Upgradeable(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - balanceBefore != amount) {
            revert ISpokePoolManager.TransferAmountMismatch(token);
        }
    }

    /// @dev Checks the caller is `deployer`
    function ensureDeployer(address deployer) internal view {
        if (msg.sender != deployer) {
            revert ISpokePoolManager.NotDeployer(msg.sender);
        }
    }

    /// @dev Returns a live pool after checking the caller is its deployer and is not paused
    function ensureActiveDeployer(
        mapping(address => ISpokePoolManager.Pool) storage pools,
        address comptroller
    ) internal view returns (ISpokePoolManager.Pool storage pool) {
        pool = pools[comptroller];
        ensureDeployer(pool.deployer);
        if (pool.status != ISpokePoolManager.PoolStatus.Live) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }
        if (pool.deployerPaused) {
            revert ISpokePoolManager.DeployerPaused(comptroller);
        }
    }

    /// @dev Returns a pool after checking its status
    function ensurePoolStatus(
        mapping(address => ISpokePoolManager.Pool) storage pools,
        address comptroller,
        ISpokePoolManager.PoolStatus status
    ) internal view returns (ISpokePoolManager.Pool storage pool) {
        pool = pools[comptroller];
        if (pool.status != status) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }
    }

    /// @dev Reverts while the caller's latest request is pending or built
    function ensureNoOpenRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage latestRequestIds
    ) internal view {
        uint256 latestRequestId = latestRequestIds[msg.sender];
        ISpokePoolManager.RequestStatus status = requests[latestRequestId].status;
        if (status == ISpokePoolManager.RequestStatus.Pending || status == ISpokePoolManager.RequestStatus.Built) {
            revert ISpokePoolManager.OpenRequestExists(latestRequestId);
        }
    }

    /// @dev Checks a new pool's parameters are within the bounds the comptroller accepts
    function checkPoolParams(ISpokePoolManager.PoolParams calldata params) internal pure {
        if (
            params.closeFactor < MIN_CLOSE_FACTOR_MANTISSA ||
            params.closeFactor > MAX_CLOSE_FACTOR_MANTISSA ||
            params.liquidationIncentive < MIN_LIQUIDATION_INCENTIVE_MANTISSA
        ) {
            revert ISpokePoolManager.InvalidPoolParams();
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Opens a pending request from the caller, approved by it, unless its latest request is still open
    function _newRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        mapping(address => uint256) storage latestRequestIds,
        uint256 requestId,
        ISpokePoolManager.RequestType requestType,
        address comptroller,
        uint256 tierId
    ) private returns (ISpokePoolManager.Request storage request) {
        ensureNoOpenRequest(requests, latestRequestIds);

        latestRequestIds[msg.sender] = requestId;
        request = requests[requestId];
        request.requestType = requestType;
        request.status = ISpokePoolManager.RequestStatus.Pending;
        request.approved = true;
        request.deployer = msg.sender;
        request.comptroller = comptroller;
        request.tierId = tierId;
    }

    /// @dev Replaces a request's markets
    function _storeMarkets(
        ISpokePoolManager.Request storage request,
        ISpokePoolManager.DeployerMarketParams[] calldata markets
    ) private {
        delete request.markets;
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            request.markets.push(markets[i]);
        }
    }

    /// @dev Pulls a request's seeds from the caller into escrow
    function _pullSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts
    ) private {
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            ISpokePoolManager.DeployerMarketParams storage market = request.markets[i];
            transferIn(market.asset, market.seed);
            escrowedAmounts[market.asset] += market.seed;
        }
    }

    /// @dev Closes an open request and refunds its bond and seeds to its deployer
    function _closeRequest(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts,
        ISpokePoolManager.RequestStatus status
    ) private {
        request.status = status;
        address deployer = request.deployer;
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            escrowedAmounts[request.bondAsset] -= request.bondAmount;
            IERC20Upgradeable(request.bondAsset).safeTransfer(deployer, request.bondAmount);
        }
        // An unapproved request's seeds were already refunded at its edit
        if (request.approved) {
            _releaseSeeds(request, escrowedAmounts, deployer);
        }
    }

    /// @dev Sends a request's escrowed seeds to `to`
    function _releaseSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts,
        address to
    ) private {
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            ISpokePoolManager.DeployerMarketParams storage market = request.markets[i];
            escrowedAmounts[market.asset] -= market.seed;
            IERC20Upgradeable(market.asset).safeTransfer(to, market.seed);
        }
    }

    /// @dev Starts a pool request's pool on its tier and moves the escrowed bond to the bond manager
    function _activatePool(
        Contracts memory contracts,
        mapping(address => ISpokePoolManager.Pool) storage pools,
        mapping(address => address) storage activePools,
        mapping(address => uint256) storage escrowedAmounts,
        ISpokePoolManager.Request storage request,
        uint256 requestId
    ) private {
        address comptroller = request.comptroller;
        address deployer = request.deployer;
        ISpokePoolManager.Pool storage pool = pools[comptroller];
        pool.deployer = deployer;
        pool.status = ISpokePoolManager.PoolStatus.Live;
        pool.tierId = request.tierId;
        activePools[deployer] = comptroller;

        address bondAsset = request.bondAsset;
        uint256 bondAmount = request.bondAmount;
        escrowedAmounts[bondAsset] -= bondAmount;
        IERC20Upgradeable(bondAsset).forceApprove(address(contracts.bondManager), bondAmount);
        contracts.bondManager.createBond(comptroller, deployer, bondAsset, bondAmount);

        emit ISpokePoolManager.PoolActivated(requestId, comptroller, deployer);
    }

    /// @dev Publishes a deployer's update of a collateral market to the RiskOracle
    function _publishUpdate(
        Contracts memory contracts,
        string memory updateType,
        address vToken,
        bytes memory newValue
    ) private {
        contracts.riskOracle.publishRiskParameterUpdate("", newValue, updateType, vToken, 0, 0, "");
    }

    /**
     * @dev Checks a new pool's tier is enabled, its bond asset allowed and its bond worth what the tier requires, and
     *   returns the tier's limits for the market checks
     */
    function _validateTierAndBond(
        Contracts memory contracts,
        uint256 tierId,
        address bondAsset,
        uint256 bondAmount
    ) private view returns (ITierRegistry.PoolLimits memory limits) {
        bool enabled;
        uint256 minBondUsd;
        (enabled, minBondUsd, limits) = contracts.tierRegistry.getTierTerms(tierId);
        if (!enabled) {
            revert ISpokePoolManager.TierDisabled(tierId);
        }
        (, , bool allowed, uint256 factor) = contracts.bondManager.assetConfigs(bondAsset);
        if (!allowed) {
            revert ISpokePoolManager.InvalidBondAsset(bondAsset);
        }
        _checkBondAmount(contracts, bondAsset, bondAmount, (minBondUsd * factor) / EXP_SCALE);
    }

    /**
     * @dev Checks a bond amount is worth the required bond. The amount is checked, not the bond's value, which a
     *   Hub's exit fee lowers
     */
    function _checkBondAmount(
        Contracts memory contracts,
        address bondAsset,
        uint256 bondAmount,
        uint256 requiredBondUsd
    ) private view {
        uint256 bondUsd = (bondAmount * contracts.resilientOracle.getPrice(bondAsset)) / EXP_SCALE;
        if (bondUsd < requiredBondUsd) {
            revert ISpokePoolManager.InsufficientBondValue(bondUsd, requiredBondUsd);
        }
    }

    /**
     * @dev Checks new markets against a pool and its tier's current limits, without prices. Reverts with
     *   InvalidArrayLength, TooManyMarkets, DuplicateAsset, InvalidMarketParams, LoanAssetNotAllowed,
     *   InterestRateModelNotAllowed or ExceedsTierLimit
     * @param comptroller The pool's comptroller; zero, or not yet listed, for a new pool
     * @param limits The tier's current limits
     */
    function _validateMarkets(
        Contracts memory contracts,
        mapping(address => bool) storage isLoanMarket,
        address comptroller,
        uint256 tierId,
        ITierRegistry.PoolLimits memory limits,
        ISpokePoolManager.DeployerMarketParams[] memory markets
    ) private view {
        uint256 marketCount = markets.length;
        if (marketCount == 0) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        ITierRegistry tierRegistry = contracts.tierRegistry;
        (uint256 poolMarketCount, uint256 collateralMarketCount) = _countPoolMarkets(isLoanMarket, comptroller);
        poolMarketCount += marketCount;
        uint256 maxPoolMarkets = contracts.proposalBuilder.MAX_POOL_MARKETS();
        if (poolMarketCount > maxPoolMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolMarketCount, maxPoolMarkets);
        }
        address poolRegistry = contracts.proposalBuilder.POOL_REGISTRY();
        for (uint256 i; i < marketCount; ++i) {
            _checkUniqueAsset(poolRegistry, comptroller, markets, i);
            _validateMarket(tierRegistry, tierId, limits, markets[i]);
            if (!markets[i].isLoanMarket) {
                ++collateralMarketCount;
            }
        }
        if (collateralMarketCount > limits.maxCollateralMarkets) {
            revert ISpokePoolManager.TooManyMarkets(collateralMarketCount, limits.maxCollateralMarkets);
        }
    }

    /// @dev Returns how many markets a pool has and how many of them are collateral; zero for a new pool
    function _countPoolMarkets(
        mapping(address => bool) storage isLoanMarket,
        address comptroller
    ) private view returns (uint256 marketCount, uint256 collateralMarketCount) {
        if (comptroller != address(0)) {
            VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
            marketCount = vTokens.length;
            for (uint256 i; i < marketCount; ++i) {
                if (!isLoanMarket[address(vTokens[i])]) {
                    ++collateralMarketCount;
                }
            }
        }
    }

    /// @dev Checks a market's asset is in no earlier market of the request and not in the pool
    function _checkUniqueAsset(
        address poolRegistry,
        address comptroller,
        ISpokePoolManager.DeployerMarketParams[] memory markets,
        uint256 index
    ) private view {
        address asset = markets[index].asset;
        // A nested loop bounded by the builder's `MAX_POOL_MARKETS`
        for (uint256 j; j < index; ++j) {
            if (markets[j].asset == asset) {
                revert ISpokePoolManager.DuplicateAsset(asset);
            }
        }
        // A pool not built yet has no comptroller, so no market in the registry
        if (
            comptroller != address(0) && PoolRegistry(poolRegistry).getVTokenForAsset(comptroller, asset) != address(0)
        ) {
            revert ISpokePoolManager.DuplicateAsset(asset);
        }
    }

    /// @dev Checks a new market's parameters against its type and the tier's limits, without prices
    function _validateMarket(
        ITierRegistry tierRegistry,
        uint256 tierId,
        ITierRegistry.PoolLimits memory limits,
        ISpokePoolManager.DeployerMarketParams memory market
    ) private view {
        address asset = market.asset;
        if (bytes(market.name).length == 0 || bytes(market.symbol).length == 0 || market.seed == 0) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        if (market.isLoanMarket) {
            uint256 supplyCap = tierRegistry.getLoanSupplyCap(tierId, asset);
            if (supplyCap == 0) {
                revert ISpokePoolManager.LoanAssetNotAllowed(asset);
            }
            if (
                market.collateralFactor != 0 ||
                market.liquidationThreshold != 0 ||
                market.supplyCap != 0 ||
                market.seed > supplyCap
            ) {
                revert ISpokePoolManager.InvalidMarketParams(asset);
            }
            if (!tierRegistry.isAllowedInterestRateModel(tierId, asset, market.interestRateModel)) {
                revert ISpokePoolManager.InterestRateModelNotAllowed(market.interestRateModel);
            }
            return;
        }
        if (
            market.interestRateModel != address(0) ||
            market.collateralFactor > market.liquidationThreshold ||
            market.seed > market.supplyCap
        ) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        if (
            market.collateralFactor > limits.maxCollateralFactor ||
            market.liquidationThreshold > limits.maxLiquidationThreshold
        ) {
            revert ISpokePoolManager.ExceedsTierLimit(asset);
        }
    }

    /// @dev Returns a request after checking it is pending or built, so it can still change
    function _ensureEditableRequest(
        mapping(uint256 => ISpokePoolManager.Request) storage requests,
        uint256 requestId
    ) private view returns (ISpokePoolManager.Request storage request) {
        request = requests[requestId];
        if (
            request.status != ISpokePoolManager.RequestStatus.Pending &&
            request.status != ISpokePoolManager.RequestStatus.Built
        ) {
            revert ISpokePoolManager.InvalidRequestStatus(requestId);
        }
    }

    /// @dev Runs the checks that need prices, at build, as a new collateral asset's oracle is set after the request
    function _validateMarketPricesAndSeeds(
        Contracts memory contracts,
        ITierRegistry.PoolLimits memory limits,
        ISpokePoolManager.DeployerMarketParams[] memory markets
    ) private view {
        IDeviationBoundedOracle deviationBoundedOracle = contracts.proposalBuilder.DEVIATION_BOUNDED_ORACLE();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            ISpokePoolManager.DeployerMarketParams memory market = markets[i];
            address asset = market.asset;
            uint256 price = contracts.resilientOracle.getPrice(asset);
            if ((market.seed * price) / EXP_SCALE < MIN_SEED_USD) {
                revert ISpokePoolManager.InsufficientSeed(asset);
            }
            if (market.isLoanMarket) {
                continue;
            }
            if ((market.supplyCap * price) / EXP_SCALE > limits.maxCollateralSupplyCapUsd) {
                revert ISpokePoolManager.ExceedsTierLimit(asset);
            }
            if (!deviationBoundedOracle.isBoundedPricingEnabled(asset)) {
                revert ISpokePoolManager.DeviationBoundedOracleNotSet(asset);
            }
        }
    }

    /// @dev Checks a market is listed in the pool, as `isListed` says, and is not a loan market
    function _ensureCollateralMarket(
        mapping(address => bool) storage isLoanMarket,
        address vToken,
        bool isListed
    ) private view {
        if (!isListed) {
            revert ISpokePoolManager.MarketNotListed(vToken);
        }
        if (isLoanMarket[vToken]) {
            revert ISpokePoolManager.InvalidMarketType(vToken);
        }
    }

    /**
     * @dev Reverts while the latest update of this kind for a market can still be applied: the receiver has not
     *   processed it, or holds it pending, and it has not expired. A new update lands after the current values, so it
     *   is checked against them; an expired one does not block the deployer
     */
    function _ensureNoPendingUpdate(Contracts memory contracts, string memory updateType, address vToken) private view {
        uint256 updateId = contracts.riskOracle.getLatestUpdateIdByTypeAndMarket(updateType, vToken);
        if (updateId == 0) {
            return;
        }
        IRiskStewardReceiver.UpdateStatus status = contracts.riskStewardReceiver.updates(updateId).status;
        if (
            (status == IRiskStewardReceiver.UpdateStatus.None || status == IRiskStewardReceiver.UpdateStatus.Pending) &&
            contracts.riskOracle.getUpdateById(updateId).timestamp +
                contracts.riskStewardReceiver.UPDATE_EXPIRATION_TIME() >=
            block.timestamp
        ) {
            revert ISpokePoolManager.PreviousUpdatePending(vToken);
        }
    }

    /// @dev Checks a pool's bond is worth at least `minCoverageRatio` of the bond its tier requires
    function _checkBondCoverage(
        Contracts memory contracts,
        address comptroller,
        uint256 minBondUsd,
        uint256 minCoverageRatio
    ) private view {
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));
        address bondAsset = address(bondAccount.asset());
        (, , , uint256 factor) = contracts.bondManager.assetConfigs(bondAsset);
        uint256 requiredBondUsd = (minBondUsd * factor) / EXP_SCALE;
        // The bond's value is the principal it still covers, net of a Hub's exit fee
        uint256 bondUsd = (bondAccount.value() * contracts.resilientOracle.getPrice(bondAsset)) / EXP_SCALE;
        if (bondUsd * EXP_SCALE < requiredBondUsd * minCoverageRatio) {
            revert ISpokePoolManager.CoverageTooLow((bondUsd * EXP_SCALE) / requiredBondUsd, minCoverageRatio);
        }
    }
}

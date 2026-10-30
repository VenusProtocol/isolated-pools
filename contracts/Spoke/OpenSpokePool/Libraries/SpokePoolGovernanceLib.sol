// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VToken } from "../../../VToken.sol";
import { EXP_SCALE } from "../../../lib/constants.sol";
import { SpokeComptroller } from "../../SpokeComptroller.sol";
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokePoolProposalBuilder } from "../../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../../interfaces/ISpokePoolManager.sol";
import { ISpokePoolPolicyRegistry } from "../../interfaces/ISpokePoolPolicyRegistry.sol";
import { IRiskStewardReceiver } from "../../interfaces/external/IRiskStewardReceiver.sol";

/**
 * @title SpokePoolGovernanceLib
 * @author Venus
 * @notice The outbound actions of `SpokePoolManager`, linked to keep the manager under the EIP-170 size limit: it
 * builds a request's, an exit's and a force close's VIP through the proposal builder and records each build, and
 * checks and publishes the deployer's risk updates to the RiskOracle for the Risk Stewards
 * @dev The manager calls it through DELEGATECALL, so `address(this)`, `msg.sender` and the storage are the manager's:
 * the builder sees the manager as its caller and the manager is the RiskOracle sender. It writes only what a build
 * records and emits the build events; the manager keeps the access checks and `SpokePoolValidationLib` the request
 * checks. The errors are `ISpokePoolManager`'s
 */
library SpokePoolGovernanceLib {
    /// @dev The RiskOracle update types the deployer publishes; each one selects the Risk Steward that applies it
    string internal constant COLLATERAL_FACTORS_UPDATE = "collateralFactors";
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";
    string internal constant SUPPLY_PAUSE_UPDATE = "supplyPause";

    // ──────────────────────────────────────────────────────────────────────
    // Build functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Builds a request's VIP and records the pool's comptroller, the Built status and the VIP payload
     * @param proposalBuilder The proposal builder
     * @param request The request, checked and funded by the manager
     * @param requestProposals The manager's VIP payloads by request id
     * @param requestId The request's id
     * @param description The VIP's description
     * @custom:event Emits RequestBuilt
     * @custom:error The builder's `buildRequestProposal` errors
     */
    function buildRequestProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Request storage request,
        mapping(uint256 requestId => bytes payload) storage requestProposals,
        uint256 requestId,
        string calldata description
    ) external {
        (address comptroller, address[] memory vTokens, bytes memory proposal) = proposalBuilder.buildRequestProposal(
            requestId,
            description
        );
        request.comptroller = comptroller;
        request.status = ISpokePoolManager.RequestStatus.Built;
        requestProposals[requestId] = proposal;

        emit ISpokePoolManager.RequestBuilt(requestId, vTokens);
    }

    /**
     * @notice Builds a live or exiting pool's exit VIP and stores it as the pool's latest
     * @param proposalBuilder The proposal builder
     * @param pool The pool
     * @param exitProposals The manager's exit VIP payloads by comptroller
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's liquidation threshold for the wind-down
     * @param description The VIP's description
     * @custom:event Emits ExitBuilt
     * @custom:error InvalidPoolStatus is thrown unless the pool is live or its exit is requested or built
     * @custom:error The builder's `buildExitProposal` errors
     */
    function buildExitProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Pool storage pool,
        mapping(address comptroller => bytes payload) storage exitProposals,
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external {
        ISpokePoolManager.PoolStatus status = pool.status;
        if (
            status != ISpokePoolManager.PoolStatus.Live &&
            status != ISpokePoolManager.PoolStatus.ExitRequested &&
            status != ISpokePoolManager.PoolStatus.ExitProposed
        ) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }

        pool.status = ISpokePoolManager.PoolStatus.ExitProposed;
        exitProposals[comptroller] = proposalBuilder.buildExitProposal(comptroller, liquidationThresholds, description);

        emit ISpokePoolManager.ExitBuilt(comptroller);
    }

    /**
     * @notice Builds a winding-down pool's force-close VIP once its wind-down period ends, in place of its exit VIP
     * @param proposalBuilder The proposal builder
     * @param pool The pool
     * @param exitProposals The manager's exit VIP payloads by comptroller
     * @param comptroller The pool's comptroller
     * @param windDownPeriod The manager's wind-down period
     * @param description The VIP's description
     * @custom:event Emits ForceCloseBuilt
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error WindDownPeriodNotElapsed is thrown before the wind-down period ends
     */
    function buildForceCloseProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Pool storage pool,
        mapping(address comptroller => bytes payload) storage exitProposals,
        address comptroller,
        uint256 windDownPeriod,
        string calldata description
    ) external {
        if (pool.status != ISpokePoolManager.PoolStatus.WindingDown) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert ISpokePoolManager.WindDownPeriodNotElapsed();
        }

        exitProposals[comptroller] = proposalBuilder.buildForceCloseProposal(comptroller, description);

        emit ISpokePoolManager.ForceCloseBuilt(comptroller);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Risk control functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a deployer's new collateral factor and liquidation threshold for a collateral market against the
     *   market, the pool's tier and its bond's coverage, then publishes them to the RiskOracle
     * @param contracts The manager's contracts
     * @param tierId The pool's tier
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:error See `ISpokePoolManager.setCollateralFactor`
     */
    function publishCollateralFactorUpdate(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external {
        (bool isListed, uint256 marketCollateralFactor, uint256 marketLiquidationThreshold) = SpokeComptroller(
            comptroller
        ).markets(vToken);
        _ensureCollateralMarket(comptroller, vToken, isListed);
        _ensureNoPendingUpdate(contracts, COLLATERAL_FACTORS_UPDATE, vToken);

        if (collateralFactor > liquidationThreshold || liquidationThreshold < marketLiquidationThreshold) {
            revert ISpokePoolManager.InvalidCollateralFactors(vToken);
        }
        if (collateralFactor == marketCollateralFactor && liquidationThreshold == marketLiquidationThreshold) {
            revert ISpokePoolManager.RedundantUpdate(vToken);
        }

        ISpokePoolPolicyRegistry.PoolLimits memory limits = contracts.policyRegistry.getTier(tierId).limits;
        // A threshold kept as is passes a lowered tier maximum, so the collateral factor can still change
        if (
            collateralFactor > limits.maxCollateralFactor ||
            (liquidationThreshold > limits.maxLiquidationThreshold &&
                liquidationThreshold != marketLiquidationThreshold)
        ) {
            revert ISpokePoolManager.ExceedsTierLimit(vToken);
        }
        _checkBondCoverage(contracts, comptroller, tierId, limits.minCoverageRatio);

        _publishUpdate(
            contracts,
            COLLATERAL_FACTORS_UPDATE,
            vToken,
            abi.encode(collateralFactor, liquidationThreshold)
        );
    }

    /**
     * @notice Checks a deployer's new supply cap for a collateral market against the market, the pool's tier and its
     *   bond's coverage, then publishes it to the RiskOracle
     * @param contracts The manager's contracts
     * @param tierId The pool's tier
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param supplyCap The new supply cap, in the market's underlying units
     * @custom:error See `ISpokePoolManager.setCollateralSupplyCap`
     */
    function publishSupplyCapUpdate(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address comptroller,
        address vToken,
        uint256 supplyCap
    ) external {
        _ensureCollateralMarket(comptroller, vToken, SpokeComptroller(comptroller).isMarketListed(VToken(vToken)));
        _ensureNoPendingUpdate(contracts, SUPPLY_CAP_UPDATE, vToken);

        if (supplyCap == SpokeComptroller(comptroller).supplyCaps(vToken)) {
            revert ISpokePoolManager.RedundantUpdate(vToken);
        }

        ISpokePoolPolicyRegistry.PoolLimits memory limits = contracts.policyRegistry.getTier(tierId).limits;
        uint256 supplyCapUsd = (supplyCap * contracts.resilientOracle.getUnderlyingPrice(vToken)) / EXP_SCALE;
        if (supplyCapUsd > limits.maxCollateralSupplyCapUsd) {
            revert ISpokePoolManager.ExceedsTierLimit(vToken);
        }
        _checkBondCoverage(contracts, comptroller, tierId, limits.minCoverageRatio);

        _publishUpdate(contracts, SUPPLY_CAP_UPDATE, vToken, abi.encode(supplyCap));
    }

    /**
     * @notice Publishes a supply pause of a collateral market to the RiskOracle: MINT paused and the collateral factor
     *   set to 0
     * @param contracts The manager's contracts
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @custom:error See `ISpokePoolManager.pauseCollateralSupply`
     */
    function publishSupplyPause(
        ISpokePoolManager.Contracts memory contracts,
        address comptroller,
        address vToken
    ) external {
        _ensureCollateralMarket(comptroller, vToken, SpokeComptroller(comptroller).isMarketListed(VToken(vToken)));

        _publishUpdate(contracts, SUPPLY_PAUSE_UPDATE, vToken, "");
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Publishes a deployer's update of a collateral market to the RiskOracle; the manager is the sender
    function _publishUpdate(
        ISpokePoolManager.Contracts memory contracts,
        string memory updateType,
        address vToken,
        bytes memory newValue
    ) private {
        contracts.riskOracle.publishRiskParameterUpdate("", newValue, updateType, vToken, 0, 0, "");
    }

    /**
     * @dev Checks a market is listed in the pool, as `isListed` says, and is not a loan market: one whose supply
     *   allowlist is on, as its listing VIP enables it for the Hub
     */
    function _ensureCollateralMarket(address comptroller, address vToken, bool isListed) private view {
        if (!isListed) {
            revert ISpokePoolManager.MarketNotListed(vToken);
        }
        if (SpokeComptroller(comptroller).isSupplyAllowlistEnabled(vToken)) {
            revert ISpokePoolManager.InvalidMarketType(vToken);
        }
    }

    /**
     * @dev Reverts while the latest update of this kind for a market can still be applied: the receiver has not
     *   processed it, or holds it pending, and it has not expired. A new update lands after the current values, so it
     *   is checked against them; an expired one does not block the deployer
     */
    function _ensureNoPendingUpdate(
        ISpokePoolManager.Contracts memory contracts,
        string memory updateType,
        address vToken
    ) private view {
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
        ISpokePoolManager.Contracts memory contracts,
        address comptroller,
        uint256 tierId,
        uint256 minCoverageRatio
    ) private view {
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));
        address bondAsset = address(bondAccount.asset());
        uint256 requiredBondUsd = contracts.policyRegistry.getRequiredBondUsd(tierId, bondAsset);

        // What the bond holds, net of a loss and a Hub's exit fee
        uint256 bondUsd = (bondAccount.currentBondAmount() * contracts.resilientOracle.getPrice(bondAsset)) / EXP_SCALE;
        if (bondUsd * EXP_SCALE < requiredBondUsd * minCoverageRatio) {
            revert ISpokePoolManager.CoverageTooLow((bondUsd * EXP_SCALE) / requiredBondUsd, minCoverageRatio);
        }
    }
}

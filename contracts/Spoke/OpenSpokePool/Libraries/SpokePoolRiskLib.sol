// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../../../VToken.sol";
import { EXP_SCALE } from "../../../lib/constants.sol";
import { SpokeComptroller } from "../../SpokeComptroller.sol";
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokePoolManager } from "../../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../../interfaces/ITierRegistry.sol";
import { IRiskStewardReceiver } from "../../interfaces/external/IRiskStewardReceiver.sol";
import { SpokePoolRequestLib } from "./SpokePoolRequestLib.sol";

/**
 * @title SpokePoolRiskLib
 * @author Venus
 * @notice The pool risk checks of `SpokePoolManager`: it checks a deployer's collateral factor and supply cap updates
 * against the market, the pool's tier and its bond's coverage, and a supply pause against the market, then publishes
 * them to the RiskOracle, and checks a winding-down pool's residual debt before it closes. Linked to keep the manager under the EIP-170 size limit
 * @dev The manager calls it through DELEGATECALL, so `address(this)` and `msg.sender` are the manager's, and the
 * manager is the RiskOracle sender. It writes no manager state and emits no events; the errors are
 * `ISpokePoolManager`'s. It uses `SpokePoolRequestLib.Contracts` as a type only, so the two are linked separately
 */
library SpokePoolRiskLib {
    /// @dev The RiskOracle update types the deployer publishes; each one selects the Risk Steward that applies it
    string internal constant COLLATERAL_FACTORS_UPDATE = "collateralFactors";
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";
    string internal constant SUPPLY_PAUSE_UPDATE = "supplyPause";

    // ──────────────────────────────────────────────────────────────────────
    // Risk control functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a deployer's new collateral factor and liquidation threshold for a collateral market against the
     * market, the pool's tier and its bond's coverage, then publishes them to the RiskOracle
     * @param contracts The manager's contracts
     * @param tierId The pool's tier
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:error See `ISpokePoolManager.setCollateralFactor`
     */
    function publishCollateralFactorUpdate(
        SpokePoolRequestLib.Contracts memory contracts,
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
     * @notice Checks a deployer's new supply cap for a collateral market against the market, the pool's tier and its
     * bond's coverage, then publishes it to the RiskOracle
     * @param contracts The manager's contracts
     * @param tierId The pool's tier
     * @param comptroller The pool's comptroller
     * @param vToken The collateral market
     * @param supplyCap The new supply cap, in the market's underlying units
     * @custom:error See `ISpokePoolManager.setCollateralSupplyCap`
     */
    function publishSupplyCapUpdate(
        SpokePoolRequestLib.Contracts memory contracts,
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
        (, uint256 minBondUsd, ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        uint256 supplyCapUsd = (supplyCap * contracts.resilientOracle.getUnderlyingPrice(vToken)) / EXP_SCALE;
        if (supplyCapUsd > limits.maxCollateralSupplyCapUsd) {
            revert ISpokePoolManager.ExceedsTierLimit(vToken);
        }
        _checkBondCoverage(contracts, comptroller, minBondUsd, limits.minCoverageRatio);

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
        SpokePoolRequestLib.Contracts memory contracts,
        address comptroller,
        address vToken
    ) external {
        _ensureCollateralMarket(comptroller, vToken, SpokeComptroller(comptroller).isMarketListed(VToken(vToken)));

        _publishUpdate(contracts, SUPPLY_PAUSE_UPDATE, vToken, "");
    }

    // ──────────────────────────────────────────────────────────────────────
    // Exit checks
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a pool's debt, its borrows plus bad debt priced in USD, is at most `maxDebtUsd`
     * @dev Not a view: `totalBorrowsCurrent` accrues each market's interest. It writes no manager state
     * @param resilientOracle The oracle the debt is priced with
     * @param comptroller The pool's comptroller
     * @param maxDebtUsd The debt the pool may close with
     * @custom:error ResidualDebtExceeded is thrown when the debt is above `maxDebtUsd`
     */
    function ensureResidualDebtBelowMax(
        ResilientOracleInterface resilientOracle,
        address comptroller,
        uint256 maxDebtUsd
    ) external {
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = vTokens[i];
            uint256 debt = vToken.totalBorrowsCurrent() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * resilientOracle.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }
        if (debtUsd > maxDebtUsd) {
            revert ISpokePoolManager.ResidualDebtExceeded(debtUsd);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Publishes a deployer's update of a collateral market to the RiskOracle; the manager is the sender
    function _publishUpdate(
        SpokePoolRequestLib.Contracts memory contracts,
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
        SpokePoolRequestLib.Contracts memory contracts,
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
        SpokePoolRequestLib.Contracts memory contracts,
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

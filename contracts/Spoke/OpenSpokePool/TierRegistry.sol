// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";

/**
 * @title TierRegistry
 * @author Venus
 * @notice Holds the tiers of open spoke pools, set by VIP: each tier's bond requirement, pool limits and loan assets,
 * each with its supply cap and the interest rate models its new markets may use. It reads no pool state: callers pass
 * values and it checks them against a tier
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract TierRegistry is AccessControlledV8, ITierRegistry {
    /// @dev The tiers, by id
    mapping(uint256 => Tier) internal tiers;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the registry
     * @param accessControlManager_ The AccessControlManager the registry checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Admin functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ITierRegistry
    function setTier(uint256 tierId, Tier calldata tier) external {
        _checkAccessAllowed("setTier(uint256,Tier)");
        PoolLimits calldata limits = tier.limits;
        if (
            tier.minBondUsd == 0 ||
            limits.minCoverageRatio == 0 ||
            limits.maxLiquidationThreshold > MANTISSA_ONE ||
            limits.maxCollateralFactor > limits.maxLiquidationThreshold
        ) {
            revert InvalidTier(tierId);
        }

        LoanAsset[] calldata loanAssets = tier.loanAssets;
        uint256 loanAssetCount = loanAssets.length;
        for (uint256 i; i < loanAssetCount; ++i) {
            address asset = loanAssets[i].asset;
            ensureNonzeroAddress(asset);
            address[] calldata interestRateModels = loanAssets[i].interestRateModels;
            uint256 modelCount = interestRateModels.length;
            if (loanAssets[i].supplyCap == 0 || modelCount == 0) {
                revert InvalidLoanAsset(tierId, asset);
            }

            // Nested loops bounded by the few loan assets and models a tier offers
            for (uint256 j; j < i; ++j) {
                if (loanAssets[j].asset == asset) {
                    revert DuplicateLoanAsset(tierId, asset);
                }
            }

            for (uint256 j; j < modelCount; ++j) {
                ensureNonzeroAddress(interestRateModels[j]);
            }
        }

        emit TierUpdated(tierId, tiers[tierId], tier);
        tiers[tierId] = tier;
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ITierRegistry
    function getTier(uint256 tierId) external view returns (Tier memory) {
        return tiers[tierId];
    }

    /// @inheritdoc ITierRegistry
    function getTierTerms(
        uint256 tierId
    ) external view returns (bool enabled, uint256 minBondUsd, PoolLimits memory limits) {
        Tier storage tier = tiers[tierId];
        return (tier.enabled, tier.minBondUsd, tier.limits);
    }

    /// @inheritdoc ITierRegistry
    function getLoanSupplyCap(uint256 tierId, address asset) external view returns (uint256) {
        return _loanSupplyCap(tiers[tierId], asset);
    }

    /// @inheritdoc ITierRegistry
    function isAllowedInterestRateModel(
        uint256 tierId,
        address asset,
        address interestRateModel
    ) external view returns (bool) {
        LoanAsset[] storage loanAssets = tiers[tierId].loanAssets;
        uint256 loanAssetCount = loanAssets.length;
        for (uint256 i; i < loanAssetCount; ++i) {
            if (loanAssets[i].asset != asset) {
                continue;
            }

            address[] storage interestRateModels = loanAssets[i].interestRateModels;
            uint256 modelCount = interestRateModels.length;
            for (uint256 j; j < modelCount; ++j) {
                if (interestRateModels[j] == interestRateModel) {
                    return true;
                }
            }
            return false;
        }

        return false;
    }

    /// @inheritdoc ITierRegistry
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool) {
        Tier storage fromTier = tiers[fromTierId];
        Tier storage toTier = tiers[toTierId];
        PoolLimits storage fromLimits = fromTier.limits;
        PoolLimits storage toLimits = toTier.limits;
        if (
            !toTier.enabled ||
            toTier.minBondUsd <= fromTier.minBondUsd ||
            toLimits.maxCollateralFactor < fromLimits.maxCollateralFactor ||
            toLimits.maxLiquidationThreshold < fromLimits.maxLiquidationThreshold ||
            toLimits.maxCollateralMarkets < fromLimits.maxCollateralMarkets ||
            toLimits.maxCollateralSupplyCapUsd < fromLimits.maxCollateralSupplyCapUsd
        ) {
            return false;
        }

        LoanAsset[] storage fromLoanAssets = fromTier.loanAssets;
        uint256 loanAssetCount = fromLoanAssets.length;
        for (uint256 i; i < loanAssetCount; ++i) {
            if (_loanSupplyCap(toTier, fromLoanAssets[i].asset) < fromLoanAssets[i].supplyCap) {
                return false;
            }
        }

        return true;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Returns a tier's supply cap for a loan asset; zero when it does not offer the asset
    function _loanSupplyCap(Tier storage tier, address asset) private view returns (uint256) {
        LoanAsset[] storage loanAssets = tier.loanAssets;
        uint256 loanAssetCount = loanAssets.length;
        for (uint256 i; i < loanAssetCount; ++i) {
            if (loanAssets[i].asset == asset) {
                return loanAssets[i].supplyCap;
            }
        }
        return 0;
    }
}

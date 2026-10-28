// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { ISpokePoolPolicyRegistry } from "../interfaces/ISpokePoolPolicyRegistry.sol";

/**
 * @title SpokePoolPolicyRegistry
 * @author Venus
 * @notice Holds the policy open spoke pools run under, set by VIP: the tiers, each with its bond requirement, pool
 * limits and loan assets with their supply caps and allowed interest rate models; the bond assets, each with the
 * factor on a tier's minimum bond; and the comptroller and market parameters new pools and markets get. It reads no
 * pool state: callers pass values and it checks them against the policy
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract SpokePoolPolicyRegistry is AccessControlledV8, ISpokePoolPolicyRegistry {
    /// @dev Bounds of a new pool's close factor and liquidation incentive, as the comptroller accepts them
    uint256 internal constant MIN_CLOSE_FACTOR_MANTISSA = 0.05e18;
    uint256 internal constant MAX_CLOSE_FACTOR_MANTISSA = 0.9e18;
    uint256 internal constant MIN_LIQUIDATION_INCENTIVE_MANTISSA = 1.05e18;

    /// @inheritdoc ISpokePoolPolicyRegistry
    mapping(address asset => uint256 factor) public bondAssetFactors;

    /// @inheritdoc ISpokePoolPolicyRegistry
    PoolParams public poolParams;

    /// @inheritdoc ISpokePoolPolicyRegistry
    ProtocolMarketParams public marketParams;

    /// @dev The tiers, by id
    mapping(uint256 tierId => Tier tier) internal tiers;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[37] private __gap;

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

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setTier(uint256 tierId, Tier calldata tier) external {
        _checkAccessAllowed("setTier(uint256,Tier)");
        PoolLimits calldata limits = tier.limits;
        if (
            tier.minTierBondUsd == 0 ||
            limits.minCoverageRatio == 0 ||
            limits.minCoverageRatio > MANTISSA_ONE ||
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

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setBondAssetFactor(address asset, uint256 factor) external {
        _checkAccessAllowed("setBondAssetFactor(address,uint256)");
        ensureNonzeroAddress(asset);

        emit BondAssetFactorUpdated(asset, bondAssetFactors[asset], factor);
        bondAssetFactors[asset] = factor;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setPoolParams(PoolParams calldata params) external {
        _checkAccessAllowed("setPoolParams(PoolParams)");
        if (
            params.closeFactor < MIN_CLOSE_FACTOR_MANTISSA ||
            params.closeFactor > MAX_CLOSE_FACTOR_MANTISSA ||
            params.liquidationIncentive < MIN_LIQUIDATION_INCENTIVE_MANTISSA
        ) {
            revert InvalidPoolParams();
        }

        emit PoolParamsUpdated(poolParams, params);
        poolParams = params;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setMarketParams(ProtocolMarketParams calldata params) external {
        _checkAccessAllowed("setMarketParams(ProtocolMarketParams)");
        if (
            params.collateralInterestRateModel == address(0) ||
            params.reserveFactor > MANTISSA_ONE ||
            params.reduceReservesBlockDelta == 0 ||
            params.maxStalePeriod == 0 ||
            params.boundDeviation == 0 ||
            params.boundDeviation >= MANTISSA_ONE
        ) {
            revert InvalidProtocolMarketParams();
        }

        emit MarketParamsUpdated(marketParams, params);
        marketParams = params;
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getRequiredBondUsd(uint256 tierId, address bondAsset) external view returns (uint256) {
        uint256 factor = bondAssetFactors[bondAsset];
        if (factor == 0) {
            revert BondAssetNotAllowed(bondAsset);
        }
        return (tiers[tierId].minTierBondUsd * factor) / MANTISSA_ONE;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getTier(uint256 tierId) external view returns (Tier memory) {
        return tiers[tierId];
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getTierTerms(
        uint256 tierId
    ) external view returns (bool enabled, uint256 minTierBondUsd, PoolLimits memory limits) {
        Tier storage tier = tiers[tierId];
        return (tier.enabled, tier.minTierBondUsd, tier.limits);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getLoanSupplyCap(uint256 tierId, address asset) external view returns (uint256) {
        return _loanSupplyCap(tiers[tierId], asset);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
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

    /// @inheritdoc ISpokePoolPolicyRegistry
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool) {
        Tier storage fromTier = tiers[fromTierId];
        Tier storage toTier = tiers[toTierId];
        PoolLimits storage fromLimits = fromTier.limits;
        PoolLimits storage toLimits = toTier.limits;
        if (
            !toTier.enabled ||
            toTier.minTierBondUsd <= fromTier.minTierBondUsd ||
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

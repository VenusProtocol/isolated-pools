// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { ISpokePoolPolicyRegistry } from "../interfaces/ISpokePoolPolicyRegistry.sol";
import { IYieldGroup } from "../interfaces/external/IYieldGroup.sol";

/**
 * @title SpokePoolPolicyRegistry
 * @author Venus
 * @notice Holds the policy open spoke pools run under, set by VIP: the tiers and their limits, the loan and bond
 * assets, the parameters new pools and markets get, the oracles new collateral feeds may be set on and any symbol
 * override for new markets. It reads no pool state: callers pass values and it checks them against the policy
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

    /// @dev Each loan asset's config; read it with `getLoanAssetConfig`
    mapping(address asset => LoanAssetConfig config) internal loanAssetConfigs;

    /// @dev The loan assets, those with a nonzero factor; read them with `getLoanAssets`
    address[] internal loanAssets;

    /// @dev The bond assets, those with a nonzero factor; read them with `getBondAssets`
    address[] internal bondAssets;

    /// @dev The ids of the tiers set; read them with `getTierIds`
    uint256[] internal tierIds;

    /// @dev The oracles a new collateral asset's feed may be set on; read them with `getSupportedOracles`
    address[] internal supportedOracles;

    /// @inheritdoc ISpokePoolPolicyRegistry
    mapping(address oracle => bool supported) public isSupportedOracle;

    /// @inheritdoc ISpokePoolPolicyRegistry
    mapping(address asset => string symbol) public assetSymbols;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[35] private __gap;

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
            limits.maxCollateralFactor > limits.maxLiquidationThreshold ||
            limits.loanSupplyCapUsd == 0
        ) {
            revert InvalidTier(tierId);
        }

        // A set tier always has a minimum bond, so a zero one means a new tier
        if (tiers[tierId].minTierBondUsd == 0) {
            tierIds.push(tierId);
        }

        emit TierUpdated(tierId, tiers[tierId], tier);
        tiers[tierId] = tier;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setLoanAssetConfig(address asset, LoanAssetConfig calldata config) external {
        _checkAccessAllowed("setLoanAssetConfig(address,LoanAssetConfig)");
        ensureNonzeroAddress(asset);
        address[] calldata interestRateModels = config.interestRateModels;
        uint256 modelCount = interestRateModels.length;
        // A loan asset needs a model for its markets to pick and a YieldGroup of its asset to supply them; a removed
        // one keeps neither
        bool yieldGroupFits = config.factor != 0
            ? config.yieldGroup != address(0) && IYieldGroup(config.yieldGroup).asset() == asset
            : config.yieldGroup == address(0);
        if ((config.factor == 0) != (modelCount == 0) || !yieldGroupFits) {
            revert InvalidLoanAssetConfig(asset);
        }

        LoanAssetConfig storage current = loanAssetConfigs[asset];
        if (current.factor == 0 && config.factor != 0) {
            loanAssets.push(asset);
        } else if (current.factor != 0 && config.factor == 0) {
            _remove(loanAssets, asset);
        }

        LoanAssetConfig memory oldConfig = current;
        current.factor = config.factor;
        current.yieldGroup = config.yieldGroup;
        delete current.interestRateModels;
        for (uint256 i; i < modelCount; ++i) {
            _addInterestRateModel(asset, current, interestRateModels[i]);
        }
        emit LoanAssetConfigUpdated(asset, oldConfig, current);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setLoanAssetFactor(address asset, uint256 factor) external {
        _checkAccessAllowed("setLoanAssetFactor(address,uint256)");
        LoanAssetConfig storage config = _ensureLoanAssetListed(asset);
        // A zero factor would leave the asset's models without a factor; delisting takes `setLoanAssetConfig`
        if (factor == 0) {
            revert InvalidLoanAssetConfig(asset);
        }

        LoanAssetConfig memory oldConfig = config;
        config.factor = factor;
        emit LoanAssetConfigUpdated(asset, oldConfig, config);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function addInterestRateModel(address asset, address interestRateModel) external {
        _checkAccessAllowed("addInterestRateModel(address,address)");
        LoanAssetConfig storage config = _ensureLoanAssetListed(asset);
        LoanAssetConfig memory oldConfig = config;
        _addInterestRateModel(asset, config, interestRateModel);
        emit LoanAssetConfigUpdated(asset, oldConfig, config);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setBondAssetFactor(address asset, uint256 factor) external {
        _checkAccessAllowed("setBondAssetFactor(address,uint256)");
        ensureNonzeroAddress(asset);

        uint256 current = bondAssetFactors[asset];
        if (current == 0 && factor != 0) {
            bondAssets.push(asset);
        } else if (current != 0 && factor == 0) {
            _remove(bondAssets, asset);
        }

        emit BondAssetFactorUpdated(asset, current, factor);
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
            params.reduceReservesBlockDelta == 0
        ) {
            revert InvalidProtocolMarketParams();
        }

        emit MarketParamsUpdated(marketParams, params);
        marketParams = params;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setSupportedOracles(address[] calldata oracles) external {
        _checkAccessAllowed("setSupportedOracles(address[])");

        uint256 oldCount = supportedOracles.length;
        for (uint256 i; i < oldCount; ++i) {
            isSupportedOracle[supportedOracles[i]] = false;
        }
        uint256 count = oracles.length;
        for (uint256 i; i < count; ++i) {
            ensureNonzeroAddress(oracles[i]);
            isSupportedOracle[oracles[i]] = true;
        }

        emit SupportedOraclesUpdated(supportedOracles, oracles);
        supportedOracles = oracles;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function setAssetSymbol(address asset, string calldata symbol) external {
        _checkAccessAllowed("setAssetSymbol(address,string)");
        ensureNonzeroAddress(asset);

        emit AssetSymbolUpdated(asset, assetSymbols[asset], symbol);
        assetSymbols[asset] = symbol;
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
    function getTierIds() external view returns (uint256[] memory) {
        return tierIds;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getBondAssets() external view returns (address[] memory) {
        return bondAssets;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getLoanAssets() external view returns (address[] memory) {
        return loanAssets;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getSupportedOracles() external view returns (address[] memory) {
        return supportedOracles;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getLoanAssetConfig(address asset) external view returns (LoanAssetConfig memory) {
        return loanAssetConfigs[asset];
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function getLoanSupplyCapUsd(uint256 tierId, address asset) external view returns (uint256) {
        return (tiers[tierId].limits.loanSupplyCapUsd * loanAssetConfigs[asset].factor) / MANTISSA_ONE;
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function isAllowedInterestRateModel(address asset, address interestRateModel) external view returns (bool) {
        return _hasInterestRateModel(loanAssetConfigs[asset].interestRateModels, interestRateModel);
    }

    /// @inheritdoc ISpokePoolPolicyRegistry
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool) {
        Tier storage fromTier = tiers[fromTierId];
        Tier storage toTier = tiers[toTierId];
        PoolLimits storage fromLimits = fromTier.limits;
        PoolLimits storage toLimits = toTier.limits;
        return
            toTier.enabled &&
            toTier.minTierBondUsd > fromTier.minTierBondUsd &&
            toLimits.maxCollateralFactor >= fromLimits.maxCollateralFactor &&
            toLimits.maxLiquidationThreshold >= fromLimits.maxLiquidationThreshold &&
            toLimits.maxCollateralMarkets >= fromLimits.maxCollateralMarkets &&
            toLimits.maxCollateralSupplyCapUsd >= fromLimits.maxCollateralSupplyCapUsd &&
            toLimits.loanSupplyCapUsd >= fromLimits.loanSupplyCapUsd;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Removes `asset`, which `list` holds, moving the last asset into its place
    function _remove(address[] storage list, address asset) private {
        uint256 last = list.length - 1;
        for (uint256 i; i < last; ++i) {
            if (list[i] == asset) {
                list[i] = list[last];
                break;
            }
        }
        list.pop();
    }

    /// @dev Adds `model` to a loan asset's config, reverting on a zero or repeated model
    function _addInterestRateModel(address asset, LoanAssetConfig storage config, address model) private {
        ensureNonzeroAddress(model);
        if (_hasInterestRateModel(config.interestRateModels, model)) {
            revert DuplicateInterestRateModel(asset, model);
        }
        config.interestRateModels.push(model);
    }

    /// @dev Returns a loan asset's config, reverting with LoanAssetNotListed when it is not listed
    function _ensureLoanAssetListed(address asset) private view returns (LoanAssetConfig storage config) {
        config = loanAssetConfigs[asset];
        if (config.factor == 0) {
            revert LoanAssetNotListed(asset);
        }
    }

    /// @dev Returns whether `models` holds `interestRateModel`
    function _hasInterestRateModel(address[] storage models, address interestRateModel) private view returns (bool) {
        uint256 modelCount = models.length;
        for (uint256 i; i < modelCount; ++i) {
            if (models[i] == interestRateModel) {
                return true;
            }
        }
        return false;
    }
}

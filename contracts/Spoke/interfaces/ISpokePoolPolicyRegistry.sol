// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokePoolPolicyRegistry
 * @author Venus
 * @notice Functions, events and errors of `SpokePoolPolicyRegistry`: the policy open spoke pools run under, set by VIP
 */
interface ISpokePoolPolicyRegistry {
    /// @notice A tier's limits on its pools; mantissas are scaled by 1e18
    struct PoolLimits {
        // The least share of the required bond, at most 100%, the bond must be worth for the deployer's risk setters;
        // a request needs the whole required bond
        uint256 minCoverageRatio;
        uint256 maxCollateralFactor;
        uint256 maxLiquidationThreshold;
        uint256 maxCollateralMarkets;
        // Per collateral market, in USD scaled by 1e18
        uint256 maxCollateralSupplyCapUsd;
        // Per loan market before its asset's factor, in USD scaled by 1e18
        uint256 loanSupplyCapUsd;
    }

    /// @notice A tier's bond requirement and pool limits
    struct Tier {
        // False stops new pool requests on the tier and upgrades to it; its live pools keep working
        bool enabled;
        // The bond required before the bond asset's factor, in USD scaled by 1e18
        uint256 minTierBondUsd;
        PoolLimits limits;
    }

    /// @notice A loan asset's config, the same in every tier
    struct LoanAssetConfig {
        // Multiplies a tier's loan supply cap for the asset's markets, scaled by 1e18; zero for an asset not lent
        uint256 factor;
        // The models a new loan market of the asset may pick from; a live market keeps its own
        address[] interestRateModels;
    }

    /// @notice A new pool's comptroller parameters
    struct PoolParams {
        uint256 closeFactor;
        uint256 liquidationIncentive;
        uint256 minLiquidatableCollateral;
    }

    /// @notice A new market's parameters set by Venus
    struct ProtocolMarketParams {
        address collateralInterestRateModel;
        uint256 reserveFactor;
        uint256 reduceReservesBlockDelta;
    }

    /// @notice The oracle configs a new collateral asset gets unless the Venus team set its own for the request
    struct OracleParams {
        // Whether the VIP sets the DeviationBoundedOracle config below; without one, that oracle returns the
        // ResilientOracle's price unbounded
        bool deviationBoundedOracleEnabled;
        // Its DeviationBoundedOracle config, set for an asset neither that oracle nor the ResilientOracle has yet
        uint64 cooldownPeriod;
        uint256 triggerThreshold;
        uint256 resetThreshold;
        // Set on the BoundValidator when a pivot feed is set, as only then does the ResilientOracle compare prices: the
        // main and fallback against the pivot, then the main against the fallback. A price passes when the other price
        // divided by it is within 1 ± this, scaled by 1e18; 0.05e18 allows about 5% either way
        uint256 boundDeviation;
    }

    /**
     * @notice Emitted when a bond asset's factor is set
     * @param asset The bond asset
     * @param oldFactor The previous factor
     * @param newFactor The new factor
     */
    event BondAssetFactorUpdated(address indexed asset, uint256 oldFactor, uint256 newFactor);

    /**
     * @notice Emitted when the parameters of new pools are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event PoolParamsUpdated(PoolParams oldParams, PoolParams newParams);

    /**
     * @notice Emitted when Venus's parameters of new markets are changed
     * @param oldParams The previous parameters
     * @param newParams The new parameters
     */
    event MarketParamsUpdated(ProtocolMarketParams oldParams, ProtocolMarketParams newParams);

    /**
     * @notice Emitted when the oracle configs of new collateral assets are changed
     * @param oldParams The previous configs
     * @param newParams The new configs
     */
    event OracleParamsUpdated(OracleParams oldParams, OracleParams newParams);

    /**
     * @notice Emitted when a tier is set
     * @param tierId The tier
     * @param oldTier The previous tier
     * @param newTier The new tier
     */
    event TierUpdated(uint256 indexed tierId, Tier oldTier, Tier newTier);

    /**
     * @notice Emitted when a loan asset's config is set
     * @param asset The loan asset
     * @param oldConfig The previous config
     * @param newConfig The new config
     */
    event LoanAssetConfigUpdated(address indexed asset, LoanAssetConfig oldConfig, LoanAssetConfig newConfig);

    /**
     * @notice Thrown when a bond asset has no factor, being disabled or never set
     * @param asset The bond asset
     */
    error BondAssetNotAllowed(address asset);

    /// @notice Thrown when pool parameters are outside the bounds the comptroller accepts
    error InvalidPoolParams();

    /// @notice Thrown when Venus's market parameters have a zero model or block delta, or a reserve factor above 1e18
    error InvalidProtocolMarketParams();

    /// @notice Thrown when the oracle configs have a bound deviation of zero, or of 1e18 or above
    error InvalidOracleParams();

    /**
     * @notice Thrown when a tier's values are zero or inconsistent
     * @param tierId The tier
     */
    error InvalidTier(uint256 tierId);

    /**
     * @notice Thrown when a loan asset's config has a factor but no model, or a model but no factor
     * @param asset The loan asset
     */
    error InvalidLoanAssetConfig(address asset);

    /**
     * @notice Thrown when changing a loan asset that is not listed; list it with `setLoanAssetConfig` first
     * @param asset The asset
     */
    error LoanAssetNotListed(address asset);

    /**
     * @notice Thrown when a loan asset would list an interest rate model twice
     * @param asset The loan asset
     * @param interestRateModel The model
     */
    error DuplicateInterestRateModel(address asset, address interestRateModel);

    /**
     * @notice Sets a tier. Its pools' later deployer changes are checked against it; their live values stay as they are
     * @param tierId The tier
     * @param tier The tier; disable it with `enabled`, never with zero values
     * @custom:event Emits TierUpdated
     * @custom:error InvalidTier is thrown when the minimum bond, minimum coverage ratio or loan supply cap is zero, the
     *   coverage ratio or maximum liquidation threshold is above 100%, or the maximum collateral factor is above the
     *   threshold
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setTier(uint256 tierId, Tier calldata tier) external;

    /**
     * @notice Sets a loan asset's config. A nonzero factor lists the asset for new loan markets in every tier; a zero
     *   factor, with no models, delists it. Live markets keep their caps and model
     * @param asset The loan asset
     * @param config The config
     * @custom:event Emits LoanAssetConfigUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset or one of the models is zero
     * @custom:error InvalidLoanAssetConfig is thrown when the config has a factor but no model, or a model but no
     *   factor
     * @custom:error DuplicateInterestRateModel is thrown when a model is listed twice
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setLoanAssetConfig(address asset, LoanAssetConfig calldata config) external;

    /**
     * @notice Sets a listed loan asset's factor, keeping its models; delist it with `setLoanAssetConfig`
     * @param asset The loan asset
     * @param factor The factor, scaled by 1e18
     * @custom:event Emits LoanAssetConfigUpdated
     * @custom:error LoanAssetNotListed is thrown when the asset is not a loan asset
     * @custom:error InvalidLoanAssetConfig is thrown when the factor is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setLoanAssetFactor(address asset, uint256 factor) external;

    /**
     * @notice Adds an interest rate model new loan markets of a listed loan asset may pick
     * @param asset The loan asset
     * @param interestRateModel The model
     * @custom:event Emits LoanAssetConfigUpdated
     * @custom:error LoanAssetNotListed is thrown when the asset is not a loan asset
     * @custom:error ZeroAddressNotAllowed is thrown when the model is zero
     * @custom:error DuplicateInterestRateModel is thrown when the asset already has the model
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function addInterestRateModel(address asset, address interestRateModel) external;

    /**
     * @notice Sets a bond asset's factor, which multiplies a tier's minimum bond for a bond in the asset: above 1e18
     *   so a volatile asset such as XVS covers more than a stablecoin, or below it for a safer one. Zero disables the
     *   asset: new pools cannot bond in it, and live pools bonded in it cannot make requests, change their risk
     *   parameters or withdraw bond excess until it is set again. Their markets keep working
     * @param asset The bond asset
     * @param factor The factor, scaled by 1e18
     * @custom:event Emits BondAssetFactorUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setBondAssetFactor(address asset, uint256 factor) external;

    /**
     * @notice Sets the comptroller parameters of new pools, read when a pool's VIP is built
     * @param params The new parameters
     * @custom:event Emits PoolParamsUpdated
     * @custom:error InvalidPoolParams is thrown when the parameters are out of bounds
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setPoolParams(PoolParams calldata params) external;

    /**
     * @notice Sets Venus's parameters of new markets, read when a VIP is built
     * @param params The new parameters
     * @custom:event Emits MarketParamsUpdated
     * @custom:error InvalidProtocolMarketParams is thrown when the interest rate model or reduce reserves block delta
     *   is zero, or the reserve factor is above 1e18
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMarketParams(ProtocolMarketParams calldata params) external;

    /**
     * @notice Sets the oracle configs every new collateral asset gets, read when a VIP is built
     * @param params The new configs; the DeviationBoundedOracle checks its own when the VIP runs
     * @custom:event Emits OracleParamsUpdated
     * @custom:error InvalidOracleParams is thrown when the bound deviation is zero, or 1e18 or above
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setOracleParams(OracleParams calldata params) external;

    /**
     * @notice Returns a bond asset's factor
     * @param asset The bond asset
     * @return The factor, scaled by 1e18; zero when the asset is disabled
     */
    function bondAssetFactors(address asset) external view returns (uint256);

    /**
     * @notice Returns the comptroller parameters of new pools
     * @return closeFactor The close factor
     * @return liquidationIncentive The liquidation incentive
     * @return minLiquidatableCollateral The minimum liquidatable collateral, in USD
     */
    function poolParams()
        external
        view
        returns (uint256 closeFactor, uint256 liquidationIncentive, uint256 minLiquidatableCollateral);

    /**
     * @notice Returns Venus's parameters of new markets
     * @return collateralInterestRateModel The interest rate model of collateral markets
     * @return reserveFactor The reserve factor
     * @return reduceReservesBlockDelta The blocks between reserve reductions
     */
    function marketParams()
        external
        view
        returns (address collateralInterestRateModel, uint256 reserveFactor, uint256 reduceReservesBlockDelta);

    /**
     * @notice Returns the oracle configs every new collateral asset gets
     * @return deviationBoundedOracleEnabled Whether the VIP sets the DeviationBoundedOracle config
     * @return cooldownPeriod The DeviationBoundedOracle cooldown, in seconds
     * @return triggerThreshold The DeviationBoundedOracle trigger threshold, scaled by 1e18
     * @return resetThreshold The DeviationBoundedOracle reset threshold, scaled by 1e18
     * @return boundDeviation The BoundValidator deviation, scaled by 1e18
     */
    function oracleParams()
        external
        view
        returns (
            bool deviationBoundedOracleEnabled,
            uint64 cooldownPeriod,
            uint256 triggerThreshold,
            uint256 resetThreshold,
            uint256 boundDeviation
        );

    /**
     * @notice Returns the USD bond a tier requires for a bond in an asset: the tier's minimum bond times the asset's
     *   factor
     * @param tierId The tier
     * @param bondAsset The bond asset
     * @return The required bond, in USD scaled by 1e18
     * @custom:error BondAssetNotAllowed is thrown when the asset has no factor
     */
    function getRequiredBondUsd(uint256 tierId, address bondAsset) external view returns (uint256);

    /**
     * @notice Returns a tier
     * @param tierId The tier
     * @return The tier; all zero when not set
     */
    function getTier(uint256 tierId) external view returns (Tier memory);

    /**
     * @notice Returns the ids of the tiers set, enabled or not
     * @return The tier ids, in the order first set
     */
    function getTierIds() external view returns (uint256[] memory);

    /**
     * @notice Returns the bond assets, those with a nonzero factor
     * @return The bond assets, in no set order
     */
    function getBondAssets() external view returns (address[] memory);

    /**
     * @notice Returns the loan assets, those with a nonzero factor
     * @return The loan assets, in no set order
     */
    function getLoanAssets() external view returns (address[] memory);

    /**
     * @notice Returns a loan asset's config
     * @param asset The loan asset
     * @return The config; all zero when the asset is not a loan asset
     */
    function getLoanAssetConfig(address asset) external view returns (LoanAssetConfig memory);

    /**
     * @notice Returns the USD supply cap a tier gives a loan market of an asset: the tier's loan supply cap times the
     *   asset's factor
     * @param tierId The tier
     * @param asset The loan asset
     * @return The cap, in USD scaled by 1e18; zero when the asset is not a loan asset
     */
    function getLoanSupplyCapUsd(uint256 tierId, address asset) external view returns (uint256);

    /**
     * @notice Returns whether a new loan market of an asset may use an interest rate model
     * @param asset The loan asset
     * @param interestRateModel The interest rate model
     * @return Whether the model is one of the asset's
     */
    function isAllowedInterestRateModel(address asset, address interestRateModel) external view returns (bool);

    /**
     * @notice Returns whether a tier is an upgrade of a pool's tier
     * @param fromTierId The pool's tier
     * @param toTierId The new tier
     * @return Whether the new tier is enabled, requires a higher minimum bond, and has max limits and a loan supply cap
     *   at least as high
     */
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool);
}

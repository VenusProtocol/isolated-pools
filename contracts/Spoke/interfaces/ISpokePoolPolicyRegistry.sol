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
    }

    /// @notice A loan asset a tier offers
    struct LoanAsset {
        address asset;
        // In the asset's units; a loan market's borrow cap and Hub resource cap are set to it too
        uint256 supplyCap;
        // The models a new loan market of the asset may pick from; a live market keeps its own
        address[] interestRateModels;
    }

    /// @notice A tier's bond requirement, pool limits and loan assets
    struct Tier {
        // False stops new pool requests on the tier and upgrades to it; its live pools keep working
        bool enabled;
        // The bond required before the bond asset's factor, in USD scaled by 1e18
        uint256 minTierBondUsd;
        PoolLimits limits;
        // The loan assets its pools may list; new loan markets get these caps, as do a live pool's loan markets when
        // it moves to the tier
        LoanAsset[] loanAssets;
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
        // A new collateral asset's oracle configs: its feeds' staleness limit, in seconds, set unless the
        // ResilientOracle prices the asset already, and its DeviationBoundedOracle config, set unless that oracle has
        // the asset already
        uint256 maxStalePeriod;
        uint64 cooldownPeriod;
        uint256 triggerThreshold;
        uint256 resetThreshold;
        // The most the main or fallback price may deviate from the price it is checked against, scaled by 1e18, set on
        // the BoundValidator when a pivot feed is set, as a fallback feed needs one; 0.05e18 is 5%
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
     * @notice Emitted when a tier is set
     * @param tierId The tier
     * @param oldTier The previous tier
     * @param newTier The new tier
     */
    event TierUpdated(uint256 indexed tierId, Tier oldTier, Tier newTier);

    /**
     * @notice Thrown when a bond asset has no factor, so new pool requests may not use it
     * @param asset The bond asset
     */
    error BondAssetNotAllowed(address asset);

    /// @notice Thrown when pool parameters are outside the bounds the comptroller accepts
    error InvalidPoolParams();

    /**
     * @notice Thrown when Venus's market parameters have a zero model, block delta, staleness limit or bound deviation,
     *   a reserve factor above 1e18, or a bound deviation of 1e18 or above
     */
    error InvalidProtocolMarketParams();

    /**
     * @notice Thrown when a tier's values are zero or inconsistent
     * @param tierId The tier
     */
    error InvalidTier(uint256 tierId);

    /**
     * @notice Thrown when a tier's loan asset has a zero supply cap or no interest rate model
     * @param tierId The tier
     * @param asset The loan asset
     */
    error InvalidLoanAsset(uint256 tierId, address asset);

    /**
     * @notice Thrown when a tier lists a loan asset twice
     * @param tierId The tier
     * @param asset The loan asset
     */
    error DuplicateLoanAsset(uint256 tierId, address asset);

    /**
     * @notice Sets a tier. Its pools' later deployer changes are checked against it; their live values stay as they are
     * @param tierId The tier
     * @param tier The tier; disable it with `enabled`, never with zero values
     * @custom:event Emits TierUpdated
     * @custom:error InvalidTier is thrown when the minimum bond or minimum coverage ratio is zero, the coverage ratio
     *   or maximum liquidation threshold is above 100%, or the maximum collateral factor is above the threshold
     * @custom:error ZeroAddressNotAllowed is thrown when a loan asset or one of its interest rate models is zero
     * @custom:error InvalidLoanAsset is thrown when a loan asset has a zero supply cap or no interest rate model
     * @custom:error DuplicateLoanAsset is thrown when a loan asset is listed twice
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setTier(uint256 tierId, Tier calldata tier) external;

    /**
     * @notice Sets a bond asset's factor, which multiplies a tier's minimum bond for a bond in the asset: above 1e18
     *   so a volatile asset such as XVS covers more than a stablecoin, or below it for a safer one. Zero stops new pool
     *   requests from using the asset; live pools keep working
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
     * @notice Sets Venus's parameters of new markets, read when a VIP is built; the staleness limit is also read when
     *   an unpriced collateral asset is priced, at request, `setOracleFeeds` and build
     * @param params The new parameters; the DeviationBoundedOracle checks its config when the VIP runs
     * @custom:event Emits MarketParamsUpdated
     * @custom:error InvalidProtocolMarketParams is thrown when the interest rate model, reduce reserves block delta,
     *   staleness limit or bound deviation is zero, the reserve factor is above 1e18, or the bound deviation is 1e18 or
     *   above
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setMarketParams(ProtocolMarketParams calldata params) external;

    /**
     * @notice Returns a bond asset's factor
     * @param asset The bond asset
     * @return The factor, scaled by 1e18; zero when new pool requests may not use the asset
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
     * @return maxStalePeriod The staleness limit of a new collateral asset's feeds, in seconds
     * @return cooldownPeriod The DeviationBoundedOracle cooldown of a new collateral asset, in seconds
     * @return triggerThreshold Its DeviationBoundedOracle trigger threshold, scaled by 1e18
     * @return resetThreshold Its DeviationBoundedOracle reset threshold, scaled by 1e18
     * @return boundDeviation Its BoundValidator deviation, scaled by 1e18
     */
    function marketParams()
        external
        view
        returns (
            address collateralInterestRateModel,
            uint256 reserveFactor,
            uint256 reduceReservesBlockDelta,
            uint256 maxStalePeriod,
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
     * @notice Returns a tier's terms without its loan assets
     * @param tierId The tier
     * @return enabled Whether the tier takes new pool requests and upgrades
     * @return minTierBondUsd The bond required before the bond asset's factor, in USD scaled by 1e18
     * @return limits The tier's pool limits
     */
    function getTierTerms(
        uint256 tierId
    ) external view returns (bool enabled, uint256 minTierBondUsd, PoolLimits memory limits);

    /**
     * @notice Returns the supply cap a tier gives its pools' loan markets of an asset
     * @param tierId The tier
     * @param asset The loan asset
     * @return The supply cap, in the asset's units; zero when the tier does not offer the asset
     */
    function getLoanSupplyCap(uint256 tierId, address asset) external view returns (uint256);

    /**
     * @notice Returns whether a tier lets a new loan market of an asset use an interest rate model
     * @param tierId The tier
     * @param asset The loan asset
     * @param interestRateModel The interest rate model
     * @return Whether the tier offers the asset with that model
     */
    function isAllowedInterestRateModel(
        uint256 tierId,
        address asset,
        address interestRateModel
    ) external view returns (bool);

    /**
     * @notice Returns whether a tier is an upgrade of a pool's tier
     * @param fromTierId The pool's tier
     * @param toTierId The new tier
     * @return Whether the new tier is enabled, requires a higher minimum bond, has max limits at least as loose and
     *   offers each of the pool tier's loan assets at a supply cap at least as high
     */
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ITierRegistry
 * @author Venus
 * @notice Functions, events and errors of `TierRegistry`
 */
interface ITierRegistry {
    /// @notice A tier's limits on its pools; mantissas are scaled by 1e18
    struct PoolLimits {
        // Below this bond value to required bond ratio, the deployer's risk setters revert
        uint256 minCoverageRatio;
        uint256 maxCollateralFactor;
        uint256 maxLiquidationThreshold;
        uint256 maxCollateralMarkets;
        // Per collateral market
        uint256 maxCollateralSupplyCapUsd;
    }

    /// @notice A loan asset a tier offers
    struct LoanAsset {
        address asset;
        // In the asset's units; a loan market's borrow cap and Hub resource cap equal it
        uint256 supplyCap;
        // The models a new loan market of the asset may pick from; a live market keeps its own
        address[] interestRateModels;
    }

    /// @notice A tier's bond requirement, pool limits and loan assets
    struct Tier {
        // False stops new requests only; live pools keep working
        bool enabled;
        // The bond required before the bond asset's factor, in USD scaled by 1e18
        uint256 minBondUsd;
        PoolLimits limits;
        // A live pool's loan markets get these caps when it moves to the tier
        LoanAsset[] loanAssets;
    }

    /**
     * @notice Emitted when a tier is set
     * @param tierId The tier
     * @param oldTier The previous tier
     * @param newTier The new tier
     */
    event TierUpdated(uint256 indexed tierId, Tier oldTier, Tier newTier);

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
     * @custom:error InvalidTier is thrown when the minimum bond or minimum coverage ratio is zero, the maximum
     *   liquidation threshold is above 100% or the maximum collateral factor is above it
     * @custom:error ZeroAddressNotAllowed is thrown when a loan asset or one of its interest rate models is zero
     * @custom:error InvalidLoanAsset is thrown when a loan asset has a zero supply cap or no interest rate model
     * @custom:error DuplicateLoanAsset is thrown when a loan asset is listed twice
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setTier(uint256 tierId, Tier calldata tier) external;

    /**
     * @notice Returns a tier
     * @param tierId The tier
     * @return The tier; all zero when not set
     */
    function getTier(uint256 tierId) external view returns (Tier memory);

    /**
     * @notice Returns whether a tier is an upgrade of a pool's tier
     * @param fromTierId The pool's tier
     * @param toTierId The new tier
     * @return Whether the new tier is enabled, requires a higher minimum bond, has max limits at least as loose and
     *   offers each of the pool tier's loan assets at a supply cap at least as high
     */
    function isUpgrade(uint256 fromTierId, uint256 toTierId) external view returns (bool);

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
     * @notice Returns the supply cap a tier gives its pools' loan markets of an asset
     * @param tierId The tier
     * @param asset The loan asset
     * @return The supply cap, in the asset's units; zero when the tier does not offer the asset
     */
    function getLoanSupplyCap(uint256 tierId, address asset) external view returns (uint256);
}

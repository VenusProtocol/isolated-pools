// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IResilientOracle
 * @author Venus
 * @notice The ResilientOracle functions `SpokePoolManager` and its proposal builder read: whether an asset is priced
 * already, and the BoundValidator a new asset's prices are checked with. The builder also encodes its `setTokenConfig`
 * actions with `TokenConfig`
 */
interface IResilientOracle {
    /// @notice An asset's oracles, in the order main, pivot, fallback
    struct TokenConfig {
        address asset;
        address[3] oracles;
        bool[3] enableFlagsForOracles;
        bool cachingEnabled;
    }

    /**
     * @notice Returns an asset's config
     * @param asset The asset
     * @return The config; its asset is zero when the asset is not configured
     */
    function getTokenConfig(address asset) external view returns (TokenConfig memory);

    /**
     * @notice Returns the BoundValidator that checks the main and fallback prices against the pivot, and each other
     * @return The BoundValidator
     */
    function boundValidator() external view returns (address);
}

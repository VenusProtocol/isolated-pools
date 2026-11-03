// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IResilientOracle
 * @author Venus
 * @notice The ResilientOracle functions `SpokePoolManager` and its proposal builder read: whether an asset is priced
 * already, and its price. The builder also encodes its `setTokenConfigs` actions with `TokenConfig`
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
     * @notice Returns an asset's USD price
     * @param asset The asset
     * @return The price, scaled by 1e36 divided by the asset's decimals
     */
    function getPrice(address asset) external view returns (uint256);
}

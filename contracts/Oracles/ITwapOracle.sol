// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

/**
 * @title ITwapOracle
 * @author Venus
 * @notice Time-weighted average prices (TWAP) of the ResilientOracle's prices
 */
interface ITwapOracle {
    /// @notice An asset's config and its latest update; periods and times are in seconds
    struct TokenConfig {
        // Zero until the asset is configured
        address asset;
        bool enabled;
        uint256 period;
        uint256 updateInterval;
        uint256 lastUpdatedAt;
        uint256 lastPrice;
        uint256 cumulativePrice;
    }

    /// @notice An update's time, the running total of price × seconds up to it, and the price it recorded
    struct Checkpoint {
        uint256 timestamp;
        uint256 cumulativePrice;
        uint256 price;
    }

    /// @notice Emitted when an asset is configured
    event TokenConfigAdded(address indexed asset, uint256 period, uint256 updateInterval);

    /// @notice Emitted when a configured asset's period and update interval change
    event AssetParamsUpdated(
        address indexed asset,
        uint256 oldPeriod,
        uint256 newPeriod,
        uint256 oldUpdateInterval,
        uint256 newUpdateInterval
    );

    /// @notice Emitted when an asset is enabled or disabled
    event TokenEnabledUpdated(address indexed asset, bool enabled);

    /// @notice Emitted when an asset's price is updated
    event PriceUpdated(address indexed asset, uint256 price, uint256 cumulativePrice);

    /// @notice Thrown when an asset is not enabled
    error AssetNotEnabled(address asset);

    /// @notice Thrown when an asset has no config
    error AssetNotConfigured(address asset);

    /// @notice Thrown when configuring an asset that already has a config
    error AssetAlreadyConfigured(address asset);

    /// @notice Thrown when the update interval is zero or longer than the period, which also refuses a zero period
    error InvalidTokenConfig(address asset);

    /// @notice Thrown when an asset's history does not reach back one period
    error InsufficientHistory(address asset);

    /**
     * @notice Configures a new asset, disabled; `setAssetParams` changes it later. An asset is never removed:
     *   `setTokenEnabled` turns it off
     * @param asset The asset
     * @param period The TWAP window
     * @param updateInterval How often the price is updated, at most the period
     * @custom:event Emits TokenConfigAdded
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:error AssetAlreadyConfigured is thrown when the asset already has a config
     * @custom:error InvalidTokenConfig is thrown when the update interval is zero or longer than the period
     * @custom:access Controlled by AccessControlManager
     */
    function setTokenConfig(address asset, uint256 period, uint256 updateInterval) external;

    /**
     * @notice Changes a configured asset's period and update interval, keeping its history and enabled flag. A period
     *   longer than the history makes `getPrice` revert until the history covers it
     * @param asset The asset
     * @param period The new TWAP window
     * @param updateInterval How often the price is updated, at most the period
     * @custom:event Emits AssetParamsUpdated
     * @custom:error AssetNotConfigured is thrown when the asset has no config
     * @custom:error InvalidTokenConfig is thrown when the update interval is zero or longer than the period
     * @custom:access Controlled by AccessControlManager
     */
    function setAssetParams(address asset, uint256 period, uint256 updateInterval) external;

    /**
     * @notice Enables or disables `getPrice` for a configured asset; price updates continue either way
     * @param asset The asset
     * @param enabled Whether `getPrice` is allowed for the asset
     * @custom:event Emits TokenEnabledUpdated when the flag changes
     * @custom:error AssetNotConfigured is thrown when the asset has no config
     * @custom:access Controlled by AccessControlManager
     */
    function setTokenEnabled(address asset, bool enabled) external;

    /**
     * @notice Updates a configured asset's price from the ResilientOracle; a second call in the same interval slot
     *   does nothing
     * @dev Meant for a keeper to call once every update interval; anyone can call it
     * @param asset The asset
     * @custom:event Emits PriceUpdated when it records a price
     * @custom:error AssetNotConfigured is thrown when the asset has no config
     * @custom:error The ResilientOracle's errors, such as when it cannot price the asset
     * @custom:access Not restricted
     */
    function updatePrice(address asset) external;

    /**
     * @notice Returns the oracle the prices are read from
     * @return The ResilientOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RESILIENT_ORACLE() external view returns (ResilientOracleInterface);

    /**
     * @notice Returns an asset's TWAP over its period, scaled like the ResilientOracle's prices
     * @param asset The asset
     * @return The TWAP
     * @custom:error AssetNotEnabled is thrown when the asset is not enabled
     * @custom:error InsufficientHistory is thrown when the asset's history does not reach back one period
     */
    function getPrice(address asset) external view returns (uint256);

    /**
     * @notice Returns whether `getPrice` succeeds for an asset now
     * @param asset The asset
     * @return Whether the asset is enabled and its history reaches back one period
     */
    function isPriceAvailable(address asset) external view returns (bool);

    /**
     * @notice Returns every configured asset, enabled or not, for the keeper to update
     * @return The assets, in the order they were added
     */
    function getAllAssets() external view returns (address[] memory);

    /**
     * @notice Returns an asset's config and latest update
     * @param asset The asset
     * @return asset_ The asset, zero until it is configured
     * @return enabled Whether `getPrice` is allowed for the asset
     * @return period The TWAP window
     * @return updateInterval How often the price is updated
     * @return lastUpdatedAt When the price was last updated
     * @return lastPrice The price from the last update
     * @return cumulativePrice The running total of price × seconds up to the last update
     */
    function tokenConfigs(
        address asset
    )
        external
        view
        returns (
            address asset_,
            bool enabled,
            uint256 period,
            uint256 updateInterval,
            uint256 lastUpdatedAt,
            uint256 lastPrice,
            uint256 cumulativePrice
        );
}

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
        bool enabled;
        uint256 period;
        uint256 updateInterval;
        uint256 maxWindowStartGap;
        uint256 lastConfiguredAt;
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

    /// @notice Emitted when an asset's config is set; this restarts its history
    event TokenConfigUpdated(address indexed asset, uint256 period, uint256 updateInterval, uint256 maxWindowStartGap);

    /// @notice Emitted when an asset is enabled or disabled
    event TokenEnabledUpdated(address indexed asset, bool enabled);

    /// @notice Emitted when an asset's price is updated
    event PriceUpdated(address indexed asset, uint256 price, uint256 cumulativePrice);

    /// @notice Thrown when an asset is not enabled
    error AssetNotEnabled(address asset);

    /// @notice Thrown when an asset has no config
    error AssetNotConfigured(address asset);

    /// @notice Thrown when the update interval is zero, or `maxWindowStartGap` is below it or above the period
    error InvalidTokenConfig(address asset);

    /// @notice Thrown when there is no checkpoint at most `maxWindowStartGap` before the start of the window
    error InsufficientHistory(address asset);

    /**
     * @notice Sets an asset's config and restarts its history; the enabled flag is kept
     * @param asset The asset
     * @param period The TWAP window; zero removes the asset and disables it
     * @param updateInterval How often the price is updated
     * @param maxWindowStartGap The most the last checkpoint may precede the window start, so updates missed there still
     *   give a TWAP: at least `updateInterval`, and twice it tolerates one missed update
     * @custom:access Controlled by AccessControlManager
     */
    function setTokenConfig(address asset, uint256 period, uint256 updateInterval, uint256 maxWindowStartGap) external;

    /**
     * @notice Enables or disables `getPrice` for an asset; price updates continue either way
     * @param asset The asset
     * @param enabled Whether `getPrice` is allowed for the asset
     * @custom:access Controlled by AccessControlManager
     */
    function setTokenEnabled(address asset, bool enabled) external;

    /**
     * @notice Updates a configured asset's price from the ResilientOracle; a second call in the same interval slot
     *   does nothing
     * @dev Meant for a keeper to call once every update interval; anyone can call it
     * @param asset The asset
     */
    function updatePrice(address asset) external;

    /**
     * @notice Returns the oracle the prices are read from
     * @return The ResilientOracle
     */
    function RESILIENT_ORACLE() external view returns (ResilientOracleInterface);

    /**
     * @notice Returns an asset's TWAP over its period, scaled like the ResilientOracle's prices
     * @param asset The asset
     * @return The TWAP
     */
    function getPrice(address asset) external view returns (uint256);

    /**
     * @notice Returns whether `getPrice` succeeds for an asset now
     * @param asset The asset
     * @return Whether the asset is enabled and has a checkpoint at most `maxWindowStartGap` before its window start
     */
    function isPriceAvailable(address asset) external view returns (bool);

    /**
     * @notice Returns an asset's config and latest update
     * @param asset The asset
     * @return enabled Whether `getPrice` is allowed for the asset
     * @return period The TWAP window
     * @return updateInterval How often the price is updated
     * @return maxWindowStartGap The most the last checkpoint may precede the window start
     * @return lastConfiguredAt When the config was last set
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
            bool enabled,
            uint256 period,
            uint256 updateInterval,
            uint256 maxWindowStartGap,
            uint256 lastConfiguredAt,
            uint256 lastUpdatedAt,
            uint256 lastPrice,
            uint256 cumulativePrice
        );
}

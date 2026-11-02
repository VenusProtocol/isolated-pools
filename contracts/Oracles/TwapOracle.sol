// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ITwapOracle } from "./ITwapOracle.sol";

/**
 * @title TwapOracle
 * @author Venus
 * @notice Time-weighted average prices (TWAP) of the ResilientOracle's prices over exactly the period. Between
 * updates the last price applies, so the running total at the window start follows from the last checkpoint before it
 * @dev A keeper calls `updatePrice` for each asset once every update interval to record its price. Anyone can call
 * it. A missed update counts at the last price, however long the gap; `getPrice` reverts only while the history is
 * shorter than the period
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract TwapOracle is AccessControlledV8, ITwapOracle {
    /// @inheritdoc ITwapOracle
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ITwapOracle
    mapping(address asset => TokenConfig config) public tokenConfigs;

    /// @dev Each asset's checkpoints, oldest first
    mapping(address asset => Checkpoint[] history) internal checkpoints;

    /// @dev Every configured asset, in the order they were added
    address[] internal allAssets;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;

    /// @param resilientOracle The oracle the prices are read from
    constructor(ResilientOracleInterface resilientOracle) {
        ensureNonzeroAddress(address(resilientOracle));
        RESILIENT_ORACLE = resilientOracle;
        _disableInitializers();
    }

    /**
     * @notice Initializes the oracle
     * @param accessControlManager_ The AccessControlManager
     */
    function initialize(address accessControlManager_) external initializer {
        __AccessControlled_init(accessControlManager_);
    }

    /// @inheritdoc ITwapOracle
    function setTokenConfig(address asset, uint256 period, uint256 updateInterval) external {
        _checkAccessAllowed("setTokenConfig(address,uint256,uint256)");
        ensureNonzeroAddress(asset);
        TokenConfig storage config = tokenConfigs[asset];
        if (config.asset != address(0)) {
            revert AssetAlreadyConfigured(asset);
        }
        // A zero period is refused too, as any update interval is then zero or longer than it
        if (updateInterval == 0 || updateInterval > period) {
            revert InvalidTokenConfig(asset);
        }

        config.asset = asset;
        config.period = period;
        config.updateInterval = updateInterval;
        allAssets.push(asset);
        emit TokenConfigAdded(asset, period, updateInterval);
    }

    /// @inheritdoc ITwapOracle
    function setAssetParams(address asset, uint256 period, uint256 updateInterval) external {
        _checkAccessAllowed("setAssetParams(address,uint256,uint256)");
        TokenConfig storage config = _ensureConfigured(asset);
        if (updateInterval == 0 || updateInterval > period) {
            revert InvalidTokenConfig(asset);
        }

        emit AssetParamsUpdated(asset, config.period, period, config.updateInterval, updateInterval);
        config.period = period;
        config.updateInterval = updateInterval;
    }

    /// @inheritdoc ITwapOracle
    function setTokenEnabled(address asset, bool enabled) external {
        _checkAccessAllowed("setTokenEnabled(address,bool)");
        TokenConfig storage config = _ensureConfigured(asset);
        if (config.enabled == enabled) {
            return;
        }

        config.enabled = enabled;
        emit TokenEnabledUpdated(asset, enabled);
    }

    /// @inheritdoc ITwapOracle
    function updatePrice(address asset) external {
        TokenConfig storage config = _ensureConfigured(asset);
        uint256 currentIntervalSlot = block.timestamp / config.updateInterval;
        uint256 lastIntervalSlot = config.lastUpdatedAt / config.updateInterval;
        // Skip the update in the same interval slot
        if (config.lastUpdatedAt != 0 && lastIntervalSlot == currentIntervalSlot) {
            return;
        }

        // The time since the last update counts at the last price; the new price counts from now on
        uint256 cumulativePrice = config.cumulativePrice + config.lastPrice * (block.timestamp - config.lastUpdatedAt);

        uint256 price = RESILIENT_ORACLE.getPrice(asset);
        config.lastUpdatedAt = block.timestamp;
        config.lastPrice = price;
        config.cumulativePrice = cumulativePrice;
        checkpoints[asset].push(Checkpoint(block.timestamp, cumulativePrice, price));

        emit PriceUpdated(asset, price, cumulativePrice);
    }

    /// @inheritdoc ITwapOracle
    function getPrice(address asset) external view returns (uint256) {
        TokenConfig storage config = tokenConfigs[asset];
        if (!config.enabled) {
            revert AssetNotEnabled(asset);
        }
        (bool hasStartCheckpoint, uint256 startCumulativePrice) = _cumulativePriceAtWindowStart(asset, config);
        if (!hasStartCheckpoint) {
            revert InsufficientHistory(asset);
        }

        uint256 cumulativePrice = config.cumulativePrice + config.lastPrice * (block.timestamp - config.lastUpdatedAt);
        return (cumulativePrice - startCumulativePrice) / config.period;
    }

    /// @inheritdoc ITwapOracle
    function getAllAssets() external view returns (address[] memory) {
        return allAssets;
    }

    /// @inheritdoc ITwapOracle
    function isPriceAvailable(address asset) external view returns (bool) {
        TokenConfig storage config = tokenConfigs[asset];
        if (!config.enabled) {
            return false;
        }
        (bool hasStartCheckpoint, ) = _cumulativePriceAtWindowStart(asset, config);
        return hasStartCheckpoint;
    }

    /// @dev Returns an asset's config, reverting unless the asset is configured
    function _ensureConfigured(address asset) private view returns (TokenConfig storage config) {
        config = tokenConfigs[asset];
        if (config.asset == address(0)) {
            revert AssetNotConfigured(asset);
        }
    }

    /**
     * @dev Returns the running total at the window start, from the last checkpoint at or before it at that checkpoint's
     *   price; `hasStartCheckpoint` is false when the history starts after the window start
     */
    function _cumulativePriceAtWindowStart(
        address asset,
        TokenConfig storage config
    ) private view returns (bool hasStartCheckpoint, uint256 cumulativePrice) {
        Checkpoint[] storage history = checkpoints[asset];
        uint256 windowStart = block.timestamp - config.period;

        // Binary search for the first checkpoint after the window start; the one before it is where the window starts
        uint256 low;
        uint256 high = history.length;
        while (low < high) {
            uint256 middle = (low + high) / 2;
            if (history[middle].timestamp <= windowStart) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        if (low == 0) {
            return (false, 0);
        }

        // Its price holds from the checkpoint until the window start
        Checkpoint storage start = history[low - 1];
        return (true, start.cumulativePrice + start.price * (windowStart - start.timestamp));
    }
}

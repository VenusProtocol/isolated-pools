// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ITwapOracle } from "./ITwapOracle.sol";

/**
 * @title TwapOracle
 * @author Venus
 * @notice Time-weighted average prices (TWAP) of the ResilientOracle's prices. Between updates the last price
 * applies. A TWAP is available once there is a checkpoint at the start of the window
 * @dev A keeper calls `updatePrice` for each asset once every update interval to record its price. Anyone can call
 * it. When an interval is missed, `getPrice` reverts once the window starts in that interval, until the window moves
 * past it
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract TwapOracle is AccessControlledV8, ITwapOracle {
    /// @inheritdoc ITwapOracle
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @inheritdoc ITwapOracle
    mapping(address asset => TokenConfig config) public tokenConfigs;

    /// @dev Each asset's checkpoints, by interval slot (`timestamp / updateInterval`)
    mapping(address asset => mapping(uint256 intervalSlot => Checkpoint checkpoint)) internal checkpoints;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[48] private __gap;

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
        if (period != 0 && (updateInterval == 0 || period % updateInterval != 0)) {
            revert InvalidTokenConfig(asset);
        }

        // Removing an asset (zero period) also disables it
        bool enabled = period != 0 && tokenConfigs[asset].enabled;
        tokenConfigs[asset] = TokenConfig(enabled, period, updateInterval, block.timestamp, 0, 0, 0);
        emit TokenConfigUpdated(asset, period, updateInterval);
    }

    /// @inheritdoc ITwapOracle
    function setTokenEnabled(address asset, bool enabled) external {
        _checkAccessAllowed("setTokenEnabled(address,bool)");
        if (enabled && tokenConfigs[asset].period == 0) {
            revert AssetNotConfigured(asset);
        }

        tokenConfigs[asset].enabled = enabled;
        emit TokenEnabledUpdated(asset, enabled);
    }

    /// @inheritdoc ITwapOracle
    function updatePrice(address asset) external {
        TokenConfig storage config = tokenConfigs[asset];
        if (config.period == 0) {
            revert AssetNotConfigured(asset);
        }
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
        checkpoints[asset][currentIntervalSlot] = Checkpoint(block.timestamp, cumulativePrice);

        emit PriceUpdated(asset, price, cumulativePrice);
    }

    /// @inheritdoc ITwapOracle
    function getPrice(address asset) external view returns (uint256) {
        TokenConfig storage config = tokenConfigs[asset];
        if (!config.enabled) {
            revert AssetNotEnabled(asset);
        }
        Checkpoint memory start = _windowStart(asset, config);
        if (start.timestamp == 0) {
            revert InsufficientHistory(asset);
        }

        uint256 cumulativePrice = config.cumulativePrice + config.lastPrice * (block.timestamp - config.lastUpdatedAt);
        return (cumulativePrice - start.cumulativePrice) / (block.timestamp - start.timestamp);
    }

    /// @inheritdoc ITwapOracle
    function isPriceAvailable(address asset) external view returns (bool) {
        TokenConfig storage config = tokenConfigs[asset];
        return config.enabled && _windowStart(asset, config).timestamp != 0;
    }

    /**
     * @dev Returns the checkpoint in the interval slot where the window starts, or one with a zero timestamp when it
     *   is missing or not after the last config (a checkpoint in the same second may be from the old history)
     */
    function _windowStart(address asset, TokenConfig storage config) private view returns (Checkpoint memory start) {
        uint256 startIntervalSlot = (block.timestamp - config.period) / config.updateInterval;
        start = checkpoints[asset][startIntervalSlot];
        if (start.timestamp <= config.lastConfiguredAt) {
            start.timestamp = 0;
        }
    }
}

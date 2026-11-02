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
 * it. A missed update counts at the last price; `getPrice` reverts only when the last checkpoint before the window
 * start is more than `maxWindowStartGap` older than it
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
    function setTokenConfig(address asset, uint256 period, uint256 updateInterval, uint256 maxWindowStartGap) external {
        _checkAccessAllowed("setTokenConfig(address,uint256,uint256,uint256)");
        ensureNonzeroAddress(asset);
        if (period != 0 && (updateInterval == 0 || maxWindowStartGap < updateInterval || maxWindowStartGap > period)) {
            revert InvalidTokenConfig(asset);
        }

        // Removing an asset (zero period) also disables it
        bool enabled = period != 0 && tokenConfigs[asset].enabled;
        tokenConfigs[asset] = TokenConfig(enabled, period, updateInterval, maxWindowStartGap, block.timestamp, 0, 0, 0);
        emit TokenConfigUpdated(asset, period, updateInterval, maxWindowStartGap);
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
        checkpoints[asset][currentIntervalSlot] = Checkpoint(block.timestamp, cumulativePrice, price);

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
    function isPriceAvailable(address asset) external view returns (bool) {
        TokenConfig storage config = tokenConfigs[asset];
        if (!config.enabled) {
            return false;
        }
        (bool hasStartCheckpoint, ) = _cumulativePriceAtWindowStart(asset, config);
        return hasStartCheckpoint;
    }

    /**
     * @dev Returns the running total at the window start, from the last checkpoint at or before it at that checkpoint's
     *   price; `hasStartCheckpoint` is false when that checkpoint is more than `maxWindowStartGap` before the start.
     *   It walks back one interval slot at a time, skipping checkpoints from before the last config (one in the same
     *   second may be from the old history)
     */
    function _cumulativePriceAtWindowStart(
        address asset,
        TokenConfig storage config
    ) private view returns (bool hasStartCheckpoint, uint256 cumulativePrice) {
        uint256 windowStart = block.timestamp - config.period;
        uint256 earliestCheckpointAt = windowStart - config.maxWindowStartGap;

        // Walk back from the window start's interval slot; the first usable checkpoint is the last one before the start
        uint256 startIntervalSlot = windowStart / config.updateInterval;
        uint256 earliestIntervalSlot = earliestCheckpointAt / config.updateInterval;
        for (uint256 intervalSlot = startIntervalSlot; intervalSlot >= earliestIntervalSlot; --intervalSlot) {
            Checkpoint storage checkpoint = checkpoints[asset][intervalSlot];
            uint256 checkpointAt = checkpoint.timestamp;
            bool isInRange = checkpointAt >= earliestCheckpointAt && checkpointAt <= windowStart;
            // One taken in the same second as the config may be from the old history
            bool isSinceLastConfig = checkpointAt > config.lastConfiguredAt;
            if (isInRange && isSinceLastConfig) {
                // Its price holds from the checkpoint until the window start
                return (true, checkpoint.cumulativePrice + checkpoint.price * (windowStart - checkpointAt));
            }
        }
    }
}

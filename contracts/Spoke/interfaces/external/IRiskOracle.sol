// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IRiskOracle
 * @author Venus
 * @notice The RiskOracle functions the open spoke pool contracts use: the manager publishes deployer updates, and the
 * validator reads the ones not applied yet
 */
interface IRiskOracle {
    /// @notice A published risk parameter update
    struct RiskParameterUpdate {
        string referenceId;
        uint256 updateId;
        address market;
        string updateType;
        bytes32 updateTypeKey;
        bytes newValue;
        bytes previousValue;
        uint256 timestamp;
        address publisher;
        uint96 poolId;
        uint32 destLzEid;
        bytes additionalData;
    }

    /**
     * @notice Publishes a new risk parameter update
     * @param referenceId An external reference ID associated with the update
     * @param newValue The new value of the risk parameter being updated
     * @param updateType Type of update performed, must be previously authorized
     * @param market Address for market of the parameter update
     * @param poolId Pool identifier for eMode-style collateral configuration (0 for regular markets)
     * @param dstEid Destination endpoint ID for cross-chain routing
     * @param additionalData Additional data for the update
     */
    function publishRiskParameterUpdate(
        string memory referenceId,
        bytes memory newValue,
        string memory updateType,
        address market,
        uint96 poolId,
        uint32 dstEid,
        bytes memory additionalData
    ) external;

    /**
     * @notice Gets the latest update ID for a specific market and update type (string) combination
     * @param updateType The update type string
     * @param market The market address
     * @return The latest update ID for the given market and update type, or 0 if none exists
     */
    function getLatestUpdateIdByTypeAndMarket(string memory updateType, address market) external view returns (uint256);

    /**
     * @notice Fetches the update for a provided updateId
     * @param updateId Update ID
     * @return The RiskParameterUpdate for the specified id
     */
    function getUpdateById(uint256 updateId) external view returns (RiskParameterUpdate memory);
}

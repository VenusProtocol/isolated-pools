// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IRiskOracle
 * @author Venus
 * @notice The RiskOracle function the open spoke pool manager publishes deployer updates through
 */
interface IRiskOracle {
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
}

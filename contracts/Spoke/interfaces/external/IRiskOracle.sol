// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IRiskOracle
 * @author Venus
 * @notice The RiskOracle functions `SpokePoolManager` uses: it publishes deployer updates and reads a market's latest
 * update of a type
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
     * @notice Publishes a risk parameter update
     * @param referenceId The publisher's own id for the update
     * @param newValue The new value
     * @param updateType The update type, which must be authorized
     * @param market The market
     * @param poolId The eMode pool the update is for; zero for a regular market
     * @param dstEid The LayerZero endpoint id the update is routed to, for a cross-chain update
     * @param additionalData Any extra data for the update
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
     * @notice Returns a market's latest update of a type
     * @param updateType The update type
     * @param market The market
     * @return The update ID; zero when there is none
     */
    function getLatestUpdateIdByTypeAndMarket(string memory updateType, address market) external view returns (uint256);

    /**
     * @notice Returns a published update
     * @param updateId The update ID
     * @return The update
     */
    function getUpdateById(uint256 updateId) external view returns (RiskParameterUpdate memory);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IRiskStewardReceiver
 * @author Venus
 * @notice The RiskStewardReceiver functions `SpokePoolManager` uses: it reads the updates not applied yet
 */
interface IRiskStewardReceiver {
    /// @notice Status of a published update in the receiver
    enum UpdateStatus {
        None,
        Pending,
        Executed,
        Rejected,
        Expired,
        SENT_TO_DESTINATION
    }

    /// @notice Registered update structure with timelock and execution information
    struct RegisteredUpdate {
        uint256 updateId;
        uint256 unlockTime;
        UpdateStatus status;
        address executor;
        uint256 executedAt;
    }

    /**
     * @notice Returns the RiskOracle the receiver reads updates from
     * @return The RiskOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RISK_ORACLE() external view returns (address);

    /**
     * @notice Returns a published update's registration in the receiver; an update never processed has status `None`
     * @param updateId The RiskOracle update ID
     * @return The registered update
     */
    function updates(uint256 updateId) external view returns (RegisteredUpdate memory);

    /**
     * @notice Returns the last registered update ID for a given update type and market
     * @param updateType The human-readable identifier of the update type
     * @param market The address of the market
     * @return The last registered update ID
     */
    function getLastRegisteredUpdate(string calldata updateType, address market) external view returns (uint256);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IGovernorBravo
 * @author Venus
 * @notice The GovernorBravo functions the manager proposes through
 */
interface IGovernorBravo {
    /**
     * @notice Submits a proposal
     * @param targets The contracts the timelock calls
     * @param values The native value of each call
     * @param signatures The function signature of each call
     * @param calldatas The ABI-encoded arguments of each call
     * @param description The proposal's description
     * @param proposalType The route: 0 Normal, 1 Fast-track, 2 Critical
     * @return The id of the proposal
     */
    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory description,
        uint8 proposalType
    ) external returns (uint256);

    /**
     * @notice Returns the state of a proposal
     * @param proposalId The id of the proposal
     * @return The `ProposalState`: 0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired,
     *   7 Executed
     */
    function state(uint256 proposalId) external view returns (uint8);

    /**
     * @notice Returns the timelock that executes the proposals of a route
     * @param proposalType The route: 0 Normal, 1 Fast-track, 2 Critical
     * @return The route's timelock
     */
    function proposalTimelocks(uint256 proposalType) external view returns (address);
}

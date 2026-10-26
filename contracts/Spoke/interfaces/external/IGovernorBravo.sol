// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/// @dev GovernorBravo `ProposalType.NORMAL`, the route open spoke pool proposals use
uint8 constant PROPOSAL_TYPE_NORMAL = 0;

/**
 * @title IGovernorBravo
 * @author Venus
 * @notice The GovernorBravo functions the proposal builder uses: it encodes `propose` calls and reads the Normal
 * route's timelock and the proposal action limit
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
     * @notice Returns the timelock that executes the proposals of a route
     * @param proposalType The route: 0 Normal, 1 Fast-track, 2 Critical
     * @return The route's timelock
     */
    function proposalTimelocks(uint256 proposalType) external view returns (address);

    /**
     * @notice Returns the most actions a proposal may have
     * @return The maximum
     */
    function proposalMaxOperations() external view returns (uint256);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/// @dev GovernorBravo `ProposalType.NORMAL`, the route open spoke pool proposals use
uint8 constant PROPOSAL_TYPE_NORMAL = 0;

/// @dev GovernorBravo `ProposalState.Canceled`
uint8 constant PROPOSAL_STATE_CANCELED = 2;

/// @dev GovernorBravo `ProposalState.Defeated`
uint8 constant PROPOSAL_STATE_DEFEATED = 3;

/// @dev GovernorBravo `ProposalState.Expired`
uint8 constant PROPOSAL_STATE_EXPIRED = 6;

/**
 * @title IGovernorBravo
 * @author Venus
 * @notice The GovernorBravo functions open spoke pools propose through and read proposal states from
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
     * @notice Returns the latest proposal an account submitted
     * @param proposer The account
     * @return The id of the proposal; zero if it never proposed
     */
    function latestProposalIds(address proposer) external view returns (uint256);

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

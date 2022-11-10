pragma solidity ^0.8.10;
pragma experimental ABIEncoderV2;

import "../../../contracts/Governance/GovernorAlpha.sol";

contract GovernorAlphaCertora is GovernorAlpha {
    Proposal proposal;

    constructor(
        address timelock_,
        address comp_,
        address guardian_
    ) public GovernorAlpha(timelock_, comp_, guardian_) {}

    // XXX breaks solver
    /* function certoraPropose() public returns (uint) { */
    /*     return propose(proposal.targets, proposal.values, proposal.signatures, proposal.calldatas, "Motion to do something"); */
    /* } */

    /* function certoraProposalLength(uint proposalId) public returns (uint) { */
    /*     return proposals[proposalId].targets.length; */
    /* } */

    function certoraProposalStart(uint256 proposalId) public returns (uint256) {
        return proposals[proposalId].startBlock;
    }

    function certoraProposalEnd(uint256 proposalId) public returns (uint256) {
        return proposals[proposalId].endBlock;
    }

    function certoraProposalEta(uint256 proposalId) public returns (uint256) {
        return proposals[proposalId].eta;
    }

    function certoraProposalExecuted(uint256 proposalId) public returns (bool) {
        return proposals[proposalId].executed;
    }

    function certoraProposalState(uint256 proposalId) public returns (uint256) {
        return uint256(state(proposalId));
    }

    function certoraProposalVotesFor(uint256 proposalId) public returns (uint256) {
        return proposals[proposalId].forVotes;
    }

    function certoraProposalVotesAgainst(uint256 proposalId) public returns (uint256) {
        return proposals[proposalId].againstVotes;
    }

    function certoraVoterVotes(uint256 proposalId, address voter) public returns (uint256) {
        return proposals[proposalId].receipts[voter].votes;
    }

    function certoraTimelockDelay() public returns (uint256) {
        return timelock.delay();
    }

    function certoraTimelockGracePeriod() public returns (uint256) {
        return timelock.GRACE_PERIOD();
    }
}

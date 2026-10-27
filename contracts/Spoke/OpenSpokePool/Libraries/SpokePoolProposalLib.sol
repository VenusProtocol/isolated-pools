// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ISpokePoolProposalBuilder } from "../../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../../interfaces/ISpokePoolManager.sol";

/**
 * @title SpokePoolProposalLib
 * @author Venus
 * @notice The VIP builds of `SpokePoolManager`: it builds a request's, an exit's and a force close's VIP through the
 * proposal builder and records each build. Linked to keep the manager under the EIP-170 size limit
 * @dev The manager calls it through DELEGATECALL, so `address(this)`, `msg.sender` and the storage are the manager's,
 * and the builder sees the manager as its caller. It writes only what a build records and emits the build events; the
 * manager keeps the access checks and the request checks. The errors are `ISpokePoolManager`'s
 */
library SpokePoolProposalLib {
    /**
     * @notice Builds a request's VIP and records the pool's comptroller, the Built status and the VIP payload
     * @param proposalBuilder The proposal builder
     * @param request The request, checked and funded by the manager
     * @param requestProposals The manager's VIP payloads by request id
     * @param requestId The request's id
     * @param description The VIP's description
     * @custom:event Emits RequestBuilt
     * @custom:error The builder's `buildRequestProposal` errors
     */
    function buildRequestProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Request storage request,
        mapping(uint256 => bytes) storage requestProposals,
        uint256 requestId,
        string calldata description
    ) external {
        (address comptroller, address[] memory vTokens, bytes memory proposal) = proposalBuilder.buildRequestProposal(
            requestId,
            description
        );
        request.comptroller = comptroller;
        request.status = ISpokePoolManager.RequestStatus.Built;
        requestProposals[requestId] = proposal;

        emit ISpokePoolManager.RequestBuilt(requestId, vTokens);
    }

    /**
     * @notice Builds a live or exiting pool's exit VIP and stores it as the pool's latest
     * @param proposalBuilder The proposal builder
     * @param pool The pool
     * @param exitProposals The manager's exit VIP payloads by comptroller
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's liquidation threshold for the wind-down
     * @param description The VIP's description
     * @custom:event Emits ExitBuilt
     * @custom:error InvalidPoolStatus is thrown unless the pool is live or its exit is requested or built
     * @custom:error The builder's `buildExitProposal` errors
     */
    function buildExitProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Pool storage pool,
        mapping(address => bytes) storage exitProposals,
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external {
        ISpokePoolManager.PoolStatus status = pool.status;
        if (
            status != ISpokePoolManager.PoolStatus.Live &&
            status != ISpokePoolManager.PoolStatus.ExitRequested &&
            status != ISpokePoolManager.PoolStatus.ExitProposed
        ) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }

        pool.status = ISpokePoolManager.PoolStatus.ExitProposed;
        exitProposals[comptroller] = proposalBuilder.buildExitProposal(comptroller, liquidationThresholds, description);

        emit ISpokePoolManager.ExitBuilt(comptroller);
    }

    /**
     * @notice Builds a winding-down pool's force-close VIP once its wind-down period ends, in place of its exit VIP
     * @param proposalBuilder The proposal builder
     * @param pool The pool
     * @param exitProposals The manager's exit VIP payloads by comptroller
     * @param comptroller The pool's comptroller
     * @param windDownPeriod The manager's wind-down period
     * @param description The VIP's description
     * @custom:event Emits ForceCloseBuilt
     * @custom:error InvalidPoolStatus is thrown when the pool is not winding down
     * @custom:error WindDownPeriodNotElapsed is thrown before the wind-down period ends
     */
    function buildForceCloseProposal(
        ISpokePoolProposalBuilder proposalBuilder,
        ISpokePoolManager.Pool storage pool,
        mapping(address => bytes) storage exitProposals,
        address comptroller,
        uint256 windDownPeriod,
        string calldata description
    ) external {
        if (pool.status != ISpokePoolManager.PoolStatus.WindingDown) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }
        if (block.timestamp < pool.windDownStartedAt + windDownPeriod) {
            revert ISpokePoolManager.WindDownPeriodNotElapsed();
        }

        exitProposals[comptroller] = proposalBuilder.buildForceCloseProposal(comptroller, description);

        emit ISpokePoolManager.ForceCloseBuilt(comptroller);
    }
}

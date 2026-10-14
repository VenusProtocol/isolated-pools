// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokePoolProposer
 * @author Venus
 * @notice The `SpokePoolProposer` functions `SpokePoolManager` calls
 */
interface ISpokePoolProposer {
    /**
     * @notice Deploys a request's comptroller, on a new pool's first proposal, and markets, then submits its proposal
     * @param requestId The request
     * @param description The proposal's description
     * @return proposalId The proposal
     * @return comptroller The pool's comptroller
     * @return vTokens The deployed markets, in the request's market order
     */
    function proposeRequest(
        uint256 requestId,
        string calldata description
    ) external returns (uint256 proposalId, address comptroller, address[] memory vTokens);

    /**
     * @notice Submits an exit's first proposal
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order
     * @param description The proposal's description
     * @return proposalId The proposal
     */
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId);

    /**
     * @notice Submits an exit's force-close proposal
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposalId The proposal
     */
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId);
}

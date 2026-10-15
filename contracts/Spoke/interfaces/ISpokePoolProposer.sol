// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokePoolProposer
 * @author Venus
 * @notice The `SpokePoolProposer` functions `SpokePoolManager` calls; each returns a GovernorBravo `propose` call,
 * ABI-encoded, that the manager submits
 */
interface ISpokePoolProposer {
    /**
     * @notice Deploys a request's comptroller, on a new pool's first proposal, and markets, then builds its proposal
     * @param requestId The request
     * @param description The proposal's description
     * @return comptroller The pool's comptroller
     * @return vTokens The deployed markets, in the request's market order
     * @return proposal The ABI-encoded `propose` call
     */
    function buildRequestProposal(
        uint256 requestId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal);

    /**
     * @notice Builds an exit's first proposal
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order
     * @param description The proposal's description
     * @return proposal The ABI-encoded `propose` call
     */
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view returns (bytes memory proposal);

    /**
     * @notice Builds an exit's force-close proposal
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposal The ABI-encoded `propose` call
     */
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view returns (bytes memory proposal);
}

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
     * @notice Deploys a request's comptroller, on a new pool's first proposal, and markets, then builds its proposal.
     *   In order, it lists a new pool or sets a live pool's changes, settles the request, then lists each market with
     *   its seed and registers each loan market with the Hub
     * @param requestId The request
     * @param description The proposal's description
     * @return comptroller The pool's comptroller
     * @return vTokens The deployed markets, in the request's market order
     * @return proposal The ABI-encoded GovernorBravo `propose` call
     * @custom:error NotManager is thrown when the caller is not the manager
     * @custom:access Only the manager
     */
    function buildRequestProposal(
        uint256 requestId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal);

    /**
     * @notice Builds an exit's first proposal: pause minting, borrowing and entering markets, zero the caps of every
     *   listed market, zero each collateral market's collateral factor and set its liquidation threshold no higher than
     *   now, then start the wind-down in the manager. A pool without listed markets only starts the wind-down
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order; ignored
     *   for loan markets
     * @param description The proposal's description
     * @return proposal The ABI-encoded GovernorBravo `propose` call
     * @custom:error NotManager is thrown when the caller is not the manager
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's listed markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     * @custom:access Only the manager
     */
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view returns (bytes memory proposal);

    /**
     * @notice Builds an exit's force-close proposal: zero every collateral market's collateral factor and liquidation
     *   threshold, and enable forced liquidation on every loan market with borrows
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposal The ABI-encoded GovernorBravo `propose` call
     * @custom:error NotManager is thrown when the caller is not the manager
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     * @custom:access Only the manager
     */
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view returns (bytes memory proposal);
}

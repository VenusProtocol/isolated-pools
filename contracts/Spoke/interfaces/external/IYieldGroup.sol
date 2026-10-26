// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IYieldGroup
 * @author Venus
 * @notice The Liquidity Hub YieldGroup function the proposal builder calls to read how much a YieldGroup may supply
 * to a loan market
 */
interface IYieldGroup {
    /**
     * @notice Returns the most the YieldGroup supplies to a resource
     * @param resource The resource, a loan market
     * @return The cap, in the asset's units; zero when the resource is uncapped
     */
    function resourceCap(address resource) external view returns (uint256);
}

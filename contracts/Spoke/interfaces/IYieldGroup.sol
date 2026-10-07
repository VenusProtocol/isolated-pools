// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IYieldGroup
 * @author Venus
 * @notice The YieldGroup queue a Hub source withdraws from its markets in
 */
interface IYieldGroup {
    /**
     * @notice Returns the order the source withdraws from its markets in
     * @return The markets
     */
    function innerWithdrawQueue() external view returns (address[] memory);
}

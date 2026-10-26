// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IChainlinkFeed
 * @author Venus
 * @notice The Chainlink feed functions `SpokePoolManager` reads to price a collateral asset the ResilientOracle does
 * not price yet
 */
interface IChainlinkFeed {
    /**
     * @notice Returns the decimals of the feed's answers
     * @return The decimals
     */
    function decimals() external view returns (uint8);

    /**
     * @notice Returns the feed's latest round
     * @return roundId The round
     * @return answer The price
     * @return startedAt When the round started
     * @return updatedAt When the answer was last updated
     * @return answeredInRound The round the answer was computed in
     */
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

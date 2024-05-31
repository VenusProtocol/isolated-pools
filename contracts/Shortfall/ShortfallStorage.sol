// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VToken } from "../VToken.sol";
import { IRiskFund } from "../Shortfall/IRiskFund.sol";

/**
 * @title ShortfallStorage
 * @author Venus
 * @dev Storage for Shortfall
 */
contract ShortfallStorage {
    /// @notice Type of auction
    enum AuctionType {
        LARGE_POOL_DEBT,
        LARGE_RISK_FUND
    }

    /// @notice Status of auction
    enum AuctionStatus {
        NOT_STARTED,
        STARTED,
        ENDED
    }

    /// @notice Auction metadata
    struct Auction {
        /// @notice It holds either the starting block number or timestamp
        uint256 startBlockOrTimestamp;
        AuctionType auctionType;
        AuctionStatus status;
        VToken[] markets;
        uint256 seizedRiskFund;
        address highestBidder;
        uint256 highestBidBps;
        /// @notice It holds either the highestBid block or timestamp
        uint256 highestBidBlockOrTimestamp;
        uint256 startBidBps;
        mapping(VToken => uint256) marketDebt;
        mapping(VToken => uint256) bidAmount;
    }

    /// @notice Pool registry address
    address public poolRegistry;

    /// @notice Risk fund address
    IRiskFund public riskFund;

    /// @notice Minimum USD debt in pool for shortfall to trigger
    uint256 public minimumPoolBadDebt;

    /// @notice Incentive to auction participants, initial value set to 1000 or 10%
    uint256 public incentiveBps;

    /// @notice Time to wait for next bidder. Initially waits for DEFAULT_NEXT_BIDDER_BLOCK_OR_TIMESTAMP_LIMIT
    uint256 public nextBidderBlockLimit;

    /// @notice Boolean of if auctions are paused
    bool public auctionsPaused;

    /// @notice Time to wait for first bidder. Initially waits for DEFAULT_WAIT_FOR_FIRST_BIDDER
    uint256 public waitForFirstBidder;

    /// @notice Auctions for each pool
    mapping(address => Auction) public auctions;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[42] private __gap;
}

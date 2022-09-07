// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../CToken.sol";
import "../PriceOracle.sol";
import "../ComptrollerInterface.sol";

contract Shortfall is OwnableUpgradeable {
    address immutable public comptroller;

    //Minimum USD debt in pool for shortfall to trigger 
    uint256 public minimumPoolBadDebt;

    //Incentive to auction participants.
    uint256 public constant incentiveBps = 1000; //10%

    uint256 private constant MAX_BPS = 10_000;

    //Bidding period

    enum AuctionType {
        LARGE_RISK_FUND,
        LARGE_POOL_DEBT
    }

    enum AuctionStatus {
        STARTED,
        ENDED
    }

    struct TokenDebt {
        CToken cToken;
        uint256 amount;
    }

    struct Auction {
        uint256 startBlock;
        AuctionType auctionType;
        AuctionStatus status;
        TokenDebt[] tokenDebt;
        uint256 seizedRiskFund;
        TokenDebt[] highestBid;
        address highestBidder;
        uint256 poolBadDebt;
    }

    Auction public auction;

    constructor(address _comptroller) {
        comptroller = _comptroller;
    }

    function initialize(uint256 _minimumPoolBadDebt) public initializer {
        __Ownable_init();

        minimumPoolBadDebt = _minimumPoolBadDebt;
    }

    function startAuction() external {
        require(auction.startBlock == 0 || auction.status == AuctionStatus.ENDED, "auction is on-going");

        CToken[] memory cTokens = ComptrollerInterface(comptroller).getAllMarkets();
        PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(comptroller).priceOracle()); 

        uint256 poolBadDebt = 0;
        delete auction.tokenDebt;

        for (uint256 i = 0; i < cTokens.length; i++) {
            uint256 marketBadDebt = cTokens[i].badDebt();
            uint256 usdValue =  priceOracle.getUnderlyingPrice(cTokens[i]) * marketBadDebt;

            poolBadDebt = poolBadDebt + usdValue;
            auction.tokenDebt[i] = TokenDebt(cTokens[i], marketBadDebt);

            // cTokens[i].updateMarketBadDebt(0) - TBD
        }

        require(poolBadDebt < minimumPoolBadDebt, "pool bad debt is too low");
        auction.poolBadDebt = poolBadDebt;
        
        uint256 riskFundBalance = 50000 * 10**18; // for testing. we need to fetch the risk fund balance
        uint256 remainingRiskFundBalance = riskFundBalance;

        if (poolBadDebt + ((poolBadDebt * incentiveBps) / MAX_BPS) >= riskFundBalance) {
            remainingRiskFundBalance = 0;
            auction.auctionType = AuctionType.LARGE_POOL_DEBT;
        } else {
            //bids starts at
            uint256 maxSeizeableRiskFundBalance = remainingRiskFundBalance;
            uint256 incentivizedRiskFundBalance = (poolBadDebt * ((poolBadDebt * incentiveBps) / MAX_BPS)) / remainingRiskFundBalance;

            if(incentivizedRiskFundBalance < remainingRiskFundBalance) {
                maxSeizeableRiskFundBalance = incentivizedRiskFundBalance;
            }

            remainingRiskFundBalance = remainingRiskFundBalance - maxSeizeableRiskFundBalance;
            auction.auctionType = AuctionType.LARGE_RISK_FUND;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;
        riskFundBalance = remainingRiskFundBalance; //for testing. we need to update the risk fund balance in risk fund contract

        delete auction.highestBid;
        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);
    }

    // function placeBid(
    //     TokenDebt[] memory bid,
    //     uint256 seizeRiskFund
    // ) external {
    //     require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");

    //     PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(comptroller).priceOracle()); 
    //     uint256 totalBidValue;

    //     for (uint256 i = 0; i < bid.length; i++) {
    //         totalBidValue = totalBidValue + (priceOracle.getUnderlyingPrice(bid[i].cToken) * bid[i].amount);
    //     }

    //     if (auction.highestBidder != address(0)) {
    //         uint256 highestBidderBidValue;

    //         for (uint256 i = 0; i < bid.length; i++) {
    //             highestBidderBidValue = highestBidderBidValue + (priceOracle.getUnderlyingPrice(auction.highestBid[i].cToken) * auction.highestBid[i].amount);
    //         }

    //         if(auction.auctionType == AuctionType.LARGE_RISK_FUND) {
    //             require(highestBidderBidValue < totalBidValue, "your bid is not the highest");
    //         } else {
    //             require(highestBidderBidValue < totalBidValue, "your bid is not the highest");
    //         }
    //     } else {
    //         auction.highestBidder = msg.sender;
    //         auction.highestBid = bid;
    //     }
    // }
}
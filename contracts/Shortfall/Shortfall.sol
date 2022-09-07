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

    struct TokenBid {
        CToken cToken;
        uint256 amount;
    }

    struct Auction {
        uint256 startBlock;
        AuctionType auctionType;
        AuctionStatus status;
        CToken[] markets;
        uint256 seizedRiskFund;
        address highestBidder;
        uint256 poolBadDebt;
        mapping (CToken => uint256) marketDebt;
        mapping (CToken => uint256) highestBid;
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

        //clear the mappings
        for (uint256 i = 0; i < auction.markets.length; i++) {
            CToken cToken = auction.markets[i];
            auction.marketDebt[cToken] = 0;
            auction.highestBid[cToken] = 0;
        }

        delete auction.markets;

        CToken[] memory cTokens = ComptrollerInterface(comptroller).getAllMarkets();
        PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(comptroller).priceOracle()); 
        uint256 poolBadDebt = 0;
        

        for (uint256 i = 0; i < cTokens.length; i++) {
            uint256 marketBadDebt = cTokens[i].badDebt();
            uint256 usdValue =  priceOracle.getUnderlyingPrice(cTokens[i]) * marketBadDebt;

            poolBadDebt = poolBadDebt + usdValue;
            auction.markets[i] = cTokens[i];
            auction.marketDebt[cTokens[i]] = marketBadDebt;

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

        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);
    }

    function placeBid(
        TokenBid[] memory bid,
        uint256 seizeRiskFund
    ) external {
        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(bid.length == auction.markets.length, "you need to bid all markets");

        PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(comptroller).priceOracle()); 
        uint256 totalBidValue;
        
        for (uint256 i = 0; i < bid.length; i++) {
            uint256 usdValue =  priceOracle.getUnderlyingPrice(bid[i].cToken) * bid[i].amount;
            totalBidValue = totalBidValue + usdValue;

            require(auction.marketDebt[bid[i].cToken] > 0, "market is not part of auction");

            if (auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                require(bid[i].amount <= auction.marketDebt[bid[i].cToken], "cannot bid more than debt");
                require(seizeRiskFund == auction.seizedRiskFund, "you need to seize total risk fund");
            } else {
                require(bid[i].amount == auction.marketDebt[bid[i].cToken], "invalid bid amount");
                require(seizeRiskFund <= auction.seizedRiskFund, "invalid seize risk fund");
            }
        }
    }
}
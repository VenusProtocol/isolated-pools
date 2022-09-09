// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../CToken.sol";
import "../CErc20.sol";
import "../PriceOracle.sol";
import "../ComptrollerInterface.sol";

contract Shortfall is OwnableUpgradeable {
    address immutable public comptroller;

    //Minimum USD debt in pool for shortfall to trigger 
    uint256 public minimumPoolBadDebt;

    //Incentive to auction participants.
    uint256 private constant incentiveBps = 1000; //10%

    //Max basis points i.e., 100%
    uint256 private constant MAX_BPS = 10_000;

    //Time to wait for next bidder. wait for 10 blocks
    uint256 private constant nextBidderBlockLimit = 10;

    //Time to wait for first bidder. wait for 100 blocks
    uint256 private constant waitForFirstBidder = 100;

    //BUSD contract address
    IERC20 private immutable BUSD;

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
        uint256 highestBidBps;
        uint256 highestBidBlock;
        uint256 startBidBps;
        mapping (CToken => uint256) marketDebt;
    }

    Auction public auction;

    constructor(address _comptroller, IERC20 _BUSD) {
        comptroller = _comptroller;
        BUSD = _BUSD;
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
            auction.highestBidBps = 0;
            auction.highestBidBlock = 0;
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
        
        uint256 riskFundBalance = 50000 * 10**18; // for testing. we need to fetch the risk fund balance
        uint256 remainingRiskFundBalance = riskFundBalance;

        if (poolBadDebt + ((poolBadDebt * incentiveBps) / MAX_BPS) >= riskFundBalance) {
            auction.startBidBps =  ((MAX_BPS - incentiveBps) * remainingRiskFundBalance) / poolBadDebt;
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
            auction.startBidBps = MAX_BPS;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;
        riskFundBalance = remainingRiskFundBalance; //for testing. we need to update the risk fund balance in risk fund contract and transfer rest to this contract

        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);
    }

    function placeBid(
        uint256 bidBps
    ) external {
        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(bidBps > 10000, "basis points cannot be more than 10000");
        require(
            (auction.auctionType == AuctionType.LARGE_POOL_DEBT &&
            (
                (auction.highestBidder != address(0) && bidBps > auction.highestBidBps) ||
                (auction.highestBidder == address(0) && bidBps > auction.startBidBps)
            )) ||
            (auction.auctionType == AuctionType.LARGE_RISK_FUND && 
            (
                (auction.highestBidder != address(0) && bidBps < auction.highestBidBps) ||
                (auction.highestBidder == address(0) && bidBps <= auction.startBidBps)
            )),
            "your bid is not the highest"
        );

        for (uint256 i = 0; i < auction.markets.length; i++) {
            CErc20 cErc20 = CErc20(address(auction.markets[i]));
            IERC20 erc20 = IERC20(address(cErc20.underlying()));

            if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                uint256 previousBidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps)/MAX_BPS);
                uint256 currentBidAmount = ((auction.marketDebt[auction.markets[i]] * bidBps)/MAX_BPS);
                erc20.transferFrom(address(this), auction.highestBidder, previousBidAmount);
                erc20.transferFrom(msg.sender, address(this), currentBidAmount);
            } else {
                erc20.transferFrom(address(this), auction.highestBidder, auction.marketDebt[auction.markets[i]]);
                erc20.transferFrom(msg.sender, address(this), auction.marketDebt[auction.markets[i]]);
            }
        }

        auction.highestBidder = msg.sender;
        auction.highestBidBps = bidBps;
        auction.highestBidBlock = block.number;
    }

    function closeAuction() external {
        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(block.number > auction.highestBidBlock + nextBidderBlockLimit && auction.highestBidder != address(0), "waiting for next bidder. cannot close auction" );

        for (uint256 i = 0; i < auction.markets.length; i++) {
            CErc20 cErc20 = CErc20(address(auction.markets[i]));
            IERC20 erc20 = IERC20(address(cErc20.underlying()));

            if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
                uint256 bidAmount = ((auction.marketDebt[auction.markets[i]] * auction.highestBidBps)/MAX_BPS);
                erc20.transferFrom(address(this), address(auction.markets[i]), bidAmount);
            } else {
                erc20.transferFrom(address(this), address(auction.markets[i]), auction.marketDebt[auction.markets[i]]);
            }
        }

        if(auction.auctionType == AuctionType.LARGE_POOL_DEBT) {
            BUSD.transferFrom(address(this), auction.highestBidder, auction.seizedRiskFund);
        } else {
            uint256 riskFundBidAmount = (auction.seizedRiskFund * auction.highestBidBps) / MAX_BPS;
            BUSD.transferFrom(address(this), auction.highestBidder, riskFundBidAmount);

            uint256 remainingRiskFundSeizedAmount = auction.seizedRiskFund - seizedRiskFund;
            //transfer remainingRiskFundSeizedAmount to risk fund
        }

        auction.status = AuctionStatus.ENDED;
        //update exchange rate
    }

    function restartAuction() external {
        require(auction.startBlock != 0 && auction.status == AuctionStatus.STARTED, "no on-going auction");
        require(block.number > auction.startBlock + waitForFirstBidder && auction.highestBidder == address(0), "you need to wait for more time for first bidder" );
    }
}
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
        }

        require(poolBadDebt < minimumPoolBadDebt, "pool bad debt is too low");
        auction.poolBadDebt = poolBadDebt;
        
        uint256 riskFundBalance = 50000 * 10**18; // for testing. we need to fetch the risk fund balance
        uint256 remainingRiskFundBalance = riskFundBalance;

        if (poolBadDebt >= riskFundBalance) {
            remainingRiskFundBalance = 0; // for testing
            auction.auctionType = AuctionType.LARGE_POOL_DEBT;
        } else {
            remainingRiskFundBalance = remainingRiskFundBalance - poolBadDebt; // for testing
            auction.auctionType = AuctionType.LARGE_RISK_FUND;
        }

        auction.seizedRiskFund = riskFundBalance - remainingRiskFundBalance;

        //for testing. we need to update the risk fund balance in risk fund contract
        riskFundBalance = remainingRiskFundBalance;

        delete auction.highestBid;
        auction.startBlock = block.number;
        auction.status = AuctionStatus.STARTED;
        auction.highestBidder = address(0);
    }
}
// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../CToken.sol";
import "../PriceOracle.sol";
import "../ComptrollerInterface.sol";

contract Shortfall is OwnableUpgradeable {
    address immutable public comptroller;

    struct AuctionData {
        uint256 startBlock;
    }

    constructor(address _comptroller) {
        comptroller = _comptroller;
    }

    function initialize() public initializer {
        __Ownable_init();
    }

    function handleBadDebt(
        CToken[] memory cTokens,
        uint16[] memory riskFundSplit
    ) external {
        // for testing. we need to fetch the risk fund balance
        uint256 riskFundBalance = 50000 * 10**18; 

        for (uint256 i = 0; i < cTokens.length; i++) {
            uint256 badDebt = cTokens[i].badDebt();
            PriceOracle priceOracle = PriceOracle(ComptrollerViewInterface(comptroller).priceOracle()); 
            uint256 usdValue = priceOracle.getUnderlyingPrice(cTokens[i]);
            uint256 totalValue = badDebt * usdValue;

            uint256 riskFundAllocation = (riskFundSplit[i] * riskFundBalance) / 10000;
        }
    }

    function test() public view returns (uint) {
        return 0;
    }
}
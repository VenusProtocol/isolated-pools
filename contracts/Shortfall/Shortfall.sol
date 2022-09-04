// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../CToken.sol";
import "../PriceOracle.sol";

contract Shortfall {
    address immutable public comptroller;

    struct AuctionData {
        uint256 startBlock;
    }

    constructor(address _comptroller) {
        comptroller = _comptroller;
    }

    function startAuction(
        CToken[] cTokens,
        uint16[] riskFundSplit
    ) external {
        
    }
}
// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../PriceOracle.sol";

contract MockPriceOracle is PriceOracle {
    mapping(address => uint) public assetPrices;

    //set price in 6 decimal precision
    constructor() {}

    function setPrice(address cToken, uint price) external {
        assetPrices[cToken] = price;
    }

    //https://compound.finance/docs/prices
    function getUnderlyingPrice(CToken cToken) override public view returns (uint) {
        cToken;
        return assetPrices[address(cToken)];
    }
}

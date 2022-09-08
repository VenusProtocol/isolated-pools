// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../PriceOracle.sol";
import "../VBep20.sol";

contract MockPriceOracle {
    mapping(address => uint256) public assetPrices;

    //set price in 6 decimal precision
    constructor() {}

    function setPrice(address asset, uint256 price) external {
        assetPrices[asset] = price;
    }

    //https://compound.finance/docs/prices
    function getUnderlyingPrice(VBep20 vToken) public view returns (uint256) {
        return assetPrices[vToken.underlying()];
    }
}

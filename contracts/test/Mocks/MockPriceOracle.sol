// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "../../VToken.sol";

contract MockPriceOracle {
    mapping(address => uint256) public assetPrices;

    //set price in 6 decimal precision
    // solhint-disable-next-line no-empty-blocks
    constructor() {}

    function setPrice(address asset, uint256 price) external {
        assetPrices[asset] = price;
    }

    // solhint-disable-next-line no-empty-blocks
    function updatePrice(address vToken) external {}

    //https://compound.finance/docs/prices
    function getUnderlyingPrice(VToken vToken) public view returns (uint256) {
        return assetPrices[vToken.underlying()];
    }
}

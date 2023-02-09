// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";

contract FixedPriceOracle is PriceOracle {
    uint256 public price;

    constructor(uint256 _price) {
        price = _price;
    }

    function updatePrice(address vToken) external override {}

    function getUnderlyingPrice(address vToken) public view override returns (uint256) {
        vToken;
        return price;
    }

    function assetPrices(address asset) public view returns (uint256) {
        asset;
        return price;
    }
}

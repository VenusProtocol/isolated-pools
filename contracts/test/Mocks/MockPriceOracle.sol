// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

// Mock imports for testing
import { BinanceOracle } from "@venusprotocol/oracle/contracts/oracles/BinanceOracle.sol";
import { ChainlinkOracle } from "@venusprotocol/oracle/contracts/oracles/ChainlinkOracle.sol";
import { LZEndpointMock } from "@layerzerolabs/solidity-examples/contracts/lzApp/mocks/LZEndpointMock.sol";

import { VToken } from "../../VToken.sol";

contract MockPriceOracle is ResilientOracleInterface {
    mapping(address => uint256) public assetPrices;

    //set price in 6 decimal precision
    // solhint-disable-next-line no-empty-blocks
    constructor() {}

    function setPrice(address asset, uint256 price) external {
        assetPrices[asset] = price;
    }

    // solhint-disable-next-line no-empty-blocks
    function updatePrice(address vToken) external override {}

    // solhint-disable-next-line no-empty-blocks
    function updateAssetPrice(address asset) external override {}

    function getPrice(address asset) external view returns (uint256) {
        return assetPrices[asset];
    }

    //https://compound.finance/docs/prices
    function getUnderlyingPrice(address vToken) public view override returns (uint256) {
        return assetPrices[VToken(vToken).underlying()];
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "../VToken.sol";

contract SimplePriceOracle is PriceOracle {
    mapping(address => uint256) prices;
    event PricePosted(
        address asset,
        uint256 previousPriceMantissa,
        uint256 requestedPriceMantissa,
        uint256 newPriceMantissa
    );

    function updatePrice(address vToken) external override {}

    // v1 price oracle interface for use as backing of proxy
    function assetPrices(address asset) external view returns (uint256) {
        return prices[asset];
    }

    function setUnderlyingPrice(VToken vToken, uint256 underlyingPriceMantissa) public {
        address asset = _getUnderlyingAddress(address(vToken));
        emit PricePosted(asset, prices[asset], underlyingPriceMantissa, underlyingPriceMantissa);
        prices[asset] = underlyingPriceMantissa;
    }

    function setDirectPrice(address asset, uint256 price) public {
        emit PricePosted(asset, prices[asset], price, price);
        prices[asset] = price;
    }

    function getUnderlyingPrice(address vToken) public view override returns (uint256) {
        return prices[_getUnderlyingAddress(vToken)];
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function _getUnderlyingAddress(address vTokenAddress) private view returns (address) {
        VToken vToken = VToken(vTokenAddress);
        address asset;
        if (compareStrings(vToken.symbol(), "vBNB")) {
            asset = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
        } else {
            asset = address(vToken.underlying());
        }
        return asset;
    }
}

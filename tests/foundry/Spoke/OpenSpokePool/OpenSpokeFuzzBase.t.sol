// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import { IResilientOracle } from "../../../../contracts/Spoke/interfaces/external/IResilientOracle.sol";
import { AllowAllAccessControl } from "../SpokeFuzzBase.t.sol";

/// @notice ResilientOracle stand-in. A price carries `36 - decimals` decimals, so for an 18-decimal asset `1e18` is $1
contract ResilientOracleStub {
    mapping(address asset => uint256 price) public prices;
    mapping(address vToken => uint256 price) public underlyingPrices;

    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function setUnderlyingPrice(address vToken, uint256 price) external {
        underlyingPrices[vToken] = price;
    }

    function getPrice(address asset) external view returns (uint256) {
        return prices[asset];
    }

    function getUnderlyingPrice(address vToken) external view returns (uint256) {
        return underlyingPrices[vToken];
    }

    /// @dev An asset with a price has a config, so the validation library prices it here instead of from its feeds
    function getTokenConfig(address asset) external view returns (IResilientOracle.TokenConfig memory config) {
        if (prices[asset] != 0) {
            config.asset = asset;
        }
    }
}

/**
 * @title OpenSpokeFuzzBase
 * @notice Shared stand-ins for the Open Spoke Pool fuzz suites: access control that allows every call, the oracle
 * above and a proxy helper for the upgradeable contracts
 */
abstract contract OpenSpokeFuzzBase is Test {
    address internal proxyAdmin = makeAddr("proxyAdmin");
    address internal acm;
    ResilientOracleStub internal oracle;

    function setUp() public virtual {
        acm = address(new AllowAllAccessControl());
        oracle = new ResilientOracleStub();
    }

    function _proxy(address implementation, bytes memory initData) internal returns (address) {
        return address(new TransparentUpgradeableProxy(implementation, proxyAdmin, initData));
    }

    /// @notice The oracle price of a `decimals`-decimal asset worth `usd` (scaled by 1e18) per whole token
    function _price(uint256 usd, uint8 decimals) internal pure returns (uint256) {
        return usd * 10 ** (18 - decimals);
    }
}

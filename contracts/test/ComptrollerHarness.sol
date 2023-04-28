// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "../../contracts/Comptroller.sol";

contract ComptrollerHarness is Comptroller {
    uint256 public blockNumber;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _poolRegistry) Comptroller(_poolRegistry) {}

    function harnessFastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }
}

contract EchoTypesComptroller {
    function stringy(string memory s) public pure returns (string memory) {
        return s;
    }

    function addresses(address a) public pure returns (address) {
        return a;
    }

    function booly(bool b) public pure returns (bool) {
        return b;
    }

    function listOInts(uint256[] memory u) public pure returns (uint256[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }
}

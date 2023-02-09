// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../../contracts/Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint256 public blockNumber;

    constructor(address _poolRegistry, address _accessControl) Comptroller(_poolRegistry, _accessControl) {}

    function fastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function unlist(VToken vToken) public {
        markets[address(vToken)].isListed = false;
    }

    function membershipLength(VToken vToken) public view returns (uint256) {
        return accountAssets[address(vToken)].length;
    }
}

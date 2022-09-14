// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "../../contracts/Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint public blockNumber;

    constructor(address _poolRegistry, address _accessControl)
        Comptroller(_poolRegistry, _accessControl)
        {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() override public view returns (uint) {
        return blockNumber;
    }

    function membershipLength(VToken vToken) public view returns (uint) {
        return accountAssets[address(vToken)].length;
    }

    function unlist(VToken vToken) public {
        markets[address(vToken)].isListed = false;
    }
}

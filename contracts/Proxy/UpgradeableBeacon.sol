// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract Beacon is UpgradeableBeacon {
    constructor(address implementation_) UpgradeableBeacon(implementation_) {
        require(implementation_ != address(0), "Invalid implementation address");
    }
}

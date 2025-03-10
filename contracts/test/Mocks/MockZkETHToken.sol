// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { MockToken } from "./MockToken.sol";

contract MockZkETHToken is MockToken {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockToken(name_, symbol_, decimals_) {}

    function LSTPerToken() external pure returns (uint256) {
        return 1005000000000000000; // 1.005e18
    }
}

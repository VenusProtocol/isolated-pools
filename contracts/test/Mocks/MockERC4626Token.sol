// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { MockToken } from "./MockToken.sol";

contract MockERC4626Token is MockToken {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockToken(name_, symbol_, decimals_) {}

    function convertToAssets(uint256 shares) external pure returns (uint256) {
        return shares;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

abstract contract ReentrancyGuardStorage {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;
}

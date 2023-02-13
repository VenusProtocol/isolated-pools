// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

contract ConstBase {
    uint256 public constant C = 1;

    function ADD(uint256 a) public view returns (uint256) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + block.timestamp;
        }
        return a + C;
    }

    function add(uint256 a) public view returns (uint256) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + block.timestamp;
        }
        return a + c();
    }

    function c() public pure virtual returns (uint256) {
        return 1;
    }
}

contract ConstSub is ConstBase {
    function c() public pure override returns (uint256) {
        return 2;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

contract Counter {
    uint256 public count;
    uint256 public count2;

    function increment(uint256 amount) public payable {
        count += amount;
    }

    function decrement(uint256 amount) public payable {
        require(amount <= count, "counter underflow");
        count -= amount;
    }

    function increment(uint256 amount, uint256 amount2) public payable {
        count += amount;
        count2 += amount2;
    }

    function notZero() public view {
        require(count != 0, "Counter::notZero");
    }

    function doRevert() public pure {
        require(false, "Counter::revert Testing");
    }
}

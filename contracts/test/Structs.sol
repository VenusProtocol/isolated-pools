// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

contract Structs {
    struct Outer {
        uint256 sentinel;
        mapping(address => Inner) inners;
    }

    struct Inner {
        uint16 a;
        uint16 b;
        uint96 c;
    }

    mapping(uint256 => Outer) public outers;

    function writeEach(
        uint256 id,
        uint16 a,
        uint16 b,
        uint96 c
    ) public {
        Inner storage inner = outers[id].inners[msg.sender];
        inner.a = a;
        inner.b = b;
        inner.c = c;
    }

    function writeOnce(
        uint256 id,
        uint16 a,
        uint16 b,
        uint96 c
    ) public {
        Inner memory inner = Inner({ a: a, b: b, c: c });
        outers[id].inners[msg.sender] = inner;
    }
}
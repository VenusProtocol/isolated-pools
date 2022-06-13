pragma solidity ^0.8.4;

import "../EIP20Interface.sol";

contract TetherInterface is EIP20Interface {
    function setParams(uint newBasisPoints, uint newMaxFee) external;
}
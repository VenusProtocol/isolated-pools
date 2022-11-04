// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface TetherInterface is IERC20 {
    function setParams(uint256 newBasisPoints, uint256 newMaxFee) external;
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IVAIController {
    function getVAIRepayAmount(address account) external view returns (uint256);
}

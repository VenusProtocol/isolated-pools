// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

interface IRiskFund {
    function swapAllPoolsAssets() external returns (uint256);

    function getPoolReserve(uint256 poolId) external view returns (uint256);

    function transferReserveForAuction(uint256 poolId, uint256 amount)
        external
        returns (uint256);
}

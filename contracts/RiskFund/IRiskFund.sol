// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

interface IRiskFund {
    function swapAllPoolsAssets() external returns (uint256);

    function getPoolReserve(address comptroller) external view returns (uint256);

    function transferReserveForAuction(address comptroller, uint256 amount)
        external
        returns (uint256);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IRiskFund {
    function swapPoolsAssets(address[] calldata markets, uint256[] calldata amountsOutMin) external returns (uint256);

    function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256);

    function updateAssetsState(address comptroller, address asset) external;

    function getPoolReserve(address comptroller) external view returns (uint256);
}

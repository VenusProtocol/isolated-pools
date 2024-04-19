// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

interface IVToken {
    function mintBehalf(address receiver, uint256 mintAmount) external returns (uint256);

    function redeemUnderlyingBehalf(address redeemer, uint256 redeemAmount) external returns (uint256);

    function redeemBehalf(address redeemer, uint256 redeemTokens) external returns (uint256);

    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);

    function borrowBehalf(address borrower, uint256 borrowAmount) external returns (uint256);

    function borrowBalanceCurrent(address account) external returns (uint256);

    function underlying() external returns (address);

    function exchangeRateCurrent() external returns (uint256);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function redeem(uint256 redeemTokens) external returns (uint256);
}

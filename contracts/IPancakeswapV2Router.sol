// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IPancakeswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ResilientOracle } from "@venusprotocol/oracle/contracts/ResilientOracle.sol";

interface IAbstractSwapper {
    struct SwapConfiguration {
        /// tokenIn address
        address tokenAddressIn;
        /// tokenOut address
        address tokenAddressOut;
        /// incentive on swapping tokens in mantissa i.e 10% incentive would be 0.1 * 1e18
        uint256 incentive;
        /// whether the swap is enabled
        bool enabled;
    }

    function pauseSwap() external;

    function resumeSwap() external;

    function setPriceOracle(ResilientOracle priceOracle_) external;

    function setSwapConfiguration(SwapConfiguration calldata swapConfiguration) external;

    function swapExactTokensForTokens(
        uint256 amountInMantissa,
        uint256 amountOutMinMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external;

    function swapTokensForExactTokens(
        uint256 amountInMaxMantissa,
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external;

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountInMantissa,
        uint256 amountOutMinMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external;

    function swapTokensForExactTokensSupportingFeeOnTransferTokens(
        uint256 amountInMaxMantissa,
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external;
}

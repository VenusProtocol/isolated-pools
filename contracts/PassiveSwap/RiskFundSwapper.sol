// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { AbstractSwapper } from "./AbstractSwapper.sol";
import { ReserveHelpers } from "../RiskFund/ReserveHelpers.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";
import { IRiskFund } from "../RiskFund/IRiskFund.sol";

contract RiskFundSwapper is AbstractSwapper, ReserveHelpers {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Emitted when pool registry address is updated
    event PoolRegistryUpdated(address indexed oldPoolRegistry, address indexed newPoolRegistry);
     
    /**
     * @dev Pool registry setter
     * @param poolRegistry_ Address of the pool registry
     * @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
     */
    function setPoolRegistry(address poolRegistry_) external onlyOwner {
        ensureNonzeroAddress(poolRegistry_);
        address oldPoolRegistry = poolRegistry;
        poolRegistry = poolRegistry_;
        emit PoolRegistryUpdated(oldPoolRegistry, poolRegistry_);
    }

    function balanceOf(address tokenAddress) public view override returns (uint256 tokenBalance) {
        IERC20Upgradeable token = IERC20Upgradeable(tokenAddress);
        tokenBalance = token.balanceOf(address(this));
    }


    function postSwapHook(
        address tokenInAddress,
        uint256 amountIn,
        uint256 amountOut
    ) internal override {
        uint256[] memory poolsBalances;
        uint256 poolsBalancesSum;
        address[] memory pools = PoolRegistryInterface(poolRegistry).getPoolsSupportedByAsset(tokenInAddress);

        for (uint256 i; i < pools.length; ++i) {
            poolsBalances[i] = IERC20Upgradeable(tokenInAddress).balanceOf(pools[i]);
            poolsBalancesSum += poolsBalances[i];
        }

        for (uint256 i; i < pools.length; ++i) {
            uint256 poolRatio = poolsBalances[i] / poolsBalancesSum;
            uint256 poolAmountInShare = poolRatio * amountIn;
            uint256 poolAmountOutShare = poolRatio * amountOut;

            poolsAssetsReserves[pools[i]][tokenInAddress] -= poolAmountInShare;
            IRiskFund(destinationAddress).updatePoolState(pools[i], poolAmountOutShare);
        }

        assetsReserves[tokenInAddress] -= amountIn;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";

/**
 * @title ILiquidityHub
 * @author Venus
 * @notice The Liquidity Hub functions a bond account holds a stablecoin with, beyond ERC-4626
 */
interface ILiquidityHub is IERC4626Upgradeable {
    /// @notice Settles the Hub's interest and fees, at most once per block, so its share price is current
    function accrueFees() external;

    /**
     * @notice Returns whether the Hub is paused; deposits, withdrawals and `accrueFees` revert while it is
     * @return Whether the Hub is paused
     */
    function hubPaused() external view returns (bool);
}

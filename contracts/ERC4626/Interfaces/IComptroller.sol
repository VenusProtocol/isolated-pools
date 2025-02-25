// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { VToken } from "../../VToken.sol";
import { RewardsDistributor } from "../../Rewards/RewardsDistributor.sol";

enum Action {
    MINT,
    REDEEM,
    BORROW,
    REPAY,
    SEIZE,
    LIQUIDATE,
    TRANSFER,
    ENTER_MARKET,
    EXIT_MARKET
}

/**
 * @title IComptroller
 * @author Venus
 * @notice Combined interface for the `Comptroller` contract, including both core and view functions.
 */
interface IComptroller {
    /*** Assets You Are In ***/
    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    function exitMarket(address vToken) external returns (uint256);

    function isComptroller() external view returns (bool);

    function getAllMarkets() external view returns (VToken[] memory);

    function actionPaused(address market, Action action) external view returns (bool);

    /*** View Functions ***/
    function markets(address) external view returns (bool, uint256);

    function oracle() external view returns (ResilientOracleInterface);

    function getAssetsIn(address) external view returns (VToken[] memory);

    function closeFactorMantissa() external view returns (uint256);

    function liquidationIncentiveMantissa() external view returns (uint256);

    function minLiquidatableCollateral() external view returns (uint256);

    function getRewardDistributors() external view returns (RewardsDistributor[] memory);

    function borrowCaps(address) external view returns (uint256);

    function supplyCaps(address) external view returns (uint256);

    function approvedDelegates(address user, address delegate) external view returns (bool);
}

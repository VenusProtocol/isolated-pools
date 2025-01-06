// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "./VToken.sol";
import { RewardsDistributor } from "./Rewards/RewardsDistributor.sol";
import { VTokenInterface } from "./VTokenInterfaces.sol";

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
 * @title ComptrollerInterface
 * @author Venus
 * @notice Interface implemented by the `Comptroller` contract.
 */
interface ComptrollerInterface {
    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    function exitMarket(address vToken) external returns (uint256);

    /*** Policy Hooks ***/

    function preMintHook(address vToken, address minter, uint256 mintAmount) external;

    function preRedeemHook(address vToken, address redeemer, uint256 redeemTokens) external;

    function preBorrowHook(address vToken, address borrower, uint256 borrowAmount) external;

    function preRepayHook(address vToken, address borrower) external;

    function preLiquidateHook(
        address vTokenBorrowed,
        address vTokenCollateral,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external;

    function preSeizeHook(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower
    ) external;

    function borrowVerify(address vToken, address borrower, uint borrowAmount) external;

    function mintVerify(address vToken, address minter, uint mintAmount, uint mintTokens) external;

    function redeemVerify(address vToken, address redeemer, uint redeemAmount, uint redeemTokens) external;

    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex
    ) external;

    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens
    ) external;

    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external;

    function transferVerify(address vToken, address src, address dst, uint transferTokens) external;

    function preTransferHook(address vToken, address src, address dst, uint256 transferTokens) external;

    function executeFlashLoan(address receiver, VTokenInterface[] calldata assets, uint256[] calldata amounts) external;

    function isComptroller() external view returns (bool);

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 repayAmount
    ) external view returns (uint256, uint256);

    function getAllMarkets() external view returns (VToken[] memory);

    function actionPaused(address market, Action action) external view returns (bool);
}

/**
 * @title ComptrollerViewInterface
 * @author Venus
 * @notice Interface implemented by the `Comptroller` contract, including only some util view functions.
 */
interface ComptrollerViewInterface {
    function markets(address) external view returns (bool, uint256);

    function oracle() external view returns (ResilientOracleInterface);

    function getAssetsIn(address) external view returns (VToken[] memory);

    function closeFactorMantissa() external view returns (uint256);

    function liquidationIncentiveMantissa() external view returns (uint256);

    function minLiquidatableCollateral() external view returns (uint256);

    function getRewardDistributors() external view returns (RewardsDistributor[] memory);

    function getAllMarkets() external view returns (VToken[] memory);

    function borrowCaps(address) external view returns (uint256);

    function supplyCaps(address) external view returns (uint256);

    function approvedDelegates(address user, address delegate) external view returns (bool);
}

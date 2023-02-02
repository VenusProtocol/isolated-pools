// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "./VToken.sol";
import "./Rewards/RewardsDistributor.sol";

interface ComptrollerInterface {
    
    function isComptroller() external view virtual returns(bool);

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external virtual returns (uint256[] memory);

    function exitMarket(address vToken) external virtual returns (uint256);

    /*** Policy Hooks ***/

    function preMintHook(
        address vToken,
        address minter,
        uint256 mintAmount
    ) external virtual;

    function preRedeemHook(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) external virtual;

    function preBorrowHook(
        address vToken,
        address borrower,
        uint256 borrowAmount
    ) external virtual;

    function preRepayHook(
        address vToken,
        address payer,
        address borrower,
        uint256 repayAmount
    ) external virtual;

    function preLiquidateHook(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external virtual;

    function preSeizeHook(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external virtual;

    function preTransferHook(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external virtual;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 repayAmount
    ) external view virtual returns (uint256, uint256);

    function getAllMarkets() external view virtual returns (VToken[] memory);
}

interface ComptrollerViewInterface {
    function markets(address) external view virtual returns (bool, uint256);

    function oracle() external view virtual returns (PriceOracle);

    function getAssetsIn(address) external view virtual returns (VToken[] memory);

    function compSpeeds(address) external view virtual returns (uint256);

    function pauseGuardian() external view virtual returns (address);

    function priceOracle() external view virtual returns (address);

    function closeFactorMantissa() external view virtual returns (uint256);

    function maxAssets() external view virtual returns (uint256);

    function liquidationIncentiveMantissa() external view virtual returns (uint256);

    function minLiquidatableCollateral() external view virtual returns (uint256);

    function getXVSRewardsByMarket(address) external view virtual returns (uint256, uint256);

    function getRewardDistributors() external view virtual returns (RewardsDistributor[] memory);
}

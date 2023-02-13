// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "./VToken.sol";
import "./Rewards/RewardsDistributor.sol";

interface ComptrollerInterface {
    function isComptroller() external view returns (bool);

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    function exitMarket(address vToken) external returns (uint256);

    /*** Policy Hooks ***/

    function preMintHook(
        address vToken,
        address minter,
        uint256 mintAmount
    ) external;

    function preRedeemHook(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) external;

    function preBorrowHook(
        address vToken,
        address borrower,
        uint256 borrowAmount
    ) external;

    function preRepayHook(
        address vToken,
        address payer,
        address borrower,
        uint256 repayAmount
    ) external;

    function preLiquidateHook(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external;

    function preSeizeHook(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external;

    function preTransferHook(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 repayAmount
    ) external view returns (uint256, uint256);

    function getAllMarkets() external view returns (VToken[] memory);
}

interface ComptrollerViewInterface {
    function markets(address) external view returns (bool, uint256);

    function oracle() external view returns (PriceOracle);

    function getAssetsIn(address) external view returns (VToken[] memory);

    function compSpeeds(address) external view returns (uint256);

    function pauseGuardian() external view returns (address);

    function priceOracle() external view returns (address);

    function closeFactorMantissa() external view returns (uint256);

    function maxAssets() external view returns (uint256);

    function liquidationIncentiveMantissa() external view returns (uint256);

    function minLiquidatableCollateral() external view returns (uint256);

    function getXVSRewardsByMarket(address) external view returns (uint256, uint256);

    function getRewardDistributors() external view returns (RewardsDistributor[] memory);
}

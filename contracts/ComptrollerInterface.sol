// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@venusprotocol/oracle/contracts/PriceOracle.sol";
import "./VToken.sol";
import "./Rewards/RewardsDistributor.sol";

interface ComptrollerInterface {
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

    function preTransferHook(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external;

    function isComptroller() external view returns (bool);

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

    function closeFactorMantissa() external view returns (uint256);

    function liquidationIncentiveMantissa() external view returns (uint256);

    function minLiquidatableCollateral() external view returns (uint256);

    function getRewardDistributors() external view returns (RewardsDistributor[] memory);

    function getAllMarkets() external view returns (VToken[] memory);

    function borrowCaps(address) external view returns (uint256);

    function supplyCaps(address) external view returns (uint256);
}

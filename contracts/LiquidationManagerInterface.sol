// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { VToken } from "./VToken.sol";
import { ComptrollerStorage } from "./ComptrollerStorage.sol";
import { ComptrollerInterface } from "./ComptrollerInterface.sol";

interface ILiquidationManager {
    struct AssetData {
        uint256 vTokenBalance;
        uint256 borrowBalance;
        uint256 exchangeRateMantissa;
        uint256 underlyingPrice;
        uint256 assetWeight;
        address vTokenAddress;
    }

    struct EffectsParams {
        VToken vTokenModify;
        uint256 redeemTokens;
        uint256 borrowAmount;
    }

    function processLiquidationOrder(
        ComptrollerStorage.LiquidationOrder calldata order,
        address borrower,
        address liquidator
    ) external;

    function calculateIncentiveAdjustedDebt(
        address borrower,
        VToken[] memory markets,
        ComptrollerInterface comptroller
    ) external view returns (uint256 weightedBorrowSum);

    function processAsset(
        VToken asset,
        address account,
        EffectsParams memory effects,
        uint256 assetWeight,
        uint256 underlyingPrice,
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot
    ) external view returns (ComptrollerStorage.AccountLiquiditySnapshot memory);

    function finalizeSnapshot(
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot
    ) external pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory);
}

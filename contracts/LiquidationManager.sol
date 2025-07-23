// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { VToken } from "./VToken.sol";
import { ComptrollerStorage } from "./ComptrollerStorage.sol";
import { ComptrollerInterface } from "./ComptrollerInterface.sol";
import { Comptroller } from "./Comptroller.sol";
import { ExponentialNoError } from "./ExponentialNoError.sol";
import { ILiquidationManager } from "./LiquidationManagerInterface.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

contract LiquidationManager is ILiquidationManager, ExponentialNoError {
    /**
     * @notice Calculates incentive-adjusted debt
     */
    function calculateIncentiveAdjustedDebt(
        address borrower,
        VToken[] memory markets,
        ComptrollerInterface comptroller
    ) external view returns (uint256 weightedBorrowSum) {
        for (uint256 i; i < markets.length; ++i) {
            VToken market = markets[i];
            (, , uint256 borrowBalance, ) = market.getAccountSnapshot(borrower);
            if (borrowBalance == 0) continue;

            ResilientOracleInterface oracle = comptroller.getOracle();
            uint256 borrowPrice = oracle.getUnderlyingPrice(address(market));
            uint256 borrowValueUSD = mul_ScalarTruncate(Exp({ mantissa: borrowPrice }), borrowBalance);

            uint256 marketIncentive = comptroller.getDynamicLiquidationIncentive(borrower, address(market));

            weightedBorrowSum = ExponentialNoError.add_(
                weightedBorrowSum,
                ExponentialNoError.mul_ScalarTruncate(
                    ExponentialNoError.Exp({ mantissa: marketIncentive }),
                    borrowValueUSD
                )
            );
        }
    }

    /**
     * @notice Processes a single asset for a given account and updates the liquidity snapshot.
     * @dev
     * - Constructs AssetData for the asset and account.
     * - Calculates and applies the asset's effect on the account's liquidity snapshot, including any modifications (redeem/borrow).
     * @param asset The VToken asset to process.
     * @param account The address of the account being evaluated.
     * @param effects Parameters describing any modifications (redeem/borrow) to apply for this asset.
     * @param assetWeight The risk weight of the asset.
     * @param snapshot The current account liquidity snapshot to update.
     * @return The updated AccountLiquiditySnapshot struct.
     */
    function processAsset(
        VToken asset,
        address account,
        EffectsParams memory effects,
        uint256 assetWeight,
        uint256 underlyingPrice,
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot
    ) external view returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        (, uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa) = asset.getAccountSnapshot(
            account
        );

        AssetData memory assetData = AssetData({
            vTokenBalance: vTokenBalance,
            borrowBalance: borrowBalance,
            exchangeRateMantissa: exchangeRateMantissa,
            underlyingPrice: underlyingPrice,
            assetWeight: assetWeight,
            vTokenAddress: address(asset)
        });

        return _calculateAssetValues(assetData, snapshot, effects);
    }

    /**
     * @notice Finalizes the account liquidity snapshot by calculating weighted averages, health factors, and liquidity/shortfall.
     * @dev
     * - Computes the average weight.
     * - Calculates the sum of borrows and effects.
     * - Determines the health factor as the ratio of weighted collateral to total borrow plus effects.
     * - Sets the health factor threshold using the weighted average and liquidation incentive.
     * - Calculates liquidity and shortfall based on the comparison of weighted collateral and borrow plus effects.
     * @param snapshot The account liquidity snapshot to be finalized.
     * @return The finalized account liquidity snapshot with updated fields.
     */
    function finalizeSnapshot(
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot
    ) external pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        if (snapshot.totalCollateral > 0) {
            snapshot.averageLT = div_(snapshot.averageLT, snapshot.totalCollateral);
        }
        uint256 borrowPlusEffects = snapshot.borrows + snapshot.effects;

        if (borrowPlusEffects > 0) {
            snapshot.healthFactor = div_(snapshot.weightedCollateral, borrowPlusEffects);
        }
        snapshot.healthFactorThreshold = div_(snapshot.averageLT * (1e18 + snapshot.liquidationIncentiveAvg), 1e18);

        unchecked {
            if (snapshot.weightedCollateral > borrowPlusEffects) {
                snapshot.liquidity = snapshot.weightedCollateral - borrowPlusEffects;
                snapshot.shortfall = 0;
            } else {
                snapshot.liquidity = 0;
                snapshot.shortfall = borrowPlusEffects - snapshot.weightedCollateral;
            }
        }

        return snapshot;
    }

    /**
     * @notice Calculates and updates the liquidity snapshot values for a given asset.
     * @dev Computes weighted collateral, total collateral, and borrow values using asset data and price information.
     *      If the asset is being modified (redeemed or borrowed), applies the effects to the snapshot as well.
     * @param asset The asset data struct containing balances, prices, and weights.
     * @param snapshot The current account liquidity snapshot to update.
     * @param effectsParams Parameters describing any modifications (redeem/borrow) to apply for this asset.
     * @return The updated AccountLiquiditySnapshot struct.
     */
    function _calculateAssetValues(
        AssetData memory asset,
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot,
        EffectsParams memory effectsParams
    ) internal pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        Exp memory oraclePrice = Exp({ mantissa: asset.underlyingPrice });
        Exp memory vTokenPrice = mul_(Exp({ mantissa: asset.exchangeRateMantissa }), oraclePrice);
        Exp memory weightedVTokenPrice = mul_(Exp({ mantissa: asset.assetWeight }), vTokenPrice);

        // Core calculations
        snapshot.weightedCollateral = mul_ScalarTruncateAddUInt(
            weightedVTokenPrice,
            asset.vTokenBalance,
            snapshot.weightedCollateral
        );
        snapshot.totalCollateral = mul_ScalarTruncateAddUInt(
            vTokenPrice,
            asset.vTokenBalance,
            snapshot.totalCollateral
        );
        snapshot.borrows = mul_ScalarTruncateAddUInt(oraclePrice, asset.borrowBalance, snapshot.borrows);
        uint256 vTokenBalanceUSD = mul_ScalarTruncate(vTokenPrice, asset.vTokenBalance);
        snapshot.averageLT += mul_(asset.assetWeight, vTokenBalanceUSD);

        // Handle modified asset effects
        if (address(asset.vTokenAddress) == address(effectsParams.vTokenModify)) {
            snapshot.effects = mul_ScalarTruncateAddUInt(
                weightedVTokenPrice,
                effectsParams.redeemTokens,
                snapshot.effects
            );
            snapshot.effects = mul_ScalarTruncateAddUInt(oraclePrice, effectsParams.borrowAmount, snapshot.effects);
        }

        return snapshot;
    }
}

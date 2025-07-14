// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { ExponentialNoError } from "./ExponentialNoError.sol";
import { ComptrollerStorage } from "../ComptrollerStorage.sol";
import { ComptrollerInterface } from "../ComptrollerInterface.sol";
import { Comptroller } from "../Comptroller.sol";
import { VToken } from "../VToken.sol";

library Liquidation {
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

    /**
     * @notice Processes a batch of liquidation orders for a given borrower.
     * @dev Iterates through the provided liquidation orders, validates that both the borrowed and collateral markets are listed,
     *      and executes the liquidation for each order using the `forceLiquidateBorrow` function.
     * @param orders Array of liquidation orders to process.
     * @param borrower The address of the borrower whose positions are being liquidated.
     * @param liquidator The address performing the liquidation.
     * @param markets Mapping of market addresses to their corresponding market data, used to validate market status.
     * @custom:reverts MarketNotListed if either the borrowed or collateral market in an order is not listed.
     */
    function processLiquidationOrders(
        ComptrollerStorage.LiquidationOrder[] calldata orders,
        address borrower,
        address liquidator,
        mapping(address => ComptrollerStorage.Market) storage markets
    ) internal {
        uint256 ordersCount = orders.length;
        for (uint256 i; i < ordersCount; ++i) {
            ComptrollerStorage.LiquidationOrder calldata order = orders[i];

            // Validate markets are listed
            if (!markets[address(order.vTokenBorrowed)].isListed) {
                revert Comptroller.MarketNotListed(address(order.vTokenBorrowed));
            }
            if (!markets[address(order.vTokenCollateral)].isListed) {
                revert Comptroller.MarketNotListed(address(order.vTokenCollateral));
            }

            // Execute liquidation
            order.vTokenBorrowed.forceLiquidateBorrow(
                liquidator,
                borrower,
                order.repayAmount,
                order.vTokenCollateral,
                true
            );
        }
    }

    /**
     * @notice Calculates the sum of all borrow amounts weighted by their liquidation incentives
     * @dev Returns Σ (borrowAmount × liquidationIncentive) for all markets
     * @param borrower The account address
     * @param markets Array of markets to check
     * @param comptroller For incentive lookup
     * @return weightedBorrowSum The incentive-adjusted total borrow value
     */
    function calculateIncentiveAdjustedDebt(
        address borrower,
        VToken[] memory markets,
        ComptrollerInterface comptroller
    ) internal view returns (uint256 weightedBorrowSum) {
        for (uint256 i; i < markets.length; ++i) {
            VToken market = markets[i];
            (, , uint256 borrowBalance, ) = market.getAccountSnapshot(borrower);

            if (borrowBalance > 0) {
                uint256 marketIncentive = comptroller.getDynamicLiquidationIncentive(borrower, address(market));
                uint256 scaledBorrow = ExponentialNoError.mul_ScalarTruncate(
                    ExponentialNoError.Exp({ mantissa: marketIncentive }),
                    borrowBalance
                );
                weightedBorrowSum = ExponentialNoError.add_(weightedBorrowSum, scaledBorrow);
            }
        }
        return weightedBorrowSum;
    }

    /**
     * @notice Constructs an AssetData struct for a given asset and account.
     * @dev Fetches the account's vToken balance, borrow balance, and exchange rate for the asset,
     *      as well as the asset's underlying price and risk weight.
     * @param asset The VToken asset to query.
     * @param account The address of the account.
     * @param assetWeight The risk weight of the asset.
     * @param getUnderlyingPrice Function to fetch the asset's underlying price.
     * @param getAccountSnapshot Function to fetch the account's balances for the asset.
     * @return AssetData struct containing all relevant asset/account data.
     */
    function createAssetData(
        VToken asset,
        address account,
        uint256 assetWeight,
        function(VToken) internal view returns (uint256) getUnderlyingPrice,
        function(VToken, address) internal view returns (uint256, uint256, uint256) getAccountSnapshot
    ) internal view returns (AssetData memory) {
        (uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa) = getAccountSnapshot(
            asset,
            account
        );

        return
            AssetData({
                vTokenBalance: vTokenBalance,
                borrowBalance: borrowBalance,
                exchangeRateMantissa: exchangeRateMantissa,
                underlyingPrice: getUnderlyingPrice(asset),
                assetWeight: assetWeight,
                vTokenAddress: address(asset)
            });
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
     * @param getUnderlyingPrice Function to fetch the asset's underlying price.
     * @param getAccountSnapshot Function to fetch the account's balances for the asset.
     * @param snapshot The current account liquidity snapshot to update.
     * @return The updated AccountLiquiditySnapshot struct.
     */
    function processAsset(
        VToken asset,
        address account,
        EffectsParams memory effects,
        uint256 assetWeight,
        function(VToken) internal view returns (uint256) getUnderlyingPrice,
        function(VToken, address) internal view returns (uint256, uint256, uint256) getAccountSnapshot,
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot
    ) internal view returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        AssetData memory assetData = createAssetData(
            asset,
            account,
            assetWeight,
            getUnderlyingPrice,
            getAccountSnapshot
        );

        return calculateAssetValues(assetData, snapshot, effects);
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
    function calculateAssetValues(
        AssetData memory asset,
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot,
        EffectsParams memory effectsParams
    ) internal pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        ExponentialNoError.Exp memory oraclePrice = ExponentialNoError.Exp({ mantissa: asset.underlyingPrice });
        ExponentialNoError.Exp memory vTokenPrice = ExponentialNoError.mul_(
            ExponentialNoError.Exp({ mantissa: asset.exchangeRateMantissa }),
            oraclePrice
        );
        ExponentialNoError.Exp memory weightedVTokenPrice = ExponentialNoError.mul_(
            ExponentialNoError.Exp({ mantissa: asset.assetWeight }),
            vTokenPrice
        );

        // Core calculations
        snapshot.weightedCollateral = ExponentialNoError.mul_ScalarTruncateAddUInt(
            weightedVTokenPrice,
            asset.vTokenBalance,
            snapshot.weightedCollateral
        );
        snapshot.totalCollateral = ExponentialNoError.mul_ScalarTruncateAddUInt(
            vTokenPrice,
            asset.vTokenBalance,
            snapshot.totalCollateral
        );
        snapshot.borrows = ExponentialNoError.mul_ScalarTruncateAddUInt(
            oraclePrice,
            asset.borrowBalance,
            snapshot.borrows
        );
        snapshot.weightavg += asset.assetWeight;

        // Handle modified asset effects
        if (address(asset.vTokenAddress) == address(effectsParams.vTokenModify)) {
            snapshot.effects = ExponentialNoError.mul_ScalarTruncateAddUInt(
                weightedVTokenPrice,
                effectsParams.redeemTokens,
                snapshot.effects
            );
            snapshot.effects = ExponentialNoError.mul_ScalarTruncateAddUInt(
                oraclePrice,
                effectsParams.borrowAmount,
                snapshot.effects
            );
        }

        return snapshot;
    }

    /**
     * @notice Finalizes the account liquidity snapshot by calculating weighted averages, health factors, and liquidity/shortfall.
     * @dev
     * - Computes the average weight if there are assets.
     * - Calculates the sum of borrows and effects.
     * - Determines the health factor as the ratio of weighted collateral to total borrow plus effects.
     * - Sets the health factor threshold using the weighted average and liquidation incentive.
     * - Calculates liquidity and shortfall based on the comparison of weighted collateral and borrow plus effects.
     * @param snapshot The account liquidity snapshot to be finalized.
     * @param assetsCount The number of assets in the snapshot.
     * @param liquidationIncentiveMantissa The liquidation incentive, scaled by 1e18.
     * @return The finalized account liquidity snapshot with updated fields.
     */
    function finalizeSnapshot(
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot,
        uint256 assetsCount,
        uint256 liquidationIncentiveMantissa
    ) internal pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        if (assetsCount > 0) {
            snapshot.weightavg = snapshot.weightavg / assetsCount;
        }

        uint256 borrowPlusEffects = snapshot.borrows + snapshot.effects;

        if (borrowPlusEffects > 0) {
            snapshot.healthFactor = ExponentialNoError.div_(snapshot.weightedCollateral, borrowPlusEffects);
        }
        snapshot.healthFactorThreshold = ExponentialNoError.div_(
            snapshot.weightavg * (1e18 + liquidationIncentiveMantissa),
            1e18
        );

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
}

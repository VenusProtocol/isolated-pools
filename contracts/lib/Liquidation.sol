// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { ExponentialNoError } from "./ExponentialNoError.sol";
import { ComptrollerStorage } from "../ComptrollerStorage.sol";
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

    /// @notice Thrown when a market is not listed in the comptroller.
    /// @param market The address of the market that is not listed.
    error MarketNotListed(address market);

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
                revert MarketNotListed(address(order.vTokenBorrowed));
            }
            if (!markets[address(order.vTokenCollateral)].isListed) {
                revert MarketNotListed(address(order.vTokenCollateral));
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

    function finalizeSnapshot(
        ComptrollerStorage.AccountLiquiditySnapshot memory snapshot,
        uint256 assetsCount,
        uint256 liquidationIncentiveMantissa
    ) internal pure returns (ComptrollerStorage.AccountLiquiditySnapshot memory) {
        snapshot.weightavg = snapshot.weightavg / assetsCount;
        uint256 borrowPlusEffects = snapshot.borrows + snapshot.effects;

        snapshot.healthFactor = ExponentialNoError.div_(snapshot.weightedCollateral, borrowPlusEffects);
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

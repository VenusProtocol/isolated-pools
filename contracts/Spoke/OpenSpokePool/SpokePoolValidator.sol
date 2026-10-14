// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistryInterface } from "../../Pool/PoolRegistryInterface.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolValidator } from "../interfaces/ISpokePoolValidator.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolValidator
 * @author Venus
 * @notice Checks `SpokePoolManager` requests and deployer updates against the pool tiers. It is split out of the
 * manager for bytecode size, as `ComptrollerLens` is from the core pool's Comptroller, reads the manager's state and
 * reverts with the manager's errors
 */
contract SpokePoolValidator is ISpokePoolValidator {
    /// @notice The manager whose requests and pools are checked
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /**
     * @param spokePoolManager The manager whose requests and pools are checked
     * @custom:error ZeroAddressNotAllowed is thrown when the manager is zero
     */
    constructor(SpokePoolManager spokePoolManager) {
        ensureNonzeroAddress(address(spokePoolManager));
        SPOKE_POOL_MANAGER = spokePoolManager;
    }

    /**
     * @notice Accrues interest in every market of a pool and checks its borrows and bad debt, in USD, are within the
     *   manager's `maxResidualPoolDebtUsd`
     * @param comptroller The pool's comptroller
     * @custom:error ResidualDebtExceeded is thrown when the borrows and bad debt exceed `maxResidualPoolDebtUsd`
     */
    function accrueAndCheckResidualDebt(address comptroller) external {
        ResilientOracleInterface oracle = SPOKE_POOL_MANAGER.RESILIENT_ORACLE();
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            uint256 debt = vToken.totalBorrowsCurrent() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * oracle.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }
        if (debtUsd > SPOKE_POOL_MANAGER.maxResidualPoolDebtUsd()) {
            revert ISpokePoolManager.ResidualDebtExceeded(debtUsd);
        }
    }

    /**
     * @notice Checks a request's content against the pool it is for and that pool's tier
     * @param requestId The request
     * @custom:error InvalidRequestType is thrown for a tier request
     * @custom:error InvalidPoolParams is thrown when a new pool's close factor or liquidation incentive is zero
     * @custom:error InvalidTier is thrown when a pool request's stake is no longer its tier's
     * @custom:error InvalidPoolStatus is thrown when a markets or pool config request's pool is not live
     * @custom:error InvalidArrayLength is thrown when a markets request has no market
     * @custom:error MarketNotListed is thrown when an interest rate model is for a market outside the pool
     * @custom:error InvalidInterestRateModel is thrown when an interest rate model is zero
     * @custom:error TooManyMarkets is thrown when the pool would have more than `MAX_POOL_MARKETS` markets
     * @custom:error DuplicateAsset is thrown when a market's asset is already in the request or the pool
     * @custom:error InvalidMarketParams is thrown when a market's parameters are missing or do not fit its kind or seed
     * @custom:error UnsupportedAsset is thrown when a loan asset has no Hub source or a collateral asset has no bounded
     *   pricing
     * @custom:error ExceedsTierLimit is thrown when a collateral parameter or the loan liquidity is beyond the tier
     */
    function verifyRequest(uint256 requestId) external view {
        SpokePoolManagerStorage.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        SpokePoolManagerStorage.RequestType requestType = request.requestType;
        if (requestType == SpokePoolManagerStorage.RequestType.Pool) {
            SpokePoolManagerStorage.PoolRequest memory pool = request.pool;
            if (pool.params.closeFactor == 0 || pool.params.liquidationIncentive == 0) {
                revert ISpokePoolManager.InvalidPoolParams();
            }
            SpokePoolManagerStorage.Tier memory tier = SPOKE_POOL_MANAGER.getTier(pool.tierId);
            // The new pool starts with the stake locked at request, so it must still be the tier's
            if (pool.stake != tier.stakeAmount) {
                revert ISpokePoolManager.InvalidTier(pool.tierId);
            }
            // The comptroller of a proposed new pool has no listed markets yet
            _checkMarkets(address(0), tier, request.markets);
            return;
        }
        address comptroller = request.comptroller;
        SpokePoolManagerStorage.Pool memory livePool = SPOKE_POOL_MANAGER.getPool(comptroller);
        if (livePool.status != SpokePoolManagerStorage.PoolStatus.Live) {
            revert ISpokePoolManager.InvalidPoolStatus(comptroller);
        }
        if (requestType == SpokePoolManagerStorage.RequestType.Markets) {
            if (request.markets.length == 0) {
                revert ISpokePoolManager.InvalidArrayLength();
            }
            _checkMarkets(comptroller, SPOKE_POOL_MANAGER.getTier(livePool.tierId), request.markets);
        } else if (requestType == SpokePoolManagerStorage.RequestType.PoolConfig) {
            SpokePoolManagerStorage.MarketInterestRateModel[] memory models = request.poolConfig.interestRateModels;
            uint256 modelCount = models.length;
            for (uint256 i; i < modelCount; ++i) {
                _checkMarketListed(comptroller, models[i].vToken);
                if (models[i].interestRateModel == address(0)) {
                    revert ISpokePoolManager.InvalidInterestRateModel(models[i].vToken);
                }
            }
        } else {
            revert ISpokePoolManager.InvalidRequestType(requestId);
        }
    }

    /**
     * @notice Checks a live pool fits a tier: every listed collateral market's risk parameters, the loan liquidity,
     *   and no bad debt
     * @param comptroller The pool's comptroller
     * @param tierId The tier
     * @custom:error ExceedsTierLimit is thrown when a risk parameter or the loan liquidity does not fit the tier
     * @custom:error BadDebtOutstanding is thrown when a market has bad debt
     */
    function checkPoolFitsTier(address comptroller, uint256 tierId) external view {
        SpokePoolManagerStorage.Tier memory tier = SPOKE_POOL_MANAGER.getTier(tierId);
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            if (!SPOKE_POOL_MANAGER.isLoanMarket(address(vToken))) {
                (bool isListed, uint256 collateralFactor, uint256 liquidationThreshold) = SpokeComptroller(comptroller)
                    .markets(address(vToken));
                if (isListed) {
                    _checkCollateralParams(tier, collateralFactor, liquidationThreshold);
                }
            }
            if (vToken.badDebt() != 0) {
                revert ISpokePoolManager.BadDebtOutstanding(address(vToken));
            }
        }
        if (_loanLiquidityUsd(comptroller, markets) > tier.maxLiquidityUsd) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }

    /**
     * @notice Checks a deployer's new collateral factor and liquidation threshold for a collateral market
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param collateralFactor The new collateral factor
     * @param liquidationThreshold The new liquidation threshold
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown when the market is a loan market
     * @custom:error InvalidLiquidationThreshold is thrown when the collateral factor is above the liquidation threshold
     * @custom:error ExceedsTierLimit is thrown when either value is beyond the tier
     */
    function checkCollateralFactor(
        address comptroller,
        address vToken,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external view {
        _checkMarketListed(comptroller, vToken);
        if (SPOKE_POOL_MANAGER.isLoanMarket(vToken)) {
            revert ISpokePoolManager.InvalidMarketType(vToken);
        }
        if (collateralFactor > liquidationThreshold) {
            revert ISpokePoolManager.InvalidLiquidationThreshold(vToken);
        }
        _checkCollateralParams(
            SPOKE_POOL_MANAGER.getTier(SPOKE_POOL_MANAGER.getPool(comptroller).tierId),
            collateralFactor,
            liquidationThreshold
        );
    }

    /**
     * @notice Checks a deployer's new supply cap: a loan market's raise must keep the loan markets' caps, in USD,
     *   within the tier. Collateral caps are not bounded
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @param newSupplyCap The new supply cap
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error ExceedsTierLimit is thrown when a raise takes the loan liquidity beyond the tier
     */
    function checkSupplyCap(address comptroller, address vToken, uint256 newSupplyCap) external view {
        _checkMarketListed(comptroller, vToken);
        uint256 supplyCap = SpokeComptroller(comptroller).supplyCaps(vToken);
        if (!SPOKE_POOL_MANAGER.isLoanMarket(vToken) || newSupplyCap <= supplyCap) {
            return;
        }
        uint256 raiseUsd = ((newSupplyCap - supplyCap) *
            SPOKE_POOL_MANAGER.RESILIENT_ORACLE().getUnderlyingPrice(vToken)) / EXP_SCALE;
        uint256 liquidityUsd = _loanLiquidityUsd(comptroller, SpokeComptroller(comptroller).getAllMarkets());
        uint256 tierId = SPOKE_POOL_MANAGER.getPool(comptroller).tierId;
        if (liquidityUsd + raiseUsd > SPOKE_POOL_MANAGER.getTier(tierId).maxLiquidityUsd) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }

    /**
     * @notice Checks a market is a listed loan market of the pool, the only kind whose borrow cap a deployer sets
     * @param comptroller The pool's comptroller
     * @param vToken The market
     * @custom:error MarketNotListed is thrown when the market is not listed in the pool
     * @custom:error InvalidMarketType is thrown when the market is a collateral market
     */
    function checkLoanMarket(address comptroller, address vToken) external view {
        _checkMarketListed(comptroller, vToken);
        if (!SPOKE_POOL_MANAGER.isLoanMarket(vToken)) {
            revert ISpokePoolManager.InvalidMarketType(vToken);
        }
    }

    /**
     * @dev Checks new markets against a tier: the pool's market count, each market, and the loan liquidity together
     * with the pool's
     * @param comptroller The pool, or zero for a new pool
     * @param tier The tier
     * @param markets The new markets
     */
    function _checkMarkets(
        address comptroller,
        SpokePoolManagerStorage.Tier memory tier,
        SpokePoolManagerStorage.MarketParams[] memory markets
    ) internal view {
        uint256 marketCount = markets.length;
        uint256 poolMarketCount = marketCount;
        VToken[] memory poolMarkets;
        if (comptroller != address(0)) {
            poolMarkets = SpokeComptroller(comptroller).getAllMarkets();
            poolMarketCount += poolMarkets.length;
        }
        uint256 maxPoolMarkets = SPOKE_POOL_MANAGER.MAX_POOL_MARKETS();
        if (poolMarketCount > maxPoolMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolMarketCount, maxPoolMarkets);
        }
        uint256 liquidityUsd;
        for (uint256 i; i < marketCount; ++i) {
            _checkUniqueAsset(comptroller, markets, i);
            liquidityUsd += _checkMarket(tier, markets[i]);
        }
        if (liquidityUsd != 0 && comptroller != address(0)) {
            liquidityUsd += _loanLiquidityUsd(comptroller, poolMarkets);
        }
        if (liquidityUsd > tier.maxLiquidityUsd) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }

    /**
     * @dev Checks a market's asset is in no earlier market of the request and not in the pool
     * @param comptroller The pool, or zero for a new pool
     * @param markets The request's markets
     * @param index The market to check
     */
    function _checkUniqueAsset(
        address comptroller,
        SpokePoolManagerStorage.MarketParams[] memory markets,
        uint256 index
    ) internal view {
        address asset = markets[index].asset;
        // A nested loop is bounded by `MAX_POOL_MARKETS`
        for (uint256 j; j < index; ++j) {
            if (markets[j].asset == asset) {
                revert ISpokePoolManager.DuplicateAsset(asset);
            }
        }
        if (
            comptroller != address(0) &&
            PoolRegistryInterface(SPOKE_POOL_MANAGER.POOL_REGISTRY()).getVTokenForAsset(comptroller, asset) !=
            address(0)
        ) {
            revert ISpokePoolManager.DuplicateAsset(asset);
        }
    }

    /**
     * @dev Checks one new market against a tier. A zero interest rate model or initial exchange rate is left to
     * `VToken.initialize`, which rejects it when the proposer deploys the market, before the vote
     * @param tier The tier
     * @param market The market
     * @return liquidityUsd A loan market's supply cap in USD; zero for a collateral market
     */
    function _checkMarket(
        SpokePoolManagerStorage.Tier memory tier,
        SpokePoolManagerStorage.MarketParams memory market
    ) internal view returns (uint256 liquidityUsd) {
        address asset = market.asset;
        if (
            bytes(market.name).length == 0 ||
            bytes(market.symbol).length == 0 ||
            market.decimals == 0 ||
            market.seed > market.supplyCap ||
            market.seedBurnPercent == 0 ||
            market.seedBurnPercent > MANTISSA_ONE
        ) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        if (market.isLoanMarket) {
            if (market.collateralFactor != 0 || market.liquidationThreshold != 0) {
                revert ISpokePoolManager.InvalidMarketParams(asset);
            }
            if (SPOKE_POOL_MANAGER.spokeSources(asset) == address(0)) {
                revert ISpokePoolManager.UnsupportedAsset(asset);
            }
            return (market.supplyCap * SPOKE_POOL_MANAGER.RESILIENT_ORACLE().getPrice(asset)) / EXP_SCALE;
        }
        if (market.borrowCap != 0 || market.collateralFactor > market.liquidationThreshold) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        _checkCollateralParams(tier, market.collateralFactor, market.liquidationThreshold);
        if (!SPOKE_POOL_MANAGER.DEVIATION_BOUNDED_ORACLE().isBoundedPricingEnabled(asset)) {
            revert ISpokePoolManager.UnsupportedAsset(asset);
        }
    }

    /**
     * @dev Checks a market is listed in a pool
     * @param comptroller The pool's comptroller
     * @param vToken The market
     */
    function _checkMarketListed(address comptroller, address vToken) internal view {
        if (!SpokeComptroller(comptroller).isMarketListed(VToken(vToken))) {
            revert ISpokePoolManager.MarketNotListed(vToken);
        }
    }

    /**
     * @dev Returns the summed USD value of a pool's loan market supply caps; an uncapped loan market overflows and
     * reverts, since it fits no tier
     * @param comptroller The pool's comptroller
     * @param markets The pool's markets
     * @return liquidityUsd The value
     */
    function _loanLiquidityUsd(
        address comptroller,
        VToken[] memory markets
    ) internal view returns (uint256 liquidityUsd) {
        ResilientOracleInterface oracle = SPOKE_POOL_MANAGER.RESILIENT_ORACLE();
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(markets[i]);
            if (SPOKE_POOL_MANAGER.isLoanMarket(vToken)) {
                liquidityUsd +=
                    (SpokeComptroller(comptroller).supplyCaps(vToken) * oracle.getUnderlyingPrice(vToken)) /
                    EXP_SCALE;
            }
        }
    }

    /**
     * @dev Checks a collateral factor and liquidation threshold against a tier's bounds
     * @param tier The tier
     * @param collateralFactor The collateral factor
     * @param liquidationThreshold The liquidation threshold
     */
    function _checkCollateralParams(
        SpokePoolManagerStorage.Tier memory tier,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) internal pure {
        if (
            collateralFactor > tier.maxCollateralFactor ||
            liquidationThreshold > tier.maxLiquidationThreshold ||
            liquidationThreshold < tier.minLiquidationThreshold
        ) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }
}

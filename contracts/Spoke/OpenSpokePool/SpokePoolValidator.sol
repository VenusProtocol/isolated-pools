// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistryInterface } from "../../Pool/PoolRegistryInterface.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IRiskOracle } from "../interfaces/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../interfaces/IRiskStewardReceiver.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolValidator } from "../interfaces/ISpokePoolValidator.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolValidator
 * @author Venus
 * @notice Checks `SpokePoolManager` requests and deployer updates against the pool tiers, reading the manager's state
 * and reverting with the manager's errors. It is split out of the manager for bytecode size, as `ComptrollerLens` is
 * from the core pool's Comptroller
 */
contract SpokePoolValidator is ISpokePoolValidator {
    /// @dev RiskOracle update type of the supply caps the manager publishes
    string internal constant SUPPLY_CAP_UPDATE = "supplyCap";

    /// @notice The manager whose requests and pools are checked
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice The receiver that applies the manager's published updates, which tells which are not applied yet
    IRiskStewardReceiver public immutable RISK_STEWARD_RECEIVER;

    /// @notice The manager's pool registry
    PoolRegistryInterface public immutable POOL_REGISTRY;

    /// @notice The manager's ResilientOracle
    ResilientOracleInterface public immutable RESILIENT_ORACLE;

    /// @notice The manager's DeviationBoundedOracle
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

    /// @notice The RiskOracle the manager publishes deployer updates to
    IRiskOracle public immutable RISK_ORACLE;

    /**
     * @dev Copies the manager's registry and oracles, which are immutables of its implementation, so a manager upgrade
     *   that changes them needs a new validator
     * @param spokePoolManager The manager whose requests and pools are checked
     * @param riskStewardReceiver The receiver that applies the manager's published updates
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     */
    constructor(SpokePoolManager spokePoolManager, IRiskStewardReceiver riskStewardReceiver) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(address(riskStewardReceiver));
        SPOKE_POOL_MANAGER = spokePoolManager;
        RISK_STEWARD_RECEIVER = riskStewardReceiver;
        POOL_REGISTRY = PoolRegistryInterface(spokePoolManager.POOL_REGISTRY());
        RESILIENT_ORACLE = spokePoolManager.RESILIENT_ORACLE();
        DEVIATION_BOUNDED_ORACLE = spokePoolManager.DEVIATION_BOUNDED_ORACLE();
        RISK_ORACLE = spokePoolManager.RISK_ORACLE();
    }

    /// @inheritdoc ISpokePoolValidator
    function accrueAndCheckResidualDebt(address comptroller) external {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            uint256 debt = vToken.totalBorrowsCurrent() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * RESILIENT_ORACLE.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }
        if (debtUsd > SPOKE_POOL_MANAGER.maxResidualPoolDebtUsd()) {
            revert ISpokePoolManager.ResidualDebtExceeded(debtUsd);
        }
    }

    /// @inheritdoc ISpokePoolValidator
    function verifyRequest(uint256 requestId) external view {
        SpokePoolManagerStorage.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        SpokePoolManagerStorage.RequestType requestType = request.requestType;
        if (requestType == SpokePoolManagerStorage.RequestType.Tier) {
            revert ISpokePoolManager.InvalidRequestType(requestId);
        }
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
        if (request.markets.length == 0) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        _checkMarkets(comptroller, SPOKE_POOL_MANAGER.getTier(livePool.tierId), request.markets);
    }

    /// @inheritdoc ISpokePoolValidator
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
        if (_loanLiquidityUsd(comptroller, markets, address(0)) > tier.maxLiquidityUsd) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }

    /// @inheritdoc ISpokePoolValidator
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

    /// @inheritdoc ISpokePoolValidator
    function checkSupplyCap(address comptroller, address vToken, uint256 newSupplyCap) external view {
        _checkMarketListed(comptroller, vToken);
        uint256 supplyCap = SpokeComptroller(comptroller).supplyCaps(vToken);
        if (!SPOKE_POOL_MANAGER.isLoanMarket(vToken) || newSupplyCap <= supplyCap) {
            return;
        }
        // The new cap stands in for the market's earlier ones: a registered raise that may still apply passed this
        // check when published, and the other markets' raises count it
        uint256 liquidityUsd = _loanLiquidityUsd(comptroller, SpokeComptroller(comptroller).getAllMarkets(), vToken) +
            (newSupplyCap * RESILIENT_ORACLE.getUnderlyingPrice(vToken)) /
            EXP_SCALE;
        uint256 tierId = SPOKE_POOL_MANAGER.getPool(comptroller).tierId;
        if (liquidityUsd > SPOKE_POOL_MANAGER.getTier(tierId).maxLiquidityUsd) {
            revert ISpokePoolManager.ExceedsTierLimit();
        }
    }

    /// @inheritdoc ISpokePoolValidator
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
            liquidityUsd += _loanLiquidityUsd(comptroller, poolMarkets, address(0));
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
        if (comptroller != address(0) && POOL_REGISTRY.getVTokenForAsset(comptroller, asset) != address(0)) {
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
            return (market.supplyCap * RESILIENT_ORACLE.getPrice(asset)) / EXP_SCALE;
        }
        if (market.borrowCap != 0 || market.collateralFactor > market.liquidationThreshold) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        _checkCollateralParams(tier, market.collateralFactor, market.liquidationThreshold);
        if (!DEVIATION_BOUNDED_ORACLE.isBoundedPricingEnabled(asset)) {
            revert ISpokePoolManager.UnsupportedAsset(asset);
        }
    }

    /**
     * @dev Returns the summed USD value of a pool's loan market supply caps, each the higher of its applied cap and a
     * cap the receiver may still apply, so raises published together are checked against the tier as a whole. An
     * uncapped loan market overflows and reverts, since it fits no tier
     * @param comptroller The pool's comptroller
     * @param markets The pool's markets
     * @param excluded A market left out, or zero
     * @return liquidityUsd The value
     */
    function _loanLiquidityUsd(
        address comptroller,
        VToken[] memory markets,
        address excluded
    ) internal view returns (uint256 liquidityUsd) {
        uint256 marketCount = markets.length;
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(markets[i]);
            if (vToken != excluded && SPOKE_POOL_MANAGER.isLoanMarket(vToken)) {
                uint256 supplyCap = SpokeComptroller(comptroller).supplyCaps(vToken);
                // The higher one: a pending cut may never be applied, and then the applied cap stays
                uint256 pendingSupplyCap = _pendingSupplyCap(vToken);
                if (pendingSupplyCap > supplyCap) {
                    supplyCap = pendingSupplyCap;
                }
                liquidityUsd += (supplyCap * RESILIENT_ORACLE.getUnderlyingPrice(vToken)) / EXP_SCALE;
            }
        }
    }

    /**
     * @dev Returns the higher of a market's supply caps the receiver may still apply, or zero: the latest one published
     * to the RiskOracle while not processed, until a newer one is published, and the last one registered while pending,
     * which the receiver still executes after a newer one is published, until the receiver resolves it. Either counts
     * even once too old to apply
     * @param vToken The market
     * @return pendingSupplyCap The supply cap
     */
    function _pendingSupplyCap(address vToken) internal view returns (uint256 pendingSupplyCap) {
        uint256 publishedId = RISK_ORACLE.getLatestUpdateIdByTypeAndMarket(SUPPLY_CAP_UPDATE, vToken);
        if (
            publishedId != 0 &&
            RISK_STEWARD_RECEIVER.updates(publishedId).status == IRiskStewardReceiver.UpdateStatus.None
        ) {
            pendingSupplyCap = abi.decode(RISK_ORACLE.getUpdateById(publishedId).newValue, (uint256));
        }
        uint256 registeredId = RISK_STEWARD_RECEIVER.getLastRegisteredUpdate(SUPPLY_CAP_UPDATE, vToken);
        if (
            registeredId != 0 &&
            RISK_STEWARD_RECEIVER.updates(registeredId).status == IRiskStewardReceiver.UpdateStatus.Pending
        ) {
            uint256 registeredSupplyCap = abi.decode(RISK_ORACLE.getUpdateById(registeredId).newValue, (uint256));
            if (registeredSupplyCap > pendingSupplyCap) {
                pendingSupplyCap = registeredSupplyCap;
            }
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

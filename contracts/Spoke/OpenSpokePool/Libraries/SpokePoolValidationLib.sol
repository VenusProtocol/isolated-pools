// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistry } from "../../../Pool/PoolRegistry.sol";
import { VToken } from "../../../VToken.sol";
import { EXP_SCALE } from "../../../lib/constants.sol";
import { SpokeComptroller } from "../../SpokeComptroller.sol";
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokePoolManager } from "../../interfaces/ISpokePoolManager.sol";
import { ISpokePoolPolicyRegistry } from "../../interfaces/ISpokePoolPolicyRegistry.sol";
import { IChainlinkFeed } from "../../interfaces/external/IChainlinkFeed.sol";
import { IResilientOracle } from "../../interfaces/external/IResilientOracle.sol";

/**
 * @title SpokePoolValidationLib
 * @author Venus
 * @notice The checks of `SpokePoolManager`, linked to keep the manager under the EIP-170 size limit: what a deployer
 * requests, each market's $10 seed, and a closing pool's debt. It only reads; the manager
 * owns every write and `SpokePoolGovernanceLib` every outbound action
 * @dev The manager calls it through DELEGATECALL, so `address(this)` and `msg.sender` are the manager's. It writes no
 * manager state and emits no events; the errors are `ISpokePoolManager`'s
 */
library SpokePoolValidationLib {
    /// @dev Lowest USD value of a market's seed, scaled by 1e18
    uint256 internal constant MIN_SEED_USD = 10e18;

    // ──────────────────────────────────────────────────────────────────────
    // Exit checks
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a pool's debt, its borrows plus bad debt priced in USD, is at most `maxDebtUsd`
     * @dev Not a view: `totalBorrowsCurrent` accrues each market's interest. It writes no manager state
     * @param resilientOracle The oracle the debt is priced with
     * @param comptroller The pool's comptroller
     * @param maxDebtUsd The debt the pool may close with
     * @custom:error ResidualDebtExceeded is thrown when the debt is above `maxDebtUsd`
     */
    function ensureResidualDebtBelowMax(
        ResilientOracleInterface resilientOracle,
        address comptroller,
        uint256 maxDebtUsd
    ) external {
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        uint256 debtUsd;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = vTokens[i];
            uint256 debt = vToken.totalBorrowsCurrent() + vToken.badDebt();
            if (debt != 0) {
                debtUsd += (debt * resilientOracle.getUnderlyingPrice(address(vToken))) / EXP_SCALE;
            }
        }

        if (debtUsd > maxDebtUsd) {
            revert ISpokePoolManager.ResidualDebtExceeded(debtUsd);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Request checks
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a new pool's tier is enabled, its bond asset allowed and its bond worth what the tier requires,
     *   valued as it will be once deposited in its source, so the pool's later bond checks pass at once
     * @param contracts The manager's contracts
     * @param tierId The requested tier
     * @param bondAsset The bond's asset
     * @param bondAmount The bond's amount
     * @custom:error TierDisabled is thrown when the tier is disabled
     * @custom:error The `_ensureRequiredBondValue` errors
     */
    function validateNewBond(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address bondAsset,
        uint256 bondAmount
    ) external view {
        if (!contracts.policyRegistry.getTier(tierId).enabled) {
            revert ISpokePoolManager.TierDisabled(tierId);
        }

        _ensureRequiredBondValue(
            contracts,
            tierId,
            bondAsset,
            contracts.bondManager.previewBondAmount(bondAsset, bondAmount)
        );
    }

    /**
     * @notice Checks a live pool's bond against a tier before a markets or tier request, as
     *   `_ensureRequiredBondValue` does
     * @param contracts The manager's contracts
     * @param comptroller The pool's comptroller
     * @param tierId The pool's tier, or a tier request's target tier
     * @custom:error The `_ensureRequiredBondValue` errors
     */
    function validateBond(
        ISpokePoolManager.Contracts memory contracts,
        address comptroller,
        uint256 tierId
    ) external view {
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));

        _ensureRequiredBondValue(contracts, tierId, address(bondAccount.asset()), bondAccount.currentBondAmount());
    }

    /**
     * @notice Returns the bond a pool's tier requires, in the pool's bond asset at the current price: the floor its
     *   withdrawals keep
     * @param contracts The manager's contracts
     * @param tierId The pool's tier
     * @param comptroller The pool's comptroller
     * @return The required bond, in the asset, rounded up
     * @custom:error BondAssetNotAllowed is thrown by the registry when the bond asset has no factor
     */
    function requiredBondAmount(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address comptroller
    ) external view returns (uint256) {
        address bondAsset = address(IBondAccount(contracts.bondManager.bondAccounts(comptroller)).asset());
        uint256 requiredBondUsd = contracts.policyRegistry.getRequiredBondUsd(tierId, bondAsset);
        uint256 price = contracts.resilientOracle.getPrice(bondAsset);
        return (requiredBondUsd * EXP_SCALE + price - 1) / price;
    }

    /**
     * @notice Checks a collateral market's supply cap is worth at most its tier's maximum, after its feed changed
     * @param contracts The manager's contracts
     * @param tierId The request's tier
     * @param market The collateral market
     * @custom:error InvalidOracleFeed is thrown when an unpriced asset's main feed is missing or has no live positive
     *   answer, a set feed has no staleness limit, two of its feeds share an oracle, or it has a fallback feed without
     *   a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when the supply cap is worth more than the tier allows
     */
    function checkSupplyCapUsd(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        ISpokePoolManager.CollateralMarketRequestParams memory market
    ) external view {
        ISpokePoolPolicyRegistry.PoolLimits memory limits = contracts.policyRegistry.getTier(tierId).limits;
        _checkSupplyCapUsd(contracts, market, limits.maxCollateralSupplyCapUsd);
    }

    /**
     * @notice Returns each new market's seed, worth $10 at current prices, for the manager to pull from the request's
     *   deployer at its build
     * @param contracts The manager's contracts
     * @param request The pool or markets request, with its markets stored
     * @return assets The markets' assets, collateral markets first
     * @return seeds Each asset's seed
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, a set feed has no staleness limit, two of its feeds share an oracle, or it has a fallback
     *   feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     */
    function computeSeeds(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.Request storage request
    ) external view returns (address[] memory assets, uint256[] memory seeds) {
        uint256 collateralCount = request.collateralMarkets.length;
        uint256 loanCount = request.loanMarkets.length;
        assets = new address[](collateralCount + loanCount);
        seeds = new uint256[](collateralCount + loanCount);

        // Collateral markets: priced by the ResilientOracle or their main feed, capped by the deployer
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = request.collateralMarkets[i];
            assets[i] = market.asset;
            seeds[i] = _seed(market.asset, _collateralPrice(contracts, market), market.supplyCap);
        }

        // Loan markets: priced by the ResilientOracle, capped by their USD cap at that price
        for (uint256 i; i < loanCount; ++i) {
            address asset = request.loanMarkets[i].asset;
            uint256 price = contracts.resilientOracle.getPrice(asset);
            uint256 supplyCapUsd = contracts.policyRegistry.getLoanSupplyCapUsd(request.tierId, asset);
            assets[collateralCount + i] = asset;
            seeds[collateralCount + i] = _seed(asset, price, (supplyCapUsd * EXP_SCALE) / price);
        }
    }

    /**
     * @notice Checks a request's markets against its pool and its tier's current limits: the market counts, each
     *   collateral market's factors and supply cap worth, each loan market's asset and model, and that no asset
     *   repeats. The manager calls it again at build, as the pool, the tier and the prices may have changed since the
     *   request
     * @param contracts The manager's contracts
     * @param request The pool or markets request, with its markets stored
     * @custom:error InvalidArrayLength is thrown when the request has no market
     * @custom:error TooManyMarkets is thrown when the pool would have more markets, or collateral markets, than allowed
     * @custom:error InvalidMarketParams is thrown when a collateral factor is above its liquidation threshold
     * @custom:error ExceedsTierLimit is thrown when a collateral factor, liquidation threshold or supply cap's worth is
     *   above the tier's
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, a set feed has no staleness limit, two of its feeds share an oracle, or it has a fallback
     *   feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error LoanAssetNotAllowed is thrown when a loan market's asset is not a loan asset
     * @custom:error InterestRateModelNotAllowed is thrown when a loan market's model is not one of its asset's
     * @custom:error DuplicateAsset is thrown when an asset repeats in the request or is already in the pool
     */
    function validateMarkets(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.Request storage request
    ) external view {
        ISpokePoolPolicyRegistry.PoolLimits memory limits = contracts.policyRegistry.getTier(request.tierId).limits;
        _checkPoolMarkets(contracts, request, limits.maxCollateralMarkets);
        _checkCollateralMarkets(contracts, request, limits);
        _checkLoanMarkets(contracts.policyRegistry, request);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @dev Checks a request's markets as a set: there is at least one, the pool stays within the builder's market
     *   limit and the tier's collateral market limit, and no asset repeats in the request or is already in the pool.
     *   Reverts with InvalidArrayLength, TooManyMarkets or DuplicateAsset
     */
    function _checkPoolMarkets(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.Request storage request,
        uint256 maxCollateralMarkets
    ) private view {
        uint256 collateralCount = request.collateralMarkets.length;
        uint256 loanCount = request.loanMarkets.length;
        uint256 marketCount = collateralCount + loanCount;
        if (marketCount == 0) {
            revert ISpokePoolManager.InvalidArrayLength();
        }

        // Zero, or not yet listed, for a new pool
        address comptroller = request.comptroller;
        (uint256 poolMarketCount, uint256 poolCollateralCount) = _countPoolMarkets(comptroller);
        poolMarketCount += marketCount;
        uint256 maxPoolMarkets = contracts.proposalBuilder.MAX_POOL_MARKETS();
        if (poolMarketCount > maxPoolMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolMarketCount, maxPoolMarkets);
        }
        poolCollateralCount += collateralCount;
        if (poolCollateralCount > maxCollateralMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolCollateralCount, maxCollateralMarkets);
        }

        address[] memory assets = new address[](marketCount);
        for (uint256 i; i < collateralCount; ++i) {
            assets[i] = request.collateralMarkets[i].asset;
        }
        for (uint256 i; i < loanCount; ++i) {
            assets[collateralCount + i] = request.loanMarkets[i].asset;
        }

        address poolRegistry = contracts.proposalBuilder.POOL_REGISTRY();
        for (uint256 i; i < marketCount; ++i) {
            _checkUniqueAsset(poolRegistry, comptroller, assets, i);
        }
    }

    /**
     * @dev Checks each collateral market's factor is at most its liquidation threshold, and both, and its supply cap's
     *   worth, are within the tier's limits. Reverts with InvalidMarketParams, ExceedsTierLimit or the pricing errors
     */
    function _checkCollateralMarkets(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.Request storage request,
        ISpokePoolPolicyRegistry.PoolLimits memory limits
    ) private view {
        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = request.collateralMarkets[i];
            if (market.collateralFactor > market.liquidationThreshold) {
                revert ISpokePoolManager.InvalidMarketParams(market.asset);
            }
            if (
                market.collateralFactor > limits.maxCollateralFactor ||
                market.liquidationThreshold > limits.maxLiquidationThreshold
            ) {
                revert ISpokePoolManager.ExceedsTierLimit(market.asset);
            }
            _checkSupplyCapUsd(contracts, market, limits.maxCollateralSupplyCapUsd);
        }
    }

    /**
     * @dev Checks each loan market's asset is a loan asset, with one of its interest rate models. Reverts with
     *   LoanAssetNotAllowed or InterestRateModelNotAllowed
     */
    function _checkLoanMarkets(
        ISpokePoolPolicyRegistry policyRegistry,
        ISpokePoolManager.Request storage request
    ) private view {
        uint256 tierId = request.tierId;
        uint256 loanCount = request.loanMarkets.length;
        for (uint256 i; i < loanCount; ++i) {
            ISpokePoolManager.LoanMarketRequestParams memory market = request.loanMarkets[i];
            // Zero only for an asset that is not a loan asset, as `setTier` rejects a zero cap
            if (policyRegistry.getLoanSupplyCapUsd(tierId, market.asset) == 0) {
                revert ISpokePoolManager.LoanAssetNotAllowed(market.asset);
            }
            if (!policyRegistry.isAllowedInterestRateModel(market.asset, market.interestRateModel)) {
                revert ISpokePoolManager.InterestRateModelNotAllowed(market.interestRateModel);
            }
        }
    }

    /**
     * @dev Returns how many listed markets a pool has and how many of them are collateral; zero for a new pool. An
     *   unlisted market stays in `getAllMarkets` but takes no slot. A loan market is one whose supply allowlist is on,
     *   as its listing VIP enables it for the Hub
     */
    function _countPoolMarkets(
        address comptroller
    ) private view returns (uint256 marketCount, uint256 collateralMarketCount) {
        if (comptroller != address(0)) {
            VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
            uint256 allMarketCount = vTokens.length;
            for (uint256 i; i < allMarketCount; ++i) {
                VToken vToken = vTokens[i];
                if (!SpokeComptroller(comptroller).isMarketListed(vToken)) {
                    continue;
                }
                ++marketCount;
                if (!SpokeComptroller(comptroller).isSupplyAllowlistEnabled(address(vToken))) {
                    ++collateralMarketCount;
                }
            }
        }
    }

    /// @dev Checks a market's asset is in no earlier market of the request and not in the pool
    function _checkUniqueAsset(
        address poolRegistry,
        address comptroller,
        address[] memory assets,
        uint256 index
    ) private view {
        address asset = assets[index];
        // A nested loop bounded by the builder's `MAX_POOL_MARKETS`
        for (uint256 j; j < index; ++j) {
            if (assets[j] == asset) {
                revert ISpokePoolManager.DuplicateAsset(asset);
            }
        }

        // A pool not built yet has no comptroller, so no market in the registry
        if (
            comptroller != address(0) && PoolRegistry(poolRegistry).getVTokenForAsset(comptroller, asset) != address(0)
        ) {
            revert ISpokePoolManager.DuplicateAsset(asset);
        }
    }

    /// @dev Checks a collateral market's supply cap is worth at most `maxSupplyCapUsd`
    function _checkSupplyCapUsd(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.CollateralMarketRequestParams memory market,
        uint256 maxSupplyCapUsd
    ) private view {
        if ((market.supplyCap * _collateralPrice(contracts, market)) / EXP_SCALE > maxSupplyCapUsd) {
            revert ISpokePoolManager.ExceedsTierLimit(market.asset);
        }
    }

    /**
     * @dev Returns a collateral asset's price, scaled like the ResilientOracle's: from the ResilientOracle once it
     *   prices the asset, else from the market's main feed, whose latest answer must be positive and within the feed's
     *   staleness limit. The pivot and fallback feeds are not considered, but every set feed's oracle is checked
     */
    function _collateralPrice(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.CollateralMarketRequestParams memory market
    ) private view returns (uint256) {
        address asset = market.asset;
        if (IResilientOracle(address(contracts.resilientOracle)).getTokenConfig(asset).asset != address(0)) {
            return contracts.resilientOracle.getPrice(asset);
        }

        ISpokePoolManager.OracleFeed[3] memory feeds = market.feeds;
        // The main feed, the first one, is required
        if (feeds[0].feed == address(0)) {
            revert ISpokePoolManager.InvalidOracleFeed(asset);
        }
        _checkFeedOracles(asset, feeds);

        // Only the main feed prices the asset here
        IChainlinkFeed feed = IChainlinkFeed(feeds[0].feed);
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > feeds[0].maxStalePeriod) {
            revert ISpokePoolManager.InvalidOracleFeed(asset);
        }

        // As the ChainlinkOracle scales it: to 18 decimals, then by the asset's decimals. It scales each separately,
        // so it cannot price a feed or an asset with more than 18
        uint8 feedDecimals = feed.decimals();
        uint8 assetDecimals = IERC20MetadataUpgradeable(asset).decimals();
        if (feedDecimals > 18 || assetDecimals > 18) {
            revert ISpokePoolManager.InvalidOracleFeed(asset);
        }
        return uint256(answer) * 10 ** (36 - feedDecimals - assetDecimals);
    }

    /**
     * @dev Checks each set feed has a staleness limit and is on one of the manager's supported oracles, and on its own:
     *   one oracle holds one feed per asset, so a second feed would replace the first. A fallback feed needs a pivot
     *   feed, as the ResilientOracle only uses a fallback price it can check against the pivot. Reverts with
     *   UnsupportedOracle or InvalidOracleFeed
     */
    function _checkFeedOracles(address asset, ISpokePoolManager.OracleFeed[3] memory feeds) private view {
        if (feeds[2].feed != address(0) && feeds[1].feed == address(0)) {
            revert ISpokePoolManager.InvalidOracleFeed(asset);
        }

        ISpokePoolManager manager = ISpokePoolManager(address(this));
        address[3] memory supportedOracles = [
            manager.supportedOracles(0),
            manager.supportedOracles(1),
            manager.supportedOracles(2)
        ];

        for (uint256 i; i < 3; ++i) {
            if (feeds[i].feed == address(0)) {
                continue;
            }
            if (feeds[i].maxStalePeriod == 0) {
                revert ISpokePoolManager.InvalidOracleFeed(asset);
            }

            address oracle = feeds[i].oracle;
            if (
                oracle == address(0) ||
                (oracle != supportedOracles[0] && oracle != supportedOracles[1] && oracle != supportedOracles[2])
            ) {
                revert ISpokePoolManager.UnsupportedOracle(oracle);
            }

            // Rejects two feeds on the same oracle. An oracle keeps only one feed per asset, so the second feed would
            // overwrite the first
            for (uint256 j; j < i; ++j) {
                if (feeds[j].feed != address(0) && feeds[j].oracle == oracle) {
                    revert ISpokePoolManager.InvalidOracleFeed(asset);
                }
            }
        }
    }

    /**
     * @dev Checks a bond on every request, so a deployer short of it tops up first: `amount`, what the bond holds or
     *   a new bond's amount, must be worth the whole bond `tierId` requires. The tier's coverage ratio, at most 100%,
     *   only loosens the deployer's risk setters. Reverts with the registry's BondAssetNotAllowed when the asset has
     *   no factor, or InsufficientBondValue
     */
    function _ensureRequiredBondValue(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address bondAsset,
        uint256 amount
    ) private view {
        uint256 requiredBondUsd = contracts.policyRegistry.getRequiredBondUsd(tierId, bondAsset);
        uint256 amountUsd = (amount * contracts.resilientOracle.getPrice(bondAsset)) / EXP_SCALE;
        if (amountUsd < requiredBondUsd) {
            revert ISpokePoolManager.InsufficientBondValue(amountUsd, requiredBondUsd);
        }
    }

    /// @dev Returns $10 of `asset` at `price`, rounded up so the seed is never worth less
    function _seed(address asset, uint256 price, uint256 supplyCap) private pure returns (uint256 seed) {
        seed = (MIN_SEED_USD * EXP_SCALE + price - 1) / price;
        // The seed is supplied at listing, so it must fit in the market's supply cap
        if (seed > supplyCap) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
    }
}

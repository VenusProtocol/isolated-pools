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

    /**
     * @notice Checks no market of a pool holds bad debt, which a seizure of the whole bond, excess included, may repay
     * @param comptroller The pool's comptroller
     * @custom:error BadDebtExists is thrown when a market of the pool holds bad debt
     */
    function ensureNoBadDebt(address comptroller) external view {
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            if (vTokens[i].badDebt() != 0) {
                revert ISpokePoolManager.BadDebtExists(address(vTokens[i]));
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Request checks
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a new pool's tier is enabled, its bond asset allowed and its bond worth what the tier requires
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

        _ensureRequiredBondValue(contracts, tierId, bondAsset, bondAmount);
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
        uint256 price = bondAssetPrice(contracts, bondAsset);
        return (requiredBondUsd * EXP_SCALE + price - 1) / price;
    }

    /**
     * @notice Returns how much a pool's bond is worth at current prices
     * @param contracts The manager's contracts
     * @param comptroller The pool's comptroller
     * @return bondUsd What the bond holds, net of a loss and a Hub's exit fee, in USD scaled by 1e18
     */
    function getBondValue(
        ISpokePoolManager.Contracts memory contracts,
        address comptroller
    ) external view returns (uint256 bondUsd) {
        (, bondUsd) = bondValue(contracts, comptroller);
    }

    /**
     * @notice Returns each new market's seed, worth $10 at current prices, for the manager to pull from the request's
     *   deployer at the request
     * @param contracts The manager's contracts
     * @param request The pool or markets request, with its markets stored
     * @return assets The markets' assets, collateral markets first
     * @return seeds Each asset's seed
     * @custom:error InvalidOracleConfig is thrown when an unpriced collateral asset's feed is missing, has no staleness
     *   limit or no live positive answer, or it or the asset has more than 18 decimals
     * @custom:error UnsupportedOracle is thrown when an unpriced collateral asset's feed is on an oracle the registry
     *   does not support
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

        // Collateral markets: priced by the ResilientOracle or their feed, capped by the deployer
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
     * @custom:error InvalidOracleConfig is thrown when an unpriced collateral asset's feed is missing, has no staleness
     *   limit or no live positive answer, or it or the asset has more than 18 decimals
     * @custom:error UnsupportedOracle is thrown when an unpriced collateral asset's feed is on an oracle the registry
     *   does not support
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

    /**
     * @notice Checks the oracle config of a collateral asset the ResilientOracle does not price, and returns the
     *   asset's price from its feed, scaled like the ResilientOracle's. The feed must be on a supported oracle, with a
     *   positive answer within its staleness limit
     * @param contracts The manager's contracts
     * @param asset The collateral asset
     * @param oracleConfig The asset's oracle config
     * @return The asset's price
     * @custom:error InvalidOracleConfig is thrown when the config has no feed or no staleness limit, the feed has no
     *   live positive answer, or it or the asset has more than 18 decimals
     * @custom:error UnsupportedOracle is thrown when the config's oracle is not one the registry supports
     */
    function validateOracleConfig(
        ISpokePoolManager.Contracts memory contracts,
        address asset,
        ISpokePoolManager.OracleConfig memory oracleConfig
    ) public view returns (uint256) {
        if (oracleConfig.feed == address(0) || oracleConfig.maxStalePeriod == 0) {
            revert ISpokePoolManager.InvalidOracleConfig(asset);
        }
        // A zero oracle is never supported
        if (!contracts.policyRegistry.isSupportedOracle(oracleConfig.oracle)) {
            revert ISpokePoolManager.UnsupportedOracle(oracleConfig.oracle);
        }

        // The ChainlinkOracle's checks, so a feed that passes here prices the asset once the VIP sets it
        IChainlinkFeed feed = IChainlinkFeed(oracleConfig.feed);
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > oracleConfig.maxStalePeriod) {
            revert ISpokePoolManager.InvalidOracleConfig(asset);
        }

        // As the ChainlinkOracle scales it: to 18 decimals, then by the asset's decimals. It scales each separately,
        // so it cannot price a feed or an asset with more than 18
        uint8 feedDecimals = feed.decimals();
        uint8 assetDecimals = IERC20MetadataUpgradeable(asset).decimals();
        if (feedDecimals > 18 || assetDecimals > 18) {
            revert ISpokePoolManager.InvalidOracleConfig(asset);
        }
        return uint256(answer) * 10 ** (18 - feedDecimals) * 10 ** (18 - assetDecimals);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns a bond asset's price: the lower of its spot price and its TWAP when the TWAP oracle has the asset
     *   enabled, so a short pump cannot inflate a bond's value; its spot price otherwise
     * @param contracts The manager's contracts
     * @param asset The bond asset
     * @return price The price, scaled like the ResilientOracle's
     * @custom:error InsufficientHistory is thrown by the TWAP oracle while an enabled asset has no TWAP
     */
    function bondAssetPrice(
        ISpokePoolManager.Contracts memory contracts,
        address asset
    ) internal view returns (uint256 price) {
        price = contracts.resilientOracle.getPrice(asset);
        (, bool isTwapEnabled, , , , , ) = contracts.twapOracle.tokenConfigs(asset);
        if (isTwapEnabled) {
            uint256 twap = contracts.twapOracle.getPrice(asset);
            if (twap < price) {
                price = twap;
            }
        }
    }

    /**
     * @dev Returns a pool's bond asset and what its bond holds, net of a loss and a Hub's exit fee, in USD. Internal,
     *   so `SpokePoolGovernanceLib` compiles it in for its coverage check instead of linking this library
     */
    function bondValue(
        ISpokePoolManager.Contracts memory contracts,
        address comptroller
    ) internal view returns (address bondAsset, uint256 bondUsd) {
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));
        bondAsset = address(bondAccount.asset());
        bondUsd = (bondAccount.currentBondAmount() * bondAssetPrice(contracts, bondAsset)) / EXP_SCALE;
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
     *   worth, are within the tier's limits, and validates its oracles. Reverts with InvalidMarketParams,
     *   ExceedsTierLimit or the oracle errors
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
            uint256 price = _collateralPrice(contracts, market);
            if ((market.supplyCap * price) / EXP_SCALE > limits.maxCollateralSupplyCapUsd) {
                revert ISpokePoolManager.ExceedsTierLimit(market.asset);
            }
        }
    }

    /**
     * @dev Returns a collateral market's price: the ResilientOracle's if it prices the asset, else its feed's, checked
     *   by `validateOracleConfig`. The ResilientOracle is asked on every call, as another pool's VIP may price the
     *   asset after this request
     */
    function _collateralPrice(
        ISpokePoolManager.Contracts memory contracts,
        ISpokePoolManager.CollateralMarketRequestParams memory market
    ) private view returns (uint256) {
        if (IResilientOracle(address(contracts.resilientOracle)).getTokenConfig(market.asset).asset != address(0)) {
            return contracts.resilientOracle.getPrice(market.asset);
        }
        // The ResilientOracle has no config for the asset yet, so the VIP sets one up with this feed. The feed is
        // checked first, so the market is never listed on a feed that cannot price it
        return validateOracleConfig(contracts, market.asset, market.oracleConfig);
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

    /**
     * @dev Checks `amount`, a new bond or what a live bond holds, is worth the whole bond `tierId` requires; the
     *   deployer's risk updates need only the tier's `minCoverageRatio` of it. Reverts with the registry's
     *   BondAssetNotAllowed when the asset has no factor, or InsufficientBondValue
     */
    function _ensureRequiredBondValue(
        ISpokePoolManager.Contracts memory contracts,
        uint256 tierId,
        address bondAsset,
        uint256 amount
    ) private view {
        uint256 requiredBondUsd = contracts.policyRegistry.getRequiredBondUsd(tierId, bondAsset);
        uint256 amountUsd = (amount * bondAssetPrice(contracts, bondAsset)) / EXP_SCALE;
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

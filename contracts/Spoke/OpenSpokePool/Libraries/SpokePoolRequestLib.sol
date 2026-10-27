// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { PoolRegistry } from "../../../Pool/PoolRegistry.sol";
import { VToken } from "../../../VToken.sol";
import { EXP_SCALE } from "../../../lib/constants.sol";
import { SpokeComptroller } from "../../SpokeComptroller.sol";
import { IBondAccount } from "../../interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../../interfaces/ITierRegistry.sol";
import { IChainlinkFeed } from "../../interfaces/external/IChainlinkFeed.sol";
import { IResilientOracle } from "../../interfaces/external/IResilientOracle.sol";
import { IRiskOracle } from "../../interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../../interfaces/external/IRiskStewardReceiver.sol";

/**
 * @title SpokePoolRequestLib
 * @author Venus
 * @notice The request checks and escrow of `SpokePoolManager`: it checks what a deployer requests, with and without
 * prices, computes each market's $10 seed, and moves the escrowed bonds and seeds in and out. Linked to keep the
 * manager under the EIP-170 size limit
 * @dev The manager calls it through DELEGATECALL, so `address(this)`, `msg.sender` and the storage are the manager's.
 * It writes only the requests' seeds, and emits no events; it changes no status. The errors are `ISpokePoolManager`'s
 */
library SpokePoolRequestLib {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The manager's contracts the libraries read
    struct Contracts {
        ResilientOracleInterface resilientOracle;
        IRiskOracle riskOracle;
        IRiskStewardReceiver riskStewardReceiver;
        ITierRegistry tierRegistry;
        ISpokeBondManager bondManager;
        ISpokePoolProposalBuilder proposalBuilder;
    }

    /// @dev Lowest USD value of a market's seed, scaled by 1e18
    uint256 internal constant MIN_SEED_USD = 10e18;

    // ──────────────────────────────────────────────────────────────────────
    // Escrow functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Pulls a new pool request's bond from its deployer into escrow
     * @param request The pool request, with its bond stored
     * @custom:error TransferAmountMismatch is thrown when the transfer delivers a different amount
     */
    function escrowBond(ISpokePoolManager.Request storage request) external {
        _transferIn(request.bondAsset, request.deployer, request.bondAmount);
    }

    /**
     * @notice Pulls each new market's seed, worth $10 at current prices, from the request's deployer at its build
     * @param contracts The manager's contracts
     * @param request The pool or markets request, with its markets stored
     * @param seeds The request's seeds by asset, from the manager's `requestSeeds`
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:error TransferAmountMismatch is thrown when a transfer delivers a different amount
     */
    function pullSeeds(
        Contracts memory contracts,
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage seeds
    ) external {
        address deployer = request.deployer;
        uint256 collateralCount = request.collateralMarkets.length;
        // Collateral markets: priced by the ResilientOracle or their main feed, capped by the deployer
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = request.collateralMarkets[i];
            _pullSeed(seeds, deployer, market.asset, _collateralPrice(contracts, market), market.supplyCap);
        }
        // Loan markets: priced by the ResilientOracle, capped by their tier
        uint256 loanCount = request.loanMarkets.length;
        for (uint256 i; i < loanCount; ++i) {
            address asset = request.loanMarkets[i].asset;
            _pullSeed(
                seeds,
                deployer,
                asset,
                contracts.resilientOracle.getPrice(asset),
                contracts.tierRegistry.getLoanSupplyCap(request.tierId, asset)
            );
        }
    }

    /**
     * @notice Sends a request's escrowed seeds to `to`: the VIP's executor at settle, which lists the markets with them
     * @param request The request
     * @param seeds The request's seeds by asset, from the manager's `requestSeeds`
     * @param to The receiver
     */
    function releaseSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage seeds,
        address to
    ) external {
        _releaseSeeds(request, seeds, to);
    }

    /**
     * @notice Refunds a canceled or rejected request's escrowed bond, for a pool request, and seeds to its deployer
     * @param request The request
     * @param seeds The request's seeds by asset, from the manager's `requestSeeds`
     */
    function refund(ISpokePoolManager.Request storage request, mapping(address => uint256) storage seeds) external {
        address deployer = request.deployer;
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            IERC20Upgradeable(request.bondAsset).safeTransfer(deployer, request.bondAmount);
        }
        _releaseSeeds(request, seeds, deployer);
    }

    /**
     * @notice Moves a settled pool request's escrowed bond to the bond manager, in its deployer's name
     * @param request The pool request, with its comptroller set at build
     * @param bondManager The bond manager
     * @custom:error The bond manager's `createBond` errors
     */
    function createBond(ISpokePoolManager.Request storage request, ISpokeBondManager bondManager) external {
        address bondAsset = request.bondAsset;
        uint256 bondAmount = request.bondAmount;
        IERC20Upgradeable(bondAsset).forceApprove(address(bondManager), bondAmount);
        bondManager.createBond(request.comptroller, request.deployer, bondAsset, bondAmount);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Request checks
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Checks a new pool's tier is enabled, its bond asset allowed and its bond's amount and coverage
     * @param contracts The manager's contracts
     * @param tierId The requested tier
     * @param bondAsset The bond's asset
     * @param bondAmount The bond's amount
     * @custom:error TierDisabled is thrown when the tier is disabled
     * @custom:error InvalidBondAsset is thrown when the bond manager does not allow the bond asset
     * @custom:error The `_checkBondCoverageAndAmount` errors
     */
    function validateTierAndBond(
        Contracts memory contracts,
        uint256 tierId,
        address bondAsset,
        uint256 bondAmount
    ) external view {
        (bool enabled, uint256 minBondUsd, ITierRegistry.PoolLimits memory limits) = contracts
            .tierRegistry
            .getTierTerms(tierId);
        if (!enabled) {
            revert ISpokePoolManager.TierDisabled(tierId);
        }
        (, , bool allowed, uint256 factor) = contracts.bondManager.assetConfigs(bondAsset);
        if (!allowed) {
            revert ISpokePoolManager.InvalidBondAsset(bondAsset);
        }
        // A bond not deposited yet has no yield, loss or exit fee, so its value is its amount
        _checkBondCoverageAndAmount(
            contracts,
            bondAsset,
            bondAmount,
            bondAmount,
            (minBondUsd * factor) / EXP_SCALE,
            limits.minCoverageRatio
        );
    }

    /**
     * @notice Checks a live pool's bond against a tier before a markets or tier request, as
     *   `_checkBondCoverageAndAmount` does
     * @param contracts The manager's contracts
     * @param comptroller The pool's comptroller
     * @param tierId The pool's tier, or a tier request's target tier
     * @custom:error The `_checkBondCoverageAndAmount` errors
     */
    function validateBond(Contracts memory contracts, address comptroller, uint256 tierId) external view {
        (, uint256 minBondUsd, ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        IBondAccount bondAccount = IBondAccount(contracts.bondManager.bondAccounts(comptroller));
        address bondAsset = address(bondAccount.asset());
        (, , , uint256 factor) = contracts.bondManager.assetConfigs(bondAsset);
        _checkBondCoverageAndAmount(
            contracts,
            bondAsset,
            bondAccount.principal(),
            bondAccount.value(),
            (minBondUsd * factor) / EXP_SCALE,
            limits.minCoverageRatio
        );
    }

    /**
     * @notice Checks a new request's stored markets against its pool and tier, with each collateral supply cap worth
     *   at most the tier's maximum. The supply caps are priced here and on a feed change, not at build
     * @param contracts The manager's contracts
     * @param request The request, with its markets stored
     * @custom:error The `validateMarkets` errors
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when a collateral supply cap is worth more than the tier allows
     */
    function validateNewRequest(Contracts memory contracts, ISpokePoolManager.Request storage request) external view {
        ITierRegistry.PoolLimits memory limits = validateMarkets(contracts, request);
        uint256 collateralMarketCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralMarketCount; ++i) {
            _checkSupplyCapUsd(contracts, request.collateralMarkets[i], limits.maxCollateralSupplyCapUsd);
        }
    }

    /**
     * @notice Checks a collateral market's supply cap is worth at most its tier's maximum, after its feed changed
     * @param contracts The manager's contracts
     * @param tierId The request's tier
     * @param market The collateral market
     * @custom:error InvalidOracleFeed is thrown when an unpriced asset's main feed is missing or has no live positive
     *   answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when the supply cap is worth more than the tier allows
     */
    function checkSupplyCapUsd(
        Contracts memory contracts,
        uint256 tierId,
        ISpokePoolManager.CollateralMarketRequestParams memory market
    ) external view {
        (, , ITierRegistry.PoolLimits memory limits) = contracts.tierRegistry.getTierTerms(tierId);
        _checkSupplyCapUsd(contracts, market, limits.maxCollateralSupplyCapUsd);
    }

    /**
     * @notice Checks a request's markets against its pool and its tier's current limits, without prices: the market
     *   counts, each collateral market's factors, each loan market's asset and model, and that no asset repeats. The
     *   manager calls it again at build, as the pool and the tier may have changed since the request
     * @param contracts The manager's contracts
     * @param request The pool or markets request, with its markets stored
     * @return limits The tier's current limits
     * @custom:error InvalidArrayLength is thrown when the request has no market
     * @custom:error TooManyMarkets is thrown when the pool would have more markets, or collateral markets, than allowed
     * @custom:error InvalidMarketParams is thrown when a collateral factor is above its liquidation threshold
     * @custom:error ExceedsTierLimit is thrown when a collateral factor or liquidation threshold is above the tier's
     * @custom:error LoanAssetNotAllowed is thrown when the tier does not offer a loan asset
     * @custom:error InterestRateModelNotAllowed is thrown when the tier does not allow a loan market's model
     * @custom:error DuplicateAsset is thrown when an asset repeats in the request or is already in the pool
     */
    function validateMarkets(
        Contracts memory contracts,
        ISpokePoolManager.Request storage request
    ) public view returns (ITierRegistry.PoolLimits memory limits) {
        ISpokePoolManager.CollateralMarketRequestParams[] memory collateralMarkets = request.collateralMarkets;
        ISpokePoolManager.LoanMarketRequestParams[] memory loanMarkets = request.loanMarkets;
        uint256 collateralCount = collateralMarkets.length;
        uint256 loanCount = loanMarkets.length;
        uint256 marketCount = collateralCount + loanCount;
        if (marketCount == 0) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        // Zero, or not yet listed, for a new pool
        address comptroller = request.comptroller;
        uint256 tierId = request.tierId;
        ITierRegistry tierRegistry = contracts.tierRegistry;
        (, , limits) = tierRegistry.getTierTerms(tierId);
        (uint256 poolMarketCount, uint256 poolCollateralCount) = _countPoolMarkets(comptroller);
        poolMarketCount += marketCount;

        uint256 maxPoolMarkets = contracts.proposalBuilder.MAX_POOL_MARKETS();
        if (poolMarketCount > maxPoolMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolMarketCount, maxPoolMarkets);
        }
        poolCollateralCount += collateralCount;
        if (poolCollateralCount > limits.maxCollateralMarkets) {
            revert ISpokePoolManager.TooManyMarkets(poolCollateralCount, limits.maxCollateralMarkets);
        }

        address[] memory assets = new address[](marketCount);
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = collateralMarkets[i];
            assets[i] = market.asset;
            if (market.collateralFactor > market.liquidationThreshold) {
                revert ISpokePoolManager.InvalidMarketParams(market.asset);
            }
            if (
                market.collateralFactor > limits.maxCollateralFactor ||
                market.liquidationThreshold > limits.maxLiquidationThreshold
            ) {
                revert ISpokePoolManager.ExceedsTierLimit(market.asset);
            }
        }

        for (uint256 i; i < loanCount; ++i) {
            ISpokePoolManager.LoanMarketRequestParams memory market = loanMarkets[i];
            assets[collateralCount + i] = market.asset;
            if (tierRegistry.getLoanSupplyCap(tierId, market.asset) == 0) {
                revert ISpokePoolManager.LoanAssetNotAllowed(market.asset);
            }
            if (!tierRegistry.isAllowedInterestRateModel(tierId, market.asset, market.interestRateModel)) {
                revert ISpokePoolManager.InterestRateModelNotAllowed(market.interestRateModel);
            }
        }

        address poolRegistry = contracts.proposalBuilder.POOL_REGISTRY();
        for (uint256 i; i < marketCount; ++i) {
            _checkUniqueAsset(poolRegistry, comptroller, assets, i);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Sends a request's escrowed seeds to `to`
    function _releaseSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage seeds,
        address to
    ) private {
        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            _releaseSeed(seeds, request.collateralMarkets[i].asset, to);
        }
        uint256 loanCount = request.loanMarkets.length;
        for (uint256 i; i < loanCount; ++i) {
            _releaseSeed(seeds, request.loanMarkets[i].asset, to);
        }
    }

    /// @dev Sends the seed escrowed in `asset` to `to`; a request not built yet has none
    function _releaseSeed(mapping(address => uint256) storage seeds, address asset, address to) private {
        uint256 seed = seeds[asset];
        if (seed != 0) {
            IERC20Upgradeable(asset).safeTransfer(to, seed);
        }
    }

    /// @dev Pulls tokens from `from`, reverting unless exactly `amount` arrives
    function _transferIn(address token, address from, uint256 amount) private {
        IERC20Upgradeable asset = IERC20Upgradeable(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(from, address(this), amount);
        if (asset.balanceOf(address(this)) - balanceBefore != amount) {
            revert ISpokePoolManager.TransferAmountMismatch(token);
        }
    }

    /// @dev Pulls the seed in `asset` from `deployer`, $10 of it at `price`
    function _pullSeed(
        mapping(address => uint256) storage seeds,
        address deployer,
        address asset,
        uint256 price,
        uint256 supplyCap
    ) private {
        // $10 of the asset, rounded up so the seed is never worth less
        uint256 seed = (MIN_SEED_USD * EXP_SCALE + price - 1) / price;
        // The seed is supplied at listing, so it must fit in the market's supply cap
        if (seed > supplyCap) {
            revert ISpokePoolManager.InvalidMarketParams(asset);
        }
        _transferIn(asset, deployer, seed);
        seeds[asset] = seed;
    }

    /**
     * @dev Returns how many markets a pool has and how many of them are collateral; zero for a new pool. A loan market
     *   is one whose supply allowlist is on, as its listing VIP enables it for the Hub
     */
    function _countPoolMarkets(
        address comptroller
    ) private view returns (uint256 marketCount, uint256 collateralMarketCount) {
        if (comptroller != address(0)) {
            VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
            marketCount = vTokens.length;
            for (uint256 i; i < marketCount; ++i) {
                if (!SpokeComptroller(comptroller).isSupplyAllowlistEnabled(address(vTokens[i]))) {
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
        Contracts memory contracts,
        ISpokePoolManager.CollateralMarketRequestParams memory market,
        uint256 maxSupplyCapUsd
    ) private view {
        if ((market.supplyCap * _collateralPrice(contracts, market)) / EXP_SCALE > maxSupplyCapUsd) {
            revert ISpokePoolManager.ExceedsTierLimit(market.asset);
        }
    }

    /**
     * @dev Returns a collateral asset's price, scaled like the ResilientOracle's: from the ResilientOracle once it
     *   prices the asset, else from the market's main feed, whose latest answer must be positive and within Venus's
     *   staleness limit. The pivot and fallback feeds are not considered, but every set feed's oracle is checked
     */
    function _collateralPrice(
        Contracts memory contracts,
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
        (, , , uint256 maxStalePeriod, , , , ) = ISpokePoolManager(address(this)).marketParams();
        IChainlinkFeed feed = IChainlinkFeed(feeds[0].feed);
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > maxStalePeriod) {
            revert ISpokePoolManager.InvalidOracleFeed(asset);
        }
        // As the ChainlinkOracle scales it: to 18 decimals, then by the asset's decimals
        return uint256(answer) * 10 ** (36 - feed.decimals() - IERC20MetadataUpgradeable(asset).decimals());
    }

    /**
     * @dev Checks each set feed is on one of the manager's supported oracles, and on its own: one oracle holds one feed
     *   per asset, so a second feed would replace the first. A fallback feed needs a pivot feed, as the ResilientOracle
     *   only uses a fallback price it can check against the pivot. Reverts with UnsupportedOracle or InvalidOracleFeed
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
     * @dev Checks a bond on every request, so a deployer short of either tops up first: its `principal` must be worth
     *   `requiredBondUsd`, the whole bond its tier requires, and its `value`, net of losses and a Hub's exit fee, at
     *   least `minCoverageRatio` of it. Reverts with InsufficientBondValue or CoverageTooLow
     */
    function _checkBondCoverageAndAmount(
        Contracts memory contracts,
        address bondAsset,
        uint256 principal,
        uint256 value,
        uint256 requiredBondUsd,
        uint256 minCoverageRatio
    ) private view {
        uint256 price = contracts.resilientOracle.getPrice(bondAsset);
        uint256 principalUsd = (principal * price) / EXP_SCALE;
        if (principalUsd < requiredBondUsd) {
            revert ISpokePoolManager.InsufficientBondValue(principalUsd, requiredBondUsd);
        }
        uint256 valueUsd = (value * price) / EXP_SCALE;
        if (valueUsd * EXP_SCALE < requiredBondUsd * minCoverageRatio) {
            revert ISpokePoolManager.CoverageTooLow((valueUsd * EXP_SCALE) / requiredBondUsd, minCoverageRatio);
        }
    }
}

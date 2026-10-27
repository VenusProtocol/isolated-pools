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
 * It writes only escrow data, a request's `seeds` and the manager's escrowed amounts by token, and emits no events;
 * it changes no status. The errors are `ISpokePoolManager`'s
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
     * @notice Pulls a new pool request's bond from `from` into escrow
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param bondAsset The bond's asset
     * @param from The deployer
     * @param bondAmount The bond's amount
     * @custom:error TransferAmountMismatch is thrown when the transfer delivers a different amount
     */
    function escrowBond(
        mapping(address => uint256) storage escrowedAmounts,
        address bondAsset,
        address from,
        uint256 bondAmount
    ) external {
        _transferIn(bondAsset, from, bondAmount);
        escrowedAmounts[bondAsset] += bondAmount;
    }

    /**
     * @notice Tops each new market's seed up to $10 at current prices, pulling what its escrow lacks from the request's
     *   deployer. An escrowed seed is never reduced, so a price rise after the request costs nothing
     * @param contracts The manager's contracts
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param request The pool or markets request, with its markets stored
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error InvalidMarketParams is thrown when a seed is above its market's supply cap
     * @custom:error TransferAmountMismatch is thrown when a transfer delivers a different amount
     */
    function pullSeeds(
        Contracts memory contracts,
        mapping(address => uint256) storage escrowedAmounts,
        ISpokePoolManager.Request storage request
    ) external {
        uint256 seedCount = request.seeds.length;
        for (uint256 i; i < seedCount; ++i) {
            (address asset, uint256 price, uint256 supplyCap) = _seedMarket(contracts, request, i);
            uint256 escrowed = request.seeds[i];

            // $10 of the asset, rounded up so the seed is never worth less
            uint256 seed = (MIN_SEED_USD * EXP_SCALE + price - 1) / price;
            // Keep a larger seed escrowed earlier, as the price may have risen since
            if (seed < escrowed) {
                seed = escrowed;
            }
            // The seed is supplied at listing, so it must fit in the market's supply cap
            if (seed > supplyCap) {
                revert ISpokePoolManager.InvalidMarketParams(asset);
            }
            // Pull only what the escrow lacks
            if (seed > escrowed) {
                _transferIn(asset, request.deployer, seed - escrowed);
                escrowedAmounts[asset] += seed - escrowed;
                request.seeds[i] = seed;
            }
        }
    }

    /**
     * @notice Sends a request's escrowed seeds to `to`: the VIP's executor at settle, which lists the markets with them
     * @param request The request
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param to The receiver
     */
    function releaseSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts,
        address to
    ) external {
        _releaseSeeds(request, escrowedAmounts, to);
    }

    /**
     * @notice Refunds a closing request's escrowed bond, for a pool request, and seeds to its deployer
     * @param request The request
     * @param escrowedAmounts The manager's escrowed amounts by token
     */
    function refund(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts
    ) external {
        address deployer = request.deployer;
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            escrowedAmounts[request.bondAsset] -= request.bondAmount;
            IERC20Upgradeable(request.bondAsset).safeTransfer(deployer, request.bondAmount);
        }
        _releaseSeeds(request, escrowedAmounts, deployer);
    }

    /**
     * @notice Moves a settled pool request's escrowed bond to the bond manager, in its deployer's name
     * @param request The pool request, with its comptroller set at build
     * @param escrowedAmounts The manager's escrowed amounts by token
     * @param bondManager The bond manager
     * @custom:error The bond manager's `createBond` errors
     */
    function createBond(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts,
        ISpokeBondManager bondManager
    ) external {
        address bondAsset = request.bondAsset;
        uint256 bondAmount = request.bondAmount;
        escrowedAmounts[bondAsset] -= bondAmount;
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
        // A bond not deposited yet has no loss or exit fee, so its value is its amount
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
     * @custom:error The `_validateMarkets` errors
     * @custom:error InvalidOracleFeed is thrown when an unpriced collateral asset's main feed is missing or has no live
     *   positive answer, two of its feeds share an oracle, or it has a fallback feed without a pivot feed
     * @custom:error UnsupportedOracle is thrown when one of its feeds is on an oracle the manager does not support
     * @custom:error ExceedsTierLimit is thrown when a collateral supply cap is worth more than the tier allows
     */
    function validateNewRequest(
        Contracts memory contracts,
        mapping(address => bool) storage isLoanMarket,
        ISpokePoolManager.Request storage request
    ) external view {
        ITierRegistry.PoolLimits memory limits = _validateMarkets(contracts, isLoanMarket, request);
        uint256 collateralMarketCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralMarketCount; ++i) {
            _checkSupplyCapUsd(contracts, request.collateralMarkets[i], limits.maxCollateralSupplyCapUsd);
        }
    }

    /**
     * @notice Checks a request's markets again at build, against its pool and its tier's current limits, without prices
     * @param contracts The manager's contracts
     * @param isLoanMarket The manager's loan market flags by vToken
     * @param request The pool or markets request
     * @custom:error The `_validateMarkets` errors
     */
    function validateBuild(
        Contracts memory contracts,
        mapping(address => bool) storage isLoanMarket,
        ISpokePoolManager.Request storage request
    ) external view {
        _validateMarkets(contracts, isLoanMarket, request);
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

    // ──────────────────────────────────────────────────────────────────────
    // Private functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Sends a request's escrowed seeds to `to`
    function _releaseSeeds(
        ISpokePoolManager.Request storage request,
        mapping(address => uint256) storage escrowedAmounts,
        address to
    ) private {
        uint256 seedCount = request.seeds.length;
        for (uint256 i; i < seedCount; ++i) {
            address asset = _seedAsset(request, i);
            uint256 seed = request.seeds[i];
            escrowedAmounts[asset] -= seed;
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

    /// @dev Returns the asset of the seed at `index`: the collateral markets' come first, then the loan markets'
    function _seedAsset(ISpokePoolManager.Request storage request, uint256 index) private view returns (address) {
        uint256 collateralCount = request.collateralMarkets.length;
        return
            index < collateralCount
                ? request.collateralMarkets[index].asset
                : request.loanMarkets[index - collateralCount].asset;
    }

    /**
     * @dev Checks a request's markets against its pool and its tier's current limits, without prices, and returns the
     *   limits. Reverts with InvalidArrayLength, TooManyMarkets, DuplicateAsset, InvalidMarketParams,
     *   ExceedsTierLimit, LoanAssetNotAllowed or InterestRateModelNotAllowed
     */
    function _validateMarkets(
        Contracts memory contracts,
        ISpokePoolManager.Request storage request
    ) private view returns (ITierRegistry.PoolLimits memory limits) {
        ISpokePoolManager.CollateralMarketRequestParams[] memory collateralMarkets = request.collateralMarkets;
        ISpokePoolManager.LoanMarketRequestParams[] memory loanMarkets = request.loanMarkets;
        uint256 collateralCount = collateralMarkets.length;
        uint256 marketCount = collateralCount + loanMarkets.length;
        if (marketCount == 0) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        // Zero, or not yet listed, for a new pool
        address comptroller = request.comptroller;
        uint256 tierId = request.tierId;
        (, , limits) = contracts.tierRegistry.getTierTerms(tierId);
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
        ITierRegistry tierRegistry = contracts.tierRegistry;
        for (uint256 i; i < loanMarkets.length; ++i) {
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

    /// @dev Returns how many markets a pool has and how many of them are collateral; zero for a new pool
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

    /**
     * @dev Returns what the seed at `index` is priced and capped with: a collateral market is priced by the
     *   ResilientOracle or its main feed and capped by the deployer, a loan market priced by the ResilientOracle and
     *   capped by its tier
     */
    function _seedMarket(
        Contracts memory contracts,
        ISpokePoolManager.Request storage request,
        uint256 index
    ) private view returns (address asset, uint256 price, uint256 supplyCap) {
        uint256 collateralCount = request.collateralMarkets.length;
        if (index < collateralCount) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = request.collateralMarkets[index];
            return (market.asset, _collateralPrice(contracts, market), market.supplyCap);
        }
        asset = request.loanMarkets[index - collateralCount].asset;
        price = contracts.resilientOracle.getPrice(asset);
        supplyCap = contracts.tierRegistry.getLoanSupplyCap(request.tierId, asset);
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
        // A fallback without a pivot is never used: the ResilientOracle takes a fallback price only after checking it
        // against the pivot, so with no pivot a failed main feed has no backup
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

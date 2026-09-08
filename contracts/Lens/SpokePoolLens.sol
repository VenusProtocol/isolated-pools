// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";

import { ExponentialNoError } from "../ExponentialNoError.sol";
import { VToken } from "../VToken.sol";
import { Action, ComptrollerInterface, ComptrollerViewInterface } from "../ComptrollerInterface.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";
import { PoolRegistry } from "../Pool/PoolRegistry.sol";
import { RewardsDistributor } from "../Rewards/RewardsDistributor.sol";
import { SpokeComptrollerViewInterface } from "../Spoke/SpokeComptrollerInterface.sol";

/**
 * @title SpokePoolLens
 * @author Venus
 * @notice Reads pool and market state specific to a spoke pool
 *
 * @dev Spoke pools expose additional state that is not included in the shared PoolLens data, including the
 * deviation-bounded oracle, the supply and liquidation allowlists, liquidation thresholds and liquidation incentives.
 * Those reads are named `spoke*` or `getSpokePool*` and return spoke-shaped structs.
 *
 * The rest of the surface mirrors `PoolLens` under the same names and struct shapes, so that reading a spoke pool
 * takes one address rather than two. Those reads go through getters both kinds of pool share.
 *
 * Access-controlled call permissions are deliberately not reported: `AccessControlManager` derives the role from its
 * own caller, so asked from a lens it answers `false` for an account that can in fact call.
 *
 * This contract holds no state and is versioned by redeployment.
 */
contract SpokePoolLens is ExponentialNoError, TimeManagerV8 {
    /**
     * @dev Mirrors `PoolLens.PoolData` with spoke-pool-specific fields.
     */
    struct SpokePoolData {
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
        string category;
        string logoURL;
        string description;
        address priceOracle;
        uint256 closeFactor;
        /// @notice The pool-wide liquidation incentive, scaled by 1e18
        uint256 poolLiquidationIncentiveMantissa;
        uint256 minLiquidatableCollateral;
        /// @notice Oracle used to bound collateral prices for borrowing and redeeming. Zero until governance sets it,
        /// and while it is zero both actions revert
        address deviationBoundedOracle;
        /// @notice Whether liquidation is restricted to allowlisted accounts
        bool liquidationAllowlistEnabled;
        SpokeVTokenMetadata[] vTokens;
    }

    /**
     * @dev Mirrors `PoolLens.VTokenMetadata` with spoke-pool-specific fields.
     */
    struct SpokeVTokenMetadata {
        address vToken;
        uint256 exchangeRateCurrent;
        uint256 supplyRatePerBlockOrTimestamp;
        uint256 borrowRatePerBlockOrTimestamp;
        uint256 reserveFactorMantissa;
        uint256 supplyCaps;
        uint256 borrowCaps;
        uint256 totalBorrows;
        uint256 totalReserves;
        uint256 totalSupply;
        uint256 totalCash;
        bool isListed;
        uint256 collateralFactorMantissa;
        /// @notice The collateral weight above which a position becomes liquidatable, scaled by 1e18
        uint256 liquidationThresholdMantissa;
        address underlyingAssetAddress;
        uint256 vTokenDecimals;
        uint256 underlyingDecimals;
        uint256 pausedActions;
        /// @notice The liquidation incentive effective for this market, scaled by 1e18
        uint256 effectiveLiquidationIncentiveMantissa;
        /// @notice The market-specific liquidation incentive, or zero when using the pool-wide value
        uint256 ownLiquidationIncentiveMantissa;
        /// @notice Whether supply is restricted to allowlisted accounts
        bool supplyAllowlistEnabled;
        /// @notice Whether the market allows full liquidation without a shortfall
        bool forcedLiquidationEnabled;
    }

    /**
     * @dev Returns both the market's allowlist status and whether the account is allowlisted.
     */
    struct SpokeSupplyPermission {
        address vToken;
        /// @notice Whether supply is restricted to allowlisted accounts
        bool allowlistEnabled;
        /// @notice Whether the account is allowlisted for the market
        bool accountAllowlisted;
    }

    /**
     * @dev Struct for VTokenBalance.
     */
    struct VTokenBalances {
        address vToken;
        uint256 balanceOf;
        uint256 borrowBalanceCurrent;
        uint256 balanceOfUnderlying;
        uint256 tokenBalance;
        uint256 tokenAllowance;
    }

    /**
     * @dev Struct for underlyingPrice of VToken.
     */
    struct VTokenUnderlyingPrice {
        address vToken;
        uint256 underlyingPrice;
    }

    /**
     * @dev Struct with pending reward info for a market.
     */
    struct PendingReward {
        address vTokenAddress;
        uint256 amount;
    }

    /**
     * @dev Struct with reward distribution totals for a single reward token and distributor.
     */
    struct RewardSummary {
        address distributorAddress;
        address rewardTokenAddress;
        uint256 totalRewards;
        PendingReward[] pendingRewards;
    }

    /**
     * @dev Struct used in RewardDistributor to save last updated market state.
     */
    struct RewardTokenState {
        // The market's last updated rewardTokenBorrowIndex or rewardTokenSupplyIndex
        uint224 index;
        // The block number or timestamp the index was last updated at
        uint256 blockOrTimestamp;
        // The block number or timestamp at which to stop rewards
        uint256 lastRewardingBlockOrTimestamp;
    }

    /**
     * @dev Struct with bad debt of a market denominated
     */
    struct BadDebt {
        address vTokenAddress;
        uint256 badDebtUsd;
    }

    /**
     * @dev Struct with bad debt total denominated in usd for a pool and an array of BadDebt structs for each market
     */
    struct BadDebtSummary {
        address comptroller;
        uint256 totalBadDebtUsd;
        BadDebt[] badDebts;
    }

    /**
     * @param timeBased_ A boolean indicating whether the contract is based on time or block
     * @param blocksPerYear_ The number of blocks per year
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor(bool timeBased_, uint256 blocksPerYear_) TimeManagerV8(timeBased_, blocksPerYear_) {}

    /**
     * @notice Queries the user's supply/borrow balances in vTokens
     * @param vTokens The list of vToken addresses
     * @param account The user Account
     * @return A list of structs containing balances data
     */
    function vTokenBalancesAll(VToken[] calldata vTokens, address account) external returns (VTokenBalances[] memory) {
        uint256 vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenBalances(vTokens[i], account);
        }
        return res;
    }

    /**
     * @notice Queries every pool and market in a spoke pool registry
     * @dev Not intended to be called in a transaction due to its gas cost. The registry must contain only spoke pools.
     * @param poolRegistryAddress The registry to enumerate
     * @return The data of every pool in the registry
     */
    function getAllSpokePools(address poolRegistryAddress) external view returns (SpokePoolData[] memory) {
        PoolRegistry.VenusPool[] memory pools = PoolRegistryInterface(poolRegistryAddress).getAllPools();
        uint256 poolLength = pools.length;

        SpokePoolData[] memory poolDataItems = new SpokePoolData[](poolLength);

        for (uint256 i; i < poolLength; ++i) {
            poolDataItems[i] = getSpokePoolData(poolRegistryAddress, pools[i]);
        }

        return poolDataItems;
    }

    /**
     * @notice Queries a spoke pool by its comptroller address
     * @param poolRegistryAddress The registry containing the pool
     * @param comptroller The pool's comptroller
     * @return The pool's data
     */
    function getSpokePoolByComptroller(
        address poolRegistryAddress,
        address comptroller
    ) external view returns (SpokePoolData memory) {
        PoolRegistryInterface poolRegistry = PoolRegistryInterface(poolRegistryAddress);
        return getSpokePoolData(poolRegistryAddress, poolRegistry.getPoolByComptroller(comptroller));
    }

    /**
     * @notice Returns whether an account may supply to each specified market
     * @dev The account checked is the one receiving the minted vTokens, which can differ from the payer when using
     * `mintBehalf`.
     * @param comptroller The spoke pool's comptroller
     * @param vTokens The markets to test
     * @param account The account to test
     * @return One entry per market, in the order given
     */
    function spokeSupplyPermissions(
        address comptroller,
        VToken[] memory vTokens,
        address account
    ) external view returns (SpokeSupplyPermission[] memory) {
        SpokeComptrollerViewInterface spoke = SpokeComptrollerViewInterface(comptroller);
        uint256 len = vTokens.length;

        SpokeSupplyPermission[] memory permissions = new SpokeSupplyPermission[](len);

        for (uint256 i; i < len; ++i) {
            address vToken = address(vTokens[i]);
            permissions[i] = SpokeSupplyPermission({
                vToken: vToken,
                allowlistEnabled: spoke.isSupplyAllowlistEnabled(vToken),
                accountAllowlisted: spoke.isAllowedSupplier(vToken, account)
            });
        }

        return permissions;
    }

    /**
     * @notice Returns whether an account may seize collateral in a spoke pool
     * @param comptroller The spoke pool's comptroller
     * @param liquidator The account to test
     * @return allowlistEnabled Whether liquidation is restricted to allowlisted accounts
     * @return accountAllowlisted Whether the account is allowlisted
     */
    function spokeLiquidationPermission(
        address comptroller,
        address liquidator
    ) external view returns (bool allowlistEnabled, bool accountAllowlisted) {
        SpokeComptrollerViewInterface spoke = SpokeComptrollerViewInterface(comptroller);
        return (spoke.isLiquidationAllowlistEnabled(), spoke.isAllowedLiquidator(liquidator));
    }

    /**
     * @notice Returns the price data for the underlying assets of the specified vTokens
     * @param vTokens The list of vToken addresses
     * @return An array containing the price data for each asset
     */
    function vTokenUnderlyingPriceAll(
        VToken[] calldata vTokens
    ) external view returns (VTokenUnderlyingPrice[] memory) {
        uint256 vTokenCount = vTokens.length;
        VTokenUnderlyingPrice[] memory res = new VTokenUnderlyingPrice[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenUnderlyingPrice(vTokens[i]);
        }
        return res;
    }

    /**
     * @notice Returns the pending rewards for a user for a given pool.
     * @param account The user account.
     * @param comptrollerAddress address
     * @return Pending rewards array
     */
    function getPendingRewards(
        address account,
        address comptrollerAddress
    ) external view returns (RewardSummary[] memory) {
        VToken[] memory markets = ComptrollerInterface(comptrollerAddress).getAllMarkets();
        RewardsDistributor[] memory rewardsDistributors = ComptrollerViewInterface(comptrollerAddress)
            .getRewardDistributors();
        RewardSummary[] memory rewardSummary = new RewardSummary[](rewardsDistributors.length);
        for (uint256 i; i < rewardsDistributors.length; ++i) {
            RewardSummary memory reward;
            reward.distributorAddress = address(rewardsDistributors[i]);
            reward.rewardTokenAddress = address(rewardsDistributors[i].rewardToken());
            reward.totalRewards = rewardsDistributors[i].rewardTokenAccrued(account);
            reward.pendingRewards = _calculateNotDistributedAwards(account, markets, rewardsDistributors[i]);
            rewardSummary[i] = reward;
        }
        return rewardSummary;
    }

    /**
     * @notice Returns a summary of a pool's bad debt broken down by market
     *
     * @param comptrollerAddress Address of the comptroller
     *
     * @return badDebtSummary A struct with comptroller address, total bad debut denominated in usd, and
     *   a break down of bad debt by market
     */
    function getPoolBadDebt(address comptrollerAddress) external view returns (BadDebtSummary memory) {
        uint256 totalBadDebtUsd;

        // Get every market in the pool
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(comptrollerAddress);
        VToken[] memory markets = comptroller.getAllMarkets();
        ResilientOracleInterface priceOracle = comptroller.oracle();

        BadDebt[] memory badDebts = new BadDebt[](markets.length);

        BadDebtSummary memory badDebtSummary;
        badDebtSummary.comptroller = comptrollerAddress;
        badDebtSummary.badDebts = badDebts;

        // // Calculate the bad debt is USD per market
        for (uint256 i; i < markets.length; ++i) {
            BadDebt memory badDebt;
            badDebt.vTokenAddress = address(markets[i]);
            badDebt.badDebtUsd =
                (VToken(address(markets[i])).badDebt() * priceOracle.getUnderlyingPrice(address(markets[i]))) /
                EXP_SCALE;
            badDebtSummary.badDebts[i] = badDebt;
            totalBadDebtUsd = totalBadDebtUsd + badDebt.badDebtUsd;
        }

        badDebtSummary.totalBadDebtUsd = totalBadDebtUsd;

        return badDebtSummary;
    }

    /**
     * @notice Returns vToken holding the specified underlying asset in the specified pool
     * @param poolRegistryAddress The address of the PoolRegistry contract
     * @param comptroller The pool comptroller
     * @param asset The underlyingAsset of VToken
     * @return Address of the vToken
     */
    function getVTokenForAsset(
        address poolRegistryAddress,
        address comptroller,
        address asset
    ) external view returns (address) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getVTokenForAsset(comptroller, asset);
    }

    /**
     * @notice Returns all pools that support the specified underlying asset
     * @param poolRegistryAddress The address of the PoolRegistry contract
     * @param asset The underlying asset of vToken
     * @return A list of Comptroller contracts
     */
    function getPoolsSupportedByAsset(
        address poolRegistryAddress,
        address asset
    ) external view returns (address[] memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getPoolsSupportedByAsset(asset);
    }

    /**
     * @notice Queries the user's supply/borrow balances in the specified vToken
     * @param vToken vToken address
     * @param account The user Account
     * @return A struct containing the balances data
     */
    function vTokenBalances(VToken vToken, address account) public returns (VTokenBalances memory) {
        uint256 balanceOf = vToken.balanceOf(account);
        uint256 borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint256 balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        uint256 tokenBalance;
        uint256 tokenAllowance;

        IERC20 underlying = IERC20(vToken.underlying());
        tokenBalance = underlying.balanceOf(account);
        tokenAllowance = underlying.allowance(account, address(vToken));

        return
            VTokenBalances({
                vToken: address(vToken),
                balanceOf: balanceOf,
                borrowBalanceCurrent: borrowBalanceCurrent,
                balanceOfUnderlying: balanceOfUnderlying,
                tokenBalance: tokenBalance,
                tokenAllowance: tokenAllowance
            });
    }

    /**
     * @notice Queries a spoke pool from its registry entry
     * @param poolRegistryAddress The registry containing the pool
     * @param venusPool The pool's registry entry
     * @return The pool's data, including its markets
     */
    function getSpokePoolData(
        address poolRegistryAddress,
        PoolRegistry.VenusPool memory venusPool
    ) public view returns (SpokePoolData memory) {
        address comptroller = venusPool.comptroller;

        SpokeVTokenMetadata[] memory vTokenMetadataItems = spokeVTokenMetadataAll(
            ComptrollerInterface(comptroller).getAllMarkets()
        );

        PoolRegistry.VenusPoolMetaData memory metaData = PoolRegistryInterface(poolRegistryAddress)
            .getVenusPoolMetadata(comptroller);

        ComptrollerViewInterface pooledView = ComptrollerViewInterface(comptroller);
        SpokeComptrollerViewInterface spokeView = SpokeComptrollerViewInterface(comptroller);

        SpokePoolData memory poolData;
        poolData.name = venusPool.name;
        poolData.creator = venusPool.creator;
        poolData.comptroller = comptroller;
        poolData.blockPosted = venusPool.blockPosted;
        poolData.timestampPosted = venusPool.timestampPosted;
        poolData.category = metaData.category;
        poolData.logoURL = metaData.logoURL;
        poolData.description = metaData.description;
        poolData.priceOracle = address(pooledView.oracle());
        poolData.closeFactor = pooledView.closeFactorMantissa();
        // This call is made from the lens, so the comptroller returns the pool-wide incentive.
        poolData.poolLiquidationIncentiveMantissa = pooledView.liquidationIncentiveMantissa();
        poolData.minLiquidatableCollateral = pooledView.minLiquidatableCollateral();
        poolData.deviationBoundedOracle = address(spokeView.deviationBoundedOracle());
        poolData.liquidationAllowlistEnabled = spokeView.isLiquidationAllowlistEnabled();
        poolData.vTokens = vTokenMetadataItems;

        return poolData;
    }

    /**
     * @notice Queries the metadata of every given market of a spoke pool
     * @param vTokens The markets to read
     * @return One entry per market, in the order given
     */
    function spokeVTokenMetadataAll(VToken[] memory vTokens) public view returns (SpokeVTokenMetadata[] memory) {
        uint256 len = vTokens.length;

        SpokeVTokenMetadata[] memory metadataItems = new SpokeVTokenMetadata[](len);

        for (uint256 i; i < len; ++i) {
            metadataItems[i] = spokeVTokenMetadata(vTokens[i]);
        }

        return metadataItems;
    }

    /**
     * @notice Queries the metadata of one market of a spoke pool
     * @param vToken The market to read
     * @return The market's metadata
     */
    function spokeVTokenMetadata(VToken vToken) public view returns (SpokeVTokenMetadata memory) {
        address vTokenAddress = address(vToken);
        address comptroller = address(vToken.comptroller());

        ComptrollerViewInterface pooledView = ComptrollerViewInterface(comptroller);
        SpokeComptrollerViewInterface spokeView = SpokeComptrollerViewInterface(comptroller);

        // Read through the spoke interface, which declares all three returns. `ComptrollerViewInterface` declares
        // the first two, so reading it there drops the liquidation threshold with no error.
        (bool isListed, uint256 collateralFactorMantissa, uint256 liquidationThresholdMantissa) = spokeView.markets(
            vTokenAddress
        );

        address underlying = vToken.underlying();

        return
            SpokeVTokenMetadata({
                vToken: vTokenAddress,
                exchangeRateCurrent: vToken.exchangeRateStored(),
                // Zero for an empty market, as `PoolLens` reports: the rate model divides by the market's supply.
                supplyRatePerBlockOrTimestamp: vToken.totalSupply() > 0 ? vToken.supplyRatePerBlock() : 0,
                borrowRatePerBlockOrTimestamp: vToken.borrowRatePerBlock(),
                reserveFactorMantissa: vToken.reserveFactorMantissa(),
                supplyCaps: pooledView.supplyCaps(vTokenAddress),
                borrowCaps: pooledView.borrowCaps(vTokenAddress),
                totalBorrows: vToken.totalBorrows(),
                totalReserves: vToken.totalReserves(),
                totalSupply: vToken.totalSupply(),
                totalCash: vToken.getCash(),
                isListed: isListed,
                collateralFactorMantissa: collateralFactorMantissa,
                liquidationThresholdMantissa: liquidationThresholdMantissa,
                underlyingAssetAddress: underlying,
                vTokenDecimals: vToken.decimals(),
                underlyingDecimals: IERC20Metadata(underlying).decimals(),
                pausedActions: _pausedActions(comptroller, vTokenAddress),
                effectiveLiquidationIncentiveMantissa: spokeView.effectiveLiquidationIncentive(vTokenAddress),
                ownLiquidationIncentiveMantissa: spokeView.liquidationIncentives(vTokenAddress),
                supplyAllowlistEnabled: spokeView.isSupplyAllowlistEnabled(vTokenAddress),
                forcedLiquidationEnabled: spokeView.isForcedLiquidationEnabled(vTokenAddress)
            });
    }

    /**
     * @notice Returns the price data for the underlying asset of the specified vToken
     * @param vToken vToken address
     * @return The price data for each asset
     */
    function vTokenUnderlyingPrice(VToken vToken) public view returns (VTokenUnderlyingPrice memory) {
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(address(vToken.comptroller()));
        ResilientOracleInterface priceOracle = comptroller.oracle();

        return
            VTokenUnderlyingPrice({
                vToken: address(vToken),
                underlyingPrice: priceOracle.getUnderlyingPrice(address(vToken))
            });
    }

    function _calculateNotDistributedAwards(
        address account,
        VToken[] memory markets,
        RewardsDistributor rewardsDistributor
    ) internal view returns (PendingReward[] memory) {
        PendingReward[] memory pendingRewards = new PendingReward[](markets.length);

        for (uint256 i; i < markets.length; ++i) {
            // Market borrow and supply state we will modify update in-memory, in order to not modify storage
            RewardTokenState memory borrowState;
            RewardTokenState memory supplyState;

            if (isTimeBased) {
                (
                    borrowState.index,
                    borrowState.blockOrTimestamp,
                    borrowState.lastRewardingBlockOrTimestamp
                ) = rewardsDistributor.rewardTokenBorrowStateTimeBased(address(markets[i]));
                (
                    supplyState.index,
                    supplyState.blockOrTimestamp,
                    supplyState.lastRewardingBlockOrTimestamp
                ) = rewardsDistributor.rewardTokenSupplyStateTimeBased(address(markets[i]));
            } else {
                (
                    borrowState.index,
                    borrowState.blockOrTimestamp,
                    borrowState.lastRewardingBlockOrTimestamp
                ) = rewardsDistributor.rewardTokenBorrowState(address(markets[i]));
                (
                    supplyState.index,
                    supplyState.blockOrTimestamp,
                    supplyState.lastRewardingBlockOrTimestamp
                ) = rewardsDistributor.rewardTokenSupplyState(address(markets[i]));
            }

            Exp memory marketBorrowIndex = Exp({ mantissa: markets[i].borrowIndex() });

            // Update market supply and borrow index in-memory
            updateMarketBorrowIndex(address(markets[i]), rewardsDistributor, borrowState, marketBorrowIndex);
            updateMarketSupplyIndex(address(markets[i]), rewardsDistributor, supplyState);

            // Calculate pending rewards
            uint256 borrowReward = calculateBorrowerReward(
                address(markets[i]),
                rewardsDistributor,
                account,
                borrowState,
                marketBorrowIndex
            );
            uint256 supplyReward = calculateSupplierReward(
                address(markets[i]),
                rewardsDistributor,
                account,
                supplyState
            );

            PendingReward memory pendingReward;
            pendingReward.vTokenAddress = address(markets[i]);
            pendingReward.amount = borrowReward + supplyReward;
            pendingRewards[i] = pendingReward;
        }
        return pendingRewards;
    }

    function updateMarketBorrowIndex(
        address vToken,
        RewardsDistributor rewardsDistributor,
        RewardTokenState memory borrowState,
        Exp memory marketBorrowIndex
    ) internal view {
        uint256 borrowSpeed = rewardsDistributor.rewardTokenBorrowSpeeds(vToken);
        uint256 blockNumberOrTimestamp = getBlockNumberOrTimestamp();

        if (
            borrowState.lastRewardingBlockOrTimestamp > 0 &&
            blockNumberOrTimestamp > borrowState.lastRewardingBlockOrTimestamp
        ) {
            blockNumberOrTimestamp = borrowState.lastRewardingBlockOrTimestamp;
        }

        uint256 deltaBlocksOrTimestamp = sub_(blockNumberOrTimestamp, borrowState.blockOrTimestamp);
        if (deltaBlocksOrTimestamp > 0 && borrowSpeed > 0) {
            // Remove the total earned interest rate since the opening of the market from total borrows
            uint256 borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint256 tokensAccrued = mul_(deltaBlocksOrTimestamp, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(tokensAccrued, borrowAmount) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: borrowState.index }), ratio);
            borrowState.index = safe224(index.mantissa, "new index overflows");
            borrowState.blockOrTimestamp = blockNumberOrTimestamp;
        } else if (deltaBlocksOrTimestamp > 0) {
            borrowState.blockOrTimestamp = blockNumberOrTimestamp;
        }
    }

    function updateMarketSupplyIndex(
        address vToken,
        RewardsDistributor rewardsDistributor,
        RewardTokenState memory supplyState
    ) internal view {
        uint256 supplySpeed = rewardsDistributor.rewardTokenSupplySpeeds(vToken);
        uint256 blockNumberOrTimestamp = getBlockNumberOrTimestamp();

        if (
            supplyState.lastRewardingBlockOrTimestamp > 0 &&
            blockNumberOrTimestamp > supplyState.lastRewardingBlockOrTimestamp
        ) {
            blockNumberOrTimestamp = supplyState.lastRewardingBlockOrTimestamp;
        }

        uint256 deltaBlocksOrTimestamp = sub_(blockNumberOrTimestamp, supplyState.blockOrTimestamp);
        if (deltaBlocksOrTimestamp > 0 && supplySpeed > 0) {
            uint256 supplyTokens = VToken(vToken).totalSupply();
            uint256 tokensAccrued = mul_(deltaBlocksOrTimestamp, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(tokensAccrued, supplyTokens) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: supplyState.index }), ratio);
            supplyState.index = safe224(index.mantissa, "new index overflows");
            supplyState.blockOrTimestamp = blockNumberOrTimestamp;
        } else if (deltaBlocksOrTimestamp > 0) {
            supplyState.blockOrTimestamp = blockNumberOrTimestamp;
        }
    }

    function calculateBorrowerReward(
        address vToken,
        RewardsDistributor rewardsDistributor,
        address borrower,
        RewardTokenState memory borrowState,
        Exp memory marketBorrowIndex
    ) internal view returns (uint256) {
        Double memory borrowIndex = Double({ mantissa: borrowState.index });
        Double memory borrowerIndex = Double({
            mantissa: rewardsDistributor.rewardTokenBorrowerIndex(vToken, borrower)
        });
        if (borrowerIndex.mantissa == 0 && borrowIndex.mantissa >= rewardsDistributor.INITIAL_INDEX()) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set
            borrowerIndex.mantissa = rewardsDistributor.INITIAL_INDEX();
        }
        Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
        uint256 borrowerAmount = div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex);
        uint256 borrowerDelta = mul_(borrowerAmount, deltaIndex);
        return borrowerDelta;
    }

    function calculateSupplierReward(
        address vToken,
        RewardsDistributor rewardsDistributor,
        address supplier,
        RewardTokenState memory supplyState
    ) internal view returns (uint256) {
        Double memory supplyIndex = Double({ mantissa: supplyState.index });
        Double memory supplierIndex = Double({
            mantissa: rewardsDistributor.rewardTokenSupplierIndex(vToken, supplier)
        });
        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa >= rewardsDistributor.INITIAL_INDEX()) {
            // Covers the case where users supplied tokens before the market's supply state index was set
            supplierIndex.mantissa = rewardsDistributor.INITIAL_INDEX();
        }
        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint256 supplierTokens = VToken(vToken).balanceOf(supplier);
        uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
        return supplierDelta;
    }

    /**
     * @dev Encodes paused actions using the same bit positions as `PoolLens`.
     * @param comptroller The market's comptroller
     * @param vToken The market to read
     * @return A bitmask of the paused actions
     */
    function _pausedActions(address comptroller, address vToken) private view returns (uint256) {
        uint256 pausedActions;

        for (uint8 i; i <= uint8(type(Action).max); ++i) {
            uint256 paused = ComptrollerInterface(comptroller).actionPaused(vToken, Action(i)) ? 1 : 0;
            pausedActions |= paused << i;
        }

        return pausedActions;
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ExponentialNoError } from "../ExponentialNoError.sol";
import { VToken } from "../VToken.sol";
import { ComptrollerInterface, ComptrollerViewInterface } from "../ComptrollerInterface.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";
import { PoolRegistry } from "../Pool/PoolRegistry.sol";
import { RewardsDistributor } from "../Rewards/RewardsDistributor.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";

/**
 * @title PoolLens
 * @author Venus
 * @notice The `PoolLens` contract is designed to retrieve important information for each registered pool. A list of essential information
 * for all pools within the lending protocol can be acquired through the function `getAllPools()`. Additionally, the following records can be
 * looked up for specific pools and markets:
- the vToken balance of a given user;
- the pool data (oracle address, associated vToken, liquidation incentive, etc) of a pool via its associated comptroller address;
- the vToken address in a pool for a given asset;
- a list of all pools that support an asset;
- the underlying asset price of a vToken;
- the metadata (exchange/borrow/supply rate, total supply, collateral factor, etc) of any vToken.
 */
contract PoolLens is ExponentialNoError, TimeManagerV8 {
    /**
     * @dev Struct for PoolDetails.
     */
    struct PoolData {
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
        uint256 liquidationIncentive;
        uint256 minLiquidatableCollateral;
        VTokenMetadata[] vTokens;
    }

    /**
     * @dev Struct for VToken.
     */
    struct VTokenMetadata {
        address vToken;
        uint256 exchangeRateCurrent;
        uint256 supplyRatePerBlock;
        uint256 borrowRatePerBlock;
        uint256 reserveFactorMantissa;
        uint256 supplyCaps;
        uint256 borrowCaps;
        uint256 totalBorrows;
        uint256 totalReserves;
        uint256 totalSupply;
        uint256 totalCash;
        bool isListed;
        uint256 collateralFactorMantissa;
        address underlyingAssetAddress;
        uint256 vTokenDecimals;
        uint256 underlyingDecimals;
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
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
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
     * @notice Queries all pools with addtional details for each of them
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive
     * @param poolRegistryAddress The address of the PoolRegistry contract
     * @return Arrays of all Venus pools' data
     */
    function getAllPools(address poolRegistryAddress) external view returns (PoolData[] memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        PoolRegistry.VenusPool[] memory venusPools = poolRegistryInterface.getAllPools();
        uint256 poolLength = venusPools.length;

        PoolData[] memory poolDataItems = new PoolData[](poolLength);

        for (uint256 i; i < poolLength; ++i) {
            PoolRegistry.VenusPool memory venusPool = venusPools[i];
            PoolData memory poolData = getPoolDataFromVenusPool(poolRegistryAddress, venusPool);
            poolDataItems[i] = poolData;
        }

        return poolDataItems;
    }

    /**
     * @notice Queries the details of a pool identified by Comptroller address
     * @param poolRegistryAddress The address of the PoolRegistry contract
     * @param comptroller The Comptroller implementation address
     * @return PoolData structure containing the details of the pool
     */
    function getPoolByComptroller(
        address poolRegistryAddress,
        address comptroller
    ) external view returns (PoolData memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return getPoolDataFromVenusPool(poolRegistryAddress, poolRegistryInterface.getPoolByComptroller(comptroller));
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
     * @notice Queries additional information for the pool
     * @param poolRegistryAddress Address of the PoolRegistry
     * @param venusPool The VenusPool Object from PoolRegistry
     * @return Enriched PoolData
     */
    function getPoolDataFromVenusPool(
        address poolRegistryAddress,
        PoolRegistry.VenusPool memory venusPool
    ) public view returns (PoolData memory) {
        // Get tokens in the Pool
        ComptrollerInterface comptrollerInstance = ComptrollerInterface(venusPool.comptroller);

        VToken[] memory vTokens = comptrollerInstance.getAllMarkets();

        VTokenMetadata[] memory vTokenMetadataItems = vTokenMetadataAll(vTokens);

        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);

        PoolRegistry.VenusPoolMetaData memory venusPoolMetaData = poolRegistryInterface.getVenusPoolMetadata(
            venusPool.comptroller
        );

        ComptrollerViewInterface comptrollerViewInstance = ComptrollerViewInterface(venusPool.comptroller);

        PoolData memory poolData = PoolData({
            name: venusPool.name,
            creator: venusPool.creator,
            comptroller: venusPool.comptroller,
            blockPosted: venusPool.blockPosted,
            timestampPosted: venusPool.timestampPosted,
            category: venusPoolMetaData.category,
            logoURL: venusPoolMetaData.logoURL,
            description: venusPoolMetaData.description,
            vTokens: vTokenMetadataItems,
            priceOracle: address(comptrollerViewInstance.oracle()),
            closeFactor: comptrollerViewInstance.closeFactorMantissa(),
            liquidationIncentive: comptrollerViewInstance.liquidationIncentiveMantissa(),
            minLiquidatableCollateral: comptrollerViewInstance.minLiquidatableCollateral()
        });

        return poolData;
    }

    /**
     * @notice Returns the metadata of VToken
     * @param vToken The address of vToken
     * @return VTokenMetadata struct
     */
    function vTokenMetadata(VToken vToken) public view returns (VTokenMetadata memory) {
        uint256 exchangeRateCurrent = vToken.exchangeRateStored();
        address comptrollerAddress = address(vToken.comptroller());
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(comptrollerAddress);
        (bool isListed, uint256 collateralFactorMantissa) = comptroller.markets(address(vToken));

        address underlyingAssetAddress = vToken.underlying();
        uint256 underlyingDecimals = IERC20Metadata(underlyingAssetAddress).decimals();

        return
            VTokenMetadata({
                vToken: address(vToken),
                exchangeRateCurrent: exchangeRateCurrent,
                supplyRatePerBlock: vToken.supplyRatePerBlock(),
                borrowRatePerBlock: vToken.borrowRatePerBlock(),
                reserveFactorMantissa: vToken.reserveFactorMantissa(),
                supplyCaps: comptroller.supplyCaps(address(vToken)),
                borrowCaps: comptroller.borrowCaps(address(vToken)),
                totalBorrows: vToken.totalBorrows(),
                totalReserves: vToken.totalReserves(),
                totalSupply: vToken.totalSupply(),
                totalCash: vToken.getCash(),
                isListed: isListed,
                collateralFactorMantissa: collateralFactorMantissa,
                underlyingAssetAddress: underlyingAssetAddress,
                vTokenDecimals: vToken.decimals(),
                underlyingDecimals: underlyingDecimals
            });
    }

    /**
     * @notice Returns the metadata of all VTokens
     * @param vTokens The list of vToken addresses
     * @return An array of VTokenMetadata structs
     */
    function vTokenMetadataAll(VToken[] memory vTokens) public view returns (VTokenMetadata[] memory) {
        uint256 vTokenCount = vTokens.length;
        VTokenMetadata[] memory res = new VTokenMetadata[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenMetadata(vTokens[i]);
        }
        return res;
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

        bool _isTimeBased = rewardsDistributor.isTimeBased();
        require(_isTimeBased == isTimeBased, "Inconsistent Reward mode");

        for (uint256 i; i < markets.length; ++i) {
            // Market borrow and supply state we will modify update in-memory, in order to not modify storage
            RewardTokenState memory borrowState;
            RewardTokenState memory supplyState;

            if (_isTimeBased) {
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
}

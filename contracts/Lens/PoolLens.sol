// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@venusprotocol/oracle/contracts/PriceOracle.sol";

import "../VToken.sol";
import "../ComptrollerInterface.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../Pool/PoolRegistry.sol";

contract PoolLens is ExponentialNoError {
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
        // The block number the index was last updated at
        uint32 block;
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
     * @param vTokens The list of vToken Addresses.
     * @param account The user Account.
     * @notice Returns the BalanceInfo of all VTokens.
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
     * @param poolRegistryAddress The address of Pool.
     * @notice Returns arrays of all Venus pools' data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
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
     * @param poolRegistryAddress The address of Pool.
     * @param comptroller The Comptroller implementation address.
     * @notice Returns Venus pool Unitroller (Comptroller proxy) contract addresses.
     */
    function getPoolByComptroller(address poolRegistryAddress, address comptroller)
        external
        view
        returns (PoolData memory)
    {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return getPoolDataFromVenusPool(poolRegistryAddress, poolRegistryInterface.getPoolByComptroller(comptroller));
    }

    /**
     * @param poolRegistryAddress The address of Pool.
     * @param comptroller The pool comptroller.
     * @param asset The underlyingAsset of VToken.
     * @notice Returns VToken in a Pool for an Asset.
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
     * @param poolRegistryAddress The address of Pool.
     * @param asset The underlyingAsset of VToken.
     * @notice Returns all Pools supported by an Asset.
     */
    function getPoolsSupportedByAsset(address poolRegistryAddress, address asset)
        external
        view
        returns (address[] memory)
    {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getPoolsSupportedByAsset(asset);
    }

    /**
     * @param vTokens The list of vToken Addresses.
     * @notice Returns the underlyingPrice Info of all VTokens.
     */
    function vTokenUnderlyingPriceAll(VToken[] calldata vTokens)
        external
        view
        returns (VTokenUnderlyingPrice[] memory)
    {
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
    function getPendingRewards(address account, address comptrollerAddress)
        external
        view
        returns (RewardSummary[] memory)
    {
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
        PriceOracle priceOracle = comptroller.oracle();

        BadDebt[] memory badDebts = new BadDebt[](markets.length);

        BadDebtSummary memory badDebtSummary;
        badDebtSummary.comptroller = comptrollerAddress;
        badDebtSummary.badDebts = badDebts;

        // // Calculate the bad debt is USD per market
        for (uint256 i; i < markets.length; ++i) {
            BadDebt memory badDebt;
            badDebt.vTokenAddress = address(markets[i]);
            badDebt.badDebtUsd =
                VToken(address(markets[i])).badDebt() *
                priceOracle.getUnderlyingPrice(address(markets[i]));
            badDebtSummary.badDebts[i] = badDebt;
            totalBadDebtUsd = totalBadDebtUsd + badDebt.badDebtUsd;
        }

        badDebtSummary.totalBadDebtUsd = totalBadDebtUsd;

        return badDebtSummary;
    }

    /**
     * @param vToken The vTokenAddress.
     * @param account The user Account.
     * @notice Returns the BalanceInfo of VToken.
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
     * @param venusPool The VenusPool Object from PoolRegistry.
     * @notice Returns enriched PoolData.
     */
    function getPoolDataFromVenusPool(address poolRegistryAddress, PoolRegistry.VenusPool memory venusPool)
        public
        view
        returns (PoolData memory)
    {
        //get tokens in the Pool
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
     * @param vToken The address of vToken.
     * @notice Returns the metadata of VToken.
     */
    function vTokenMetadata(VToken vToken) public view returns (VTokenMetadata memory) {
        uint256 exchangeRateCurrent = vToken.exchangeRateStored();
        address comptrollerAddress = address(vToken.comptroller());
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(comptrollerAddress);
        (bool isListed, uint256 collateralFactorMantissa) = comptroller.markets(address(vToken));
        address underlyingAssetAddress;
        uint256 underlyingDecimals;

        underlyingAssetAddress = vToken.underlying();
        underlyingDecimals = IERC20Metadata(vToken.underlying()).decimals();

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
     * @param vTokens The list of vToken Addresses.
     * @notice Returns the metadata of all VTokens.
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
     * @param vToken The vToken Addresses.
     * @notice Returns the underlyingPrice of VToken.
     */
    function vTokenUnderlyingPrice(VToken vToken) public view returns (VTokenUnderlyingPrice memory) {
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(address(vToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

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
            (borrowState.index, borrowState.block) = rewardsDistributor.rewardTokenBorrowState(address(markets[i]));
            RewardTokenState memory supplyState;
            (supplyState.index, supplyState.block) = rewardsDistributor.rewardTokenSupplyState(address(markets[i]));
            Exp memory marketBorrowIndex = Exp({ mantissa: markets[i].borrowIndex() });

            //Update market supply and borrow index in-memory
            updateMarketBorrowIndex(address(markets[i]), rewardsDistributor, borrowState, marketBorrowIndex);
            updateMarketSupplyIndex(address(markets[i]), rewardsDistributor, supplyState);

            //Calculate pending rewards
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
        uint256 blockNumber = block.number;
        uint256 deltaBlocks = sub_(blockNumber, uint256(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            // Remove the total earned interest rate since the opening of the market from total borrows
            uint256 borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint256 tokensAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(tokensAccrued, borrowAmount) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: borrowState.index }), ratio);
            borrowState.index = safe224(index.mantissa, "new index overflows");
            borrowState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            borrowState.block = safe32(blockNumber, "block number overflows");
        }
    }

    function updateMarketSupplyIndex(
        address vToken,
        RewardsDistributor rewardsDistributor,
        RewardTokenState memory supplyState
    ) internal view {
        uint256 supplySpeed = rewardsDistributor.rewardTokenSupplySpeeds(vToken);
        uint256 blockNumber = block.number;
        uint256 deltaBlocks = sub_(blockNumber, uint256(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint256 supplyTokens = VToken(vToken).totalSupply();
            uint256 tokensAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(tokensAccrued, supplyTokens) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: supplyState.index }), ratio);
            supplyState.index = safe224(index.mantissa, "new index overflows");
            supplyState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            supplyState.block = safe32(blockNumber, "block number overflows");
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
        if (borrowerIndex.mantissa == 0 && borrowIndex.mantissa > 0) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set
            borrowerIndex.mantissa = rewardsDistributor.rewardTokenInitialIndex();
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
        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            // Covers the case where users supplied tokens before the market's supply state index was set
            supplierIndex.mantissa = rewardsDistributor.rewardTokenInitialIndex();
        }
        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint256 supplierTokens = VToken(vToken).balanceOf(supplier);
        uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
        return supplierDelta;
    }
}

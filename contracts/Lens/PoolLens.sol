// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "../VBep20.sol";
import "../VToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../ComptrollerInterface.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../Pool/PoolRegistry.sol";

contract PoolLens is ExponentialNoError {
    /**
    * @dev Struct for PoolDetails.
    */
    struct PoolData {
        uint256 poolId;
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
        PoolRegistry.RiskRating riskRating;
        string category;
        string logoURL;
        string description;
        address priceOracle;
        uint256 closeFactor;
        uint256 liquidationIncentive;
        uint256 maxAssets;
        VTokenMetadata[] vTokens;
    }

    /**
    * @param poolRegistryAddress The address of Pool.
    * @notice Returns arrays of all Venus pools' data.
    * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
    */
    function getAllPools(address poolRegistryAddress) external view returns (PoolData[] memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        PoolRegistry.VenusPool[] memory venusPools = poolRegistryInterface.getAllPools();
        uint poolLength = venusPools.length;

        PoolData[] memory poolDataItems = new PoolData[](poolLength);
        
        for (uint256 i; i < poolLength; ++i) {
            PoolRegistry.VenusPool memory venusPool = venusPools[i];
            PoolData memory poolData = getPoolDataFromVenusPool(poolRegistryAddress, venusPool);
            poolDataItems[i] = poolData;
        }

        return poolDataItems;
    }

    /**
    * @param venusPool The VenusPool Object from PoolRegistry.
    * @notice Returns enriched PoolData.
    */
    function getPoolDataFromVenusPool(address poolRegistryAddress, PoolRegistry.VenusPool memory venusPool) public view returns (PoolData memory) {
            //get tokens in the Pool
            ComptrollerInterface comptrollerInstance = ComptrollerInterface(venusPool.comptroller);

            VToken[] memory vTokens = comptrollerInstance.getAllMarkets();

            VTokenMetadata[] memory vTokenMetadataItems = vTokenMetadataAll(vTokens);

            PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);

            uint256 poolId = poolRegistryInterface.getPoolIDByComptroller(venusPool.comptroller);

            //get PoolMetada via lookup on comptrollerAddress to poolId and then poolId to poolMetadata
            PoolRegistry.VenusPoolMetaData memory venusPoolMetaData = poolRegistryInterface.getVenusPoolMetadata(poolId);

            ComptrollerViewInterface comptrollerViewInstance = ComptrollerViewInterface(venusPool.comptroller);

            PoolData memory poolData = PoolData({
                poolId: venusPool.poolId,
                name: venusPool.name,
                creator: venusPool.creator,
                comptroller: venusPool.comptroller,
                blockPosted: venusPool.blockPosted,
                timestampPosted: venusPool.timestampPosted,
                riskRating: venusPoolMetaData.riskRating,
                category: venusPoolMetaData.category,
                logoURL: venusPoolMetaData.logoURL,
                description: venusPoolMetaData.description,
                vTokens: vTokenMetadataItems,
                priceOracle: address(comptrollerViewInstance.oracle()),
                closeFactor: comptrollerViewInstance.closeFactorMantissa(),
                liquidationIncentive: comptrollerViewInstance.liquidationIncentiveMantissa(),
                maxAssets: comptrollerViewInstance.maxAssets()
            });

            return poolData;
    }

    /** 
    * @param poolRegistryAddress The address of Pool.
    * @param comptroller The Comptroller implementation address.
    * @notice Returns Venus pool Unitroller (Comptroller proxy) contract addresses.
    */
    function getPoolByComptroller(address poolRegistryAddress, address comptroller) external view returns (PoolData memory)
    {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return getPoolDataFromVenusPool(poolRegistryAddress, poolRegistryInterface.getPoolByComptroller(comptroller));   
    }

    /**
    * @param poolRegistryAddress The address of Pool.
    * @param poolId The poolIndex.  
    * @param asset The underlyingAsset of VToken.
    * @notice Returns VToken in a Pool for an Asset.
    */
    function getVTokenForAsset(address poolRegistryAddress, uint poolId, address asset) external view returns (address) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getVTokenForAsset(poolId, asset);
    }

    /**
    * @param poolRegistryAddress The address of Pool.  
    * @param asset The underlyingAsset of VToken.
    * @notice Returns all Pools supported by an Asset.
    */
    function getPoolsSupportedByAsset(address poolRegistryAddress, address asset) external view returns (uint[] memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getPoolsSupportedByAsset(asset);
    }

    /**
    * @dev Struct for VToken.
    */
    struct VTokenMetadata {
        address vToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint vTokenDecimals;
        uint underlyingDecimals;
    }

    /**
    * @param vToken The address of vToken.  
    * @notice Returns the metadata of VToken.
    */
    function vTokenMetadata(VToken vToken) public view returns (VTokenMetadata memory) {
        uint exchangeRateCurrent = vToken.exchangeRateStored();
        address comptrollerAddress = address(vToken.comptroller());
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(comptrollerAddress);
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(vToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        VBep20 vBep20 = VBep20(address(vToken));
        underlyingAssetAddress = vBep20.underlying();
        underlyingDecimals = EIP20Interface(vBep20.underlying()).decimals();

        return VTokenMetadata({
            vToken: address(vToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: vToken.supplyRatePerBlock(),
            borrowRatePerBlock: vToken.borrowRatePerBlock(),
            reserveFactorMantissa: vToken.reserveFactorMantissa(),
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
        uint vTokenCount = vTokens.length;
        VTokenMetadata[] memory res = new VTokenMetadata[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenMetadata(vTokens[i]);
        }
        return res;
    }

    /**
    * @dev Struct for VTokenBalance.
    */
    struct VTokenBalances {
        address vToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    /**
    * @param vToken The vTokenAddress.
    * @param account The user Account.
    * @notice Returns the BalanceInfo of VToken.
    */
    function vTokenBalances(VToken vToken, address payable account) public returns (VTokenBalances memory) {
        uint balanceOf = vToken.balanceOf(account);
        uint borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        VBep20 vBep20 = VBep20(address(vToken));
        EIP20Interface underlying = EIP20Interface(vBep20.underlying());
        tokenBalance = underlying.balanceOf(account);
        tokenAllowance = underlying.allowance(account, address(vToken));

        return VTokenBalances({
            vToken: address(vToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    /**
    * @param vTokens The list of vToken Addresses.
    * @param account The user Account. 
    * @notice Returns the BalanceInfo of all VTokens.
    */
    function vTokenBalancesAll(VToken[] calldata vTokens, address payable account) external returns (VTokenBalances[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenBalances(vTokens[i], account);
        }
        return res;
    }

    /**
    * @dev Struct for underlyingPrice of VToken.
    */
    struct VTokenUnderlyingPrice {
        address vToken;
        uint underlyingPrice;
    }

    /**
    * @param vToken The vToken Addresses.  
    * @notice Returns the underlyingPrice of VToken.
    */
    function vTokenUnderlyingPrice(VToken vToken) public view returns (VTokenUnderlyingPrice memory) {
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(address(vToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return VTokenUnderlyingPrice({
            vToken: address(vToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(vToken)
        });
    }

    /**
    * @param vTokens The list of vToken Addresses.  
    * @notice Returns the underlyingPrice Info of all VTokens.
    */
    function vTokenUnderlyingPriceAll(VToken[] calldata vTokens) external view returns (VTokenUnderlyingPrice[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenUnderlyingPrice[] memory res = new VTokenUnderlyingPrice[](vTokenCount);
        for (uint256 i; i < vTokenCount; ++i) {
            res[i] = vTokenUnderlyingPrice(vTokens[i]);
        }
        return res;
    }
}
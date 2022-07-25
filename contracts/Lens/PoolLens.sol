// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "../CErc20.sol";
import "../CToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../ComptrollerInterface.sol";
import "../SafeMath.sol";
import "../Pool/PoolRegistryInterface.sol";
import "../Pool/PoolRegistry.sol";

contract PoolLens is ExponentialNoError {

    using SafeMath for uint256;

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
        CTokenMetadata[] cTokens;
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

            CToken[] memory cTokens = comptrollerInstance.getAllMarkets();

            CTokenMetadata[] memory cTokenMetadataItems = cTokenMetadataAll(cTokens);

            PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);

            uint256 poolId = poolRegistryInterface.getPoolIDByComptroller(venusPool.comptroller);

            //get PoolMetada via lookup on comptrollerAddress to poolId and then poolId to poolMetadata
            PoolRegistry.VenusPoolMetaData memory venusPoolMetaData = poolRegistryInterface.getVenusPoolMetadata(poolId);

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
                cTokens: cTokenMetadataItems
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
    * @param asset The underlyingAsset of CToken.
    * @notice Returns CToken in a Pool for an Asset.
    */
    function getCTokenForAsset(address poolRegistryAddress, uint poolId, address asset) external view returns (address) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getCTokenForAsset(poolId, asset);
    }

    /**
    * @param poolRegistryAddress The address of Pool.  
    * @param asset The underlyingAsset of CToken.
    * @notice Returns all Pools supported by an Asset.
    */
    function getPoolsSupportedByAsset(address poolRegistryAddress, address asset) external view returns (uint[] memory) {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getPoolsSupportedByAsset(asset);
    }

    /**
    * @dev Struct for CToken.
    */
    struct CTokenMetadata {
        address cToken;
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
        uint cTokenDecimals;
        uint underlyingDecimals;
    }

    /**
    * @param cToken The address of cToken.  
    * @notice Returns the metadata of CToken.
    */
    function cTokenMetadata(CToken cToken) public view returns (CTokenMetadata memory) {
        uint exchangeRateCurrent = cToken.exchangeRateStored();
        address comptrollerAddress = address(cToken.comptroller());
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(comptrollerAddress);
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(cToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        CErc20 cErc20 = CErc20(address(cToken));
        underlyingAssetAddress = cErc20.underlying();
        underlyingDecimals = EIP20Interface(cErc20.underlying()).decimals();

        return CTokenMetadata({
            cToken: address(cToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: cToken.supplyRatePerBlock(),
            borrowRatePerBlock: cToken.borrowRatePerBlock(),
            reserveFactorMantissa: cToken.reserveFactorMantissa(),
            totalBorrows: cToken.totalBorrows(),
            totalReserves: cToken.totalReserves(),
            totalSupply: cToken.totalSupply(),
            totalCash: cToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            cTokenDecimals: cToken.decimals(),
            underlyingDecimals: underlyingDecimals
        });
    }

    /**
    * @param cTokens The list of cToken Addresses.  
    * @notice Returns the metadata of all CTokens.
    */
    function cTokenMetadataAll(CToken[] memory cTokens) public view returns (CTokenMetadata[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenMetadata[] memory res = new CTokenMetadata[](cTokenCount);
        for (uint256 i; i < cTokenCount; ++i) {
            res[i] = cTokenMetadata(cTokens[i]);
        }
        return res;
    }

    /**
    * @dev Struct for CTokenBalance.
    */
    struct CTokenBalances {
        address cToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    /**
    * @param cToken The cTokenAddress.
    * @param account The user Account.
    * @notice Returns the BalanceInfo of CToken.
    */
    function cTokenBalances(CToken cToken, address payable account) public returns (CTokenBalances memory) {
        uint balanceOf = cToken.balanceOf(account);
        uint borrowBalanceCurrent = cToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = cToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        CErc20 cErc20 = CErc20(address(cToken));
        EIP20Interface underlying = EIP20Interface(cErc20.underlying());
        tokenBalance = underlying.balanceOf(account);
        tokenAllowance = underlying.allowance(account, address(cToken));

        return CTokenBalances({
            cToken: address(cToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    /**
    * @param cTokens The list of cToken Addresses.
    * @param account The user Account. 
    * @notice Returns the BalanceInfo of all CTokens.
    */
    function cTokenBalancesAll(CToken[] calldata cTokens, address payable account) external returns (CTokenBalances[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenBalances[] memory res = new CTokenBalances[](cTokenCount);
        for (uint256 i; i < cTokenCount; ++i) {
            res[i] = cTokenBalances(cTokens[i], account);
        }
        return res;
    }

    /**
    * @dev Struct for underlyingPrice of CToken.
    */
    struct CTokenUnderlyingPrice {
        address cToken;
        uint underlyingPrice;
    }

    /**
    * @param cToken The cToken Addresses.  
    * @notice Returns the underlyingPrice of CToken.
    */
    function cTokenUnderlyingPrice(CToken cToken) public view returns (CTokenUnderlyingPrice memory) {
        ComptrollerViewInterface comptroller = ComptrollerViewInterface(address(cToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return CTokenUnderlyingPrice({
            cToken: address(cToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(cToken)
        });
    }

    /**
    * @param cTokens The list of cToken Addresses.  
    * @notice Returns the underlyingPrice Info of all CTokens.
    */
    function cTokenUnderlyingPriceAll(CToken[] calldata cTokens) external view returns (CTokenUnderlyingPrice[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenUnderlyingPrice[] memory res = new CTokenUnderlyingPrice[](cTokenCount);
        for (uint256 i; i < cTokenCount; ++i) {
            res[i] = cTokenUnderlyingPrice(cTokens[i]);
        }
        return res;
    }
}
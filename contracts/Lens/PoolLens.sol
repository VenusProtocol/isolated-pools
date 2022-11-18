// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

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
        PoolRegistry.RiskRating riskRating;
        string category;
        string logoURL;
        string description;
        address priceOracle;
        uint256 closeFactor;
        uint256 liquidationIncentive;
        uint256 minLiquidatableCollateral;
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
            riskRating: venusPoolMetaData.riskRating,
            category: venusPoolMetaData.category,
            logoURL: venusPoolMetaData.logoURL,
            description: venusPoolMetaData.description,
            vTokens: vTokenMetadataItems,
            priceOracle: address(comptrollerViewInstance.oracle()),
            closeFactor: comptrollerViewInstance.closeFactorMantissa(),
            liquidationIncentive: comptrollerViewInstance.liquidationIncentiveMantissa(),
            minLiquidatableCollateral: comptrollerViewInstance.minLiquidatableCollateral(),
            maxAssets: comptrollerViewInstance.maxAssets()
        });

        return poolData;
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
        returns (uint256[] memory)
    {
        PoolRegistryInterface poolRegistryInterface = PoolRegistryInterface(poolRegistryAddress);
        return poolRegistryInterface.getPoolsSupportedByAsset(asset);
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
     * @param vToken The vTokenAddress.
     * @param account The user Account.
     * @notice Returns the BalanceInfo of VToken.
     */
    function vTokenBalances(VToken vToken, address payable account) public returns (VTokenBalances memory) {
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
     * @param vTokens The list of vToken Addresses.
     * @param account The user Account.
     * @notice Returns the BalanceInfo of all VTokens.
     */
    function vTokenBalancesAll(VToken[] calldata vTokens, address payable account)
        external
        returns (VTokenBalances[] memory)
    {
        uint256 vTokenCount = vTokens.length;
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
        uint256 underlyingPrice;
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
}

# Solidity API

## PoolLens

### PoolData

```solidity
struct PoolData {
  string name;
  address creator;
  address comptroller;
  uint256 blockPosted;
  uint256 timestampPosted;
  enum PoolRegistry.RiskRating riskRating;
  string category;
  string logoURL;
  string description;
  address priceOracle;
  uint256 closeFactor;
  uint256 liquidationIncentive;
  uint256 maxAssets;
  struct PoolLens.VTokenMetadata[] vTokens;
}
```

### getAllPools

```solidity
function getAllPools(address poolRegistryAddress) external view returns (struct PoolLens.PoolData[])
```

Returns arrays of all Venus pools' data.

_This function is not designed to be called in a transaction: it is too gas-intensive._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |

### getPoolDataFromVenusPool

```solidity
function getPoolDataFromVenusPool(address poolRegistryAddress, struct PoolRegistry.VenusPool venusPool) public view returns (struct PoolLens.PoolData)
```

Returns enriched PoolData.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address |  |
| venusPool | struct PoolRegistry.VenusPool | The VenusPool Object from PoolRegistry. |

### getPoolByComptroller

```solidity
function getPoolByComptroller(address poolRegistryAddress, address comptroller) external view returns (struct PoolLens.PoolData)
```

Returns Venus pool Unitroller (Comptroller proxy) contract addresses.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| comptroller | address | The Comptroller implementation address. |

### getVTokenForAsset

```solidity
function getVTokenForAsset(address poolRegistryAddress, address comptroller, address asset) external view returns (address)
```

Returns VToken in a Pool for an Asset.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| comptroller | address | The pool comptroller. |
| asset | address | The underlyingAsset of VToken. |

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address poolRegistryAddress, address asset) external view returns (uint256[])
```

Returns all Pools supported by an Asset.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| asset | address | The underlyingAsset of VToken. |

### VTokenMetadata

```solidity
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
```

### vTokenMetadata

```solidity
function vTokenMetadata(contract VToken vToken) public view returns (struct PoolLens.VTokenMetadata)
```

Returns the metadata of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The address of vToken. |

### vTokenMetadataAll

```solidity
function vTokenMetadataAll(contract VToken[] vTokens) public view returns (struct PoolLens.VTokenMetadata[])
```

Returns the metadata of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |

### VTokenBalances

```solidity
struct VTokenBalances {
  address vToken;
  uint256 balanceOf;
  uint256 borrowBalanceCurrent;
  uint256 balanceOfUnderlying;
  uint256 tokenBalance;
  uint256 tokenAllowance;
}
```

### vTokenBalances

```solidity
function vTokenBalances(contract VToken vToken, address payable account) public returns (struct PoolLens.VTokenBalances)
```

Returns the BalanceInfo of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vTokenAddress. |
| account | address payable | The user Account. |

### vTokenBalancesAll

```solidity
function vTokenBalancesAll(contract VToken[] vTokens, address payable account) external returns (struct PoolLens.VTokenBalances[])
```

Returns the BalanceInfo of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |
| account | address payable | The user Account. |

### VTokenUnderlyingPrice

```solidity
struct VTokenUnderlyingPrice {
  address vToken;
  uint256 underlyingPrice;
}
```

### vTokenUnderlyingPrice

```solidity
function vTokenUnderlyingPrice(contract VToken vToken) public view returns (struct PoolLens.VTokenUnderlyingPrice)
```

Returns the underlyingPrice of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken Addresses. |

### vTokenUnderlyingPriceAll

```solidity
function vTokenUnderlyingPriceAll(contract VToken[] vTokens) external view returns (struct PoolLens.VTokenUnderlyingPrice[])
```

Returns the underlyingPrice Info of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |


# Solidity API

## PoolRegistryInterface

### getAllPools

```solidity
function getAllPools() external view virtual returns (struct PoolRegistry.VenusPool[])
```

### getPoolByComptroller

```solidity
function getPoolByComptroller(address comptroller) external view virtual returns (struct PoolRegistry.VenusPool)
```

### getBookmarks

```solidity
function getBookmarks(address account) external view virtual returns (address[])
```

### getVTokenForAsset

```solidity
function getVTokenForAsset(address comptroller, address asset) external view virtual returns (address)
```

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address asset) external view virtual returns (uint256[])
```

### getVenusPoolMetadata

```solidity
function getVenusPoolMetadata(address comptroller) external view virtual returns (struct PoolRegistry.VenusPoolMetaData)
```


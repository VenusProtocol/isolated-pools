# Solidity API

## PoolRegistry

PoolRegistry is a registry for Venus interest rate pools.

### vTokenFactory

```solidity
contract VBep20ImmutableProxyFactory vTokenFactory
```

### jumpRateFactory

```solidity
contract JumpRateModelFactory jumpRateFactory
```

### whitePaperFactory

```solidity
contract WhitePaperInterestRateModelFactory whitePaperFactory
```

### shortfall

```solidity
contract Shortfall shortfall
```

### riskFund

```solidity
address payable riskFund
```

### protocolShareReserve

```solidity
address payable protocolShareReserve
```

### initialize

```solidity
function initialize(contract VBep20ImmutableProxyFactory _vTokenFactory, contract JumpRateModelFactory _jumpRateFactory, contract WhitePaperInterestRateModelFactory _whitePaperFactory, contract Shortfall _shortfall, address payable riskFund_, address payable protocolShareReserve_) public
```

_Initializes the deployer to owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _vTokenFactory | contract VBep20ImmutableProxyFactory | vToken factory address. |
| _jumpRateFactory | contract JumpRateModelFactory | jump rate factory address. |
| _whitePaperFactory | contract WhitePaperInterestRateModelFactory | white paper factory address. |
| _shortfall | contract Shortfall |  |
| riskFund_ | address payable | risk fund address. |
| protocolShareReserve_ | address payable | protocol's shares reserve address. |

### VenusPool

```solidity
struct VenusPool {
  string name;
  address creator;
  address comptroller;
  uint256 blockPosted;
  uint256 timestampPosted;
}
```

### RiskRating

```solidity
enum RiskRating {
  VERY_HIGH_RISK,
  HIGH_RISK,
  MEDIUM_RISK,
  LOW_RISK,
  MINIMAL_RISK
}
```

### VenusPoolMetaData

```solidity
struct VenusPoolMetaData {
  enum PoolRegistry.RiskRating riskRating;
  string category;
  string logoURL;
  string description;
}
```

### metadata

```solidity
mapping(address => struct PoolRegistry.VenusPoolMetaData) metadata
```

_Maps venus pool id to metadata_

### _poolsByID

```solidity
mapping(uint256 => address) _poolsByID
```

_Array of Venus pool comptroller addresses.
Used for iterating over all pools_

### _numberOfPools

```solidity
uint256 _numberOfPools
```

_Total number of pools created._

### _poolByComptroller

```solidity
mapping(address => struct PoolRegistry.VenusPool) _poolByComptroller
```

_Maps comptroller address to Venus pool Index._

### _bookmarks

```solidity
mapping(address => address[]) _bookmarks
```

_Maps Ethereum accounts to arrays of Venus pool Comptroller proxy contract addresses._

### _vTokens

```solidity
mapping(address => mapping(address => address)) _vTokens
```

_Maps pool id to asset to vToken._

### _supportedPools

```solidity
mapping(address => address[]) _supportedPools
```

_Maps asset to list of supported pools._

### InterestRateModels

```solidity
enum InterestRateModels {
  WhitePaper,
  JumpRate
}
```

### AddMarketInput

```solidity
struct AddMarketInput {
  address comptroller;
  address asset;
  uint8 decimals;
  string name;
  string symbol;
  enum PoolRegistry.InterestRateModels rateModel;
  uint256 baseRatePerYear;
  uint256 multiplierPerYear;
  uint256 jumpMultiplierPerYear;
  uint256 kink_;
  uint256 collateralFactor;
  uint256 liquidationThreshold;
  contract AccessControlManager accessControlManager;
  address vTokenProxyAdmin;
  contract VBep20Immutable tokenImplementation_;
}
```

### PoolRegistered

```solidity
event PoolRegistered(address comptroller, struct PoolRegistry.VenusPool pool)
```

_Emitted when a new Venus pool is added to the directory._

### PoolNameSet

```solidity
event PoolNameSet(address comptroller, string name)
```

_Emitted when a pool name is set._

### PoolMetadataUpdated

```solidity
event PoolMetadataUpdated(address comptroller, struct PoolRegistry.VenusPoolMetaData oldMetadata, struct PoolRegistry.VenusPoolMetaData newMetadata)
```

_Emitted when a pool metadata is updated._

### MarketAdded

```solidity
event MarketAdded(address comptroller, address vTokenAddress)
```

_Emitted when a Market is added to the pool._

### _registerPool

```solidity
function _registerPool(string name, address comptroller) internal returns (uint256)
```

_Adds a new Venus pool to the directory (without checking msg.sender)._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | The name of the pool. |
| comptroller | address | The pool's Comptroller proxy contract address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The index of the registered Venus pool. |

### createRegistryPool

```solidity
function createRegistryPool(string name, address implementation, uint256 closeFactor, uint256 liquidationIncentive, address priceOracle) external virtual returns (uint256, address)
```

_Deploys a new Venus pool and adds to the directory._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | The name of the pool. |
| implementation | address | The Comptroller implementation address. |
| closeFactor | uint256 | The pool's close factor (scaled by 1e18). |
| liquidationIncentive | uint256 | The pool's liquidation incentive (scaled by 1e18). |
| priceOracle | address | The pool's PriceOracle address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The index of the registered Venus pool and the proxy(Unitroller ) address. |
| [1] | address |  |

### setPoolName

```solidity
function setPoolName(address comptroller, string name) external
```

Modify existing Venus pool name.

### bookmarkPool

```solidity
function bookmarkPool(address comptroller) external
```

Bookmarks a Venus pool Unitroller (Comptroller proxy) contract addresses.

### getAllPools

```solidity
function getAllPools() external view returns (struct PoolRegistry.VenusPool[])
```

Returns arrays of all Venus pools' data.

_This function is not designed to be called in a transaction: it is too gas-intensive._

### getPoolByComptroller

```solidity
function getPoolByComptroller(address comptroller) external view returns (struct PoolRegistry.VenusPool)
```

Returns Venus pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | The Comptroller implementation address. |

### getVenusPoolMetadata

```solidity
function getVenusPoolMetadata(address comptroller) external view returns (struct PoolRegistry.VenusPoolMetaData)
```

Returns Metadata of Venus pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of Venus pool. |

### getBookmarks

```solidity
function getBookmarks(address account) external view returns (address[])
```

Returns arrays of Venus pool Unitroller (Comptroller proxy) contract addresses bookmarked by `account`.

### addMarket

```solidity
function addMarket(struct PoolRegistry.AddMarketInput input) external
```

Add a market to an existing pool

### getVTokenForAsset

```solidity
function getVTokenForAsset(address comptroller, address asset) external view returns (address)
```

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address asset) external view returns (address[])
```

### updatePoolMetadata

```solidity
function updatePoolMetadata(address comptroller, struct PoolRegistry.VenusPoolMetaData _metadata) external
```

Update metadata of an existing pool


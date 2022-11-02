# Solidity API

## RiskFund

_This contract does not support BNB._

### poolRegistry

```solidity
address poolRegistry
```

### pancakeSwapRouter

```solidity
address pancakeSwapRouter
```

### minAmountToConvert

```solidity
uint256 minAmountToConvert
```

### amountOutMin

```solidity
uint256 amountOutMin
```

### convertableBUSDAddress

```solidity
address convertableBUSDAddress
```

### auctionContractAddress

```solidity
address auctionContractAddress
```

### accessControl

```solidity
address accessControl
```

### poolReserves

```solidity
mapping(address => uint256) poolReserves
```

### initialize

```solidity
function initialize(address _pancakeSwapRouter, uint256 _amountOutMin, uint256 _minAmountToConvert, address _convertableBUSDAddress, address _accessControl) public
```

_Initializes the deployer to owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pancakeSwapRouter | address | Address of the pancake swap router. |
| _amountOutMin | uint256 | Min amount out for the pancake swap. |
| _minAmountToConvert | uint256 | Asset should be worth of min amount to convert to BUSD |
| _convertableBUSDAddress | address | Address of the BUSD |
| _accessControl | address | Address of the access control contract. |

### setPoolRegistry

```solidity
function setPoolRegistry(address _poolRegistry) external
```

_Pool registry setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolRegistry | address | Address of the pool registry. |

### setAuctionContractAddress

```solidity
function setAuctionContractAddress(address _auctionContractAddress) external
```

_Auction contract address setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _auctionContractAddress | address | Address of the auction contract. |

### setPancakeSwapRouter

```solidity
function setPancakeSwapRouter(address _pancakeSwapRouter) external
```

_Pancake swap router address setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pancakeSwapRouter | address | Address of the pancake swap router. |

### setAmountOutMin

```solidity
function setAmountOutMin(uint256 _amountOutMin) external
```

_Min amount out setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountOutMin | uint256 | Min amount out for the pancake swap. |

### setMinAmountToConvert

```solidity
function setMinAmountToConvert(uint256 _minAmountToConvert) external
```

_Min amout to convert setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minAmountToConvert | uint256 | Min amout to convert. |

### swapAsset

```solidity
function swapAsset(contract VToken vToken, address comptroller) internal returns (uint256)
```

_Swap single asset to BUSD._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | VToken |
| comptroller | address | comptorller address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### swapPoolsAssets

```solidity
function swapPoolsAssets(struct PoolRegistry.VenusPool[] venusPools) public returns (uint256)
```

_Swap assets of selected pools into BUSD tokens._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| venusPools | struct PoolRegistry.VenusPool[] | Array of Pools to swap for BUSD |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### swapAllPoolsAssets

```solidity
function swapAllPoolsAssets() external returns (uint256)
```

_Swap assets of all pools into BUSD tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### getPoolReserve

```solidity
function getPoolReserve(address comptroller) external view returns (uint256)
```

_Get pool reserve by pool id._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number reserved tokens. |

### transferReserveForAuction

```solidity
function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256)
```

_Transfer tokens for auction._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool. |
| amount | uint256 | Amount to be transferred to auction contract. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number reserved tokens. |


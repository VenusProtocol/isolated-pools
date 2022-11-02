# Solidity API

## Observation

```solidity
struct Observation {
  uint256 timestamp;
  uint256 acc;
}
```

## TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  uint256 baseUnit;
  address pancakePool;
  bool isBnbBased;
  bool isReversedPool;
  uint256 anchorPeriod;
}
```

## TwapOracle

### vBNB

```solidity
address vBNB
```

vBNB address

### bnbBaseUnit

```solidity
uint256 bnbBaseUnit
```

the base unit of WBNB and BUSD, which are the paired tokens for all assets

### busdBaseUnit

```solidity
uint256 busdBaseUnit
```

### expScale

```solidity
uint256 expScale
```

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

Configs by token

### newObservations

```solidity
mapping(address => struct Observation) newObservations
```

The current price observation of TWAP. With old and current observations
we can calculate the TWAP between this range

### oldObservations

```solidity
mapping(address => struct Observation) oldObservations
```

The old price observation of TWAP

### prices

```solidity
mapping(address => uint256) prices
```

Stored price by token

### TwapWindowUpdated

```solidity
event TwapWindowUpdated(address vToken, uint256 oldTimestamp, uint256 oldAcc, uint256 newTimestamp, uint256 newAcc)
```

Emit this event when TWAP window is updated

### AnchorPriceUpdated

```solidity
event AnchorPriceUpdated(address vToken, uint256 price, uint256 oldTimestamp, uint256 newTimestamp)
```

Emit this event when TWAP price is updated

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, address pancakePool, uint256 anchorPeriod)
```

Emit this event when new token configs are added

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize(address vBNB_) public
```

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] configs) external
```

Add multiple token configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| configs | struct TokenConfig[] | config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig config) public
```

Add single token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct TokenConfig | token config struct |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

Get the underlying TWAP price of input vToken

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### currentCumulativePrice

```solidity
function currentCumulativePrice(struct TokenConfig config) public view returns (uint256)
```

Fetches the current token/WBNB and token/BUSD price accumulator from pancakeswap.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | cumulative price of target token regardless of pair order |

### updateTwap

```solidity
function updateTwap(address vToken) public returns (uint256)
```

### _updateTwapInternal

```solidity
function _updateTwapInternal(struct TokenConfig config) internal virtual returns (uint256)
```

Fetches the current token/BUSD price from PancakeSwap, with 18 decimals of precision.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### pokeWindowValues

```solidity
function pokeWindowValues(struct TokenConfig config) internal returns (uint256, uint256, uint256)
```

Update new and old observations of lagging window if period elapsed.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | cumulative price & old observation |
| [1] | uint256 |  |
| [2] | uint256 |  |


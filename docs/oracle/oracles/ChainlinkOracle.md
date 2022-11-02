# Solidity API

## TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  address feed;
  uint256 maxStalePeriod;
}
```

## ChainlinkOracle

### VAI_VALUE

```solidity
uint256 VAI_VALUE
```

VAI token is considered $1 constantly in oracle for now

### prices

```solidity
mapping(address => uint256) prices
```

TODO: might be removed some day, it's for enabling us to force set the prices to
certain values in some urgent conditions

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

token config by assets

### PricePosted

```solidity
event PricePosted(address asset, uint256 previousPriceMantissa, uint256 requestedPriceMantissa, uint256 newPriceMantissa)
```

emit when forced price is set

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, address feed, uint256 maxStalePeriod)
```

emit when token config is added

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize() public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```

Get the Chainlink price of underlying asset of input vToken, revert when vToken is zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### _getUnderlyingPriceInternal

```solidity
function _getUnderlyingPriceInternal(contract VBep20Interface vToken) internal view returns (uint256 price)
```

Get the Chainlink price of underlying asset of input vToken or cached price when it's been set

_The decimals of underlying tokens is considered to ensure the returned prices are in 18 decimals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VBep20Interface | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | in USD, with 18 decimals |

### _getChainlinkPrice

```solidity
function _getChainlinkPrice(address vToken) internal view returns (uint256)
```

Get the Chainlink price of underlying asset of input vToken, revert if token config doesn't exit

_The decimals of feeds are considered_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### setUnderlyingPrice

```solidity
function setUnderlyingPrice(contract VBep20Interface vToken, uint256 underlyingPriceMantissa) external
```

Set the forced prices of the underlying token of input vToken

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VBep20Interface | vToken address |
| underlyingPriceMantissa | uint256 | price in 18 decimals |

### setDirectPrice

```solidity
function setDirectPrice(address asset, uint256 price) external
```

Set the forced prices of the input token

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset | address | asset address |
| price | uint256 | price in 18 decimals |

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] tokenConfigs_) external
```

Add multiple token configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct TokenConfig[] | config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig tokenConfig) public
```

Add single token config, vToken & feed cannot be zero address, and maxStalePeriod must be positive

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct TokenConfig | token config struct |

### _compareStrings

```solidity
function _compareStrings(string a, string b) internal pure returns (bool)
```


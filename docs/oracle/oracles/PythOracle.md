# Solidity API

## TokenConfig

```solidity
struct TokenConfig {
  bytes32 pythId;
  address vToken;
  uint64 maxStalePeriod;
}
```

## PythOracle

PythOracle contract reads prices from actual Pyth oracle contract which accepts/verifies and stores the
updated prices from external sources

### EXP_SCALE

```solidity
uint256 EXP_SCALE
```

price decimals

### underlyingPythOracle

```solidity
contract IPyth underlyingPythOracle
```

the actual pyth oracle address fetch & store the prices

### PythOracleSet

```solidity
event PythOracleSet(address newPythOracle)
```

emit when setting a new pyth oracle address

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, bytes32 pythId, uint64 maxStalePeriod)
```

emit when token config added

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

token configs by vToken address

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize(address underlyingPythOracle_) public
```

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] tokenConfigs_) external
```

Batch set token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct TokenConfig[] | token config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig tokenConfig) public
```

Set single token config, `maxStalePeriod` cannot be 0 and `vToken` can be zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct TokenConfig | token config struct |

### setUnderlyingPythOracle

```solidity
function setUnderlyingPythOracle(contract IPyth underlyingPythOracle_) external
```

set the underlying pyth oracle contract address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| underlyingPythOracle_ | contract IPyth | pyth oracle contract address |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```

Get price of underlying asset of the input vToken, under the hood this function
get price from Pyth contract, the prices of which are updated externally

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in 10 decimals |


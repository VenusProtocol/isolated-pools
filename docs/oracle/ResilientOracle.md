# Solidity API

## ResilientOracle

### INVALID_PRICE

```solidity
uint256 INVALID_PRICE
```

### OracleRole

```solidity
enum OracleRole {
  MAIN,
  PIVOT,
  FALLBACK
}
```

### TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  address[3] oracles;
  bool[3] enableFlagsForOracles;
}
```

### tokenConfigs

```solidity
mapping(address => struct ResilientOracle.TokenConfig) tokenConfigs
```

### GlobalEnable

```solidity
event GlobalEnable(bool isEnable)
```

### TokenConfigAdded

```solidity
event TokenConfigAdded(address token, address mainOracle, address pivotOracle, address fallbackOracle)
```

### OracleSet

```solidity
event OracleSet(address vToken, address oracle, uint256 role)
```

### OracleEnabled

```solidity
event OracleEnabled(address vToken, uint256 role, bool enable)
```

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### checkTokenConfigExistance

```solidity
modifier checkTokenConfigExistance(address vToken)
```

Check whether token config exist by checking whether vToken is zero address

_vToken can't be set to zero, so it's suitable to be used to check_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |

### initialize

```solidity
function initialize() public
```

### pause

```solidity
function pause() external
```

Pause protocol

### unpause

```solidity
function unpause() external
```

Unpause protocol

### getTokenConfig

```solidity
function getTokenConfig(address vToken) external view returns (struct ResilientOracle.TokenConfig)
```

_Get token config by vToken address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |

### getOracle

```solidity
function getOracle(address vToken, enum ResilientOracle.OracleRole role) public view returns (address oracle, bool enabled)
```

Get oracle & enabling status by vToken address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |
| role | enum ResilientOracle.OracleRole | oracle role |

### setTokenConfigs

```solidity
function setTokenConfigs(struct ResilientOracle.TokenConfig[] tokenConfigs_) external
```

Batch set token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct ResilientOracle.TokenConfig[] | token config array |

### setTokenConfig

```solidity
function setTokenConfig(struct ResilientOracle.TokenConfig tokenConfig) public
```

Set single token configs, vToken MUST HAVE NOT be added before, and main oracle MUST NOT be zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct ResilientOracle.TokenConfig | token config struct |

### setOracle

```solidity
function setOracle(address vToken, address oracle, enum ResilientOracle.OracleRole role) external
```

Set oracle of any type for the input vToken, input vToken MUST exist

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| oracle | address | oracle address |
| role | enum ResilientOracle.OracleRole | oracle role |

### enableOracle

```solidity
function enableOracle(address vToken, enum ResilientOracle.OracleRole role, bool enable) external
```

Enable/disable oracle for the input vToken, input vToken MUST exist

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| role | enum ResilientOracle.OracleRole | oracle role |
| enable | bool | expected status |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

Get price of underlying asset of the input vToken, check flow:
- check the global pausing status
- check price from main oracle
- check price against pivot oracle, if any
- if fallback flag is enabled and price is invalidated, fallback

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price USD price in 18 decimals |

### _getUnderlyingPriceInternal

```solidity
function _getUnderlyingPriceInternal(address vToken) internal view returns (uint256)
```

This function won't revert when price is 0, because the fallback oracle may come to play later

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price USD price in 18 decimals |


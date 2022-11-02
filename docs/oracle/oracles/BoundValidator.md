# Solidity API

## ValidateConfig

```solidity
struct ValidateConfig {
  address vToken;
  uint256 upperBoundRatio;
  uint256 lowerBoundRatio;
}
```

## BoundValidator

### validateConfigs

```solidity
mapping(address => struct ValidateConfig) validateConfigs
```

validation configs by token

### ValidateConfigAdded

```solidity
event ValidateConfigAdded(address vToken, uint256 upperBound, uint256 lowerBound)
```

Emit this event when new validate configs are added

### setValidateConfigs

```solidity
function setValidateConfigs(struct ValidateConfig[] configs) external virtual
```

Add multiple validation configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| configs | struct ValidateConfig[] | config array |

### setValidateConfig

```solidity
function setValidateConfig(struct ValidateConfig config) public virtual
```

Add single validation config

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct ValidateConfig | config struct |

### validatePriceWithAnchorPrice

```solidity
function validatePriceWithAnchorPrice(address vToken, uint256 reporterPrice, uint256 anchorPrice) public view virtual returns (bool)
```

Test reported vToken underlying price against anchor price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |
| anchorPrice | uint256 |  |

### _isWithinAnchor

```solidity
function _isWithinAnchor(address vToken, uint256 reporterPrice, uint256 anchorPrice) internal view returns (bool)
```

Test whether the reported price is within the predefined bounds

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |
| anchorPrice | uint256 | anchor price as testing anchor |

### __gap

```solidity
uint256[49] __gap
```


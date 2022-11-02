# Solidity API

## FixedPriceOracle

### price

```solidity
uint256 price
```

### constructor

```solidity
constructor(uint256 _price) public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) public view returns (uint256)
```

Get the underlying price of a vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18).  Zero means the price is unavailable. |

### assetPrices

```solidity
function assetPrices(address asset) public view returns (uint256)
```

### updatePrice

```solidity
function updatePrice(address vToken) external
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |


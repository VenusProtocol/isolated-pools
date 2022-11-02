# Solidity API

## PriceOracle

### isPriceOracle

```solidity
bool isPriceOracle
```

Indicator that this is a PriceOracle contract (for inspection)

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) external view virtual returns (uint256)
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

### updatePrice

```solidity
function updatePrice(address vToken) external virtual
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |


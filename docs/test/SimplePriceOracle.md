# Solidity API

## SimplePriceOracle

### prices

```solidity
mapping(address => uint256) prices
```

### PricePosted

```solidity
event PricePosted(address asset, uint256 previousPriceMantissa, uint256 requestedPriceMantissa, uint256 newPriceMantissa)
```

### _getUnderlyingAddress

```solidity
function _getUnderlyingAddress(contract VToken vToken) private view returns (address)
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

### setUnderlyingPrice

```solidity
function setUnderlyingPrice(contract VToken vToken, uint256 underlyingPriceMantissa) public
```

### setDirectPrice

```solidity
function setDirectPrice(address asset, uint256 price) public
```

### assetPrices

```solidity
function assetPrices(address asset) external view returns (uint256)
```

### compareStrings

```solidity
function compareStrings(string a, string b) internal pure returns (bool)
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


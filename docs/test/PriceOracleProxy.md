# Solidity API

## V1PriceOracleInterface

### assetPrices

```solidity
function assetPrices(address asset) external view returns (uint256)
```

## PriceOracleProxy

### v1PriceOracle

```solidity
contract V1PriceOracleInterface v1PriceOracle
```

The v1 price oracle, which will continue to serve prices for v1 assets

### guardian

```solidity
address guardian
```

Address of the guardian, which may set the SAI price once

### cEthAddress

```solidity
address cEthAddress
```

Address of the cEther contract, which has a constant price

### cUsdcAddress

```solidity
address cUsdcAddress
```

Address of the cUSDC contract, which we hand pick a key for

### cUsdtAddress

```solidity
address cUsdtAddress
```

Address of the cUSDT contract, which uses the cUSDC price

### cSaiAddress

```solidity
address cSaiAddress
```

Address of the cSAI contract, which may have its price set

### cDaiAddress

```solidity
address cDaiAddress
```

Address of the cDAI contract, which we hand pick a key for

### usdcOracleKey

```solidity
address usdcOracleKey
```

Handpicked key for USDC

### daiOracleKey

```solidity
address daiOracleKey
```

Handpicked key for DAI

### saiPrice

```solidity
uint256 saiPrice
```

Frozen SAI price (or 0 if not set yet)

### constructor

```solidity
constructor(address guardian_, address v1PriceOracle_, address cEthAddress_, address cUsdcAddress_, address cSaiAddress_, address cDaiAddress_, address cUsdtAddress_) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| guardian_ | address | The address of the guardian, which may set the SAI price once |
| v1PriceOracle_ | address | The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets |
| cEthAddress_ | address | The address of cETH, which will return a constant 1e18, since all prices relative to ether |
| cUsdcAddress_ | address | The address of cUSDC, which will be read from a special oracle key |
| cSaiAddress_ | address | The address of cSAI, which may be read directly from storage |
| cDaiAddress_ | address | The address of cDAI, which will be read from a special oracle key |
| cUsdtAddress_ | address | The address of cUSDT, which uses the cUSDC price |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) public view returns (uint256)
```

Get the underlying price of a listed vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18) |

### setSaiPrice

```solidity
function setSaiPrice(uint256 price) public
```

Set the price of SAI, permanently

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | The price for SAI |

### updatePrice

```solidity
function updatePrice(address vToken) external
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |


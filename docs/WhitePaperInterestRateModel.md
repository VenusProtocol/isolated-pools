# Solidity API

## WhitePaperInterestRateModel

The parameterized model described in section 2.4 of the original Compound Protocol whitepaper

### NewInterestParams

```solidity
event NewInterestParams(uint256 baseRatePerBlock, uint256 multiplierPerBlock)
```

### BASE

```solidity
uint256 BASE
```

### blocksPerYear

```solidity
uint256 blocksPerYear
```

The approximate number of blocks per year that is assumed by the interest rate model

### multiplierPerBlock

```solidity
uint256 multiplierPerBlock
```

The multiplier of utilization rate that gives the slope of the interest rate

### baseRatePerBlock

```solidity
uint256 baseRatePerBlock
```

The base interest rate which is the y-intercept when utilization rate is 0

### constructor

```solidity
constructor(uint256 baseRatePerYear, uint256 multiplierPerYear) public
```

Construct an interest rate model

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseRatePerYear | uint256 | The approximate target base APR, as a mantissa (scaled by BASE) |
| multiplierPerYear | uint256 | The rate of increase in interest rate wrt utilization (scaled by BASE) |

### utilizationRate

```solidity
function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256)
```

Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market (currently unused) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The utilization rate as a mantissa between [0, BASE] |

### getBorrowRate

```solidity
function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) public view returns (uint256)
```

Calculates the current borrow rate per block, with the error code expected by the market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate percentage per block as a mantissa (scaled by BASE) |

### getSupplyRate

```solidity
function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) public view returns (uint256)
```

Calculates the current supply rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |
| reserveFactorMantissa | uint256 | The current reserve factor for the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The supply rate percentage per block as a mantissa (scaled by BASE) |


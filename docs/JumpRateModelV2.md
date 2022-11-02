# Solidity API

## JumpRateModelV2

Supports only for V2 vTokens

### getBorrowRate

```solidity
function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) external view returns (uint256)
```

Calculates the current borrow rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate percentage per block as a mantissa (scaled by 1e18) |

### constructor

```solidity
constructor(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_, address owner_) public
```


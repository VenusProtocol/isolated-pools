# Solidity API

## PivotTwapOracle

### validatePrice

```solidity
function validatePrice(address vToken, uint256 reporterPrice) external view returns (bool)
```

Test reported vToken underlying price against stored TWAP

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |


# Solidity API

## OracleInterface

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

## PivotValidatorInterface

### validatePrice

```solidity
function validatePrice(address vToken, uint256 price) external view returns (bool)
```

## PivotOracleInterface


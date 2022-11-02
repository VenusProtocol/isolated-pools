# Solidity API

## MockSimpleOracle

### prices

```solidity
mapping(address => uint256) prices
```

### constructor

```solidity
constructor() public
```

### setPrice

```solidity
function setPrice(address vToken, uint256 price) public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

## MockPivotOracle

### validateResults

```solidity
mapping(address => bool) validateResults
```

### constructor

```solidity
constructor() public
```

### setValidateResult

```solidity
function setValidateResult(address vToken, bool pass) public
```

### validatePrice

```solidity
function validatePrice(address vToken, uint256 price) external view returns (bool)
```


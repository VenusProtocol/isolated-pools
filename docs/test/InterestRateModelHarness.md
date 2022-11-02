# Solidity API

## InterestRateModelHarness

### opaqueBorrowFailureCode

```solidity
uint256 opaqueBorrowFailureCode
```

### failBorrowRate

```solidity
bool failBorrowRate
```

### borrowRate

```solidity
uint256 borrowRate
```

### constructor

```solidity
constructor(uint256 borrowRate_) public
```

### setFailBorrowRate

```solidity
function setFailBorrowRate(bool failBorrowRate_) public
```

### setBorrowRate

```solidity
function setBorrowRate(uint256 borrowRate_) public
```

### getBorrowRate

```solidity
function getBorrowRate(uint256 _cash, uint256 _borrows, uint256 _reserves) public view returns (uint256)
```

### getSupplyRate

```solidity
function getSupplyRate(uint256 _cash, uint256 _borrows, uint256 _reserves, uint256 _reserveFactor) external view returns (uint256)
```


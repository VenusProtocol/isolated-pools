# Solidity API

## EvilToken

A simple test token that fails certain operations

### fail

```solidity
bool fail
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### setFail

```solidity
function setFail(bool _fail) external
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external returns (bool)
```


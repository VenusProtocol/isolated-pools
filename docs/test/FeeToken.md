# Solidity API

## FeeToken

A simple test token that charges fees on transfer. Used to mock USDT.

### basisPointFee

```solidity
uint256 basisPointFee
```

### owner

```solidity
address owner
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, uint256 _basisPointFee, address _owner) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) public returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) public returns (bool)
```


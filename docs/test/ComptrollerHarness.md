# Solidity API

## ComptrollerHarness

### blockNumber

```solidity
uint256 blockNumber
```

### constructor

```solidity
constructor(address _poolRegistry, address _accessControl) public
```

### setPauseGuardian

```solidity
function setPauseGuardian(address harnessedPauseGuardian) public
```

### harnessFastForward

```solidity
function harnessFastForward(uint256 blocks) public returns (uint256)
```

### setBlockNumber

```solidity
function setBlockNumber(uint256 number) public
```

### getBlockNumber

```solidity
function getBlockNumber() public view returns (uint256)
```

## ComptrollerBorked

### _become

```solidity
function _become(contract Unitroller unitroller, contract PriceOracle _oracle, uint256 _closeFactorMantissa, uint256 _maxAssets, bool _reinitializing) public
```

## EchoTypesComptroller

### stringy

```solidity
function stringy(string s) public pure returns (string)
```

### addresses

```solidity
function addresses(address a) public pure returns (address)
```

### booly

```solidity
function booly(bool b) public pure returns (bool)
```

### listOInts

```solidity
function listOInts(uint256[] u) public pure returns (uint256[])
```

### reverty

```solidity
function reverty() public pure
```

### becomeBrains

```solidity
function becomeBrains(address payable unitroller) public
```


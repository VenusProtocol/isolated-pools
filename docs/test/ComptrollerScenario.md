# Solidity API

## ComptrollerScenario

### blockNumber

```solidity
uint256 blockNumber
```

### constructor

```solidity
constructor(address _poolRegistry, address _accessControl) public
```

### fastForward

```solidity
function fastForward(uint256 blocks) public returns (uint256)
```

### setBlockNumber

```solidity
function setBlockNumber(uint256 number) public
```

### getBlockNumber

```solidity
function getBlockNumber() public view returns (uint256)
```

### membershipLength

```solidity
function membershipLength(contract VToken vToken) public view returns (uint256)
```

### unlist

```solidity
function unlist(contract VToken vToken) public
```


# Solidity API

## AggregatorV2V3Interface

Solidity V0.5 does not allow interfaces to inherit from other
interfaces so this contract is a combination of v0.5 AggregatorInterface.sol
and v0.5 AggregatorV3Interface.sol.

### latestAnswer

```solidity
function latestAnswer() external view returns (int256)
```

### latestTimestamp

```solidity
function latestTimestamp() external view returns (uint256)
```

### latestRound

```solidity
function latestRound() external view returns (uint256)
```

### getAnswer

```solidity
function getAnswer(uint256 roundId) external view returns (int256)
```

### getTimestamp

```solidity
function getTimestamp(uint256 roundId) external view returns (uint256)
```

### AnswerUpdated

```solidity
event AnswerUpdated(int256 current, uint256 roundId, uint256 timestamp)
```

### NewRound

```solidity
event NewRound(uint256 roundId, address startedBy, uint256 startedAt)
```

### decimals

```solidity
function decimals() external view returns (uint8)
```

### description

```solidity
function description() external view returns (string)
```

### version

```solidity
function version() external view returns (uint256)
```

### getRoundData

```solidity
function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### latestRoundData

```solidity
function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```


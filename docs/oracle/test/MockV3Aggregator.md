# Solidity API

## MockV3Aggregator

Based on the FluxAggregator contract
Use this contract when you need to test
other contract's ability to read data from an
aggregator contract, but how the aggregator got
its answer is unimportant

### version

```solidity
uint256 version
```

### decimals

```solidity
uint8 decimals
```

### latestAnswer

```solidity
int256 latestAnswer
```

### latestTimestamp

```solidity
uint256 latestTimestamp
```

### latestRound

```solidity
uint256 latestRound
```

### getAnswer

```solidity
mapping(uint256 => int256) getAnswer
```

### getTimestamp

```solidity
mapping(uint256 => uint256) getTimestamp
```

### getStartedAt

```solidity
mapping(uint256 => uint256) getStartedAt
```

### constructor

```solidity
constructor(uint8 _decimals, int256 _initialAnswer) public
```

### updateAnswer

```solidity
function updateAnswer(int256 _answer) public
```

### updateRoundData

```solidity
function updateRoundData(uint80 _roundId, int256 _answer, uint256 _timestamp, uint256 _startedAt) public
```

### getRoundData

```solidity
function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### latestRoundData

```solidity
function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### description

```solidity
function description() external pure returns (string)
```


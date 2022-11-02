# Solidity API

## Math

### min

```solidity
function min(uint256 x, uint256 y) internal pure returns (uint256 z)
```

### sqrt

```solidity
function sqrt(uint256 y) internal pure returns (uint256 z)
```

## UQ112x112

### Q112

```solidity
uint224 Q112
```

### encode

```solidity
function encode(uint112 y) internal pure returns (uint224 z)
```

### uqdiv

```solidity
function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z)
```

## PancakePairHarness

### token0

```solidity
address token0
```

### token1

```solidity
address token1
```

### reserve0

```solidity
uint112 reserve0
```

### reserve1

```solidity
uint112 reserve1
```

### blockTimestampLast

```solidity
uint32 blockTimestampLast
```

### price0CumulativeLast

```solidity
uint256 price0CumulativeLast
```

### price1CumulativeLast

```solidity
uint256 price1CumulativeLast
```

### kLast

```solidity
uint256 kLast
```

### currentBlockTimestamp

```solidity
function currentBlockTimestamp() external view returns (uint32)
```

### getReserves

```solidity
function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
```

### initialize

```solidity
function initialize(address _token0, address _token1) external
```

### update

```solidity
function update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) external
```


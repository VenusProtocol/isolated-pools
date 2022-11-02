# Solidity API

## FixedPoint

### uq112x112

```solidity
struct uq112x112 {
  uint224 _x;
}
```

### fraction

```solidity
function fraction(uint112 numerator, uint112 denominator) internal pure returns (struct FixedPoint.uq112x112)
```

### decode112with18

```solidity
function decode112with18(struct FixedPoint.uq112x112 self) internal pure returns (uint256)
```

## PancakeOracleLibrary

### currentBlockTimestamp

```solidity
function currentBlockTimestamp() internal view returns (uint32)
```

### currentCumulativePrices

```solidity
function currentCumulativePrices(address pair) internal view returns (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp)
```

## IPancakePair

### getReserves

```solidity
function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
```

### price0CumulativeLast

```solidity
function price0CumulativeLast() external view returns (uint256)
```

### price1CumulativeLast

```solidity
function price1CumulativeLast() external view returns (uint256)
```


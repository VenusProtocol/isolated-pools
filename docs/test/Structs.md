# Solidity API

## Structs

### Outer

```solidity
struct Outer {
  uint256 sentinel;
  mapping(address => struct Structs.Inner) inners;
}
```

### Inner

```solidity
struct Inner {
  uint16 a;
  uint16 b;
  uint96 c;
}
```

### outers

```solidity
mapping(uint256 => struct Structs.Outer) outers
```

### writeEach

```solidity
function writeEach(uint256 id, uint16 a, uint16 b, uint96 c) public
```

### writeOnce

```solidity
function writeOnce(uint256 id, uint16 a, uint16 b, uint96 c) public
```


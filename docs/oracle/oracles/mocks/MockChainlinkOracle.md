# Solidity API

## MockChainlinkOracle

### assetPrices

```solidity
mapping(address => uint256) assetPrices
```

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize() public
```

### setPrice

```solidity
function setPrice(address asset, uint256 price) external
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```


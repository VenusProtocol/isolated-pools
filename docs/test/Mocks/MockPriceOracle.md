# Solidity API

## MockPriceOracle

### assetPrices

```solidity
mapping(address => uint256) assetPrices
```

### constructor

```solidity
constructor() public
```

### setPrice

```solidity
function setPrice(address asset, uint256 price) external
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VBep20 vToken) public view returns (uint256)
```

### updatePrice

```solidity
function updatePrice(address vToken) external
```


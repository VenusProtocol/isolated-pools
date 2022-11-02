# Solidity API

## MockPivotTwapOracle

### assetPrices

```solidity
mapping(address => uint256) assetPrices
```

### vBNB

```solidity
address vBNB
```

vBNB address

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address vBNB_) public
```

### setPrice

```solidity
function setPrice(address asset, uint256 price) external
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```


# Solidity API

## MockPythOracle

### assetPrices

```solidity
mapping(address => uint256) assetPrices
```

### underlyingPythOracle

```solidity
contract IPyth underlyingPythOracle
```

the actual pyth oracle address fetch & store the prices

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address underlyingPythOracle_) public
```

### setPrice

```solidity
function setPrice(address asset, uint256 price) external
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```


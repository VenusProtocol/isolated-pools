# Solidity API

## ComptrollerInterface

### isComptroller

```solidity
bool isComptroller
```

Indicator that this is a Comptroller contract (for inspection)

### enterMarkets

```solidity
function enterMarkets(address[] vTokens) external virtual returns (uint256[])
```

### exitMarket

```solidity
function exitMarket(address vToken) external virtual returns (uint256)
```

### mintAllowed

```solidity
function mintAllowed(address vToken, address minter, uint256 mintAmount) external virtual returns (uint256)
```

### mintVerify

```solidity
function mintVerify(address vToken, address minter, uint256 mintAmount, uint256 mintTokens) external virtual
```

### redeemAllowed

```solidity
function redeemAllowed(address vToken, address redeemer, uint256 redeemTokens) external virtual returns (uint256)
```

### redeemVerify

```solidity
function redeemVerify(address vToken, address redeemer, uint256 redeemAmount, uint256 redeemTokens) external virtual
```

### borrowAllowed

```solidity
function borrowAllowed(address vToken, address borrower, uint256 borrowAmount) external virtual returns (uint256)
```

### borrowVerify

```solidity
function borrowVerify(address vToken, address borrower, uint256 borrowAmount) external virtual
```

### repayBorrowAllowed

```solidity
function repayBorrowAllowed(address vToken, address payer, address borrower, uint256 repayAmount) external virtual returns (uint256)
```

### repayBorrowVerify

```solidity
function repayBorrowVerify(address vToken, address payer, address borrower, uint256 repayAmount, uint256 borrowerIndex) external virtual
```

### liquidateBorrowAllowed

```solidity
function liquidateBorrowAllowed(address vTokenBorrowed, address vTokenCollateral, address liquidator, address borrower, uint256 repayAmount, bool skipLiquidityCheck) external virtual returns (uint256)
```

### liquidateBorrowVerify

```solidity
function liquidateBorrowVerify(address vTokenBorrowed, address vTokenCollateral, address liquidator, address borrower, uint256 repayAmount, uint256 seizeTokens) external virtual
```

### seizeAllowed

```solidity
function seizeAllowed(address vTokenCollateral, address vTokenBorrowed, address liquidator, address borrower, uint256 seizeTokens) external virtual returns (uint256)
```

### seizeVerify

```solidity
function seizeVerify(address vTokenCollateral, address vTokenBorrowed, address liquidator, address borrower, uint256 seizeTokens) external virtual
```

### transferAllowed

```solidity
function transferAllowed(address vToken, address src, address dst, uint256 transferTokens) external virtual returns (uint256)
```

### transferVerify

```solidity
function transferVerify(address vToken, address src, address dst, uint256 transferTokens) external virtual
```

### liquidateCalculateSeizeTokens

```solidity
function liquidateCalculateSeizeTokens(address vTokenBorrowed, address vTokenCollateral, uint256 repayAmount) external view virtual returns (uint256, uint256)
```

### getAllMarkets

```solidity
function getAllMarkets() external view virtual returns (contract VToken[])
```

## ComptrollerViewInterface

### markets

```solidity
function markets(address) external view virtual returns (bool, uint256)
```

### oracle

```solidity
function oracle() external view virtual returns (contract PriceOracle)
```

### getAssetsIn

```solidity
function getAssetsIn(address) external view virtual returns (contract VToken[])
```

### compSpeeds

```solidity
function compSpeeds(address) external view virtual returns (uint256)
```

### pauseGuardian

```solidity
function pauseGuardian() external view virtual returns (address)
```

### priceOracle

```solidity
function priceOracle() external view virtual returns (address)
```

### closeFactorMantissa

```solidity
function closeFactorMantissa() external view virtual returns (uint256)
```

### maxAssets

```solidity
function maxAssets() external view virtual returns (uint256)
```

### liquidationIncentiveMantissa

```solidity
function liquidationIncentiveMantissa() external view virtual returns (uint256)
```


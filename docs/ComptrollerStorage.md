# Solidity API

## UnitrollerAdminStorage

### admin

```solidity
address admin
```

Administrator for this contract

### pendingAdmin

```solidity
address pendingAdmin
```

Pending administrator for this contract

### comptrollerImplementation

```solidity
address comptrollerImplementation
```

Active brains of Unitroller

### pendingComptrollerImplementation

```solidity
address pendingComptrollerImplementation
```

Pending brains of Unitroller

## ComptrollerV1Storage

### oracle

```solidity
contract PriceOracle oracle
```

Oracle which gives the price of any given asset

### closeFactorMantissa

```solidity
uint256 closeFactorMantissa
```

Multiplier used to calculate the maximum repayAmount when liquidating a borrow

### liquidationIncentiveMantissa

```solidity
uint256 liquidationIncentiveMantissa
```

Multiplier representing the discount on collateral that a liquidator receives

### maxAssets

```solidity
uint256 maxAssets
```

Max number of assets a single account can participate in (borrow or use as collateral)

### accountAssets

```solidity
mapping(address => contract VToken[]) accountAssets
```

Per-account mapping of "assets you are in", capped by maxAssets

### Market

```solidity
struct Market {
  bool isListed;
  uint256 collateralFactorMantissa;
  uint256 liquidationThresholdMantissa;
  mapping(address => bool) accountMembership;
}
```

### markets

```solidity
mapping(address => struct ComptrollerV1Storage.Market) markets
```

Official mapping of vTokens -> Market metadata

_Used e.g. to determine if a market is supported_

### pauseGuardian

```solidity
address pauseGuardian
```

The Pause Guardian can pause certain actions as a safety mechanism.
 Actions which allow users to remove their own assets cannot be paused.
 Liquidation / seizing / transfer can only be paused globally, not by market.
NOTE: THIS VALUE IS NOT USED IN COMPTROLLER. HOWEVER IT IS ALREADY USED IN COMTROLLERG7
		 AND IS CAUSING COMPILATION ERROR IF REMOVED.

### transferGuardianPaused

```solidity
bool transferGuardianPaused
```

### seizeGuardianPaused

```solidity
bool seizeGuardianPaused
```

### mintGuardianPaused

```solidity
mapping(address => bool) mintGuardianPaused
```

### borrowGuardianPaused

```solidity
mapping(address => bool) borrowGuardianPaused
```

### allMarkets

```solidity
contract VToken[] allMarkets
```

A list of all markets

### borrowCapGuardian

```solidity
address borrowCapGuardian
```

### borrowCaps

```solidity
mapping(address => uint256) borrowCaps
```

### minLiquidatableCollateral

```solidity
uint256 minLiquidatableCollateral
```

Minimal collateral required for regular (non-batch) liquidations

### supplyCaps

```solidity
mapping(address => uint256) supplyCaps
```

Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed

### Action

```solidity
enum Action {
  MINT,
  REDEEM,
  BORROW,
  REPAY,
  SEIZE,
  LIQUIDATE,
  TRANSFER,
  ENTER_MARKET,
  EXIT_MARKET
}
```

### _actionPaused

```solidity
mapping(address => mapping(enum ComptrollerV1Storage.Action => bool)) _actionPaused
```

True if a certain action is paused on a certain market


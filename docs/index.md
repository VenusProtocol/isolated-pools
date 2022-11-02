# Solidity API

## BaseJumpRateModelV2

Version 2 modifies Version 1 by enabling updateable parameters.

### NewInterestParams

```solidity
event NewInterestParams(uint256 baseRatePerBlock, uint256 multiplierPerBlock, uint256 jumpMultiplierPerBlock, uint256 kink)
```

### BASE

```solidity
uint256 BASE
```

### owner

```solidity
address owner
```

The address of the owner, i.e. the Timelock contract, which can update parameters directly

### blocksPerYear

```solidity
uint256 blocksPerYear
```

The approximate number of blocks per year that is assumed by the interest rate model

### multiplierPerBlock

```solidity
uint256 multiplierPerBlock
```

The multiplier of utilization rate that gives the slope of the interest rate

### baseRatePerBlock

```solidity
uint256 baseRatePerBlock
```

The base interest rate which is the y-intercept when utilization rate is 0

### jumpMultiplierPerBlock

```solidity
uint256 jumpMultiplierPerBlock
```

The multiplierPerBlock after hitting a specified utilization point

### kink

```solidity
uint256 kink
```

The utilization point at which the jump multiplier is applied

### constructor

```solidity
constructor(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_, address owner_) internal
```

Construct an interest rate model

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseRatePerYear | uint256 | The approximate target base APR, as a mantissa (scaled by BASE) |
| multiplierPerYear | uint256 | The rate of increase in interest rate wrt utilization (scaled by BASE) |
| jumpMultiplierPerYear | uint256 | The multiplierPerBlock after hitting a specified utilization point |
| kink_ | uint256 | The utilization point at which the jump multiplier is applied |
| owner_ | address | The address of the owner, i.e. the Timelock contract (which has the ability to update parameters directly) |

### updateJumpRateModel

```solidity
function updateJumpRateModel(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_) external virtual
```

Update the parameters of the interest rate model (only callable by owner, i.e. Timelock)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseRatePerYear | uint256 | The approximate target base APR, as a mantissa (scaled by BASE) |
| multiplierPerYear | uint256 | The rate of increase in interest rate wrt utilization (scaled by BASE) |
| jumpMultiplierPerYear | uint256 | The multiplierPerBlock after hitting a specified utilization point |
| kink_ | uint256 | The utilization point at which the jump multiplier is applied |

### utilizationRate

```solidity
function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256)
```

Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market (currently unused) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The utilization rate as a mantissa between [0, BASE] |

### getBorrowRateInternal

```solidity
function getBorrowRateInternal(uint256 cash, uint256 borrows, uint256 reserves) internal view returns (uint256)
```

Calculates the current borrow rate per block, with the error code expected by the market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate percentage per block as a mantissa (scaled by BASE) |

### getSupplyRate

```solidity
function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) public view virtual returns (uint256)
```

Calculates the current supply rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |
| reserveFactorMantissa | uint256 | The current reserve factor for the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The supply rate percentage per block as a mantissa (scaled by BASE) |

### updateJumpRateModelInternal

```solidity
function updateJumpRateModelInternal(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_) internal
```

Internal function to update the parameters of the interest rate model

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseRatePerYear | uint256 | The approximate target base APR, as a mantissa (scaled by BASE) |
| multiplierPerYear | uint256 | The rate of increase in interest rate wrt utilization (scaled by BASE) |
| jumpMultiplierPerYear | uint256 | The multiplierPerBlock after hitting a specified utilization point |
| kink_ | uint256 | The utilization point at which the jump multiplier is applied |

## Comptroller

### MarketEntered

```solidity
event MarketEntered(contract VToken vToken, address account)
```

Emitted when an account enters a market

### MarketExited

```solidity
event MarketExited(contract VToken vToken, address account)
```

Emitted when an account exits a market

### NewCloseFactor

```solidity
event NewCloseFactor(uint256 oldCloseFactorMantissa, uint256 newCloseFactorMantissa)
```

Emitted when close factor is changed by admin

### NewCollateralFactor

```solidity
event NewCollateralFactor(contract VToken vToken, uint256 oldCollateralFactorMantissa, uint256 newCollateralFactorMantissa)
```

Emitted when a collateral factor is changed by admin

### NewLiquidationThreshold

```solidity
event NewLiquidationThreshold(contract VToken vToken, uint256 oldLiquidationThresholdMantissa, uint256 newLiquidationThresholdMantissa)
```

Emitted when liquidation threshold is changed by admin

### NewLiquidationIncentive

```solidity
event NewLiquidationIncentive(uint256 oldLiquidationIncentiveMantissa, uint256 newLiquidationIncentiveMantissa)
```

Emitted when liquidation incentive is changed by admin

### NewPriceOracle

```solidity
event NewPriceOracle(contract PriceOracle oldPriceOracle, contract PriceOracle newPriceOracle)
```

Emitted when price oracle is changed

### ActionPausedMarket

```solidity
event ActionPausedMarket(contract VToken vToken, enum ComptrollerV1Storage.Action action, bool pauseState)
```

Emitted when an action is paused on a market

### NewBorrowCap

```solidity
event NewBorrowCap(contract VToken vToken, uint256 newBorrowCap)
```

Emitted when borrow cap for a vToken is changed

### NewBorrowCapGuardian

```solidity
event NewBorrowCapGuardian(address oldBorrowCapGuardian, address newBorrowCapGuardian)
```

Emitted when borrow cap guardian is changed

### NewMinLiquidatableCollateral

```solidity
event NewMinLiquidatableCollateral(uint256 oldMinLiquidatableCollateral, uint256 newMinLiquidatableCollateral)
```

Emitted when the collateral threshold (in USD) for non-batch liquidations is changed

### NewSupplyCap

```solidity
event NewSupplyCap(contract VToken vToken, uint256 newSupplyCap)
```

Emitted when supply cap for a vToken is changed

### closeFactorMinMantissa

```solidity
uint256 closeFactorMinMantissa
```

### closeFactorMaxMantissa

```solidity
uint256 closeFactorMaxMantissa
```

### collateralFactorMaxMantissa

```solidity
uint256 collateralFactorMaxMantissa
```

### poolRegistry

```solidity
address poolRegistry
```

### accessControl

```solidity
address accessControl
```

### rewardsDistributors

```solidity
contract RewardsDistributor[] rewardsDistributors
```

### rewardsDistributorExists

```solidity
mapping(address => bool) rewardsDistributorExists
```

### constructor

```solidity
constructor(address _poolRegistry, address _accessControl) public
```

### checkActionPauseState

```solidity
function checkActionPauseState(address market, enum ComptrollerV1Storage.Action action) private view
```

Reverts if a certain action is paused on a market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | Market to check |
| action | enum ComptrollerV1Storage.Action | Action to check |

### getAssetsIn

```solidity
function getAssetsIn(address account) external view returns (contract VToken[])
```

Returns the assets an account has entered

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account to pull assets for |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract VToken[] | A dynamic list with the assets the account has entered |

### checkMembership

```solidity
function checkMembership(address account, contract VToken vToken) external view returns (bool)
```

Returns whether the given account is entered in the given asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account to check |
| vToken | contract VToken | The vToken to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the account is in the asset, otherwise false. |

### enterMarkets

```solidity
function enterMarkets(address[] vTokens) public returns (uint256[])
```

Add assets to be included in account liquidity calculation

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | address[] | The list of addresses of the vToken markets to be enabled |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Success indicator for whether each corresponding market was entered |

### addToMarketInternal

```solidity
function addToMarketInternal(contract VToken vToken, address borrower) internal returns (enum ComptrollerErrorReporter.Error)
```

Add the market to the borrower's "assets in" for liquidity calculations

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The market to enter |
| borrower | address | The address of the account to modify |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum ComptrollerErrorReporter.Error | Success indicator for whether the market was entered |

### exitMarket

```solidity
function exitMarket(address vTokenAddress) external returns (uint256)
```

Removes asset from sender's account liquidity calculation

_Sender must not have an outstanding borrow balance in the asset,
 or be providing necessary collateral for an outstanding borrow._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenAddress | address | The address of the asset to be removed |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Whether or not the account successfully exited the market |

### mintAllowed

```solidity
function mintAllowed(address vToken, address minter, uint256 mintAmount) external returns (uint256)
```

Checks if the account should be allowed to mint tokens in the given market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market to verify the mint against |
| minter | address | The account which would get the minted tokens |
| mintAmount | uint256 | The amount of underlying being supplied to the market in exchange for tokens |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol) |

### mintVerify

```solidity
function mintVerify(address vToken, address minter, uint256 actualMintAmount, uint256 mintTokens) external
```

Validates mint and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | Asset being minted |
| minter | address | The address minting the tokens |
| actualMintAmount | uint256 | The amount of the underlying asset being minted |
| mintTokens | uint256 | The number of tokens being minted |

### redeemAllowed

```solidity
function redeemAllowed(address vToken, address redeemer, uint256 redeemTokens) external returns (uint256)
```

Checks if the account should be allowed to redeem tokens in the given market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market to verify the redeem against |
| redeemer | address | The account which would redeem the tokens |
| redeemTokens | uint256 | The number of vTokens to exchange for the underlying asset in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol) |

### redeemAllowedInternal

```solidity
function redeemAllowedInternal(address vToken, address redeemer, uint256 redeemTokens) internal view returns (uint256)
```

### redeemVerify

```solidity
function redeemVerify(address vToken, address redeemer, uint256 redeemAmount, uint256 redeemTokens) external
```

Validates redeem and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | Asset being redeemed |
| redeemer | address | The address redeeming the tokens |
| redeemAmount | uint256 | The amount of the underlying asset being redeemed |
| redeemTokens | uint256 | The number of tokens being redeemed |

### borrowAllowed

```solidity
function borrowAllowed(address vToken, address borrower, uint256 borrowAmount) external returns (uint256)
```

Checks if the account should be allowed to borrow the underlying asset of the given market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market to verify the borrow against |
| borrower | address | The account which would borrow the asset |
| borrowAmount | uint256 | The amount of underlying the account would borrow |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol) |

### borrowVerify

```solidity
function borrowVerify(address vToken, address borrower, uint256 borrowAmount) external
```

Validates borrow and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | Asset whose underlying is being borrowed |
| borrower | address | The address borrowing the underlying |
| borrowAmount | uint256 | The amount of the underlying asset requested to borrow |

### repayBorrowAllowed

```solidity
function repayBorrowAllowed(address vToken, address payer, address borrower, uint256 repayAmount) external returns (uint256)
```

Checks if the account should be allowed to repay a borrow in the given market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market to verify the repay against |
| payer | address | The account which would repay the asset |
| borrower | address | The account which would borrowed the asset |
| repayAmount | uint256 | The amount of the underlying asset the account would repay |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol) |

### repayBorrowVerify

```solidity
function repayBorrowVerify(address vToken, address payer, address borrower, uint256 actualRepayAmount, uint256 borrowerIndex) external
```

Validates repayBorrow and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | Asset being repaid |
| payer | address | The address repaying the borrow |
| borrower | address | The address of the borrower |
| actualRepayAmount | uint256 | The amount of underlying being repaid |
| borrowerIndex | uint256 |  |

### liquidateBorrowAllowed

```solidity
function liquidateBorrowAllowed(address vTokenBorrowed, address vTokenCollateral, address liquidator, address borrower, uint256 repayAmount, bool skipLiquidityCheck) external returns (uint256)
```

Checks if the liquidation should be allowed to occur

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenBorrowed | address | Asset which was borrowed by the borrower |
| vTokenCollateral | address | Asset which was used as collateral and will be seized |
| liquidator | address | The address repaying the borrow and seizing the collateral |
| borrower | address | The address of the borrower |
| repayAmount | uint256 | The amount of underlying being repaid |
| skipLiquidityCheck | bool | Allows the borrow to be liquidated regardless of the account liquidity |

### liquidateBorrowVerify

```solidity
function liquidateBorrowVerify(address vTokenBorrowed, address vTokenCollateral, address liquidator, address borrower, uint256 actualRepayAmount, uint256 seizeTokens) external
```

Validates liquidateBorrow and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenBorrowed | address | Asset which was borrowed by the borrower |
| vTokenCollateral | address | Asset which was used as collateral and will be seized |
| liquidator | address | The address repaying the borrow and seizing the collateral |
| borrower | address | The address of the borrower |
| actualRepayAmount | uint256 | The amount of underlying being repaid |
| seizeTokens | uint256 |  |

### seizeAllowed

```solidity
function seizeAllowed(address vTokenCollateral, address seizerContract, address liquidator, address borrower, uint256 seizeTokens) external returns (uint256)
```

Checks if the seizing of assets should be allowed to occur

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenCollateral | address | Asset which was used as collateral and will be seized |
| seizerContract | address | Contract that tries to seize the asset (either borrowed vToken or Comptroller) |
| liquidator | address | The address repaying the borrow and seizing the collateral |
| borrower | address | The address of the borrower |
| seizeTokens | uint256 | The number of collateral tokens to seize |

### seizeVerify

```solidity
function seizeVerify(address vTokenCollateral, address vTokenBorrowed, address liquidator, address borrower, uint256 seizeTokens) external
```

Validates seize and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenCollateral | address | Asset which was used as collateral and will be seized |
| vTokenBorrowed | address | Asset which was borrowed by the borrower |
| liquidator | address | The address repaying the borrow and seizing the collateral |
| borrower | address | The address of the borrower |
| seizeTokens | uint256 | The number of collateral tokens to seize |

### transferAllowed

```solidity
function transferAllowed(address vToken, address src, address dst, uint256 transferTokens) external returns (uint256)
```

Checks if the account should be allowed to transfer tokens in the given market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market to verify the transfer against |
| src | address | The account which sources the tokens |
| dst | address | The account which receives the tokens |
| transferTokens | uint256 | The number of vTokens to transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol) |

### transferVerify

```solidity
function transferVerify(address vToken, address src, address dst, uint256 transferTokens) external
```

Validates transfer and reverts on rejection. May emit logs.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | Asset being transferred |
| src | address | The account which sources the tokens |
| dst | address | The account which receives the tokens |
| transferTokens | uint256 | The number of vTokens to transfer |

### healAccount

```solidity
function healAccount(address user) external
```

Seizes all the remaining collateral, makes msg.sender repay the existing
  borrows, and treats the rest of the debt as bad debt (for each market).
  The sender has to repay a certain percentage of the debt, computed as
  collateral / (borrows * liquidationIncentive).

_Reverts in case of failure_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | account to heal |

### LiquidationOrder

```solidity
struct LiquidationOrder {
  contract VToken vTokenCollateral;
  contract VToken vTokenBorrowed;
  uint256 repayAmount;
}
```

### AccountLiquiditySnapshot

```solidity
struct AccountLiquiditySnapshot {
  uint256 totalCollateral;
  uint256 weightedCollateral;
  uint256 borrows;
  uint256 effects;
  uint256 liquidity;
  uint256 shortfall;
}
```

### liquidateAccount

```solidity
function liquidateAccount(address borrower, struct Comptroller.LiquidationOrder[] orders) external
```

Liquidates all borrows of the borrower. Callable only if the collateral is less than
  a predefined threshold, and the account collateral can be seized to cover all borrows. If
  the collateral is higher than the threshold, use regular liquidations. If the collateral is
  below the threshold, and the account is insolvent, use healAccount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | the borrower address |
| orders | struct Comptroller.LiquidationOrder[] | an array of liquidation orders |

### getAccountLiquidity

```solidity
function getAccountLiquidity(address account) public view returns (uint256, uint256, uint256)
```

Determine the current account liquidity wrt collateral requirements

_The interface of this function is intentionally kept compatible with Compound and Venus Core_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (possible error code (semi-opaque),                 account liquidity in excess of collateral requirements,          account shortfall below collateral requirements) |
| [1] | uint256 |  |
| [2] | uint256 |  |

### getHypotheticalAccountLiquidity

```solidity
function getHypotheticalAccountLiquidity(address account, address vTokenModify, uint256 redeemTokens, uint256 borrowAmount) public view returns (uint256, uint256, uint256)
```

Determine what the account liquidity would be if the given amounts were redeemed/borrowed

_The interface of this function is intentionally kept compatible with Compound and Venus Core_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The account to determine liquidity for |
| vTokenModify | address | The market to hypothetically redeem/borrow in |
| redeemTokens | uint256 | The number of tokens to hypothetically redeem |
| borrowAmount | uint256 | The amount of underlying to hypothetically borrow |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (possible error code (semi-opaque),                 hypothetical account liquidity in excess of collateral requirements,          hypothetical account shortfall below collateral requirements) |
| [1] | uint256 |  |
| [2] | uint256 |  |

### getCurrentLiquiditySnapshot

```solidity
function getCurrentLiquiditySnapshot(address account, function (contract VToken) view returns (struct ExponentialNoError.Exp) weight) internal view returns (struct Comptroller.AccountLiquiditySnapshot snapshot)
```

Get the total collateral, weighted collateral, borrow balance, liquidity, shortfall

_Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
 without calculating accumulated interest._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The account to get the snapshot for |
| weight | function (contract VToken) view returns (struct ExponentialNoError.Exp) | The function to compute the weight of the collateral – either collateral factor or  liquidation threshold. Accepts the address of the VToken and returns the weight as Exp. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshot | struct Comptroller.AccountLiquiditySnapshot | Account liquidity snapshot |

### getHypotheticalLiquiditySnapshot

```solidity
function getHypotheticalLiquiditySnapshot(address account, contract VToken vTokenModify, uint256 redeemTokens, uint256 borrowAmount, function (contract VToken) view returns (struct ExponentialNoError.Exp) weight) internal view returns (struct Comptroller.AccountLiquiditySnapshot snapshot)
```

Determine what the supply/borrow balances would be if the given amounts were redeemed/borrowed

_Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
 without calculating accumulated interest._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The account to determine liquidity for |
| vTokenModify | contract VToken | The market to hypothetically redeem/borrow in |
| redeemTokens | uint256 | The number of tokens to hypothetically redeem |
| borrowAmount | uint256 | The amount of underlying to hypothetically borrow |
| weight | function (contract VToken) view returns (struct ExponentialNoError.Exp) | The function to compute the weight of the collateral – either collateral factor or          liquidation threshold. Accepts the address of the VToken and returns the |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshot | struct Comptroller.AccountLiquiditySnapshot | Account liquidity snapshot |

### safeGetUnderlyingPrice

```solidity
function safeGetUnderlyingPrice(contract VToken asset) internal view returns (uint256)
```

### getCollateralFactor

```solidity
function getCollateralFactor(contract VToken asset) internal view returns (struct ExponentialNoError.Exp)
```

### getLiquidationThreshold

```solidity
function getLiquidationThreshold(contract VToken asset) internal view returns (struct ExponentialNoError.Exp)
```

### liquidateCalculateSeizeTokens

```solidity
function liquidateCalculateSeizeTokens(address vTokenBorrowed, address vTokenCollateral, uint256 actualRepayAmount) external view returns (uint256, uint256)
```

Calculate number of tokens of collateral asset to seize given an underlying amount

_Used in liquidation (called in vToken.liquidateBorrowFresh)_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokenBorrowed | address | The address of the borrowed vToken |
| vTokenCollateral | address | The address of the collateral vToken |
| actualRepayAmount | uint256 | The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (errorCode, number of vTokenCollateral tokens to be seized in a liquidation) |
| [1] | uint256 |  |

### _setPriceOracle

```solidity
function _setPriceOracle(contract PriceOracle newOracle) public returns (uint256)
```

Sets a new price oracle for the comptroller

_Admin function to set a new price oracle_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setCloseFactor

```solidity
function _setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256)
```

Sets the closeFactor used when liquidating borrows

_Admin function to set closeFactor_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newCloseFactorMantissa | uint256 | New close factor, scaled by 1e18 |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure |

### _setCollateralFactor

```solidity
function _setCollateralFactor(contract VToken vToken, uint256 newCollateralFactorMantissa, uint256 newLiquidationThresholdMantissa) external returns (uint256)
```

Sets the collateralFactor for a market

_Restricted function to set per-market collateralFactor_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The market to set the factor on |
| newCollateralFactorMantissa | uint256 | The new collateral factor, scaled by 1e18 |
| newLiquidationThresholdMantissa | uint256 | The new liquidation threshold, scaled by 1e18 |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure. (See ErrorReporter for details) |

### _setLiquidationIncentive

```solidity
function _setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa) external returns (uint256)
```

Sets liquidationIncentive

_Admin function to set liquidationIncentive_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newLiquidationIncentiveMantissa | uint256 | New liquidationIncentive scaled by 1e18 |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure. (See ErrorReporter for details) |

### _supportMarket

```solidity
function _supportMarket(contract VToken vToken) external returns (uint256)
```

Add the market to the markets mapping and set it as listed

_Admin function to set isListed and add support for the market_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The address of the market (token) to list |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure. (See enum Error for details) |

### _addMarketInternal

```solidity
function _addMarketInternal(address vToken) internal
```

### _setMarketBorrowCaps

```solidity
function _setMarketBorrowCaps(contract VToken[] vTokens, uint256[] newBorrowCaps) external
```

Set the given borrow caps for the given vToken markets. Borrowing that brings total borrows to or above borrow cap will revert.

_Admin or borrowCapGuardian function to set the borrow caps. A borrow cap of 0 corresponds to unlimited borrowing._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The addresses of the markets (tokens) to change the borrow caps for |
| newBorrowCaps | uint256[] | The new borrow cap values in underlying to be set. A value of 0 corresponds to unlimited borrowing. |

### _setMarketSupplyCaps

```solidity
function _setMarketSupplyCaps(contract VToken[] vTokens, uint256[] newSupplyCaps) external
```

Set the given supply caps for the given vToken markets. Supply that brings total Supply to or above supply cap will revert.

_Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The addresses of the markets (tokens) to change the supply caps for |
| newSupplyCaps | uint256[] | The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed. |

### _setActionsPaused

```solidity
function _setActionsPaused(contract VToken[] marketsList, enum ComptrollerV1Storage.Action[] actionsList, bool paused) external
```

Pause/unpause certain actions

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| marketsList | contract VToken[] | Markets to pause/unpause the actions on |
| actionsList | enum ComptrollerV1Storage.Action[] | List of action ids to pause/unpause |
| paused | bool | The new paused state (true=paused, false=unpaused) |

### setActionPausedInternal

```solidity
function setActionPausedInternal(address market, enum ComptrollerV1Storage.Action action, bool paused) internal
```

_Pause/unpause an action on a market_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | Market to pause/unpause the action on |
| action | enum ComptrollerV1Storage.Action | Action id to pause/unpause |
| paused | bool | The new paused state (true=paused, false=unpaused) |

### _become

```solidity
function _become(contract Unitroller unitroller) public
```

### adminOrInitializing

```solidity
function adminOrInitializing() internal view returns (bool)
```

Checks caller is admin, or this contract is becoming the new implementation

### _setMinLiquidatableCollateral

```solidity
function _setMinLiquidatableCollateral(uint256 newMinLiquidatableCollateral) external
```

Set the given collateral threshold for non-batch liquidations. Regular liquidations
  will fail if the collateral amount is less than this threshold. Liquidators should use batch
  operations like liquidateAccount or healAccount.

_this funciton access is managed by AccessControlManager_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newMinLiquidatableCollateral | uint256 | The new min liquidatable collateral (in USD). |

### addRewardsDistributor

```solidity
function addRewardsDistributor(contract RewardsDistributor _rewardsDistributor) external returns (uint256)
```

### getAllMarkets

```solidity
function getAllMarkets() public view returns (contract VToken[])
```

Return all of the markets

_The automatic getter may be used to access an individual market._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract VToken[] | The list of market addresses |

### isMarketListed

```solidity
function isMarketListed(contract VToken vToken) public view returns (bool)
```

### actionPaused

```solidity
function actionPaused(address market, enum ComptrollerV1Storage.Action action) public view returns (bool)
```

Checks if a certain action is paused on a market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | vToken address |
| action | enum ComptrollerV1Storage.Action | Action to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the action is paused |

### isDeprecated

```solidity
function isDeprecated(contract VToken vToken) public view returns (bool)
```

Returns true if the given vToken market has been deprecated

_All borrows in a deprecated vToken market can be immediately liquidated_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The market to check if deprecated |

### getBlockNumber

```solidity
function getBlockNumber() public view virtual returns (uint256)
```

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

## ComptrollerErrorReporter

### Error

```solidity
enum Error {
  NO_ERROR,
  UNAUTHORIZED,
  COMPTROLLER_MISMATCH,
  INSUFFICIENT_SHORTFALL,
  INSUFFICIENT_LIQUIDITY,
  INVALID_CLOSE_FACTOR,
  INVALID_COLLATERAL_FACTOR,
  INVALID_LIQUIDATION_INCENTIVE,
  MARKET_NOT_ENTERED,
  MARKET_NOT_LISTED,
  MARKET_ALREADY_LISTED,
  MATH_ERROR,
  NONZERO_BORROW_BALANCE,
  PRICE_ERROR,
  REJECTION,
  SNAPSHOT_ERROR,
  TOO_MANY_ASSETS,
  TOO_MUCH_REPAY,
  BELOW_MIN_LIQUIDATABLE_AMOUNT,
  MIN_LIQUIDATABLE_AMOUNT_NOT_SET
}
```

### FailureInfo

```solidity
enum FailureInfo {
  ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
  ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK,
  EXIT_MARKET_BALANCE_OWED,
  EXIT_MARKET_REJECTION,
  SET_CLOSE_FACTOR_OWNER_CHECK,
  SET_CLOSE_FACTOR_VALIDATION,
  SET_COLLATERAL_FACTOR_OWNER_CHECK,
  SET_COLLATERAL_FACTOR_NO_EXISTS,
  SET_COLLATERAL_FACTOR_VALIDATION,
  SET_COLLATERAL_FACTOR_WITHOUT_PRICE,
  SET_IMPLEMENTATION_OWNER_CHECK,
  SET_LIQUIDATION_INCENTIVE_OWNER_CHECK,
  SET_LIQUIDATION_INCENTIVE_VALIDATION,
  SET_MAX_ASSETS_OWNER_CHECK,
  SET_PENDING_ADMIN_OWNER_CHECK,
  SET_PENDING_IMPLEMENTATION_OWNER_CHECK,
  SET_PRICE_ORACLE_OWNER_CHECK,
  SUPPORT_MARKET_EXISTS,
  SUPPORT_MARKET_OWNER_CHECK,
  SET_PAUSE_GUARDIAN_OWNER_CHECK,
  ADD_REWARDS_DISTRIBUTOR_OWNER_CHECK
}
```

### Failure

```solidity
event Failure(uint256 error, uint256 info, uint256 detail)
```

_`error` corresponds to enum Error; `info` corresponds to enum FailureInfo, and `detail` is an arbitrary
contract-specific code that enables us to report opaque error codes from upgradeable contracts._

### fail

```solidity
function fail(enum ComptrollerErrorReporter.Error err, enum ComptrollerErrorReporter.FailureInfo info) internal returns (uint256)
```

_use this when reporting a known error from the money market or a non-upgradeable collaborator_

### failOpaque

```solidity
function failOpaque(enum ComptrollerErrorReporter.Error err, enum ComptrollerErrorReporter.FailureInfo info, uint256 opaqueError) internal returns (uint256)
```

_use this when reporting an opaque error from an upgradeable collaborator contract_

### InvalidCollateralFactor

```solidity
error InvalidCollateralFactor()
```

### InvalidLiquidationThreshold

```solidity
error InvalidLiquidationThreshold()
```

### LiquidityComputationFailure

```solidity
error LiquidityComputationFailure(enum ComptrollerErrorReporter.Error err)
```

### Unauthorized

```solidity
error Unauthorized()
```

### PriceError

```solidity
error PriceError()
```

### SnapshotError

```solidity
error SnapshotError()
```

### MarketNotListed

```solidity
error MarketNotListed(address market)
```

### MinimalCollateralViolated

```solidity
error MinimalCollateralViolated(uint256 expectedGreaterThan, uint256 actual)
```

Throwed during the liquidation if user's total collateral amount is lower than
  a predefined threshold. In this case only batch liquidations (either liquidateAccount
  or healAccount) are available.

### CollateralExceedsThreshold

```solidity
error CollateralExceedsThreshold(uint256 expectedLessThanOrEqualTo, uint256 actual)
```

### InsufficientCollateral

```solidity
error InsufficientCollateral(uint256 collateralToSeize, uint256 availableCollateral)
```

## TokenErrorReporter

### NO_ERROR

```solidity
uint256 NO_ERROR
```

### TransferComptrollerRejection

```solidity
error TransferComptrollerRejection(uint256 errorCode)
```

### TransferNotAllowed

```solidity
error TransferNotAllowed()
```

### TransferNotEnough

```solidity
error TransferNotEnough()
```

### TransferTooMuch

```solidity
error TransferTooMuch()
```

### MintComptrollerRejection

```solidity
error MintComptrollerRejection(uint256 errorCode)
```

### MintFreshnessCheck

```solidity
error MintFreshnessCheck()
```

### RedeemComptrollerRejection

```solidity
error RedeemComptrollerRejection(uint256 errorCode)
```

### RedeemFreshnessCheck

```solidity
error RedeemFreshnessCheck()
```

### RedeemTransferOutNotPossible

```solidity
error RedeemTransferOutNotPossible()
```

### BorrowComptrollerRejection

```solidity
error BorrowComptrollerRejection(uint256 errorCode)
```

### BorrowFreshnessCheck

```solidity
error BorrowFreshnessCheck()
```

### BorrowCashNotAvailable

```solidity
error BorrowCashNotAvailable()
```

### RepayBorrowComptrollerRejection

```solidity
error RepayBorrowComptrollerRejection(uint256 errorCode)
```

### RepayBorrowFreshnessCheck

```solidity
error RepayBorrowFreshnessCheck()
```

### HealBorrowUnauthorized

```solidity
error HealBorrowUnauthorized()
```

### ForceLiquidateBorrowUnauthorized

```solidity
error ForceLiquidateBorrowUnauthorized()
```

### LiquidateComptrollerRejection

```solidity
error LiquidateComptrollerRejection(uint256 errorCode)
```

### LiquidateFreshnessCheck

```solidity
error LiquidateFreshnessCheck()
```

### LiquidateCollateralFreshnessCheck

```solidity
error LiquidateCollateralFreshnessCheck()
```

### LiquidateAccrueBorrowInterestFailed

```solidity
error LiquidateAccrueBorrowInterestFailed(uint256 errorCode)
```

### LiquidateAccrueCollateralInterestFailed

```solidity
error LiquidateAccrueCollateralInterestFailed(uint256 errorCode)
```

### LiquidateLiquidatorIsBorrower

```solidity
error LiquidateLiquidatorIsBorrower()
```

### LiquidateCloseAmountIsZero

```solidity
error LiquidateCloseAmountIsZero()
```

### LiquidateCloseAmountIsUintMax

```solidity
error LiquidateCloseAmountIsUintMax()
```

### LiquidateRepayBorrowFreshFailed

```solidity
error LiquidateRepayBorrowFreshFailed(uint256 errorCode)
```

### LiquidateSeizeComptrollerRejection

```solidity
error LiquidateSeizeComptrollerRejection(uint256 errorCode)
```

### LiquidateSeizeLiquidatorIsBorrower

```solidity
error LiquidateSeizeLiquidatorIsBorrower()
```

### AcceptAdminPendingAdminCheck

```solidity
error AcceptAdminPendingAdminCheck()
```

### SetComptrollerOwnerCheck

```solidity
error SetComptrollerOwnerCheck()
```

### SetPendingAdminOwnerCheck

```solidity
error SetPendingAdminOwnerCheck()
```

### SetReserveFactorAdminCheck

```solidity
error SetReserveFactorAdminCheck()
```

### SetReserveFactorFreshCheck

```solidity
error SetReserveFactorFreshCheck()
```

### SetReserveFactorBoundsCheck

```solidity
error SetReserveFactorBoundsCheck()
```

### AddReservesFactorFreshCheck

```solidity
error AddReservesFactorFreshCheck(uint256 actualAddAmount)
```

### ReduceReservesAdminCheck

```solidity
error ReduceReservesAdminCheck()
```

### ReduceReservesFreshCheck

```solidity
error ReduceReservesFreshCheck()
```

### ReduceReservesCashNotAvailable

```solidity
error ReduceReservesCashNotAvailable()
```

### ReduceReservesCashValidation

```solidity
error ReduceReservesCashValidation()
```

### SetInterestRateModelOwnerCheck

```solidity
error SetInterestRateModelOwnerCheck()
```

### SetInterestRateModelFreshCheck

```solidity
error SetInterestRateModelFreshCheck()
```

## ExponentialNoError

Exp is a struct which stores decimals with a fixed precision of 18 decimal places.
        Thus, if we wanted to store the 5.1, mantissa would store 5.1e18. That is:
        `Exp({mantissa: 5100000000000000000})`.

### expScale

```solidity
uint256 expScale
```

### doubleScale

```solidity
uint256 doubleScale
```

### halfExpScale

```solidity
uint256 halfExpScale
```

### mantissaOne

```solidity
uint256 mantissaOne
```

### Exp

```solidity
struct Exp {
  uint256 mantissa;
}
```

### Double

```solidity
struct Double {
  uint256 mantissa;
}
```

### truncate

```solidity
function truncate(struct ExponentialNoError.Exp exp) internal pure returns (uint256)
```

_Truncates the given exp to a whole number value.
     For example, truncate(Exp{mantissa: 15 * expScale}) = 15_

### mul_ScalarTruncate

```solidity
function mul_ScalarTruncate(struct ExponentialNoError.Exp a, uint256 scalar) internal pure returns (uint256)
```

_Multiply an Exp by a scalar, then truncate to return an unsigned integer._

### mul_ScalarTruncateAddUInt

```solidity
function mul_ScalarTruncateAddUInt(struct ExponentialNoError.Exp a, uint256 scalar, uint256 addend) internal pure returns (uint256)
```

_Multiply an Exp by a scalar, truncate, then add an to an unsigned integer, returning an unsigned integer._

### lessThanExp

```solidity
function lessThanExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if first Exp is less than second Exp._

### lessThanOrEqualExp

```solidity
function lessThanOrEqualExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if left Exp <= right Exp._

### greaterThanExp

```solidity
function greaterThanExp(struct ExponentialNoError.Exp left, struct ExponentialNoError.Exp right) internal pure returns (bool)
```

_Checks if left Exp > right Exp._

### isZeroExp

```solidity
function isZeroExp(struct ExponentialNoError.Exp value) internal pure returns (bool)
```

_returns true if Exp is exactly zero_

### safe224

```solidity
function safe224(uint256 n, string errorMessage) internal pure returns (uint224)
```

### safe32

```solidity
function safe32(uint256 n, string errorMessage) internal pure returns (uint32)
```

### add_

```solidity
function add_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### add_

```solidity
function add_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### add_

```solidity
function add_(uint256 a, uint256 b) internal pure returns (uint256)
```

### sub_

```solidity
function sub_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### sub_

```solidity
function sub_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### sub_

```solidity
function sub_(uint256 a, uint256 b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Exp a, uint256 b) internal pure returns (struct ExponentialNoError.Exp)
```

### mul_

```solidity
function mul_(uint256 a, struct ExponentialNoError.Exp b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### mul_

```solidity
function mul_(struct ExponentialNoError.Double a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```

### mul_

```solidity
function mul_(uint256 a, struct ExponentialNoError.Double b) internal pure returns (uint256)
```

### mul_

```solidity
function mul_(uint256 a, uint256 b) internal pure returns (uint256)
```

### div_

```solidity
function div_(struct ExponentialNoError.Exp a, struct ExponentialNoError.Exp b) internal pure returns (struct ExponentialNoError.Exp)
```

### div_

```solidity
function div_(struct ExponentialNoError.Exp a, uint256 b) internal pure returns (struct ExponentialNoError.Exp)
```

### div_

```solidity
function div_(uint256 a, struct ExponentialNoError.Exp b) internal pure returns (uint256)
```

### div_

```solidity
function div_(struct ExponentialNoError.Double a, struct ExponentialNoError.Double b) internal pure returns (struct ExponentialNoError.Double)
```

### div_

```solidity
function div_(struct ExponentialNoError.Double a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```

### div_

```solidity
function div_(uint256 a, struct ExponentialNoError.Double b) internal pure returns (uint256)
```

### div_

```solidity
function div_(uint256 a, uint256 b) internal pure returns (uint256)
```

### fraction

```solidity
function fraction(uint256 a, uint256 b) internal pure returns (struct ExponentialNoError.Double)
```

## JumpRateModelFactory

### deploy

```solidity
function deploy(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_, address owner_) external returns (contract JumpRateModelV2)
```

## VBep20ImmutableProxyFactory

### VBep20Args

```solidity
struct VBep20Args {
  address underlying_;
  contract ComptrollerInterface comptroller_;
  contract InterestRateModel interestRateModel_;
  uint256 initialExchangeRateMantissa_;
  string name_;
  string symbol_;
  uint8 decimals_;
  address payable admin_;
  contract AccessControlManager accessControlManager_;
  struct VBep20Interface.RiskManagementInit riskManagement;
  address vTokenProxyAdmin_;
  contract VBep20Immutable tokenImplementation_;
}
```

### deployVBep20Proxy

```solidity
function deployVBep20Proxy(struct VBep20ImmutableProxyFactory.VBep20Args input) external returns (contract VBep20Immutable)
```

## WhitePaperInterestRateModelFactory

### deploy

```solidity
function deploy(uint256 baseRatePerYear, uint256 multiplierPerYear) external returns (contract WhitePaperInterestRateModel)
```

## AccessControlManager

_This contract is a wrapper of OpenZeppelin AccessControl
	extending it in a way to standartize access control
	within Venus Smart Contract Ecosystem_

### constructor

```solidity
constructor() public
```

### isAllowedToCall

```solidity
function isAllowedToCall(address caller, string functionSig) public view returns (bool)
```

Verifies if the given account can call a praticular contract's function

_Since the contract is calling itself this function, we can get contracts address with msg.sender_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller | address | contract for which call permissions will be checked |
| functionSig | string | signature e.g. "functionName(uint,bool)" |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | false if the user account cannot call the particular contract function |

### giveCallPermission

```solidity
function giveCallPermission(address contractAddress, string functionSig, address accountToPermit) public
```

Gives a function call permission to one single account

_this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
		May emit a {RoleGranted} event._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contractAddress | address | address of contract for which call permissions will be granted NOTE: if contractAddress is zero address, we give the account DEFAULT_ADMIN_ROLE,      meaning that this account can access the certain function on ANY contract managed by this ACL |
| functionSig | string | signature e.g. "functionName(uint,bool)" |
| accountToPermit | address | account that will be given access to the contract function |

### revokeCallPermission

```solidity
function revokeCallPermission(address contractAddress, string functionSig, address accountToRevoke) public
```

Revokes an account's permission to a particular function call

_this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
		May emit a {RoleRevoked} event._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contractAddress | address | address of contract for which call permissions will be revoked |
| functionSig | string | signature e.g. "functionName(uint,bool)" |
| accountToRevoke | address |  |

## IPancakeswapV2Router

### swapExactTokensForTokens

```solidity
function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)
```

## InterestRateModel

### isInterestRateModel

```solidity
bool isInterestRateModel
```

Indicator that this is an InterestRateModel contract (for inspection)

### getBorrowRate

```solidity
function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) external view virtual returns (uint256)
```

Calculates the current borrow interest rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The total amount of cash the market has |
| borrows | uint256 | The total amount of borrows the market has outstanding |
| reserves | uint256 | The total amount of reserves the market has |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate per block (as a percentage, and scaled by 1e18) |

### getSupplyRate

```solidity
function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) external view virtual returns (uint256)
```

Calculates the current supply interest rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The total amount of cash the market has |
| borrows | uint256 | The total amount of borrows the market has outstanding |
| reserves | uint256 | The total amount of reserves the market has |
| reserveFactorMantissa | uint256 | The current reserve factor the market has |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The supply rate per block (as a percentage, and scaled by 1e18) |

## JumpRateModelV2

Supports only for V2 vTokens

### getBorrowRate

```solidity
function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) external view returns (uint256)
```

Calculates the current borrow rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate percentage per block as a mantissa (scaled by 1e18) |

### constructor

```solidity
constructor(uint256 baseRatePerYear, uint256 multiplierPerYear, uint256 jumpMultiplierPerYear, uint256 kink_, address owner_) public
```

## PoolLens

### PoolData

```solidity
struct PoolData {
  string name;
  address creator;
  address comptroller;
  uint256 blockPosted;
  uint256 timestampPosted;
  enum PoolRegistry.RiskRating riskRating;
  string category;
  string logoURL;
  string description;
  address priceOracle;
  uint256 closeFactor;
  uint256 liquidationIncentive;
  uint256 maxAssets;
  struct PoolLens.VTokenMetadata[] vTokens;
}
```

### getAllPools

```solidity
function getAllPools(address poolRegistryAddress) external view returns (struct PoolLens.PoolData[])
```

Returns arrays of all Venus pools' data.

_This function is not designed to be called in a transaction: it is too gas-intensive._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |

### getPoolDataFromVenusPool

```solidity
function getPoolDataFromVenusPool(address poolRegistryAddress, struct PoolRegistry.VenusPool venusPool) public view returns (struct PoolLens.PoolData)
```

Returns enriched PoolData.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address |  |
| venusPool | struct PoolRegistry.VenusPool | The VenusPool Object from PoolRegistry. |

### getPoolByComptroller

```solidity
function getPoolByComptroller(address poolRegistryAddress, address comptroller) external view returns (struct PoolLens.PoolData)
```

Returns Venus pool Unitroller (Comptroller proxy) contract addresses.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| comptroller | address | The Comptroller implementation address. |

### getVTokenForAsset

```solidity
function getVTokenForAsset(address poolRegistryAddress, address comptroller, address asset) external view returns (address)
```

Returns VToken in a Pool for an Asset.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| comptroller | address | The pool comptroller. |
| asset | address | The underlyingAsset of VToken. |

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address poolRegistryAddress, address asset) external view returns (uint256[])
```

Returns all Pools supported by an Asset.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolRegistryAddress | address | The address of Pool. |
| asset | address | The underlyingAsset of VToken. |

### VTokenMetadata

```solidity
struct VTokenMetadata {
  address vToken;
  uint256 exchangeRateCurrent;
  uint256 supplyRatePerBlock;
  uint256 borrowRatePerBlock;
  uint256 reserveFactorMantissa;
  uint256 totalBorrows;
  uint256 totalReserves;
  uint256 totalSupply;
  uint256 totalCash;
  bool isListed;
  uint256 collateralFactorMantissa;
  address underlyingAssetAddress;
  uint256 vTokenDecimals;
  uint256 underlyingDecimals;
}
```

### vTokenMetadata

```solidity
function vTokenMetadata(contract VToken vToken) public view returns (struct PoolLens.VTokenMetadata)
```

Returns the metadata of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The address of vToken. |

### vTokenMetadataAll

```solidity
function vTokenMetadataAll(contract VToken[] vTokens) public view returns (struct PoolLens.VTokenMetadata[])
```

Returns the metadata of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |

### VTokenBalances

```solidity
struct VTokenBalances {
  address vToken;
  uint256 balanceOf;
  uint256 borrowBalanceCurrent;
  uint256 balanceOfUnderlying;
  uint256 tokenBalance;
  uint256 tokenAllowance;
}
```

### vTokenBalances

```solidity
function vTokenBalances(contract VToken vToken, address payable account) public returns (struct PoolLens.VTokenBalances)
```

Returns the BalanceInfo of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vTokenAddress. |
| account | address payable | The user Account. |

### vTokenBalancesAll

```solidity
function vTokenBalancesAll(contract VToken[] vTokens, address payable account) external returns (struct PoolLens.VTokenBalances[])
```

Returns the BalanceInfo of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |
| account | address payable | The user Account. |

### VTokenUnderlyingPrice

```solidity
struct VTokenUnderlyingPrice {
  address vToken;
  uint256 underlyingPrice;
}
```

### vTokenUnderlyingPrice

```solidity
function vTokenUnderlyingPrice(contract VToken vToken) public view returns (struct PoolLens.VTokenUnderlyingPrice)
```

Returns the underlyingPrice of VToken.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken Addresses. |

### vTokenUnderlyingPriceAll

```solidity
function vTokenUnderlyingPriceAll(contract VToken[] vTokens) external view returns (struct PoolLens.VTokenUnderlyingPrice[])
```

Returns the underlyingPrice Info of all VTokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The list of vToken Addresses. |

## PoolRegistry

PoolRegistry is a registry for Venus interest rate pools.

### vTokenFactory

```solidity
contract VBep20ImmutableProxyFactory vTokenFactory
```

### jumpRateFactory

```solidity
contract JumpRateModelFactory jumpRateFactory
```

### whitePaperFactory

```solidity
contract WhitePaperInterestRateModelFactory whitePaperFactory
```

### shortfall

```solidity
contract Shortfall shortfall
```

### riskFund

```solidity
address payable riskFund
```

### protocolShareReserve

```solidity
address payable protocolShareReserve
```

### initialize

```solidity
function initialize(contract VBep20ImmutableProxyFactory _vTokenFactory, contract JumpRateModelFactory _jumpRateFactory, contract WhitePaperInterestRateModelFactory _whitePaperFactory, contract Shortfall _shortfall, address payable riskFund_, address payable protocolShareReserve_) public
```

_Initializes the deployer to owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _vTokenFactory | contract VBep20ImmutableProxyFactory | vToken factory address. |
| _jumpRateFactory | contract JumpRateModelFactory | jump rate factory address. |
| _whitePaperFactory | contract WhitePaperInterestRateModelFactory | white paper factory address. |
| _shortfall | contract Shortfall |  |
| riskFund_ | address payable | risk fund address. |
| protocolShareReserve_ | address payable | protocol's shares reserve address. |

### VenusPool

```solidity
struct VenusPool {
  string name;
  address creator;
  address comptroller;
  uint256 blockPosted;
  uint256 timestampPosted;
}
```

### RiskRating

```solidity
enum RiskRating {
  VERY_HIGH_RISK,
  HIGH_RISK,
  MEDIUM_RISK,
  LOW_RISK,
  MINIMAL_RISK
}
```

### VenusPoolMetaData

```solidity
struct VenusPoolMetaData {
  enum PoolRegistry.RiskRating riskRating;
  string category;
  string logoURL;
  string description;
}
```

### metadata

```solidity
mapping(address => struct PoolRegistry.VenusPoolMetaData) metadata
```

_Maps venus pool id to metadata_

### _poolsByID

```solidity
mapping(uint256 => address) _poolsByID
```

_Array of Venus pool comptroller addresses.
Used for iterating over all pools_

### _numberOfPools

```solidity
uint256 _numberOfPools
```

_Total number of pools created._

### _poolByComptroller

```solidity
mapping(address => struct PoolRegistry.VenusPool) _poolByComptroller
```

_Maps comptroller address to Venus pool Index._

### _bookmarks

```solidity
mapping(address => address[]) _bookmarks
```

_Maps Ethereum accounts to arrays of Venus pool Comptroller proxy contract addresses._

### _vTokens

```solidity
mapping(address => mapping(address => address)) _vTokens
```

_Maps pool id to asset to vToken._

### _supportedPools

```solidity
mapping(address => address[]) _supportedPools
```

_Maps asset to list of supported pools._

### InterestRateModels

```solidity
enum InterestRateModels {
  WhitePaper,
  JumpRate
}
```

### AddMarketInput

```solidity
struct AddMarketInput {
  address comptroller;
  address asset;
  uint8 decimals;
  string name;
  string symbol;
  enum PoolRegistry.InterestRateModels rateModel;
  uint256 baseRatePerYear;
  uint256 multiplierPerYear;
  uint256 jumpMultiplierPerYear;
  uint256 kink_;
  uint256 collateralFactor;
  uint256 liquidationThreshold;
  contract AccessControlManager accessControlManager;
  address vTokenProxyAdmin;
  contract VBep20Immutable tokenImplementation_;
}
```

### PoolRegistered

```solidity
event PoolRegistered(address comptroller, struct PoolRegistry.VenusPool pool)
```

_Emitted when a new Venus pool is added to the directory._

### PoolNameSet

```solidity
event PoolNameSet(address comptroller, string name)
```

_Emitted when a pool name is set._

### PoolMetadataUpdated

```solidity
event PoolMetadataUpdated(address comptroller, struct PoolRegistry.VenusPoolMetaData oldMetadata, struct PoolRegistry.VenusPoolMetaData newMetadata)
```

_Emitted when a pool metadata is updated._

### MarketAdded

```solidity
event MarketAdded(address comptroller, address vTokenAddress)
```

_Emitted when a Market is added to the pool._

### _registerPool

```solidity
function _registerPool(string name, address comptroller) internal returns (uint256)
```

_Adds a new Venus pool to the directory (without checking msg.sender)._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | The name of the pool. |
| comptroller | address | The pool's Comptroller proxy contract address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The index of the registered Venus pool. |

### createRegistryPool

```solidity
function createRegistryPool(string name, address implementation, uint256 closeFactor, uint256 liquidationIncentive, address priceOracle) external virtual returns (uint256, address)
```

_Deploys a new Venus pool and adds to the directory._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | The name of the pool. |
| implementation | address | The Comptroller implementation address. |
| closeFactor | uint256 | The pool's close factor (scaled by 1e18). |
| liquidationIncentive | uint256 | The pool's liquidation incentive (scaled by 1e18). |
| priceOracle | address | The pool's PriceOracle address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The index of the registered Venus pool and the proxy(Unitroller ) address. |
| [1] | address |  |

### setPoolName

```solidity
function setPoolName(address comptroller, string name) external
```

Modify existing Venus pool name.

### bookmarkPool

```solidity
function bookmarkPool(address comptroller) external
```

Bookmarks a Venus pool Unitroller (Comptroller proxy) contract addresses.

### getAllPools

```solidity
function getAllPools() external view returns (struct PoolRegistry.VenusPool[])
```

Returns arrays of all Venus pools' data.

_This function is not designed to be called in a transaction: it is too gas-intensive._

### getPoolByComptroller

```solidity
function getPoolByComptroller(address comptroller) external view returns (struct PoolRegistry.VenusPool)
```

Returns Venus pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | The Comptroller implementation address. |

### getVenusPoolMetadata

```solidity
function getVenusPoolMetadata(address comptroller) external view returns (struct PoolRegistry.VenusPoolMetaData)
```

Returns Metadata of Venus pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of Venus pool. |

### getBookmarks

```solidity
function getBookmarks(address account) external view returns (address[])
```

Returns arrays of Venus pool Unitroller (Comptroller proxy) contract addresses bookmarked by `account`.

### addMarket

```solidity
function addMarket(struct PoolRegistry.AddMarketInput input) external
```

Add a market to an existing pool

### getVTokenForAsset

```solidity
function getVTokenForAsset(address comptroller, address asset) external view returns (address)
```

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address asset) external view returns (address[])
```

### updatePoolMetadata

```solidity
function updatePoolMetadata(address comptroller, struct PoolRegistry.VenusPoolMetaData _metadata) external
```

Update metadata of an existing pool

## PoolRegistryInterface

### getAllPools

```solidity
function getAllPools() external view virtual returns (struct PoolRegistry.VenusPool[])
```

### getPoolByComptroller

```solidity
function getPoolByComptroller(address comptroller) external view virtual returns (struct PoolRegistry.VenusPool)
```

### getBookmarks

```solidity
function getBookmarks(address account) external view virtual returns (address[])
```

### getVTokenForAsset

```solidity
function getVTokenForAsset(address comptroller, address asset) external view virtual returns (address)
```

### getPoolsSupportedByAsset

```solidity
function getPoolsSupportedByAsset(address asset) external view virtual returns (uint256[])
```

### getVenusPoolMetadata

```solidity
function getVenusPoolMetadata(address comptroller) external view virtual returns (struct PoolRegistry.VenusPoolMetaData)
```

## PriceOracle

### isPriceOracle

```solidity
bool isPriceOracle
```

Indicator that this is a PriceOracle contract (for inspection)

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) external view virtual returns (uint256)
```

Get the underlying price of a vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18).  Zero means the price is unavailable. |

### updatePrice

```solidity
function updatePrice(address vToken) external virtual
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |

## RewardsDistributor

### RewardToken

```solidity
struct RewardToken {
  uint224 index;
  uint32 block;
}
```

### rewardTokenSupplyState

```solidity
mapping(address => struct RewardsDistributor.RewardToken) rewardTokenSupplyState
```

The REWARD TOKEN market supply state for each market

### rewardTokenSupplierIndex

```solidity
mapping(address => mapping(address => uint256)) rewardTokenSupplierIndex
```

The REWARD TOKEN borrow index for each market for each supplier as of the last time they accrued REWARD TOKEN

### rewardTokenInitialIndex

```solidity
uint224 rewardTokenInitialIndex
```

The initial REWARD TOKEN index for a market

### rewardTokenAccured

```solidity
mapping(address => uint256) rewardTokenAccured
```

The REWARD TOKEN accrued but not yet transferred to each user

### rewardTokenBorrowSpeeds

```solidity
mapping(address => uint256) rewardTokenBorrowSpeeds
```

The rate at which rewardToken is distributed to the corresponding borrow market (per block)

### rewardTokenSupplySpeeds

```solidity
mapping(address => uint256) rewardTokenSupplySpeeds
```

The rate at which rewardToken is distributed to the corresponding supply market (per block)

### rewardTokenBorrowState

```solidity
mapping(address => struct RewardsDistributor.RewardToken) rewardTokenBorrowState
```

The REWARD TOKEN market borrow state for each market

### rewardTokenContributorSpeeds

```solidity
mapping(address => uint256) rewardTokenContributorSpeeds
```

The portion of REWARD TOKEN that each contributor receives per block

### lastContributorBlock

```solidity
mapping(address => uint256) lastContributorBlock
```

Last block at which a contributor's REWARD TOKEN rewards have been allocated

### DistributedSupplierRewardToken

```solidity
event DistributedSupplierRewardToken(contract VToken vToken, address supplier, uint256 rewardTokenDelta, uint256 rewardTokenSupplyIndex)
```

Emitted when REWARD TOKEN is distributed to a supplier

### DistributedBorrowerRewardToken

```solidity
event DistributedBorrowerRewardToken(contract VToken vToken, address borrower, uint256 rewardTokenDelta, uint256 rewardTokenBorrowIndex)
```

Emitted when REWARD TOKEN is distributed to a borrower

### RewardTokenSupplySpeedUpdated

```solidity
event RewardTokenSupplySpeedUpdated(contract VToken vToken, uint256 newSpeed)
```

Emitted when a new supply-side REWARD TOKEN speed is calculated for a market

### RewardTokenBorrowSpeedUpdated

```solidity
event RewardTokenBorrowSpeedUpdated(contract VToken vToken, uint256 newSpeed)
```

Emitted when a new borrow-side REWARD TOKEN speed is calculated for a market

### RewardTokenGranted

```solidity
event RewardTokenGranted(address recipient, uint256 amount)
```

Emitted when REWARD TOKEN is granted by admin

### ContributorRewardTokenSpeedUpdated

```solidity
event ContributorRewardTokenSpeedUpdated(address contributor, uint256 newSpeed)
```

Emitted when a new REWARD TOKEN speed is set for a contributor

### rewardTokenBorrowerIndex

```solidity
mapping(address => mapping(address => uint256)) rewardTokenBorrowerIndex
```

The REWARD TOKEN borrow index for each market for each borrower as of the last time they accrued REWARD TOKEN

### comptroller

```solidity
contract Comptroller comptroller
```

### rewardToken

```solidity
contract IERC20 rewardToken
```

### initialize

```solidity
function initialize(contract Comptroller _comptroller, contract IERC20 _rewardToken) public
```

_Initializes the deployer to owner._

### initializeMarket

```solidity
function initializeMarket(address vToken) external
```

### _setRewardTokenSpeeds

```solidity
function _setRewardTokenSpeeds(contract VToken[] vTokens, uint256[] supplySpeeds, uint256[] borrowSpeeds) public
```

Set REWARD TOKEN borrow and supply speeds for the specified markets.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The markets whose REWARD TOKEN speed to update. |
| supplySpeeds | uint256[] | New supply-side REWARD TOKEN speed for the corresponding market. |
| borrowSpeeds | uint256[] | New borrow-side REWARD TOKEN speed for the corresponding market. |

### _setContributorRewardTokenSpeed

```solidity
function _setContributorRewardTokenSpeed(address contributor, uint256 rewardTokenSpeed) public
```

Set REWARD TOKEN speed for a single contributor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contributor | address | The contributor whose REWARD TOKEN speed to update |
| rewardTokenSpeed | uint256 | New REWARD TOKEN speed for contributor |

### updateContributorRewards

```solidity
function updateContributorRewards(address contributor) public
```

Calculate additional accrued REWARD TOKEN for a contributor since last accrual

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contributor | address | The address to calculate contributor rewards for |

### setRewardTokenSpeedInternal

```solidity
function setRewardTokenSpeedInternal(contract VToken vToken, uint256 supplySpeed, uint256 borrowSpeed) internal
```

Set REWARD TOKEN speed for a single market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The market whose REWARD TOKEN speed to update |
| supplySpeed | uint256 | New supply-side REWARD TOKEN speed for market |
| borrowSpeed | uint256 | New borrow-side REWARD TOKEN speed for market |

### distributeSupplierRewardToken

```solidity
function distributeSupplierRewardToken(address vToken, address supplier) public
```

### _distributeSupplierRewardToken

```solidity
function _distributeSupplierRewardToken(address vToken, address supplier) internal
```

### distributeBorrowerRewardToken

```solidity
function distributeBorrowerRewardToken(address vToken, address borrower, struct ExponentialNoError.Exp marketBorrowIndex) external
```

### _distributeBorrowerRewardToken

```solidity
function _distributeBorrowerRewardToken(address vToken, address borrower, struct ExponentialNoError.Exp marketBorrowIndex) internal
```

Calculate REWARD TOKEN accrued by a borrower and possibly transfer it to them

_Borrowers will not begin to accrue until after the first interaction with the protocol._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market in which the borrower is interacting |
| borrower | address | The address of the borrower to distribute REWARD TOKEN to |
| marketBorrowIndex | struct ExponentialNoError.Exp |  |

### grantRewardTokenInternal

```solidity
function grantRewardTokenInternal(address user, uint256 amount) internal returns (uint256)
```

Transfer REWARD TOKEN to the user

_Note: If there is not enough REWARD TOKEN, we do not perform the transfer all._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address of the user to transfer REWARD TOKEN to |
| amount | uint256 | The amount of REWARD TOKEN to (possibly) transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of REWARD TOKEN which was NOT transferred to the user |

### updateRewardTokenSupplyIndex

```solidity
function updateRewardTokenSupplyIndex(address vToken) external
```

### _updateRewardTokenSupplyIndex

```solidity
function _updateRewardTokenSupplyIndex(address vToken) internal
```

Accrue REWARD TOKEN to the market by updating the supply index

_Index is a cumulative sum of the REWARD TOKEN per vToken accrued._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market whose supply index to update |

### updateRewardTokenBorrowIndex

```solidity
function updateRewardTokenBorrowIndex(address vToken, struct ExponentialNoError.Exp marketBorrowIndex) external
```

### _updateRewardTokenBorrowIndex

```solidity
function _updateRewardTokenBorrowIndex(address vToken, struct ExponentialNoError.Exp marketBorrowIndex) internal
```

Accrue REWARD TOKEN to the market by updating the borrow index

_Index is a cumulative sum of the REWARD TOKEN per vToken accrued._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market whose borrow index to update |
| marketBorrowIndex | struct ExponentialNoError.Exp |  |

### _grantRewardToken

```solidity
function _grantRewardToken(address recipient, uint256 amount) external
```

Transfer REWARD TOKEN to the recipient

_Note: If there is not enough REWARD TOKEN, we do not perform the transfer all._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address of the recipient to transfer REWARD TOKEN to |
| amount | uint256 | The amount of REWARD TOKEN to (possibly) transfer |

### claimRewardToken

```solidity
function claimRewardToken(address[] holders, contract VToken[] vTokens, bool borrowers, bool suppliers) internal
```

Claim all rewardToken accrued by the holders

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holders | address[] | The addresses to claim REWARD TOKEN for |
| vTokens | contract VToken[] | The list of markets to claim REWARD TOKEN in |
| borrowers | bool | Whether or not to claim REWARD TOKEN earned by borrowing |
| suppliers | bool | Whether or not to claim REWARD TOKEN earned by supplying |

### claimRewardToken

```solidity
function claimRewardToken(address holder) public
```

Claim all the rewardToken accrued by holder in all markets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holder | address | The address to claim REWARD TOKEN for |

### claimRewardToken

```solidity
function claimRewardToken(address holder, contract VToken[] vTokens) public
```

Claim all the rewardToken accrued by holder in the specified markets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holder | address | The address to claim REWARD TOKEN for |
| vTokens | contract VToken[] | The list of markets to claim REWARD TOKEN in |

### getBlockNumber

```solidity
function getBlockNumber() public view virtual returns (uint256)
```

### onlyComptroller

```solidity
modifier onlyComptroller()
```

## IRiskFund

### swapAllPoolsAssets

```solidity
function swapAllPoolsAssets() external returns (uint256)
```

### getPoolReserve

```solidity
function getPoolReserve(address comptroller) external view returns (uint256)
```

### transferReserveForAuction

```solidity
function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256)
```

## RiskFund

_This contract does not support BNB._

### poolRegistry

```solidity
address poolRegistry
```

### pancakeSwapRouter

```solidity
address pancakeSwapRouter
```

### minAmountToConvert

```solidity
uint256 minAmountToConvert
```

### amountOutMin

```solidity
uint256 amountOutMin
```

### convertableBUSDAddress

```solidity
address convertableBUSDAddress
```

### auctionContractAddress

```solidity
address auctionContractAddress
```

### accessControl

```solidity
address accessControl
```

### poolReserves

```solidity
mapping(address => uint256) poolReserves
```

### initialize

```solidity
function initialize(address _pancakeSwapRouter, uint256 _amountOutMin, uint256 _minAmountToConvert, address _convertableBUSDAddress, address _accessControl) public
```

_Initializes the deployer to owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pancakeSwapRouter | address | Address of the pancake swap router. |
| _amountOutMin | uint256 | Min amount out for the pancake swap. |
| _minAmountToConvert | uint256 | Asset should be worth of min amount to convert to BUSD |
| _convertableBUSDAddress | address | Address of the BUSD |
| _accessControl | address | Address of the access control contract. |

### setPoolRegistry

```solidity
function setPoolRegistry(address _poolRegistry) external
```

_Pool registry setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolRegistry | address | Address of the pool registry. |

### setAuctionContractAddress

```solidity
function setAuctionContractAddress(address _auctionContractAddress) external
```

_Auction contract address setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _auctionContractAddress | address | Address of the auction contract. |

### setPancakeSwapRouter

```solidity
function setPancakeSwapRouter(address _pancakeSwapRouter) external
```

_Pancake swap router address setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pancakeSwapRouter | address | Address of the pancake swap router. |

### setAmountOutMin

```solidity
function setAmountOutMin(uint256 _amountOutMin) external
```

_Min amount out setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountOutMin | uint256 | Min amount out for the pancake swap. |

### setMinAmountToConvert

```solidity
function setMinAmountToConvert(uint256 _minAmountToConvert) external
```

_Min amout to convert setter_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minAmountToConvert | uint256 | Min amout to convert. |

### swapAsset

```solidity
function swapAsset(contract VToken vToken, address comptroller) internal returns (uint256)
```

_Swap single asset to BUSD._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | VToken |
| comptroller | address | comptorller address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### swapPoolsAssets

```solidity
function swapPoolsAssets(struct PoolRegistry.VenusPool[] venusPools) public returns (uint256)
```

_Swap assets of selected pools into BUSD tokens._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| venusPools | struct PoolRegistry.VenusPool[] | Array of Pools to swap for BUSD |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### swapAllPoolsAssets

```solidity
function swapAllPoolsAssets() external returns (uint256)
```

_Swap assets of all pools into BUSD tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of BUSD tokens. |

### getPoolReserve

```solidity
function getPoolReserve(address comptroller) external view returns (uint256)
```

_Get pool reserve by pool id._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number reserved tokens. |

### transferReserveForAuction

```solidity
function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256)
```

_Transfer tokens for auction._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool. |
| amount | uint256 | Amount to be transferred to auction contract. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number reserved tokens. |

## Shortfall

### AuctionType

```solidity
enum AuctionType {
  LARGE_POOL_DEBT,
  LARGE_RISK_FUND
}
```

### AuctionStatus

```solidity
enum AuctionStatus {
  NOT_STARTED,
  STARTED,
  ENDED
}
```

### Auction

```solidity
struct Auction {
  uint256 startBlock;
  enum Shortfall.AuctionType auctionType;
  enum Shortfall.AuctionStatus status;
  contract VToken[] markets;
  uint256 seizedRiskFund;
  address highestBidder;
  uint256 highestBidBps;
  uint256 highestBidBlock;
  uint256 startBidBps;
  mapping(contract VToken => uint256) marketDebt;
}
```

### AuctionStarted

```solidity
event AuctionStarted(address comptroller, uint256 startBlock, enum Shortfall.AuctionType auctionType, contract VToken[] markets, uint256[] marketsDebt, uint256 seizedRiskFund, uint256 startBidBps)
```

Emitted when a auction starts

### BidPlaced

```solidity
event BidPlaced(address comptroller, uint256 bidBps, address bidder)
```

Emitted when a bid is placed

### AuctionClosed

```solidity
event AuctionClosed(address comptroller, address highestBidder, uint256 highestBidBps, uint256 seizedRiskFind, contract VToken[] markets, uint256[] marketDebt)
```

Emitted when a auction is completed

### AuctionRestarted

```solidity
event AuctionRestarted(address comptroller)
```

Emitted when a auction is restarted

### poolRegistry

```solidity
address poolRegistry
```

Pool registry address

### riskFund

```solidity
contract IRiskFund riskFund
```

Risk fund address

### minimumPoolBadDebt

```solidity
uint256 minimumPoolBadDebt
```

Minimum USD debt in pool for shortfall to trigger

### incentiveBps

```solidity
uint256 incentiveBps
```

Incentive to auction participants.

### MAX_BPS

```solidity
uint256 MAX_BPS
```

Max basis points i.e., 100%

### nextBidderBlockLimit

```solidity
uint256 nextBidderBlockLimit
```

Time to wait for next bidder. wait for 10 blocks

### waitForFirstBidder

```solidity
uint256 waitForFirstBidder
```

Time to wait for first bidder. wait for 100 blocks

### BUSD

```solidity
contract IERC20 BUSD
```

BUSD contract address

### auctions

```solidity
mapping(address => struct Shortfall.Auction) auctions
```

Auctions for each pool

### initialize

```solidity
function initialize(contract IERC20 _BUSD, contract IRiskFund _riskFund, uint256 _minimumPoolBadDebt) public
```

Initalize the shortfall contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _BUSD | contract IERC20 |  |
| _riskFund | contract IRiskFund |  |
| _minimumPoolBadDebt | uint256 | Minimum bad debt in BUSD for a pool to start auction |

### updateMinimumPoolBadDebt

```solidity
function updateMinimumPoolBadDebt(uint256 _minimumPoolBadDebt) public
```

Update minimum pool bad debt to start auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minimumPoolBadDebt | uint256 | Minimum bad debt in BUSD for a pool to start auction |

### setPoolRegistry

```solidity
function setPoolRegistry(address _poolRegistry) public
```

After Pool Registry is deployed we need to set the pool registry address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolRegistry | address | Address of pool registry contract |

### onlyPoolRegistry

```solidity
modifier onlyPoolRegistry()
```

Modifier to allow only pool registry to call functions

### startAuction

```solidity
function startAuction(address comptroller) public
```

Start a auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |

### placeBid

```solidity
function placeBid(address comptroller, uint256 bidBps) external
```

Place a bid in a auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |
| bidBps | uint256 | The bid m% or n% |

### closeAuction

```solidity
function closeAuction(address comptroller) external
```

Close an auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |

### restartAuction

```solidity
function restartAuction(address comptroller) external
```

Restart an auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | ID of the pool |

## Unitroller

_Storage for the comptroller is at this address, while execution is delegated to the `comptrollerImplementation`.
VTokens should reference this contract as their comptroller._

### NewPendingImplementation

```solidity
event NewPendingImplementation(address oldPendingImplementation, address newPendingImplementation)
```

Emitted when pendingComptrollerImplementation is changed

### NewImplementation

```solidity
event NewImplementation(address oldImplementation, address newImplementation)
```

Emitted when pendingComptrollerImplementation is accepted, which means comptroller implementation is updated

### NewPendingAdmin

```solidity
event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin)
```

Emitted when pendingAdmin is changed

### NewAdmin

```solidity
event NewAdmin(address oldAdmin, address newAdmin)
```

Emitted when pendingAdmin is accepted, which means admin is updated

### constructor

```solidity
constructor() public
```

### _setPendingImplementation

```solidity
function _setPendingImplementation(address newPendingImplementation) public returns (uint256)
```

### _acceptImplementation

```solidity
function _acceptImplementation() public returns (uint256)
```

Accepts new implementation of comptroller. msg.sender must be pendingImplementation

_Admin function for new implementation to accept it's role as implementation_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setPendingAdmin

```solidity
function _setPendingAdmin(address newPendingAdmin) public returns (uint256)
```

Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.

_Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newPendingAdmin | address | New pending admin. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _acceptAdmin

```solidity
function _acceptAdmin() public returns (uint256)
```

Accepts transfer of admin rights. msg.sender must be pendingAdmin

_Admin function for pending admin to accept role and update admin_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### fallback

```solidity
fallback() external payable
```

_Delegates execution to an implementation contract.
It returns to the external caller whatever the implementation returns
or forwards reverts._

## VBep20

VTokens which wrap an EIP-20 underlying

### initialize

```solidity
function initialize(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

Initialize the new money market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| underlying_ | address | The address of the underlying asset |
| comptroller_ | contract ComptrollerInterface | The address of the Comptroller |
| interestRateModel_ | contract InterestRateModel | The address of the interest rate model |
| initialExchangeRateMantissa_ | uint256 | The initial exchange rate, scaled by 1e18 |
| name_ | string | ERC-20 name of this token |
| symbol_ | string | ERC-20 symbol of this token |
| decimals_ | uint8 | ERC-20 decimal precision of this token |
| accessControlManager_ | contract AccessControlManager |  |
| riskManagement | struct VBep20Interface.RiskManagementInit |  |

### mint

```solidity
function mint(uint256 mintAmount) external returns (uint256)
```

Sender supplies assets into the market and receives vTokens in exchange

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| mintAmount | uint256 | The amount of the underlying asset to supply |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### redeem

```solidity
function redeem(uint256 redeemTokens) external returns (uint256)
```

Sender redeems vTokens in exchange for the underlying asset

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemTokens | uint256 | The number of vTokens to redeem into underlying |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### redeemUnderlying

```solidity
function redeemUnderlying(uint256 redeemAmount) external returns (uint256)
```

Sender redeems vTokens in exchange for a specified amount of underlying asset

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemAmount | uint256 | The amount of underlying to redeem |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### borrow

```solidity
function borrow(uint256 borrowAmount) external returns (uint256)
```

Sender borrows assets from the protocol to their own address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrowAmount | uint256 | The amount of the underlying asset to borrow |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### repayBorrow

```solidity
function repayBorrow(uint256 repayAmount) external returns (uint256)
```

Sender repays their own borrow

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| repayAmount | uint256 | The amount to repay, or -1 for the full outstanding amount |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### repayBorrowBehalf

```solidity
function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256)
```

Sender repays a borrow belonging to borrower

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | the account with the debt being payed off |
| repayAmount | uint256 | The amount to repay, or -1 for the full outstanding amount |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### liquidateBorrow

```solidity
function liquidateBorrow(address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral) external returns (uint256)
```

The sender liquidates the borrowers collateral.
 The collateral seized is transferred to the liquidator.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | The borrower of this vToken to be liquidated |
| repayAmount | uint256 | The amount of the underlying borrowed asset to repay |
| vTokenCollateral | contract VTokenInterface | The market in which to seize collateral from the borrower |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### sweepToken

```solidity
function sweepToken(contract IERC20 token) external
```

A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to admin (timelock)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | contract IERC20 | The address of the ERC-20 token to sweep |

### _addReserves

```solidity
function _addReserves(uint256 addAmount) external returns (uint256)
```

The sender adds to reserves.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addAmount | uint256 | The amount fo underlying token to add as reserves |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### getCashPrior

```solidity
function getCashPrior() internal view virtual returns (uint256)
```

Gets balance of this contract in terms of the underlying

_This excludes the value of the current message, if any_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The quantity of underlying tokens owned by this contract |

### doTransferIn

```solidity
function doTransferIn(address from, uint256 amount) internal virtual returns (uint256)
```

_Similar to ERC-20 transfer, but handles tokens that have transfer fees.
     This function returns the actual amount received,
     which may be less than `amount` if there is a fee attached to the transfer._

### doTransferOut

```solidity
function doTransferOut(address payable to, uint256 amount) internal virtual
```

_Just a regular ERC-20 transfer, reverts on failure_

## VBep20Immutable

VTokens which wrap an EIP-20 underlying and are immutable

### initializeVToken

```solidity
function initializeVToken(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, address payable admin_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

Construct a new money market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| underlying_ | address | The address of the underlying asset |
| comptroller_ | contract ComptrollerInterface | The address of the Comptroller |
| interestRateModel_ | contract InterestRateModel | The address of the interest rate model |
| initialExchangeRateMantissa_ | uint256 | The initial exchange rate, scaled by 1e18 |
| name_ | string | ERC-20 name of this token |
| symbol_ | string | ERC-20 symbol of this token |
| decimals_ | uint8 | ERC-20 decimal precision of this token |
| admin_ | address payable | Address of the administrator of this token |
| accessControlManager_ | contract AccessControlManager |  |
| riskManagement | struct VBep20Interface.RiskManagementInit | Addresses of risk fund contracts |

## VToken

Abstract base for VTokens

### initialize

```solidity
function initialize(contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

Initialize the money market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller_ | contract ComptrollerInterface | The address of the Comptroller |
| interestRateModel_ | contract InterestRateModel | The address of the interest rate model |
| initialExchangeRateMantissa_ | uint256 | The initial exchange rate, scaled by 1e18 |
| name_ | string | EIP-20 name of this token |
| symbol_ | string | EIP-20 symbol of this token |
| decimals_ | uint8 | EIP-20 decimal precision of this token |
| accessControlManager_ | contract AccessControlManager |  |
| riskManagement | struct VBep20Interface.RiskManagementInit |  |

### transferTokens

```solidity
function transferTokens(address spender, address src, address dst, uint256 tokens) internal returns (uint256)
```

Transfer `tokens` tokens from `src` to `dst` by `spender`

_Called by both `transfer` and `transferFrom` internally_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| spender | address | The address of the account performing the transfer |
| src | address | The address of the source account |
| dst | address | The address of the destination account |
| tokens | uint256 | The number of tokens to transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | 0 if the transfer succeeded, else revert |

### transfer

```solidity
function transfer(address dst, uint256 amount) external returns (bool)
```

Transfer `amount` tokens from `msg.sender` to `dst`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| dst | address | The address of the destination account |
| amount | uint256 | The number of tokens to transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | Whether or not the transfer succeeded |

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external returns (bool)
```

Transfer `amount` tokens from `src` to `dst`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| src | address | The address of the source account |
| dst | address | The address of the destination account |
| amount | uint256 | The number of tokens to transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | Whether or not the transfer succeeded |

### approve

```solidity
function approve(address spender, uint256 amount) external returns (bool)
```

Approve `spender` to transfer up to `amount` from `src`

_This will overwrite the approval amount for `spender`
 and is subject to issues noted [here](https://eips.ethereum.org/EIPS/eip-20#approve)_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| spender | address | The address of the account which may transfer tokens |
| amount | uint256 | The number of tokens that are approved (uint256.max means infinite) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | Whether or not the approval succeeded |

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

Get the current allowance from `owner` for `spender`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | The address of the account which owns the tokens to be spent |
| spender | address | The address of the account which may transfer tokens |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The number of tokens allowed to be spent (-1 means infinite) |

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256)
```

Get the token balance of the `owner`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | The address of the account to query |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The number of tokens owned by `owner` |

### balanceOfUnderlying

```solidity
function balanceOfUnderlying(address owner) external returns (uint256)
```

Get the underlying balance of the `owner`

_This also accrues interest in a transaction_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | The address of the account to query |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of underlying owned by `owner` |

### getAccountSnapshot

```solidity
function getAccountSnapshot(address account) external view returns (uint256, uint256, uint256, uint256)
```

Get a snapshot of the account's balances, and the cached exchange rate

_This is used by comptroller to more efficiently perform liquidity checks._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | Address of the account to snapshot |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (possible error, token balance, borrow balance, exchange rate mantissa) |
| [1] | uint256 |  |
| [2] | uint256 |  |
| [3] | uint256 |  |

### getBlockNumber

```solidity
function getBlockNumber() internal view virtual returns (uint256)
```

_Function to simply retrieve block number
 This exists mainly for inheriting test contracts to stub this result._

### borrowRatePerBlock

```solidity
function borrowRatePerBlock() external view returns (uint256)
```

Returns the current per-block borrow interest rate for this vToken

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow interest rate per block, scaled by 1e18 |

### supplyRatePerBlock

```solidity
function supplyRatePerBlock() external view returns (uint256)
```

Returns the current per-block supply interest rate for this v

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The supply interest rate per block, scaled by 1e18 |

### totalBorrowsCurrent

```solidity
function totalBorrowsCurrent() external returns (uint256)
```

Returns the current total borrows plus accrued interest

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total borrows with interest |

### borrowBalanceCurrent

```solidity
function borrowBalanceCurrent(address account) external returns (uint256)
```

Accrue interest to updated borrowIndex and then calculate account's borrow balance using the updated borrowIndex

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address whose balance should be calculated after updating borrowIndex |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The calculated balance |

### borrowBalanceStored

```solidity
function borrowBalanceStored(address account) public view returns (uint256)
```

Return the borrow balance of account based on stored data

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address whose balance should be calculated |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The calculated balance |

### borrowBalanceStoredInternal

```solidity
function borrowBalanceStoredInternal(address account) internal view returns (uint256)
```

Return the borrow balance of account based on stored data

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address whose balance should be calculated |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (error code, the calculated balance or 0 if error code is non-zero) |

### exchangeRateCurrent

```solidity
function exchangeRateCurrent() public returns (uint256)
```

Accrue interest then return the up-to-date exchange rate

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Calculated exchange rate scaled by 1e18 |

### exchangeRateStored

```solidity
function exchangeRateStored() public view returns (uint256)
```

Calculates the exchange rate from the underlying to the VToken

_This function does not accrue interest before calculating the exchange rate_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Calculated exchange rate scaled by 1e18 |

### exchangeRateStoredInternal

```solidity
function exchangeRateStoredInternal() internal view virtual returns (uint256)
```

Calculates the exchange rate from the underlying to the VToken

_This function does not accrue interest before calculating the exchange rate_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | calculated exchange rate scaled by 1e18 |

### getCash

```solidity
function getCash() external view returns (uint256)
```

Get cash balance of this vToken in the underlying asset

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The quantity of underlying asset owned by this contract |

### accrueInterest

```solidity
function accrueInterest() public virtual returns (uint256)
```

Applies accrued interest to total borrows and reserves

_This calculates interest accrued from the last checkpointed block
  up to the current block and writes new checkpoint to storage._

### mintInternal

```solidity
function mintInternal(uint256 mintAmount) internal
```

Sender supplies assets into the market and receives vTokens in exchange

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| mintAmount | uint256 | The amount of the underlying asset to supply |

### mintFresh

```solidity
function mintFresh(address minter, uint256 mintAmount) internal
```

User supplies assets into the market and receives vTokens in exchange

_Assumes interest has already been accrued up to the current block_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minter | address | The address of the account which is supplying the assets |
| mintAmount | uint256 | The amount of the underlying asset to supply |

### redeemInternal

```solidity
function redeemInternal(uint256 redeemTokens) internal
```

Sender redeems vTokens in exchange for the underlying asset

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemTokens | uint256 | The number of vTokens to redeem into underlying |

### redeemUnderlyingInternal

```solidity
function redeemUnderlyingInternal(uint256 redeemAmount) internal
```

Sender redeems vTokens in exchange for a specified amount of underlying asset

_Accrues interest whether or not the operation succeeds, unless reverted_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemAmount | uint256 | The amount of underlying to receive from redeeming vTokens |

### redeemFresh

```solidity
function redeemFresh(address payable redeemer, uint256 redeemTokensIn, uint256 redeemAmountIn) internal
```

User redeems vTokens in exchange for the underlying asset

_Assumes interest has already been accrued up to the current block_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| redeemer | address payable | The address of the account which is redeeming the tokens |
| redeemTokensIn | uint256 | The number of vTokens to redeem into underlying (only one of redeemTokensIn or redeemAmountIn may be non-zero) |
| redeemAmountIn | uint256 | The number of underlying tokens to receive from redeeming vTokens (only one of redeemTokensIn or redeemAmountIn may be non-zero) |

### borrowInternal

```solidity
function borrowInternal(uint256 borrowAmount) internal
```

Sender borrows assets from the protocol to their own address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrowAmount | uint256 | The amount of the underlying asset to borrow |

### borrowFresh

```solidity
function borrowFresh(address payable borrower, uint256 borrowAmount) internal
```

Users borrow assets from the protocol to their own address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address payable |  |
| borrowAmount | uint256 | The amount of the underlying asset to borrow |

### repayBorrowInternal

```solidity
function repayBorrowInternal(uint256 repayAmount) internal
```

Sender repays their own borrow

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| repayAmount | uint256 | The amount to repay, or -1 for the full outstanding amount |

### repayBorrowBehalfInternal

```solidity
function repayBorrowBehalfInternal(address borrower, uint256 repayAmount) internal
```

Sender repays a borrow belonging to borrower

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | the account with the debt being payed off |
| repayAmount | uint256 | The amount to repay, or -1 for the full outstanding amount |

### repayBorrowFresh

```solidity
function repayBorrowFresh(address payer, address borrower, uint256 repayAmount) internal returns (uint256)
```

Borrows are repaid by another user (possibly the borrower).

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| payer | address | the account paying off the borrow |
| borrower | address | the account with the debt being payed off |
| repayAmount | uint256 | the amount of underlying tokens being returned, or -1 for the full outstanding amount |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (uint) the actual repayment amount. |

### liquidateBorrowInternal

```solidity
function liquidateBorrowInternal(address liquidator, address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral, bool skipLiquidityCheck) internal
```

The sender liquidates the borrowers collateral.
 The collateral seized is transferred to the liquidator.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidator | address | The address repaying the borrow and seizing collateral |
| borrower | address | The borrower of this vToken to be liquidated |
| repayAmount | uint256 | The amount of the underlying borrowed asset to repay |
| vTokenCollateral | contract VTokenInterface | The market in which to seize collateral from the borrower |
| skipLiquidityCheck | bool | If set to true, allows to liquidate up to 100% of the borrow   regardless of the account liquidity |

### liquidateBorrowFresh

```solidity
function liquidateBorrowFresh(address liquidator, address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral, bool skipLiquidityCheck) internal
```

The liquidator liquidates the borrowers collateral.
 The collateral seized is transferred to the liquidator.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidator | address | The address repaying the borrow and seizing collateral |
| borrower | address | The borrower of this vToken to be liquidated |
| repayAmount | uint256 | The amount of the underlying borrowed asset to repay |
| vTokenCollateral | contract VTokenInterface | The market in which to seize collateral from the borrower |
| skipLiquidityCheck | bool | If set to true, allows to liquidate up to 100% of the borrow   regardless of the account liquidity |

### healBorrow

```solidity
function healBorrow(address payer, address borrower, uint256 repayAmount) external
```

Repays a certain amount of debt, treats the rest of the borrow as bad debt, essentially
  "forgiving" the borrower. Healing is a situation that should rarely happen. However, some pools
  may list risky assets or be configured improperly – we want to still handle such cases gracefully.
  We assume that Comptroller does the seizing, so this function is only available to Comptroller.

_This function does not call any Comptroller hooks (like "healAllowed"), because we assume
  the Comptroller does all the necessary checks before calling this function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| payer | address | account who repays the debt |
| borrower | address | account to heal |
| repayAmount | uint256 | amount to repay |

### forceLiquidateBorrow

```solidity
function forceLiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral, bool skipLiquidityCheck) external returns (uint256)
```

The extended version of liquidations, callable only by Comptroller. May skip
 the close factor check. The collateral seized is transferred to the liquidator.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidator | address | The address repaying the borrow and seizing collateral |
| borrower | address | The borrower of this vToken to be liquidated |
| repayAmount | uint256 | The amount of the underlying borrowed asset to repay |
| vTokenCollateral | contract VTokenInterface | The market in which to seize collateral from the borrower |
| skipLiquidityCheck | bool | If set to true, allows to liquidate up to 100% of the borrow   regardless of the account liquidity |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### seize

```solidity
function seize(address liquidator, address borrower, uint256 seizeTokens) external returns (uint256)
```

Transfers collateral tokens (this market) to the liquidator.

_Will fail unless called by another vToken during the process of liquidation.
 Its absolutely critical to use msg.sender as the borrowed vToken and not a parameter._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidator | address | The account receiving seized collateral |
| borrower | address | The account having collateral seized |
| seizeTokens | uint256 | The number of vTokens to seize |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### seizeInternal

```solidity
function seizeInternal(address seizerContract, address liquidator, address borrower, uint256 seizeTokens) internal
```

Transfers collateral tokens (this market) to the liquidator.

_Called only during an in-kind liquidation, or by liquidateBorrow during the liquidation of another VToken.
 Its absolutely critical to use msg.sender as the seizer vToken and not a parameter._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| seizerContract | address | The contract seizing the collateral (either borrowed vToken or Comptroller) |
| liquidator | address | The account receiving seized collateral |
| borrower | address | The account having collateral seized |
| seizeTokens | uint256 | The number of vTokens to seize |

### _setPendingAdmin

```solidity
function _setPendingAdmin(address payable newPendingAdmin) external returns (uint256)
```

Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.

_Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newPendingAdmin | address payable | New pending admin. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _acceptAdmin

```solidity
function _acceptAdmin() external returns (uint256)
```

Accepts transfer of admin rights. msg.sender must be pendingAdmin

_Admin function for pending admin to accept role and update admin_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setComptroller

```solidity
function _setComptroller(contract ComptrollerInterface newComptroller) public returns (uint256)
```

Sets a new comptroller for the market

_Admin function to set a new comptroller_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setReserveFactor

```solidity
function _setReserveFactor(uint256 newReserveFactorMantissa) external returns (uint256)
```

accrues interest and sets a new reserve factor for the protocol using _setReserveFactorFresh

_Admin function to accrue interest and set a new reserve factor_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setReserveFactorFresh

```solidity
function _setReserveFactorFresh(uint256 newReserveFactorMantissa) internal returns (uint256)
```

Sets a new reserve factor for the protocol (*requires fresh interest accrual)

_Admin function to set a new reserve factor_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _addReservesInternal

```solidity
function _addReservesInternal(uint256 addAmount) internal returns (uint256)
```

Accrues interest and reduces reserves by transferring from msg.sender

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addAmount | uint256 | Amount of addition to reserves |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _addReservesFresh

```solidity
function _addReservesFresh(uint256 addAmount) internal returns (uint256, uint256)
```

Add reserves by transferring from caller

_Requires fresh interest accrual_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addAmount | uint256 | Amount of addition to reserves |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | (uint, uint) An error code (0=success, otherwise a failure (see ErrorReporter.sol for details)) and the actual amount added, net token fees |
| [1] | uint256 |  |

### _reduceReserves

```solidity
function _reduceReserves(uint256 reduceAmount) external returns (uint256)
```

Accrues interest and reduces reserves by transferring to admin

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| reduceAmount | uint256 | Amount of reduction to reserves |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _reduceReservesFresh

```solidity
function _reduceReservesFresh(uint256 reduceAmount) internal returns (uint256)
```

Reduces reserves by transferring to admin

_Requires fresh interest accrual_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| reduceAmount | uint256 | Amount of reduction to reserves |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setInterestRateModel

```solidity
function _setInterestRateModel(contract InterestRateModel newInterestRateModel) public returns (uint256)
```

accrues interest and updates the interest rate model using _setInterestRateModelFresh

_Admin function to accrue interest and update the interest rate model_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newInterestRateModel | contract InterestRateModel | the new interest rate model to use |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setInterestRateModelFresh

```solidity
function _setInterestRateModelFresh(contract InterestRateModel newInterestRateModel) internal returns (uint256)
```

updates the interest rate model (*requires fresh interest accrual)

_Admin function to update the interest rate model_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newInterestRateModel | contract InterestRateModel | the new interest rate model to use |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure (see ErrorReporter.sol for details) |

### _setAccessControlAddress

```solidity
function _setAccessControlAddress(contract AccessControlManager newAccessControlManager) public returns (uint256)
```

Sets the address of AccessControlManager

_Admin function to set address of AccessControlManager_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newAccessControlManager | contract AccessControlManager | The new address of the AccessControlManager |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint 0=success, otherwise a failure |

### getCashPrior

```solidity
function getCashPrior() internal view virtual returns (uint256)
```

Gets balance of this contract in terms of the underlying

_This excludes the value of the current message, if any_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The quantity of underlying owned by this contract |

### doTransferIn

```solidity
function doTransferIn(address from, uint256 amount) internal virtual returns (uint256)
```

_Performs a transfer in, reverting upon failure. Returns the amount actually transferred to the protocol, in case of a fee.
 This may revert due to insufficient balance or insufficient allowance._

### doTransferOut

```solidity
function doTransferOut(address payable to, uint256 amount) internal virtual
```

_Performs a transfer out, ideally returning an explanatory error code upon failure rather than reverting.
 If caller has not called checked protocol's balance, may revert due to insufficient cash held in the contract.
 If caller has checked protocol's balance, and verified it is >= amount, this should not revert in normal conditions._

### nonReentrant

```solidity
modifier nonReentrant()
```

_Prevents a contract from calling itself, directly or indirectly._

### accountBadDebtDetected

```solidity
function accountBadDebtDetected(address borrower) internal
```

Tracks market bad debt.

_Called only when bad debt is detected during liquidation._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | The borrow account which is liquidated |

### badDebtRecovered

```solidity
function badDebtRecovered(uint256 _badDebt) external
```

Updates bad debt

_Called only when bad debt is recovered from action_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _badDebt | uint256 | The amount of bad debt recovered |

## VTokenStorage

### _notEntered

```solidity
bool _notEntered
```

_Guard variable for re-entrancy checks_

### name

```solidity
string name
```

EIP-20 token name for this token

### symbol

```solidity
string symbol
```

EIP-20 token symbol for this token

### decimals

```solidity
uint8 decimals
```

EIP-20 token decimals for this token

### riskFund

```solidity
address payable riskFund
```

Risk fund contract address

### protocolShareReserve

```solidity
address payable protocolShareReserve
```

Protocol share Reserve contract address

### borrowRateMaxMantissa

```solidity
uint256 borrowRateMaxMantissa
```

### reserveFactorMaxMantissa

```solidity
uint256 reserveFactorMaxMantissa
```

### admin

```solidity
address payable admin
```

Administrator for this contract

### pendingAdmin

```solidity
address payable pendingAdmin
```

Pending administrator for this contract

### comptroller

```solidity
contract ComptrollerInterface comptroller
```

Contract which oversees inter-vToken operations

### interestRateModel

```solidity
contract InterestRateModel interestRateModel
```

Model which tells what the current interest rate should be

### initialExchangeRateMantissa

```solidity
uint256 initialExchangeRateMantissa
```

### reserveFactorMantissa

```solidity
uint256 reserveFactorMantissa
```

Fraction of interest currently set aside for reserves

### accrualBlockNumber

```solidity
uint256 accrualBlockNumber
```

Block number that interest was last accrued at

### borrowIndex

```solidity
uint256 borrowIndex
```

Accumulator of the total earned interest rate since the opening of the market

### totalBorrows

```solidity
uint256 totalBorrows
```

Total amount of outstanding borrows of the underlying in this market

### totalReserves

```solidity
uint256 totalReserves
```

Total amount of reserves of the underlying held in this market

### totalSupply

```solidity
uint256 totalSupply
```

Total number of tokens in circulation

### badDebt

```solidity
uint256 badDebt
```

Total bad debt of the market

### accountTokens

```solidity
mapping(address => uint256) accountTokens
```

### transferAllowances

```solidity
mapping(address => mapping(address => uint256)) transferAllowances
```

### BorrowSnapshot

```solidity
struct BorrowSnapshot {
  uint256 principal;
  uint256 interestIndex;
}
```

### accountBorrows

```solidity
mapping(address => struct VTokenStorage.BorrowSnapshot) accountBorrows
```

### protocolSeizeShareMantissa

```solidity
uint256 protocolSeizeShareMantissa
```

Share of seized collateral that is added to reserves

### accessControlManager

```solidity
contract AccessControlManager accessControlManager
```

Storage of AccessControlManager

### shortfall

```solidity
address shortfall
```

Storage of Shortfall contract address

## VTokenInterface

### isVToken

```solidity
bool isVToken
```

Indicator that this is a VToken contract (for inspection)

### AccrueInterest

```solidity
event AccrueInterest(uint256 cashPrior, uint256 interestAccumulated, uint256 borrowIndex, uint256 totalBorrows)
```

Event emitted when interest is accrued

### Mint

```solidity
event Mint(address minter, uint256 mintAmount, uint256 mintTokens)
```

Event emitted when tokens are minted

### Redeem

```solidity
event Redeem(address redeemer, uint256 redeemAmount, uint256 redeemTokens)
```

Event emitted when tokens are redeemed

### Borrow

```solidity
event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)
```

Event emitted when underlying is borrowed

### RepayBorrow

```solidity
event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)
```

Event emitted when a borrow is repaid

### BadDebtIncreased

```solidity
event BadDebtIncreased(address borrower, uint256 badDebtDelta, uint256 badDebtOld, uint256 badDebtNew)
```

Event emitted when bad debt is accumulated on a market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| borrower | address | borrower to "forgive" |
| badDebtDelta | uint256 |  |
| badDebtOld | uint256 | previous bad debt value |
| badDebtNew | uint256 | new bad debt value |

### LiquidateBorrow

```solidity
event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address vTokenCollateral, uint256 seizeTokens)
```

Event emitted when a borrow is liquidated

### NewPendingAdmin

```solidity
event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin)
```

Event emitted when pendingAdmin is changed

### NewAdmin

```solidity
event NewAdmin(address oldAdmin, address newAdmin)
```

Event emitted when pendingAdmin is accepted, which means admin is updated

### NewComptroller

```solidity
event NewComptroller(contract ComptrollerInterface oldComptroller, contract ComptrollerInterface newComptroller)
```

Event emitted when comptroller is changed

### NewAccessControlManager

```solidity
event NewAccessControlManager(contract AccessControlManager oldAccessControlManager, contract AccessControlManager newAccessControlManager)
```

Event emitted when comptroller is changed

### NewMarketInterestRateModel

```solidity
event NewMarketInterestRateModel(contract InterestRateModel oldInterestRateModel, contract InterestRateModel newInterestRateModel)
```

Event emitted when interestRateModel is changed

### NewReserveFactor

```solidity
event NewReserveFactor(uint256 oldReserveFactorMantissa, uint256 newReserveFactorMantissa)
```

Event emitted when the reserve factor is changed

### ReservesAdded

```solidity
event ReservesAdded(address benefactor, uint256 addAmount, uint256 newTotalReserves)
```

Event emitted when the reserves are added

### ReservesReduced

```solidity
event ReservesReduced(address admin, uint256 reduceAmount, uint256 newTotalReserves)
```

Event emitted when the reserves are reduced

### Transfer

```solidity
event Transfer(address from, address to, uint256 amount)
```

EIP20 Transfer event

### Approval

```solidity
event Approval(address owner, address spender, uint256 amount)
```

EIP20 Approval event

### transfer

```solidity
function transfer(address dst, uint256 amount) external virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external virtual returns (bool)
```

### approve

```solidity
function approve(address spender, uint256 amount) external virtual returns (bool)
```

### allowance

```solidity
function allowance(address owner, address spender) external view virtual returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address owner) external view virtual returns (uint256)
```

### balanceOfUnderlying

```solidity
function balanceOfUnderlying(address owner) external virtual returns (uint256)
```

### getAccountSnapshot

```solidity
function getAccountSnapshot(address account) external view virtual returns (uint256, uint256, uint256, uint256)
```

### borrowRatePerBlock

```solidity
function borrowRatePerBlock() external view virtual returns (uint256)
```

### supplyRatePerBlock

```solidity
function supplyRatePerBlock() external view virtual returns (uint256)
```

### totalBorrowsCurrent

```solidity
function totalBorrowsCurrent() external virtual returns (uint256)
```

### borrowBalanceCurrent

```solidity
function borrowBalanceCurrent(address account) external virtual returns (uint256)
```

### borrowBalanceStored

```solidity
function borrowBalanceStored(address account) external view virtual returns (uint256)
```

### exchangeRateCurrent

```solidity
function exchangeRateCurrent() external virtual returns (uint256)
```

### exchangeRateStored

```solidity
function exchangeRateStored() external view virtual returns (uint256)
```

### getCash

```solidity
function getCash() external view virtual returns (uint256)
```

### accrueInterest

```solidity
function accrueInterest() external virtual returns (uint256)
```

### healBorrow

```solidity
function healBorrow(address payer, address borrower, uint256 repayAmount) external virtual
```

### forceLiquidateBorrow

```solidity
function forceLiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral, bool skipCloseFactorCheck) external virtual returns (uint256)
```

### seize

```solidity
function seize(address liquidator, address borrower, uint256 seizeTokens) external virtual returns (uint256)
```

### _setPendingAdmin

```solidity
function _setPendingAdmin(address payable newPendingAdmin) external virtual returns (uint256)
```

### _acceptAdmin

```solidity
function _acceptAdmin() external virtual returns (uint256)
```

### _setComptroller

```solidity
function _setComptroller(contract ComptrollerInterface newComptroller) external virtual returns (uint256)
```

### _setReserveFactor

```solidity
function _setReserveFactor(uint256 newReserveFactorMantissa) external virtual returns (uint256)
```

### _reduceReserves

```solidity
function _reduceReserves(uint256 reduceAmount) external virtual returns (uint256)
```

### _setInterestRateModel

```solidity
function _setInterestRateModel(contract InterestRateModel newInterestRateModel) external virtual returns (uint256)
```

## VBep20Storage

### underlying

```solidity
address underlying
```

Underlying asset for this VToken

## VBep20Interface

### RiskManagementInit

```solidity
struct RiskManagementInit {
  address shortfall;
  address payable riskFund;
  address payable protocolShareReserve;
}
```

### mint

```solidity
function mint(uint256 mintAmount) external virtual returns (uint256)
```

### redeem

```solidity
function redeem(uint256 redeemTokens) external virtual returns (uint256)
```

### redeemUnderlying

```solidity
function redeemUnderlying(uint256 redeemAmount) external virtual returns (uint256)
```

### borrow

```solidity
function borrow(uint256 borrowAmount) external virtual returns (uint256)
```

### repayBorrow

```solidity
function repayBorrow(uint256 repayAmount) external virtual returns (uint256)
```

### repayBorrowBehalf

```solidity
function repayBorrowBehalf(address borrower, uint256 repayAmount) external virtual returns (uint256)
```

### liquidateBorrow

```solidity
function liquidateBorrow(address borrower, uint256 repayAmount, contract VTokenInterface vTokenCollateral) external virtual returns (uint256)
```

### sweepToken

```solidity
function sweepToken(contract IERC20 token) external virtual
```

### _addReserves

```solidity
function _addReserves(uint256 addAmount) external virtual returns (uint256)
```

## CDelegationStorage

### implementation

```solidity
address implementation
```

Implementation address for this contract

## CDelegatorInterface

### NewImplementation

```solidity
event NewImplementation(address oldImplementation, address newImplementation)
```

Emitted when implementation is changed

### _setImplementation

```solidity
function _setImplementation(address implementation_, bool allowResign, bytes becomeImplementationData) external virtual
```

Called by the admin to update the implementation of the delegator

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| implementation_ | address | The address of the new implementation for delegation |
| allowResign | bool | Flag to indicate whether to call _resignImplementation on the old implementation |
| becomeImplementationData | bytes | The encoded bytes data to be passed to _becomeImplementation |

## CDelegateInterface

### _becomeImplementation

```solidity
function _becomeImplementation(bytes data) external virtual
```

Called by the delegator on a delegate to initialize it for duty

_Should revert if any issues arise which make it unfit for delegation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| data | bytes | The encoded bytes data for any initialization |

### _resignImplementation

```solidity
function _resignImplementation() external virtual
```

Called by the delegator on a delegate to forfeit its responsibility

## WhitePaperInterestRateModel

The parameterized model described in section 2.4 of the original Compound Protocol whitepaper

### NewInterestParams

```solidity
event NewInterestParams(uint256 baseRatePerBlock, uint256 multiplierPerBlock)
```

### BASE

```solidity
uint256 BASE
```

### blocksPerYear

```solidity
uint256 blocksPerYear
```

The approximate number of blocks per year that is assumed by the interest rate model

### multiplierPerBlock

```solidity
uint256 multiplierPerBlock
```

The multiplier of utilization rate that gives the slope of the interest rate

### baseRatePerBlock

```solidity
uint256 baseRatePerBlock
```

The base interest rate which is the y-intercept when utilization rate is 0

### constructor

```solidity
constructor(uint256 baseRatePerYear, uint256 multiplierPerYear) public
```

Construct an interest rate model

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseRatePerYear | uint256 | The approximate target base APR, as a mantissa (scaled by BASE) |
| multiplierPerYear | uint256 | The rate of increase in interest rate wrt utilization (scaled by BASE) |

### utilizationRate

```solidity
function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256)
```

Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market (currently unused) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The utilization rate as a mantissa between [0, BASE] |

### getBorrowRate

```solidity
function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) public view returns (uint256)
```

Calculates the current borrow rate per block, with the error code expected by the market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The borrow rate percentage per block as a mantissa (scaled by BASE) |

### getSupplyRate

```solidity
function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) public view returns (uint256)
```

Calculates the current supply rate per block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| cash | uint256 | The amount of cash in the market |
| borrows | uint256 | The amount of borrows in the market |
| reserves | uint256 | The amount of reserves in the market |
| reserveFactorMantissa | uint256 | The current reserve factor for the market |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The supply rate percentage per block as a mantissa (scaled by BASE) |

## ComptrollerHarness

### blockNumber

```solidity
uint256 blockNumber
```

### constructor

```solidity
constructor(address _poolRegistry, address _accessControl) public
```

### setPauseGuardian

```solidity
function setPauseGuardian(address harnessedPauseGuardian) public
```

### harnessFastForward

```solidity
function harnessFastForward(uint256 blocks) public returns (uint256)
```

### setBlockNumber

```solidity
function setBlockNumber(uint256 number) public
```

### getBlockNumber

```solidity
function getBlockNumber() public view returns (uint256)
```

## ComptrollerBorked

### _become

```solidity
function _become(contract Unitroller unitroller, contract PriceOracle _oracle, uint256 _closeFactorMantissa, uint256 _maxAssets, bool _reinitializing) public
```

## EchoTypesComptroller

### stringy

```solidity
function stringy(string s) public pure returns (string)
```

### addresses

```solidity
function addresses(address a) public pure returns (address)
```

### booly

```solidity
function booly(bool b) public pure returns (bool)
```

### listOInts

```solidity
function listOInts(uint256[] u) public pure returns (uint256[])
```

### reverty

```solidity
function reverty() public pure
```

### becomeBrains

```solidity
function becomeBrains(address payable unitroller) public
```

## ComptrollerScenario

### blockNumber

```solidity
uint256 blockNumber
```

### constructor

```solidity
constructor(address _poolRegistry, address _accessControl) public
```

### fastForward

```solidity
function fastForward(uint256 blocks) public returns (uint256)
```

### setBlockNumber

```solidity
function setBlockNumber(uint256 number) public
```

### getBlockNumber

```solidity
function getBlockNumber() public view returns (uint256)
```

### membershipLength

```solidity
function membershipLength(contract VToken vToken) public view returns (uint256)
```

### unlist

```solidity
function unlist(contract VToken vToken) public
```

## FixedPriceOracle

### price

```solidity
uint256 price
```

### constructor

```solidity
constructor(uint256 _price) public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) public view returns (uint256)
```

Get the underlying price of a vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18).  Zero means the price is unavailable. |

### assetPrices

```solidity
function assetPrices(address asset) public view returns (uint256)
```

### updatePrice

```solidity
function updatePrice(address vToken) external
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |

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

## V1PriceOracleInterface

### assetPrices

```solidity
function assetPrices(address asset) external view returns (uint256)
```

## PriceOracleProxy

### v1PriceOracle

```solidity
contract V1PriceOracleInterface v1PriceOracle
```

The v1 price oracle, which will continue to serve prices for v1 assets

### guardian

```solidity
address guardian
```

Address of the guardian, which may set the SAI price once

### cEthAddress

```solidity
address cEthAddress
```

Address of the cEther contract, which has a constant price

### cUsdcAddress

```solidity
address cUsdcAddress
```

Address of the cUSDC contract, which we hand pick a key for

### cUsdtAddress

```solidity
address cUsdtAddress
```

Address of the cUSDT contract, which uses the cUSDC price

### cSaiAddress

```solidity
address cSaiAddress
```

Address of the cSAI contract, which may have its price set

### cDaiAddress

```solidity
address cDaiAddress
```

Address of the cDAI contract, which we hand pick a key for

### usdcOracleKey

```solidity
address usdcOracleKey
```

Handpicked key for USDC

### daiOracleKey

```solidity
address daiOracleKey
```

Handpicked key for DAI

### saiPrice

```solidity
uint256 saiPrice
```

Frozen SAI price (or 0 if not set yet)

### constructor

```solidity
constructor(address guardian_, address v1PriceOracle_, address cEthAddress_, address cUsdcAddress_, address cSaiAddress_, address cDaiAddress_, address cUsdtAddress_) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| guardian_ | address | The address of the guardian, which may set the SAI price once |
| v1PriceOracle_ | address | The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets |
| cEthAddress_ | address | The address of cETH, which will return a constant 1e18, since all prices relative to ether |
| cUsdcAddress_ | address | The address of cUSDC, which will be read from a special oracle key |
| cSaiAddress_ | address | The address of cSAI, which may be read directly from storage |
| cDaiAddress_ | address | The address of cDAI, which will be read from a special oracle key |
| cUsdtAddress_ | address | The address of cUSDT, which uses the cUSDC price |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) public view returns (uint256)
```

Get the underlying price of a listed vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18) |

### setSaiPrice

```solidity
function setSaiPrice(uint256 price) public
```

Set the price of SAI, permanently

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | The price for SAI |

### updatePrice

```solidity
function updatePrice(address vToken) external
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |

## SimplePriceOracle

### prices

```solidity
mapping(address => uint256) prices
```

### PricePosted

```solidity
event PricePosted(address asset, uint256 previousPriceMantissa, uint256 requestedPriceMantissa, uint256 newPriceMantissa)
```

### _getUnderlyingAddress

```solidity
function _getUnderlyingAddress(contract VToken vToken) private view returns (address)
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(contract VToken vToken) public view returns (uint256)
```

Get the underlying price of a vToken asset

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The vToken to get the underlying price of |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The underlying asset price mantissa (scaled by 1e18).  Zero means the price is unavailable. |

### setUnderlyingPrice

```solidity
function setUnderlyingPrice(contract VToken vToken, uint256 underlyingPriceMantissa) public
```

### setDirectPrice

```solidity
function setDirectPrice(address asset, uint256 price) public
```

### assetPrices

```solidity
function assetPrices(address asset) external view returns (uint256)
```

### compareStrings

```solidity
function compareStrings(string a, string b) internal pure returns (bool)
```

### updatePrice

```solidity
function updatePrice(address vToken) external
```

This is called before state updates that depends on oracle price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The vToken to get the underlying price of |

## UpgradedVBEP20

VTokens which wrap an EIP-20 underlying and are immutable

### initializeVToken

```solidity
function initializeVToken(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, address payable admin_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

Construct a new money market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| underlying_ | address | The address of the underlying asset |
| comptroller_ | contract ComptrollerInterface | The address of the Comptroller |
| interestRateModel_ | contract InterestRateModel | The address of the interest rate model |
| initialExchangeRateMantissa_ | uint256 | The initial exchange rate, scaled by 1e18 |
| name_ | string | ERC-20 name of this token |
| symbol_ | string | ERC-20 symbol of this token |
| decimals_ | uint8 | ERC-20 decimal precision of this token |
| admin_ | address payable | Address of the administrator of this token |
| accessControlManager_ | contract AccessControlManager |  |
| riskManagement | struct VBep20Interface.RiskManagementInit | Addresses of risk fund contracts |

### getTokenUnderlying

```solidity
function getTokenUnderlying() public view returns (address)
```

## VBEP20Harness

### blockNumber

```solidity
uint256 blockNumber
```

### harnessExchangeRate

```solidity
uint256 harnessExchangeRate
```

### harnessExchangeRateStored

```solidity
bool harnessExchangeRateStored
```

### failTransferToAddresses

```solidity
mapping(address => bool) failTransferToAddresses
```

### constructor

```solidity
constructor(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, address payable admin_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

### doTransferOut

```solidity
function doTransferOut(address payable to, uint256 amount) internal
```

_Just a regular ERC-20 transfer, reverts on failure_

### exchangeRateStoredInternal

```solidity
function exchangeRateStoredInternal() internal view returns (uint256)
```

Calculates the exchange rate from the underlying to the VToken

_This function does not accrue interest before calculating the exchange rate_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | calculated exchange rate scaled by 1e18 |

### getBlockNumber

```solidity
function getBlockNumber() internal view returns (uint256)
```

_Function to simply retrieve block number
 This exists mainly for inheriting test contracts to stub this result._

### getBorrowRateMaxMantissa

```solidity
function getBorrowRateMaxMantissa() public pure returns (uint256)
```

### harnessSetAccrualBlockNumber

```solidity
function harnessSetAccrualBlockNumber(uint256 _accrualblockNumber) public
```

### harnessSetBlockNumber

```solidity
function harnessSetBlockNumber(uint256 newBlockNumber) public
```

### harnessFastForward

```solidity
function harnessFastForward(uint256 blocks) public
```

### harnessSetBalance

```solidity
function harnessSetBalance(address account, uint256 amount) external
```

### harnessSetTotalSupply

```solidity
function harnessSetTotalSupply(uint256 totalSupply_) public
```

### harnessSetTotalBorrows

```solidity
function harnessSetTotalBorrows(uint256 totalBorrows_) public
```

### harnessSetTotalReserves

```solidity
function harnessSetTotalReserves(uint256 totalReserves_) public
```

### harnessExchangeRateDetails

```solidity
function harnessExchangeRateDetails(uint256 totalSupply_, uint256 totalBorrows_, uint256 totalReserves_) public
```

### harnessSetExchangeRate

```solidity
function harnessSetExchangeRate(uint256 exchangeRate) public
```

### harnessSetFailTransferToAddress

```solidity
function harnessSetFailTransferToAddress(address _to, bool _fail) public
```

### harnessMintFresh

```solidity
function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256)
```

### harnessRedeemFresh

```solidity
function harnessRedeemFresh(address payable account, uint256 vTokenAmount, uint256 underlyingAmount) public returns (uint256)
```

### harnessAccountBorrows

```solidity
function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex)
```

### harnessSetAccountBorrows

```solidity
function harnessSetAccountBorrows(address account, uint256 principal, uint256 interestIndex) public
```

### harnessSetBorrowIndex

```solidity
function harnessSetBorrowIndex(uint256 borrowIndex_) public
```

### harnessBorrowFresh

```solidity
function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256)
```

### harnessRepayBorrowFresh

```solidity
function harnessRepayBorrowFresh(address payer, address account, uint256 repayAmount) public returns (uint256)
```

### harnessLiquidateBorrowFresh

```solidity
function harnessLiquidateBorrowFresh(address liquidator, address borrower, uint256 repayAmount, contract VToken vTokenCollateral, bool skipLiquidityCheck) public returns (uint256)
```

### harnessReduceReservesFresh

```solidity
function harnessReduceReservesFresh(uint256 amount) public returns (uint256)
```

### harnessSetReserveFactorFresh

```solidity
function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256)
```

### harnessSetInterestRateModelFresh

```solidity
function harnessSetInterestRateModelFresh(contract InterestRateModel newInterestRateModel) public returns (uint256)
```

### harnessSetInterestRateModel

```solidity
function harnessSetInterestRateModel(address newInterestRateModelAddress) public
```

### harnessCallBorrowAllowed

```solidity
function harnessCallBorrowAllowed(uint256 amount) public returns (uint256)
```

## VBep20Scenario

### constructor

```solidity
constructor(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, address payable admin_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

### setTotalBorrows

```solidity
function setTotalBorrows(uint256 totalBorrows_) public
```

### setTotalReserves

```solidity
function setTotalReserves(uint256 totalReserves_) public
```

### getBlockNumber

```solidity
function getBlockNumber() internal view returns (uint256)
```

_Function to simply retrieve block number
 This exists mainly for inheriting test contracts to stub this result._

## CEvil

### constructor

```solidity
constructor(address underlying_, contract ComptrollerInterface comptroller_, contract InterestRateModel interestRateModel_, uint256 initialExchangeRateMantissa_, string name_, string symbol_, uint8 decimals_, address payable admin_, contract AccessControlManager accessControlManager_, struct VBep20Interface.RiskManagementInit riskManagement) public
```

### evilSeize

```solidity
function evilSeize(contract VToken treasure, address liquidator, address borrower, uint256 seizeTokens) public returns (uint256)
```

## ProtocolShareReserve

### liquidatedShares

```solidity
address liquidatedShares
```

### riskFund

```solidity
address riskFund
```

### initialize

```solidity
function initialize(address _liquidatedShares, address _riskFund) public
```

_Initializes the deployer to owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidatedShares | address | Liquidated shares address. |
| _riskFund | address | Risk fund address. |

### releaseFunds

```solidity
function releaseFunds(address asset, uint256 amount) external returns (uint256)
```

_Release funds_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset | address | Asset to be released. |
| amount | uint256 | Amount to release. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of total released tokens. |

## ResilientOracle

### INVALID_PRICE

```solidity
uint256 INVALID_PRICE
```

### OracleRole

```solidity
enum OracleRole {
  MAIN,
  PIVOT,
  FALLBACK
}
```

### TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  address[3] oracles;
  bool[3] enableFlagsForOracles;
}
```

### tokenConfigs

```solidity
mapping(address => struct ResilientOracle.TokenConfig) tokenConfigs
```

### GlobalEnable

```solidity
event GlobalEnable(bool isEnable)
```

### TokenConfigAdded

```solidity
event TokenConfigAdded(address token, address mainOracle, address pivotOracle, address fallbackOracle)
```

### OracleSet

```solidity
event OracleSet(address vToken, address oracle, uint256 role)
```

### OracleEnabled

```solidity
event OracleEnabled(address vToken, uint256 role, bool enable)
```

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### checkTokenConfigExistance

```solidity
modifier checkTokenConfigExistance(address vToken)
```

Check whether token config exist by checking whether vToken is zero address

_vToken can't be set to zero, so it's suitable to be used to check_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |

### initialize

```solidity
function initialize() public
```

### pause

```solidity
function pause() external
```

Pause protocol

### unpause

```solidity
function unpause() external
```

Unpause protocol

### getTokenConfig

```solidity
function getTokenConfig(address vToken) external view returns (struct ResilientOracle.TokenConfig)
```

_Get token config by vToken address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |

### getOracle

```solidity
function getOracle(address vToken, enum ResilientOracle.OracleRole role) public view returns (address oracle, bool enabled)
```

Get oracle & enabling status by vToken address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vtoken address |
| role | enum ResilientOracle.OracleRole | oracle role |

### setTokenConfigs

```solidity
function setTokenConfigs(struct ResilientOracle.TokenConfig[] tokenConfigs_) external
```

Batch set token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct ResilientOracle.TokenConfig[] | token config array |

### setTokenConfig

```solidity
function setTokenConfig(struct ResilientOracle.TokenConfig tokenConfig) public
```

Set single token configs, vToken MUST HAVE NOT be added before, and main oracle MUST NOT be zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct ResilientOracle.TokenConfig | token config struct |

### setOracle

```solidity
function setOracle(address vToken, address oracle, enum ResilientOracle.OracleRole role) external
```

Set oracle of any type for the input vToken, input vToken MUST exist

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| oracle | address | oracle address |
| role | enum ResilientOracle.OracleRole | oracle role |

### enableOracle

```solidity
function enableOracle(address vToken, enum ResilientOracle.OracleRole role, bool enable) external
```

Enable/disable oracle for the input vToken, input vToken MUST exist

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| role | enum ResilientOracle.OracleRole | oracle role |
| enable | bool | expected status |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

Get price of underlying asset of the input vToken, check flow:
- check the global pausing status
- check price from main oracle
- check price against pivot oracle, if any
- if fallback flag is enabled and price is invalidated, fallback

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price USD price in 18 decimals |

### _getUnderlyingPriceInternal

```solidity
function _getUnderlyingPriceInternal(address vToken) internal view returns (uint256)
```

This function won't revert when price is 0, because the fallback oracle may come to play later

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price USD price in 18 decimals |

## AggregatorV2V3Interface

Solidity V0.5 does not allow interfaces to inherit from other
interfaces so this contract is a combination of v0.5 AggregatorInterface.sol
and v0.5 AggregatorV3Interface.sol.

### latestAnswer

```solidity
function latestAnswer() external view returns (int256)
```

### latestTimestamp

```solidity
function latestTimestamp() external view returns (uint256)
```

### latestRound

```solidity
function latestRound() external view returns (uint256)
```

### getAnswer

```solidity
function getAnswer(uint256 roundId) external view returns (int256)
```

### getTimestamp

```solidity
function getTimestamp(uint256 roundId) external view returns (uint256)
```

### AnswerUpdated

```solidity
event AnswerUpdated(int256 current, uint256 roundId, uint256 timestamp)
```

### NewRound

```solidity
event NewRound(uint256 roundId, address startedBy, uint256 startedAt)
```

### decimals

```solidity
function decimals() external view returns (uint8)
```

### description

```solidity
function description() external view returns (string)
```

### version

```solidity
function version() external view returns (uint256)
```

### getRoundData

```solidity
function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

### latestRoundData

```solidity
function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
```

## BEP20Interface

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

_Returns the amount of tokens in existence._

### decimals

```solidity
function decimals() external view returns (uint8)
```

_Returns the token decimals._

### symbol

```solidity
function symbol() external view returns (string)
```

_Returns the token symbol._

### name

```solidity
function name() external view returns (string)
```

_Returns the token name._

### getOwner

```solidity
function getOwner() external view returns (address)
```

_Returns the bep token owner._

### balanceOf

```solidity
function balanceOf(address account) external view returns (uint256)
```

_Returns the amount of tokens owned by `account`._

### transfer

```solidity
function transfer(address recipient, uint256 amount) external returns (bool)
```

_Moves `amount` tokens from the caller's account to `recipient`.

Returns a boolean value indicating whether the operation succeeded.

Emits a {Transfer} event._

### allowance

```solidity
function allowance(address _owner, address spender) external view returns (uint256)
```

_Returns the remaining number of tokens that `spender` will be
allowed to spend on behalf of `owner` through {transferFrom}. This is
zero by default.

This value changes when {approve} or {transferFrom} are called._

### approve

```solidity
function approve(address spender, uint256 amount) external returns (bool)
```

_Sets `amount` as the allowance of `spender` over the caller's tokens.

Returns a boolean value indicating whether the operation succeeded.

IMPORTANT: Beware that changing an allowance with this method brings the risk
that someone may use both the old and the new allowance by unfortunate
transaction ordering. One possible solution to mitigate this race
condition is to first reduce the spender's allowance to 0 and set the
desired value afterwards:
https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729

Emits an {Approval} event._

### transferFrom

```solidity
function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)
```

_Moves `amount` tokens from `sender` to `recipient` using the
allowance mechanism. `amount` is then deducted from the caller's
allowance.

Returns a boolean value indicating whether the operation succeeded.

Emits a {Transfer} event._

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

_Emitted when `value` tokens are moved from one account (`from`) to
another (`to`).

Note that `value` may be zero._

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

_Emitted when the allowance of a `spender` for an `owner` is set by
a call to {approve}. `value` is the new allowance._

## OracleInterface

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

## PivotValidatorInterface

### validatePrice

```solidity
function validatePrice(address vToken, uint256 price) external view returns (bool)
```

## PivotOracleInterface

## PythStructs

### Price

```solidity
struct Price {
  int64 price;
  uint64 conf;
  int32 expo;
}
```

### PriceFeed

```solidity
struct PriceFeed {
  bytes32 id;
  bytes32 productId;
  int64 price;
  uint64 conf;
  int32 expo;
  enum PythStructs.PriceStatus status;
  uint32 maxNumPublishers;
  uint32 numPublishers;
  int64 emaPrice;
  uint64 emaConf;
  uint64 publishTime;
  int64 prevPrice;
  uint64 prevConf;
  uint64 prevPublishTime;
}
```

### PriceStatus

```solidity
enum PriceStatus {
  UNKNOWN,
  TRADING,
  HALTED,
  AUCTION
}
```

## IPyth

### PriceFeedUpdate

```solidity
event PriceFeedUpdate(bytes32 id, bool fresh, uint16 chainId, uint64 sequenceNumber, uint64 lastPublishTime, uint64 publishTime, int64 price, uint64 conf)
```

_Emitted when an update for price feed with `id` is processed successfully._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID. |
| fresh | bool | True if the price update is more recent and stored. |
| chainId | uint16 | ID of the source chain that the batch price update containing this price. This value comes from Wormhole, and you can find the corresponding chains at https://docs.wormholenetwork.com/wormhole/contracts. |
| sequenceNumber | uint64 | Sequence number of the batch price update containing this price. |
| lastPublishTime | uint64 | Publish time of the previously stored price. |
| publishTime | uint64 | Publish time of the given price update. |
| price | int64 | Current price of the given price update. |
| conf | uint64 | Current confidence interval of the given price update. |

### BatchPriceFeedUpdate

```solidity
event BatchPriceFeedUpdate(uint16 chainId, uint64 sequenceNumber, uint256 batchSize, uint256 freshPricesInBatch)
```

_Emitted when a batch price update is processed successfully._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| chainId | uint16 | ID of the source chain that the batch price update comes from. |
| sequenceNumber | uint64 | Sequence number of the batch price update. |
| batchSize | uint256 | Number of prices within the batch price update. |
| freshPricesInBatch | uint256 | Number of prices that were more recent and were stored. |

### UpdatePriceFeeds

```solidity
event UpdatePriceFeeds(address sender, uint256 batchCount, uint256 fee)
```

_Emitted when a call to `updatePriceFeeds` is processed successfully._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender | address | Sender of the call (`msg.sender`). |
| batchCount | uint256 | Number of batches that this function processed. |
| fee | uint256 | Amount of paid fee for updating the prices. |

### getCurrentPrice

```solidity
function getCurrentPrice(bytes32 id) external view returns (struct PythStructs.Price price)
```

Returns the current price and confidence interval.

_Reverts if the current price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getEmaPrice

```solidity
function getEmaPrice(bytes32 id) external view returns (struct PythStructs.Price price)
```

Returns the exponential moving average price and confidence interval.

_Reverts if the current exponential moving average price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getLatestAvailablePriceUnsafe

```solidity
function getLatestAvailablePriceUnsafe(bytes32 id) external view returns (struct PythStructs.Price price, uint64 publishTime)
```

Returns the latest available price, along with the timestamp when it was generated.

_This function returns the same price as `getCurrentPrice` in the case where a price was available
at the time this `PriceFeed` was published (`publish_time`). However, if a price was not available
at that time, this function returns the price from the latest time at which the price was available.

The returned price can be from arbitrarily far in the past; this function makes no guarantees that
the returned price is recent or useful for any particular application.

Users of this function should check the returned timestamp to ensure that the returned price is
sufficiently recent for their application. If you are considering using this function, it may be
safer / easier to use either `getCurrentPrice` or `getLatestAvailablePriceWithinDuration`._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |
| publishTime | uint64 | - the UNIX timestamp of when this price was computed. |

### getLatestAvailablePriceWithinDuration

```solidity
function getLatestAvailablePriceWithinDuration(bytes32 id, uint64 duration) external view returns (struct PythStructs.Price price)
```

Returns the latest price as long as it was updated within `duration` seconds of the current time.

_This function is a sanity-checked version of `getLatestAvailablePriceUnchecked` which is useful in
applications that require a sufficiently-recent price. Reverts if the price wasn't updated sufficiently
recently._

### updatePriceFeeds

```solidity
function updatePriceFeeds(bytes[] updateData) external payable
```

Update price feeds with given update messages.
This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.
Prices will be updated if they are more recent than the current stored prices.
The call will succeed even if the update is not the most recent.

_Reverts if the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |

### updatePriceFeedsIfNecessary

```solidity
function updatePriceFeedsIfNecessary(bytes[] updateData, bytes32[] priceIds, uint64[] publishTimes) external payable
```

Wrapper around updatePriceFeeds that rejects fast if a price update is not necessary. A price update is
necessary if the current on-chain publishTime is older than the given publishTime. It relies solely on the
given `publishTimes` for the price feeds and does not read the actual price update publish time within `updateData`.

This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.

`priceIds` and `publishTimes` are two arrays with the same size that correspond to senders known publishTime
of each priceId when calling this method. If all of price feeds within `priceIds` have updated and have
a newer or equal publish time than the given publish time, it will reject the transaction to save gas.
Otherwise, it calls updatePriceFeeds method to update the prices.

_Reverts if update is not needed or the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |
| priceIds | bytes32[] | Array of price ids. |
| publishTimes | uint64[] | Array of publishTimes. `publishTimes[i]` corresponds to known `publishTime` of `priceIds[i]` |

### getUpdateFee

```solidity
function getUpdateFee(uint256 updateDataSize) external view returns (uint256 feeAmount)
```

Returns the required fee to update an array of price updates.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateDataSize | uint256 | Number of price updates. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| feeAmount | uint256 | The required fee in Wei. |

## VBep20Interface

### underlying

```solidity
function underlying() external view returns (address)
```

Underlying asset for this VToken

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

## ValidateConfig

```solidity
struct ValidateConfig {
  address vToken;
  uint256 upperBoundRatio;
  uint256 lowerBoundRatio;
}
```

## BoundValidator

### validateConfigs

```solidity
mapping(address => struct ValidateConfig) validateConfigs
```

validation configs by token

### ValidateConfigAdded

```solidity
event ValidateConfigAdded(address vToken, uint256 upperBound, uint256 lowerBound)
```

Emit this event when new validate configs are added

### setValidateConfigs

```solidity
function setValidateConfigs(struct ValidateConfig[] configs) external virtual
```

Add multiple validation configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| configs | struct ValidateConfig[] | config array |

### setValidateConfig

```solidity
function setValidateConfig(struct ValidateConfig config) public virtual
```

Add single validation config

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct ValidateConfig | config struct |

### validatePriceWithAnchorPrice

```solidity
function validatePriceWithAnchorPrice(address vToken, uint256 reporterPrice, uint256 anchorPrice) public view virtual returns (bool)
```

Test reported vToken underlying price against anchor price

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |
| anchorPrice | uint256 |  |

### _isWithinAnchor

```solidity
function _isWithinAnchor(address vToken, uint256 reporterPrice, uint256 anchorPrice) internal view returns (bool)
```

Test whether the reported price is within the predefined bounds

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |
| anchorPrice | uint256 | anchor price as testing anchor |

### __gap

```solidity
uint256[49] __gap
```

## TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  address feed;
  uint256 maxStalePeriod;
}
```

## ChainlinkOracle

### VAI_VALUE

```solidity
uint256 VAI_VALUE
```

VAI token is considered $1 constantly in oracle for now

### prices

```solidity
mapping(address => uint256) prices
```

TODO: might be removed some day, it's for enabling us to force set the prices to
certain values in some urgent conditions

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

token config by assets

### PricePosted

```solidity
event PricePosted(address asset, uint256 previousPriceMantissa, uint256 requestedPriceMantissa, uint256 newPriceMantissa)
```

emit when forced price is set

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, address feed, uint256 maxStalePeriod)
```

emit when token config is added

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize() public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```

Get the Chainlink price of underlying asset of input vToken, revert when vToken is zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### _getUnderlyingPriceInternal

```solidity
function _getUnderlyingPriceInternal(contract VBep20Interface vToken) internal view returns (uint256 price)
```

Get the Chainlink price of underlying asset of input vToken or cached price when it's been set

_The decimals of underlying tokens is considered to ensure the returned prices are in 18 decimals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VBep20Interface | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | in USD, with 18 decimals |

### _getChainlinkPrice

```solidity
function _getChainlinkPrice(address vToken) internal view returns (uint256)
```

Get the Chainlink price of underlying asset of input vToken, revert if token config doesn't exit

_The decimals of feeds are considered_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### setUnderlyingPrice

```solidity
function setUnderlyingPrice(contract VBep20Interface vToken, uint256 underlyingPriceMantissa) external
```

Set the forced prices of the underlying token of input vToken

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VBep20Interface | vToken address |
| underlyingPriceMantissa | uint256 | price in 18 decimals |

### setDirectPrice

```solidity
function setDirectPrice(address asset, uint256 price) external
```

Set the forced prices of the input token

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| asset | address | asset address |
| price | uint256 | price in 18 decimals |

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] tokenConfigs_) external
```

Add multiple token configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct TokenConfig[] | config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig tokenConfig) public
```

Add single token config, vToken & feed cannot be zero address, and maxStalePeriod must be positive

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct TokenConfig | token config struct |

### _compareStrings

```solidity
function _compareStrings(string a, string b) internal pure returns (bool)
```

## PivotPythOracle

### validatePrice

```solidity
function validatePrice(address vToken, uint256 reporterPrice) external view returns (bool)
```

Test reported vToken underlying price against stored TWAP

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |

## PivotTwapOracle

### validatePrice

```solidity
function validatePrice(address vToken, uint256 reporterPrice) external view returns (bool)
```

Test reported vToken underlying price against stored TWAP

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |
| reporterPrice | uint256 | the price to be tested |

## TokenConfig

```solidity
struct TokenConfig {
  bytes32 pythId;
  address vToken;
  uint64 maxStalePeriod;
}
```

## PythOracle

PythOracle contract reads prices from actual Pyth oracle contract which accepts/verifies and stores the
updated prices from external sources

### EXP_SCALE

```solidity
uint256 EXP_SCALE
```

price decimals

### underlyingPythOracle

```solidity
contract IPyth underlyingPythOracle
```

the actual pyth oracle address fetch & store the prices

### PythOracleSet

```solidity
event PythOracleSet(address newPythOracle)
```

emit when setting a new pyth oracle address

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, bytes32 pythId, uint64 maxStalePeriod)
```

emit when token config added

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

token configs by vToken address

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize(address underlyingPythOracle_) public
```

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] tokenConfigs_) external
```

Batch set token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfigs_ | struct TokenConfig[] | token config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig tokenConfig) public
```

Set single token config, `maxStalePeriod` cannot be 0 and `vToken` can be zero address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenConfig | struct TokenConfig | token config struct |

### setUnderlyingPythOracle

```solidity
function setUnderlyingPythOracle(contract IPyth underlyingPythOracle_) external
```

set the underlying pyth oracle contract address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| underlyingPythOracle_ | contract IPyth | pyth oracle contract address |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) public view returns (uint256)
```

Get price of underlying asset of the input vToken, under the hood this function
get price from Pyth contract, the prices of which are updated externally

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in 10 decimals |

## Observation

```solidity
struct Observation {
  uint256 timestamp;
  uint256 acc;
}
```

## TokenConfig

```solidity
struct TokenConfig {
  address vToken;
  uint256 baseUnit;
  address pancakePool;
  bool isBnbBased;
  bool isReversedPool;
  uint256 anchorPeriod;
}
```

## TwapOracle

### vBNB

```solidity
address vBNB
```

vBNB address

### bnbBaseUnit

```solidity
uint256 bnbBaseUnit
```

the base unit of WBNB and BUSD, which are the paired tokens for all assets

### busdBaseUnit

```solidity
uint256 busdBaseUnit
```

### expScale

```solidity
uint256 expScale
```

### tokenConfigs

```solidity
mapping(address => struct TokenConfig) tokenConfigs
```

Configs by token

### newObservations

```solidity
mapping(address => struct Observation) newObservations
```

The current price observation of TWAP. With old and current observations
we can calculate the TWAP between this range

### oldObservations

```solidity
mapping(address => struct Observation) oldObservations
```

The old price observation of TWAP

### prices

```solidity
mapping(address => uint256) prices
```

Stored price by token

### TwapWindowUpdated

```solidity
event TwapWindowUpdated(address vToken, uint256 oldTimestamp, uint256 oldAcc, uint256 newTimestamp, uint256 newAcc)
```

Emit this event when TWAP window is updated

### AnchorPriceUpdated

```solidity
event AnchorPriceUpdated(address vToken, uint256 price, uint256 oldTimestamp, uint256 newTimestamp)
```

Emit this event when TWAP price is updated

### TokenConfigAdded

```solidity
event TokenConfigAdded(address vToken, address pancakePool, uint256 anchorPeriod)
```

Emit this event when new token configs are added

### notNullAddress

```solidity
modifier notNullAddress(address someone)
```

### initialize

```solidity
function initialize(address vBNB_) public
```

### setTokenConfigs

```solidity
function setTokenConfigs(struct TokenConfig[] configs) external
```

Add multiple token configs at the same time

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| configs | struct TokenConfig[] | config array |

### setTokenConfig

```solidity
function setTokenConfig(struct TokenConfig config) public
```

Add single token configs

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct TokenConfig | token config struct |

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

Get the underlying TWAP price of input vToken

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | vToken address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### currentCumulativePrice

```solidity
function currentCumulativePrice(struct TokenConfig config) public view returns (uint256)
```

Fetches the current token/WBNB and token/BUSD price accumulator from pancakeswap.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | cumulative price of target token regardless of pair order |

### updateTwap

```solidity
function updateTwap(address vToken) public returns (uint256)
```

### _updateTwapInternal

```solidity
function _updateTwapInternal(struct TokenConfig config) internal virtual returns (uint256)
```

Fetches the current token/BUSD price from PancakeSwap, with 18 decimals of precision.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | price in USD, with 18 decimals |

### pokeWindowValues

```solidity
function pokeWindowValues(struct TokenConfig config) internal returns (uint256, uint256, uint256)
```

Update new and old observations of lagging window if period elapsed.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | cumulative price & old observation |
| [1] | uint256 |  |
| [2] | uint256 |  |

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

## BEP20Harness

### decimalsInternal

```solidity
uint8 decimalsInternal
```

### constructor

```solidity
constructor(string name_, string symbol_, uint8 decimals_) public
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless this function is
overridden;

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

## MockBoundValidator

### initialize

```solidity
function initialize() public
```

## MockPyth

### priceFeeds

```solidity
mapping(bytes32 => struct PythStructs.PriceFeed) priceFeeds
```

### queryPriceFeed

```solidity
function queryPriceFeed(bytes32 id) public view returns (struct PythStructs.PriceFeed priceFeed)
```

### updatePriceFeedsHarness

```solidity
function updatePriceFeedsHarness(struct PythStructs.PriceFeed[] feeds) external
```

### getLatestAvailablePriceWithinDuration

```solidity
function getLatestAvailablePriceWithinDuration(bytes32 id, uint64 duration) external view returns (struct PythStructs.Price price)
```

Returns the latest price as long as it was updated within `duration` seconds of the current time.

_This function is a sanity-checked version of `getLatestAvailablePriceUnchecked` which is useful in
applications that require a sufficiently-recent price. Reverts if the price wasn't updated sufficiently
recently._

### _diff

```solidity
function _diff(uint256 x, uint256 y) internal pure returns (uint256)
```

### updatePriceFeedsIfNecessary

```solidity
function updatePriceFeedsIfNecessary(bytes[] updateData, bytes32[] priceIds, uint64[] publishTimes) external payable
```

Wrapper around updatePriceFeeds that rejects fast if a price update is not necessary. A price update is
necessary if the current on-chain publishTime is older than the given publishTime. It relies solely on the
given `publishTimes` for the price feeds and does not read the actual price update publish time within `updateData`.

This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.

`priceIds` and `publishTimes` are two arrays with the same size that correspond to senders known publishTime
of each priceId when calling this method. If all of price feeds within `priceIds` have updated and have
a newer or equal publish time than the given publish time, it will reject the transaction to save gas.
Otherwise, it calls updatePriceFeeds method to update the prices.

_Reverts if update is not needed or the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |
| priceIds | bytes32[] | Array of price ids. |
| publishTimes | uint64[] | Array of publishTimes. `publishTimes[i]` corresponds to known `publishTime` of `priceIds[i]` |

### getUpdateFee

```solidity
function getUpdateFee(uint256 updateDataSize) external pure returns (uint256 feeAmount)
```

Returns the required fee to update an array of price updates.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateDataSize | uint256 | Number of price updates. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| feeAmount | uint256 | The required fee in Wei. |

### updatePriceFeeds

```solidity
function updatePriceFeeds(bytes[] updateData) external payable
```

Update price feeds with given update messages.
This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.
Prices will be updated if they are more recent than the current stored prices.
The call will succeed even if the update is not the most recent.

_Reverts if the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |

### getCurrentPrice

```solidity
function getCurrentPrice(bytes32 id) external pure returns (struct PythStructs.Price price)
```

Returns the current price and confidence interval.

_Reverts if the current price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getEmaPrice

```solidity
function getEmaPrice(bytes32 id) external pure returns (struct PythStructs.Price price)
```

Returns the exponential moving average price and confidence interval.

_Reverts if the current exponential moving average price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getLatestAvailablePriceUnsafe

```solidity
function getLatestAvailablePriceUnsafe(bytes32 id) external pure returns (struct PythStructs.Price price, uint64 publishTime)
```

Returns the latest available price, along with the timestamp when it was generated.

_This function returns the same price as `getCurrentPrice` in the case where a price was available
at the time this `PriceFeed` was published (`publish_time`). However, if a price was not available
at that time, this function returns the price from the latest time at which the price was available.

The returned price can be from arbitrarily far in the past; this function makes no guarantees that
the returned price is recent or useful for any particular application.

Users of this function should check the returned timestamp to ensure that the returned price is
sufficiently recent for their application. If you are considering using this function, it may be
safer / easier to use either `getCurrentPrice` or `getLatestAvailablePriceWithinDuration`._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |
| publishTime | uint64 | - the UNIX timestamp of when this price was computed. |

## MockSimpleOracle

### prices

```solidity
mapping(address => uint256) prices
```

### constructor

```solidity
constructor() public
```

### setPrice

```solidity
function setPrice(address vToken, uint256 price) public
```

### getUnderlyingPrice

```solidity
function getUnderlyingPrice(address vToken) external view returns (uint256)
```

## MockPivotOracle

### validateResults

```solidity
mapping(address => bool) validateResults
```

### constructor

```solidity
constructor() public
```

### setValidateResult

```solidity
function setValidateResult(address vToken, bool pass) public
```

### validatePrice

```solidity
function validatePrice(address vToken, uint256 price) external view returns (bool)
```

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

## VBEP20Harness

### underlying

```solidity
address underlying
```

Underlying asset for this VToken

### constructor

```solidity
constructor(string name_, string symbol_, uint8 decimals, address underlying_) public
```

## ConstBase

### C

```solidity
uint256 C
```

### c

```solidity
function c() public pure virtual returns (uint256)
```

### ADD

```solidity
function ADD(uint256 a) public view returns (uint256)
```

### add

```solidity
function add(uint256 a) public view returns (uint256)
```

## ConstSub

### c

```solidity
function c() public pure returns (uint256)
```

## Counter

### count

```solidity
uint256 count
```

### count2

```solidity
uint256 count2
```

### increment

```solidity
function increment(uint256 amount) public payable
```

### decrement

```solidity
function decrement(uint256 amount) public payable
```

### increment

```solidity
function increment(uint256 amount, uint256 amount2) public payable
```

### notZero

```solidity
function notZero() public view
```

### doRevert

```solidity
function doRevert() public pure
```

## ERC20Base

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### balanceOf

```solidity
function balanceOf(address who) external view returns (uint256)
```

## ERC20

### transfer

```solidity
function transfer(address to, uint256 value) external virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external virtual returns (bool)
```

## ERC20NS

### transfer

```solidity
function transfer(address to, uint256 value) external virtual
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external virtual
```

## StandardToken

_Implementation of the basic standard token.
 See https://github.com/ethereum/EIPs/issues/20_

### name

```solidity
string name
```

### symbol

```solidity
string symbol
```

### decimals

```solidity
uint8 decimals
```

### totalSupply

```solidity
uint256 totalSupply
```

### allowance

```solidity
mapping(address => mapping(address => uint256)) allowance
```

### balanceOf

```solidity
mapping(address => uint256) balanceOf
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external virtual returns (bool)
```

### approve

```solidity
function approve(address _spender, uint256 amount) external virtual returns (bool)
```

## NonStandardToken

_Version of ERC20 with no return values for `transfer` and `transferFrom`
 See https://medium.com/coinmonks/missing-return-value-bug-at-least-130-tokens-affected-d67bf08521ca_

### name

```solidity
string name
```

### decimals

```solidity
uint8 decimals
```

### symbol

```solidity
string symbol
```

### totalSupply

```solidity
uint256 totalSupply
```

### allowance

```solidity
mapping(address => mapping(address => uint256)) allowance
```

### balanceOf

```solidity
mapping(address => uint256) balanceOf
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external
```

### approve

```solidity
function approve(address _spender, uint256 amount) external returns (bool)
```

## ERC20Harness

### failTransferFromAddresses

```solidity
mapping(address => bool) failTransferFromAddresses
```

### failTransferToAddresses

```solidity
mapping(address => bool) failTransferToAddresses
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### harnessSetFailTransferFromAddress

```solidity
function harnessSetFailTransferFromAddress(address src, bool _fail) public
```

### harnessSetFailTransferToAddress

```solidity
function harnessSetFailTransferToAddress(address dst, bool _fail) public
```

### harnessSetBalance

```solidity
function harnessSetBalance(address _account, uint256 _amount) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external returns (bool success)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external returns (bool success)
```

## EvilToken

A simple test token that fails certain operations

### fail

```solidity
bool fail
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### setFail

```solidity
function setFail(bool _fail) external
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external returns (bool)
```

## FalseMarkerMethodComptroller

### isComptroller

```solidity
bool isComptroller
```

## FalseMarkerMethodInterestRateModel

### isInterestRateModel

```solidity
bool isInterestRateModel
```

## FaucetToken

A simple test token that lets anyone get more of it.

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

## FaucetNonStandardToken

A simple test token that lets anyone get more of it.

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

## FaucetTokenReEntrantHarness

A test token that is malicious and tries to re-enter callers

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### name

```solidity
string name
```

### symbol

```solidity
string symbol
```

### decimals

```solidity
uint8 decimals
```

### totalSupply_

```solidity
uint256 totalSupply_
```

### allowance_

```solidity
mapping(address => mapping(address => uint256)) allowance_
```

### balanceOf_

```solidity
mapping(address => uint256) balanceOf_
```

### reEntryCallData

```solidity
bytes reEntryCallData
```

### reEntryFun

```solidity
string reEntryFun
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, bytes _reEntryCallData, string _reEntryFun) public
```

### reEnter

```solidity
modifier reEnter(string funName)
```

### compareStrings

```solidity
function compareStrings(string a, string b) internal pure returns (bool)
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

### totalSupply

```solidity
function totalSupply() public returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) public returns (uint256 remaining)
```

### approve

```solidity
function approve(address spender, uint256 amount) public returns (bool success)
```

### balanceOf

```solidity
function balanceOf(address owner) public returns (uint256 balance)
```

### transfer

```solidity
function transfer(address dst, uint256 amount) public returns (bool success)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) public returns (bool success)
```

### _approve

```solidity
function _approve(address owner, address spender, uint256 amount) internal
```

### _transfer

```solidity
function _transfer(address src, address dst, uint256 amount) internal
```

## FeeToken

A simple test token that charges fees on transfer. Used to mock USDT.

### basisPointFee

```solidity
uint256 basisPointFee
```

### owner

```solidity
address owner
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, uint256 _basisPointFee, address _owner) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) public returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) public returns (bool)
```

## InterestRateModelHarness

### opaqueBorrowFailureCode

```solidity
uint256 opaqueBorrowFailureCode
```

### failBorrowRate

```solidity
bool failBorrowRate
```

### borrowRate

```solidity
uint256 borrowRate
```

### constructor

```solidity
constructor(uint256 borrowRate_) public
```

### setFailBorrowRate

```solidity
function setFailBorrowRate(bool failBorrowRate_) public
```

### setBorrowRate

```solidity
function setBorrowRate(uint256 borrowRate_) public
```

### getBorrowRate

```solidity
function getBorrowRate(uint256 _cash, uint256 _borrows, uint256 _reserves) public view returns (uint256)
```

### getSupplyRate

```solidity
function getSupplyRate(uint256 _cash, uint256 _borrows, uint256 _reserves, uint256 _reserveFactor) external view returns (uint256)
```

## MathHelpers

### scientific

```solidity
function scientific(uint256 val, uint256 expTen) internal pure returns (uint256)
```

## MockToken

### DECIMALS

```solidity
uint8 DECIMALS
```

### constructor

```solidity
constructor(string name_, string symbol_, uint8 decimals_) public
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless this function is
overridden;

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

### faucet

```solidity
function faucet(uint256 amount) external
```

## SafeMath

_Wrappers over Solidity's arithmetic operations with added overflow
checks.

Arithmetic operations in Solidity wrap on overflow. This can easily result
in bugs, because programmers usually assume that an overflow raises an
error, which is the standard behavior in high level programming languages.
`SafeMath` restores this intuition by reverting the transaction when an
operation overflows.

Using this library instead of the unchecked operations eliminates an entire
class of bugs, so it's recommended to use it always._

### add

```solidity
function add(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the addition of two unsigned integers, reverting on overflow.

Counterpart to Solidity's `+` operator.

Requirements:
- Addition cannot overflow._

### add

```solidity
function add(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the addition of two unsigned integers, reverting with custom message on overflow.

Counterpart to Solidity's `+` operator.

Requirements:
- Addition cannot overflow._

### sub

```solidity
function sub(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the subtraction of two unsigned integers, reverting on underflow (when the result is negative).

Counterpart to Solidity's `-` operator.

Requirements:
- Subtraction cannot underflow._

### sub

```solidity
function sub(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the subtraction of two unsigned integers, reverting with custom message on underflow (when the result is negative).

Counterpart to Solidity's `-` operator.

Requirements:
- Subtraction cannot underflow._

### mul

```solidity
function mul(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the multiplication of two unsigned integers, reverting on overflow.

Counterpart to Solidity's `*` operator.

Requirements:
- Multiplication cannot overflow._

### mul

```solidity
function mul(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the multiplication of two unsigned integers, reverting on overflow.

Counterpart to Solidity's `*` operator.

Requirements:
- Multiplication cannot overflow._

### div

```solidity
function div(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the integer division of two unsigned integers.
Reverts on division by zero. The result is rounded towards zero.

Counterpart to Solidity's `/` operator. Note: this function uses a
`revert` opcode (which leaves remaining gas untouched) while Solidity
uses an invalid opcode to revert (consuming all remaining gas).

Requirements:
- The divisor cannot be zero._

### div

```solidity
function div(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the integer division of two unsigned integers.
Reverts with custom message on division by zero. The result is rounded towards zero.

Counterpart to Solidity's `/` operator. Note: this function uses a
`revert` opcode (which leaves remaining gas untouched) while Solidity
uses an invalid opcode to revert (consuming all remaining gas).

Requirements:
- The divisor cannot be zero._

### mod

```solidity
function mod(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
Reverts when dividing by zero.

Counterpart to Solidity's `%` operator. This function uses a `revert`
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).

Requirements:
- The divisor cannot be zero._

### mod

```solidity
function mod(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
Reverts with custom message when dividing by zero.

Counterpart to Solidity's `%` operator. This function uses a `revert`
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).

Requirements:
- The divisor cannot be zero._

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

## TetherInterface

### setParams

```solidity
function setParams(uint256 newBasisPoints, uint256 newMaxFee) external
```

## ERC20Basic

_Simpler version of ERC20 interface
See https://github.com/ethereum/EIPs/issues/179_

### totalSupply

```solidity
function totalSupply() public view virtual returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address _who) public view virtual returns (uint256)
```

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

## SafeMath

_Math operations with safety checks that throw on error_

### mul

```solidity
function mul(uint256 _a, uint256 _b) internal pure returns (uint256 c)
```

_Multiplies two numbers, throws on overflow._

### div

```solidity
function div(uint256 _a, uint256 _b) internal pure returns (uint256)
```

_Integer division of two numbers, truncating the quotient._

### sub

```solidity
function sub(uint256 _a, uint256 _b) internal pure returns (uint256)
```

_Subtracts two numbers, throws on overflow (i.e. if subtrahend is greater than minuend)._

### add

```solidity
function add(uint256 _a, uint256 _b) internal pure returns (uint256 c)
```

_Adds two numbers, throws on overflow._

## BasicToken

_Basic version of StandardToken, with no allowances._

### balances

```solidity
mapping(address => uint256) balances
```

### totalSupply_

```solidity
uint256 totalSupply_
```

### totalSupply

```solidity
function totalSupply() public view returns (uint256)
```

_Total number of tokens in existence_

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

_Transfer token for a specified address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address to transfer to. |
| _value | uint256 | The amount to be transferred. |

### balanceOf

```solidity
function balanceOf(address _owner) public view returns (uint256)
```

_Gets the balance of the specified address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address to query the the balance of. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | An uint256 representing the amount owned by the passed address. |

## ERC20

_see https://github.com/ethereum/EIPs/issues/20_

### allowance

```solidity
function allowance(address _owner, address _spender) public view virtual returns (uint256)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

## StandardToken

_Implementation of the basic standard token.
https://github.com/ethereum/EIPs/issues/20
Based on code by FirstBlood: https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol_

### allowed

```solidity
mapping(address => mapping(address => uint256)) allowed
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

_Transfer tokens from one address to another_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | address The address which you want to send tokens from |
| _to | address | address The address which you want to transfer to |
| _value | uint256 | uint256 the amount of tokens to be transferred |

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

_Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
Beware that changing an allowance with this method brings the risk that someone may use both the old
and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _value | uint256 | The amount of tokens to be spent. |

### allowance

```solidity
function allowance(address _owner, address _spender) public view returns (uint256)
```

_Function to check the amount of tokens that an owner allowed to a spender._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | address The address which owns the funds. |
| _spender | address | address The address which will spend the funds. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A uint256 specifying the amount of tokens still available for the spender. |

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public virtual returns (bool)
```

_Increase the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To increment
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _addedValue | uint256 | The amount of tokens to increase the allowance by. |

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public virtual returns (bool)
```

_Decrease the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To decrement
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _subtractedValue | uint256 | The amount of tokens to decrease the allowance by. |

## DetailedERC20

_The decimals are only for visualization purposes.
All the operations are done using the smallest and indivisible token unit,
just as on Ethereum all the operations are done in wei._

### name

```solidity
string name
```

### symbol

```solidity
string symbol
```

### decimals

```solidity
uint8 decimals
```

### constructor

```solidity
constructor(string _name, string _symbol, uint8 _decimals) internal
```

## Ownable

_The Ownable contract has an owner address, and provides basic authorization control
functions, this simplifies the implementation of "user permissions"._

### owner

```solidity
address owner
```

### OwnershipRenounced

```solidity
event OwnershipRenounced(address previousOwner)
```

### OwnershipTransferred

```solidity
event OwnershipTransferred(address previousOwner, address newOwner)
```

### constructor

```solidity
constructor() public
```

_The Ownable constructor sets the original `owner` of the contract to the sender
account._

### onlyOwner

```solidity
modifier onlyOwner()
```

_Throws if called by any account other than the owner._

### renounceOwnership

```solidity
function renounceOwnership() public virtual
```

Renouncing to ownership will leave the contract without an owner.
It will not be possible to call the functions with the `onlyOwner`
modifier anymore.

_Allows the current owner to relinquish control of the contract._

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public virtual
```

_Allows the current owner to transfer control of the contract to a newOwner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newOwner | address | The address to transfer ownership to. |

### _transferOwnership

```solidity
function _transferOwnership(address _newOwner) internal
```

_Transfers control of the contract to a newOwner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newOwner | address | The address to transfer ownership to. |

## MintableToken

_Simple ERC20 Token example, with mintable token creation
Based on code by TokenMarketNet: https://github.com/TokenMarketNet/ico/blob/master/contracts/MintableToken.sol_

### Mint

```solidity
event Mint(address to, uint256 amount)
```

### MintFinished

```solidity
event MintFinished()
```

### mintingFinished

```solidity
bool mintingFinished
```

### canMint

```solidity
modifier canMint()
```

### hasMintPermission

```solidity
modifier hasMintPermission()
```

### mint

```solidity
function mint(address _to, uint256 _amount) public returns (bool)
```

_Function to mint tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address that will receive the minted tokens. |
| _amount | uint256 | The amount of tokens to mint. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean that indicates if the operation was successful. |

### finishMinting

```solidity
function finishMinting() public virtual returns (bool)
```

_Function to stop minting new tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the operation was successful. |

## BurnableToken

_Token that can be irreversibly burned (destroyed)._

### Burn

```solidity
event Burn(address burner, uint256 value)
```

### burn

```solidity
function burn(uint256 _value) public virtual
```

_Burns a specific amount of tokens._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _value | uint256 | The amount of token to be burned. |

### _burn

```solidity
function _burn(address _who, uint256 _value) internal
```

## Pausable

_Base contract which allows children to implement an emergency stop mechanism._

### Pause

```solidity
event Pause()
```

### Unpause

```solidity
event Unpause()
```

### paused

```solidity
bool paused
```

### whenNotPaused

```solidity
modifier whenNotPaused()
```

_Modifier to make a function callable only when the contract is not paused._

### whenPaused

```solidity
modifier whenPaused()
```

_Modifier to make a function callable only when the contract is paused._

### pause

```solidity
function pause() public
```

_called by the owner to pause, triggers stopped state_

### unpause

```solidity
function unpause() public
```

_called by the owner to unpause, returns to normal state_

## PausableToken

_StandardToken modified with pausable transfers._

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

_Transfer tokens from one address to another_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | address The address which you want to send tokens from |
| _to | address | address The address which you want to transfer to |
| _value | uint256 | uint256 the amount of tokens to be transferred |

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

_Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
Beware that changing an allowance with this method brings the risk that someone may use both the old
and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _value | uint256 | The amount of tokens to be spent. |

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public virtual returns (bool success)
```

_Increase the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To increment
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _addedValue | uint256 | The amount of tokens to increase the allowance by. |

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public virtual returns (bool success)
```

_Decrease the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To decrement
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _subtractedValue | uint256 | The amount of tokens to decrease the allowance by. |

## Claimable

_Extension for the Ownable contract, where the ownership needs to be claimed.
This allows the new owner to accept the transfer._

### pendingOwner

```solidity
address pendingOwner
```

### onlyPendingOwner

```solidity
modifier onlyPendingOwner()
```

_Modifier throws if called by any account other than the pendingOwner._

### transferOwnership

```solidity
function transferOwnership(address newOwner) public virtual
```

_Allows the current owner to set the pendingOwner address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newOwner | address | The address to transfer ownership to. |

### claimOwnership

```solidity
function claimOwnership() public
```

_Allows the pendingOwner address to finalize the transfer._

## SafeERC20

_Wrappers around ERC20 operations that throw on failure.
To use this library you can add a `using SafeERC20 for ERC20;` statement to your contract,
which allows you to call the safe operations as `token.safeTransfer(...)`, etc._

### safeTransfer

```solidity
function safeTransfer(contract ERC20Basic _token, address _to, uint256 _value) internal
```

### safeTransferFrom

```solidity
function safeTransferFrom(contract ERC20 _token, address _from, address _to, uint256 _value) internal
```

### safeApprove

```solidity
function safeApprove(contract ERC20 _token, address _spender, uint256 _value) internal
```

## CanReclaimToken

_This allow a contract to recover any ERC20 token received in a contract by transferring the balance to the contract owner.
This will prevent any accidental loss of tokens._

### reclaimToken

```solidity
function reclaimToken(contract ERC20Basic _token) external
```

_Reclaim all ERC20Basic compatible tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | contract ERC20Basic | ERC20Basic The address of the token contract |

## OwnableContract

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public virtual
```

## WBTVToken

### approve

```solidity
function approve(address _spender, uint256 _value) public returns (bool)
```

### burn

```solidity
function burn(uint256 value) public
```

### finishMinting

```solidity
function finishMinting() public returns (bool)
```

_Function to stop minting new tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the operation was successful. |

### renounceOwnership

```solidity
function renounceOwnership() public
```

Renouncing to ownership will leave the contract without an owner.
It will not be possible to call the functions with the `onlyOwner`
modifier anymore.

_Allows the current owner to relinquish control of the contract._

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public
```

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public returns (bool)
```

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public returns (bool)
```

### transfer

```solidity
function transfer(address _to, uint256 _value) public returns (bool)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public returns (bool)
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

_Arbitrarily adds tokens to any account_

## TransferHelper

### safeApprove

```solidity
function safeApprove(address token, address to, uint256 value) internal
```

### safeTransfer

```solidity
function safeTransfer(address token, address to, uint256 value) internal
```

### safeTransferFrom

```solidity
function safeTransferFrom(address token, address from, address to, uint256 value) internal
```

### safeTransferETH

```solidity
function safeTransferETH(address to, uint256 value) internal
```

## IPancakeRouter01

### factory

```solidity
function factory() external pure returns (address)
```

### WETH

```solidity
function WETH() external pure returns (address)
```

### addLiquidity

```solidity
function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)
```

### addLiquidityETH

```solidity
function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
```

### removeLiquidity

```solidity
function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)
```

### removeLiquidityETH

```solidity
function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external returns (uint256 amountToken, uint256 amountETH)
```

### removeLiquidityWithPermit

```solidity
function removeLiquidityWithPermit(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint256 amountA, uint256 amountB)
```

### removeLiquidityETHWithPermit

```solidity
function removeLiquidityETHWithPermit(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint256 amountToken, uint256 amountETH)
```

### swapExactTokensForTokens

```solidity
function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)
```

### swapTokensForExactTokens

```solidity
function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)
```

### swapExactETHForTokens

```solidity
function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) external payable returns (uint256[] amounts)
```

### swapTokensForExactETH

```solidity
function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)
```

### swapExactTokensForETH

```solidity
function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)
```

### swapETHForExactTokens

```solidity
function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) external payable returns (uint256[] amounts)
```

### quote

```solidity
function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB)
```

### getAmountOut

```solidity
function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountOut)
```

### getAmountIn

```solidity
function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountIn)
```

### getAmountsOut

```solidity
function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)
```

### getAmountsIn

```solidity
function getAmountsIn(uint256 amountOut, address[] path) external view returns (uint256[] amounts)
```

## IPancakeRouter02

### removeLiquidityETHSupportingFeeOnTransferTokens

```solidity
function removeLiquidityETHSupportingFeeOnTransferTokens(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external returns (uint256 amountETH)
```

### removeLiquidityETHWithPermitSupportingFeeOnTransferTokens

```solidity
function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint256 amountETH)
```

### swapExactTokensForTokensSupportingFeeOnTransferTokens

```solidity
function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external
```

### swapExactETHForTokensSupportingFeeOnTransferTokens

```solidity
function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) external payable
```

### swapExactTokensForETHSupportingFeeOnTransferTokens

```solidity
function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external
```

## IPancakeFactory

### PairCreated

```solidity
event PairCreated(address token0, address token1, address pair, uint256)
```

### feeTo

```solidity
function feeTo() external view returns (address)
```

### feeToSetter

```solidity
function feeToSetter() external view returns (address)
```

### getPair

```solidity
function getPair(address tokenA, address tokenB) external view returns (address pair)
```

### allPairs

```solidity
function allPairs(uint256) external view returns (address pair)
```

### allPairsLength

```solidity
function allPairsLength() external view returns (uint256)
```

### createPair

```solidity
function createPair(address tokenA, address tokenB) external returns (address pair)
```

### setFeeTo

```solidity
function setFeeTo(address) external
```

### setFeeToSetter

```solidity
function setFeeToSetter(address) external
```

### INIT_CODE_PAIR_HASH

```solidity
function INIT_CODE_PAIR_HASH() external view returns (bytes32)
```

## SafeMath

### add

```solidity
function add(uint256 x, uint256 y) internal pure returns (uint256 z)
```

### sub

```solidity
function sub(uint256 x, uint256 y) internal pure returns (uint256 z)
```

### mul

```solidity
function mul(uint256 x, uint256 y) internal pure returns (uint256 z)
```

## IPancakePair

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### name

```solidity
function name() external pure returns (string)
```

### symbol

```solidity
function symbol() external pure returns (string)
```

### decimals

```solidity
function decimals() external pure returns (uint8)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### transfer

```solidity
function transfer(address to, uint256 value) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external returns (bool)
```

### DOMAIN_SEPARATOR

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

### PERMIT_TYPEHASH

```solidity
function PERMIT_TYPEHASH() external pure returns (bytes32)
```

### nonces

```solidity
function nonces(address owner) external view returns (uint256)
```

### permit

```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
```

### Mint

```solidity
event Mint(address sender, uint256 amount0, uint256 amount1)
```

### Burn

```solidity
event Burn(address sender, uint256 amount0, uint256 amount1, address to)
```

### Swap

```solidity
event Swap(address sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address to)
```

### Sync

```solidity
event Sync(uint112 reserve0, uint112 reserve1)
```

### MINIMUM_LIQUIDITY

```solidity
function MINIMUM_LIQUIDITY() external pure returns (uint256)
```

### factory

```solidity
function factory() external view returns (address)
```

### token0

```solidity
function token0() external view returns (address)
```

### token1

```solidity
function token1() external view returns (address)
```

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

### kLast

```solidity
function kLast() external view returns (uint256)
```

### mint

```solidity
function mint(address to) external returns (uint256 liquidity)
```

### burn

```solidity
function burn(address to) external returns (uint256 amount0, uint256 amount1)
```

### swap

```solidity
function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data) external
```

### skim

```solidity
function skim(address to) external
```

### sync

```solidity
function sync() external
```

### initialize

```solidity
function initialize(address, address) external
```

## PancakeLibrary

### sortTokens

```solidity
function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1)
```

### pairFor

```solidity
function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair)
```

### getReserves

```solidity
function getReserves(address factory, address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB)
```

### quote

```solidity
function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB)
```

### getAmountOut

```solidity
function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256 amountOut)
```

### getAmountIn

```solidity
function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256 amountIn)
```

### getAmountsOut

```solidity
function getAmountsOut(address factory, uint256 amountIn, address[] path) internal view returns (uint256[] amounts)
```

### getAmountsIn

```solidity
function getAmountsIn(address factory, uint256 amountOut, address[] path) internal view returns (uint256[] amounts)
```

## IERC20

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### name

```solidity
function name() external view returns (string)
```

### symbol

```solidity
function symbol() external view returns (string)
```

### decimals

```solidity
function decimals() external view returns (uint8)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### transfer

```solidity
function transfer(address to, uint256 value) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external returns (bool)
```

## IWETH

### deposit

```solidity
function deposit() external payable
```

### transfer

```solidity
function transfer(address to, uint256 value) external returns (bool)
```

### withdraw

```solidity
function withdraw(uint256) external
```

## PancakeRouter

### factory

```solidity
address factory
```

### WETH

```solidity
address WETH
```

### ensure

```solidity
modifier ensure(uint256 deadline)
```

### constructor

```solidity
constructor(address _factory, address _WETH) public
```

### receive

```solidity
receive() external payable
```

### _addLiquidity

```solidity
function _addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin) internal virtual returns (uint256 amountA, uint256 amountB)
```

### addLiquidity

```solidity
function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external virtual returns (uint256 amountA, uint256 amountB, uint256 liquidity)
```

### addLiquidityETH

```solidity
function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable virtual returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
```

### removeLiquidity

```solidity
function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) public virtual returns (uint256 amountA, uint256 amountB)
```

### removeLiquidityETH

```solidity
function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) public virtual returns (uint256 amountToken, uint256 amountETH)
```

### removeLiquidityWithPermit

```solidity
function removeLiquidityWithPermit(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external virtual returns (uint256 amountA, uint256 amountB)
```

### removeLiquidityETHWithPermit

```solidity
function removeLiquidityETHWithPermit(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external virtual returns (uint256 amountToken, uint256 amountETH)
```

### removeLiquidityETHSupportingFeeOnTransferTokens

```solidity
function removeLiquidityETHSupportingFeeOnTransferTokens(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) public virtual returns (uint256 amountETH)
```

### removeLiquidityETHWithPermitSupportingFeeOnTransferTokens

```solidity
function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external virtual returns (uint256 amountETH)
```

### _swap

```solidity
function _swap(uint256[] amounts, address[] path, address _to) internal virtual
```

### swapExactTokensForTokens

```solidity
function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external virtual returns (uint256[] amounts)
```

### swapTokensForExactTokens

```solidity
function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) external virtual returns (uint256[] amounts)
```

### swapExactETHForTokens

```solidity
function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) external payable virtual returns (uint256[] amounts)
```

### swapTokensForExactETH

```solidity
function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) external virtual returns (uint256[] amounts)
```

### swapExactTokensForETH

```solidity
function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external virtual returns (uint256[] amounts)
```

### swapETHForExactTokens

```solidity
function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) external payable virtual returns (uint256[] amounts)
```

### _swapSupportingFeeOnTransferTokens

```solidity
function _swapSupportingFeeOnTransferTokens(address[] path, address _to) internal virtual
```

### swapExactTokensForTokensSupportingFeeOnTransferTokens

```solidity
function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external virtual
```

### swapExactETHForTokensSupportingFeeOnTransferTokens

```solidity
function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) external payable virtual
```

### swapExactTokensForETHSupportingFeeOnTransferTokens

```solidity
function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external virtual
```

### quote

```solidity
function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure virtual returns (uint256 amountB)
```

### getAmountOut

```solidity
function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure virtual returns (uint256 amountOut)
```

### getAmountIn

```solidity
function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public pure virtual returns (uint256 amountIn)
```

### getAmountsOut

```solidity
function getAmountsOut(uint256 amountIn, address[] path) public view virtual returns (uint256[] amounts)
```

### getAmountsIn

```solidity
function getAmountsIn(uint256 amountOut, address[] path) public view virtual returns (uint256[] amounts)
```


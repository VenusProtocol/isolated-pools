# Solidity API

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


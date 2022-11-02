# Solidity API

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


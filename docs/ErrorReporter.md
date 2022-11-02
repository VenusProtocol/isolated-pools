# Solidity API

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


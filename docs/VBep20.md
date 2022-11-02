# Solidity API

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


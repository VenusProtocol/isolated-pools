# Solidity API

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


# Solidity API

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


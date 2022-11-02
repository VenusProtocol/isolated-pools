# Solidity API

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


# Solidity API

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


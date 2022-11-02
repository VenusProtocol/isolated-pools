# Solidity API

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


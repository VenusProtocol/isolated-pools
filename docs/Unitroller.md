# Solidity API

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


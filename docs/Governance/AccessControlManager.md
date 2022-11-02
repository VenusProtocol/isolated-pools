# Solidity API

## AccessControlManager

_This contract is a wrapper of OpenZeppelin AccessControl
	extending it in a way to standartize access control
	within Venus Smart Contract Ecosystem_

### constructor

```solidity
constructor() public
```

### isAllowedToCall

```solidity
function isAllowedToCall(address caller, string functionSig) public view returns (bool)
```

Verifies if the given account can call a praticular contract's function

_Since the contract is calling itself this function, we can get contracts address with msg.sender_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller | address | contract for which call permissions will be checked |
| functionSig | string | signature e.g. "functionName(uint,bool)" |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | false if the user account cannot call the particular contract function |

### giveCallPermission

```solidity
function giveCallPermission(address contractAddress, string functionSig, address accountToPermit) public
```

Gives a function call permission to one single account

_this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
		May emit a {RoleGranted} event._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contractAddress | address | address of contract for which call permissions will be granted NOTE: if contractAddress is zero address, we give the account DEFAULT_ADMIN_ROLE,      meaning that this account can access the certain function on ANY contract managed by this ACL |
| functionSig | string | signature e.g. "functionName(uint,bool)" |
| accountToPermit | address | account that will be given access to the contract function |

### revokeCallPermission

```solidity
function revokeCallPermission(address contractAddress, string functionSig, address accountToRevoke) public
```

Revokes an account's permission to a particular function call

_this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
		May emit a {RoleRevoked} event._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contractAddress | address | address of contract for which call permissions will be revoked |
| functionSig | string | signature e.g. "functionName(uint,bool)" |
| accountToRevoke | address |  |


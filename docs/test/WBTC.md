# Solidity API

## ERC20Basic

_Simpler version of ERC20 interface
See https://github.com/ethereum/EIPs/issues/179_

### totalSupply

```solidity
function totalSupply() public view virtual returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address _who) public view virtual returns (uint256)
```

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

## SafeMath

_Math operations with safety checks that throw on error_

### mul

```solidity
function mul(uint256 _a, uint256 _b) internal pure returns (uint256 c)
```

_Multiplies two numbers, throws on overflow._

### div

```solidity
function div(uint256 _a, uint256 _b) internal pure returns (uint256)
```

_Integer division of two numbers, truncating the quotient._

### sub

```solidity
function sub(uint256 _a, uint256 _b) internal pure returns (uint256)
```

_Subtracts two numbers, throws on overflow (i.e. if subtrahend is greater than minuend)._

### add

```solidity
function add(uint256 _a, uint256 _b) internal pure returns (uint256 c)
```

_Adds two numbers, throws on overflow._

## BasicToken

_Basic version of StandardToken, with no allowances._

### balances

```solidity
mapping(address => uint256) balances
```

### totalSupply_

```solidity
uint256 totalSupply_
```

### totalSupply

```solidity
function totalSupply() public view returns (uint256)
```

_Total number of tokens in existence_

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

_Transfer token for a specified address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address to transfer to. |
| _value | uint256 | The amount to be transferred. |

### balanceOf

```solidity
function balanceOf(address _owner) public view returns (uint256)
```

_Gets the balance of the specified address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address to query the the balance of. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | An uint256 representing the amount owned by the passed address. |

## ERC20

_see https://github.com/ethereum/EIPs/issues/20_

### allowance

```solidity
function allowance(address _owner, address _spender) public view virtual returns (uint256)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

## StandardToken

_Implementation of the basic standard token.
https://github.com/ethereum/EIPs/issues/20
Based on code by FirstBlood: https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol_

### allowed

```solidity
mapping(address => mapping(address => uint256)) allowed
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

_Transfer tokens from one address to another_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | address The address which you want to send tokens from |
| _to | address | address The address which you want to transfer to |
| _value | uint256 | uint256 the amount of tokens to be transferred |

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

_Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
Beware that changing an allowance with this method brings the risk that someone may use both the old
and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _value | uint256 | The amount of tokens to be spent. |

### allowance

```solidity
function allowance(address _owner, address _spender) public view returns (uint256)
```

_Function to check the amount of tokens that an owner allowed to a spender._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | address The address which owns the funds. |
| _spender | address | address The address which will spend the funds. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A uint256 specifying the amount of tokens still available for the spender. |

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public virtual returns (bool)
```

_Increase the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To increment
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _addedValue | uint256 | The amount of tokens to increase the allowance by. |

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public virtual returns (bool)
```

_Decrease the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To decrement
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _subtractedValue | uint256 | The amount of tokens to decrease the allowance by. |

## DetailedERC20

_The decimals are only for visualization purposes.
All the operations are done using the smallest and indivisible token unit,
just as on Ethereum all the operations are done in wei._

### name

```solidity
string name
```

### symbol

```solidity
string symbol
```

### decimals

```solidity
uint8 decimals
```

### constructor

```solidity
constructor(string _name, string _symbol, uint8 _decimals) internal
```

## Ownable

_The Ownable contract has an owner address, and provides basic authorization control
functions, this simplifies the implementation of "user permissions"._

### owner

```solidity
address owner
```

### OwnershipRenounced

```solidity
event OwnershipRenounced(address previousOwner)
```

### OwnershipTransferred

```solidity
event OwnershipTransferred(address previousOwner, address newOwner)
```

### constructor

```solidity
constructor() public
```

_The Ownable constructor sets the original `owner` of the contract to the sender
account._

### onlyOwner

```solidity
modifier onlyOwner()
```

_Throws if called by any account other than the owner._

### renounceOwnership

```solidity
function renounceOwnership() public virtual
```

Renouncing to ownership will leave the contract without an owner.
It will not be possible to call the functions with the `onlyOwner`
modifier anymore.

_Allows the current owner to relinquish control of the contract._

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public virtual
```

_Allows the current owner to transfer control of the contract to a newOwner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newOwner | address | The address to transfer ownership to. |

### _transferOwnership

```solidity
function _transferOwnership(address _newOwner) internal
```

_Transfers control of the contract to a newOwner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newOwner | address | The address to transfer ownership to. |

## MintableToken

_Simple ERC20 Token example, with mintable token creation
Based on code by TokenMarketNet: https://github.com/TokenMarketNet/ico/blob/master/contracts/MintableToken.sol_

### Mint

```solidity
event Mint(address to, uint256 amount)
```

### MintFinished

```solidity
event MintFinished()
```

### mintingFinished

```solidity
bool mintingFinished
```

### canMint

```solidity
modifier canMint()
```

### hasMintPermission

```solidity
modifier hasMintPermission()
```

### mint

```solidity
function mint(address _to, uint256 _amount) public returns (bool)
```

_Function to mint tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The address that will receive the minted tokens. |
| _amount | uint256 | The amount of tokens to mint. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean that indicates if the operation was successful. |

### finishMinting

```solidity
function finishMinting() public virtual returns (bool)
```

_Function to stop minting new tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the operation was successful. |

## BurnableToken

_Token that can be irreversibly burned (destroyed)._

### Burn

```solidity
event Burn(address burner, uint256 value)
```

### burn

```solidity
function burn(uint256 _value) public virtual
```

_Burns a specific amount of tokens._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _value | uint256 | The amount of token to be burned. |

### _burn

```solidity
function _burn(address _who, uint256 _value) internal
```

## Pausable

_Base contract which allows children to implement an emergency stop mechanism._

### Pause

```solidity
event Pause()
```

### Unpause

```solidity
event Unpause()
```

### paused

```solidity
bool paused
```

### whenNotPaused

```solidity
modifier whenNotPaused()
```

_Modifier to make a function callable only when the contract is not paused._

### whenPaused

```solidity
modifier whenPaused()
```

_Modifier to make a function callable only when the contract is paused._

### pause

```solidity
function pause() public
```

_called by the owner to pause, triggers stopped state_

### unpause

```solidity
function unpause() public
```

_called by the owner to unpause, returns to normal state_

## PausableToken

_StandardToken modified with pausable transfers._

### transfer

```solidity
function transfer(address _to, uint256 _value) public virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public virtual returns (bool)
```

_Transfer tokens from one address to another_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | address The address which you want to send tokens from |
| _to | address | address The address which you want to transfer to |
| _value | uint256 | uint256 the amount of tokens to be transferred |

### approve

```solidity
function approve(address _spender, uint256 _value) public virtual returns (bool)
```

_Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
Beware that changing an allowance with this method brings the risk that someone may use both the old
and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _value | uint256 | The amount of tokens to be spent. |

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public virtual returns (bool success)
```

_Increase the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To increment
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _addedValue | uint256 | The amount of tokens to increase the allowance by. |

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public virtual returns (bool success)
```

_Decrease the amount of tokens that an owner allowed to a spender.
approve should be called when allowed[_spender] == 0. To decrement
allowed value is better to use this function to avoid 2 calls (and wait until
the first transaction is mined)
From MonolithDAO Token.sol_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _spender | address | The address which will spend the funds. |
| _subtractedValue | uint256 | The amount of tokens to decrease the allowance by. |

## Claimable

_Extension for the Ownable contract, where the ownership needs to be claimed.
This allows the new owner to accept the transfer._

### pendingOwner

```solidity
address pendingOwner
```

### onlyPendingOwner

```solidity
modifier onlyPendingOwner()
```

_Modifier throws if called by any account other than the pendingOwner._

### transferOwnership

```solidity
function transferOwnership(address newOwner) public virtual
```

_Allows the current owner to set the pendingOwner address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newOwner | address | The address to transfer ownership to. |

### claimOwnership

```solidity
function claimOwnership() public
```

_Allows the pendingOwner address to finalize the transfer._

## SafeERC20

_Wrappers around ERC20 operations that throw on failure.
To use this library you can add a `using SafeERC20 for ERC20;` statement to your contract,
which allows you to call the safe operations as `token.safeTransfer(...)`, etc._

### safeTransfer

```solidity
function safeTransfer(contract ERC20Basic _token, address _to, uint256 _value) internal
```

### safeTransferFrom

```solidity
function safeTransferFrom(contract ERC20 _token, address _from, address _to, uint256 _value) internal
```

### safeApprove

```solidity
function safeApprove(contract ERC20 _token, address _spender, uint256 _value) internal
```

## CanReclaimToken

_This allow a contract to recover any ERC20 token received in a contract by transferring the balance to the contract owner.
This will prevent any accidental loss of tokens._

### reclaimToken

```solidity
function reclaimToken(contract ERC20Basic _token) external
```

_Reclaim all ERC20Basic compatible tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | contract ERC20Basic | ERC20Basic The address of the token contract |

## OwnableContract

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public virtual
```

## WBTVToken

### approve

```solidity
function approve(address _spender, uint256 _value) public returns (bool)
```

### burn

```solidity
function burn(uint256 value) public
```

### finishMinting

```solidity
function finishMinting() public returns (bool)
```

_Function to stop minting new tokens._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the operation was successful. |

### renounceOwnership

```solidity
function renounceOwnership() public
```

Renouncing to ownership will leave the contract without an owner.
It will not be possible to call the functions with the `onlyOwner`
modifier anymore.

_Allows the current owner to relinquish control of the contract._

### transferOwnership

```solidity
function transferOwnership(address _newOwner) public
```

### increaseApproval

```solidity
function increaseApproval(address _spender, uint256 _addedValue) public returns (bool)
```

### decreaseApproval

```solidity
function decreaseApproval(address _spender, uint256 _subtractedValue) public returns (bool)
```

### transfer

```solidity
function transfer(address _to, uint256 _value) public returns (bool)
```

### transferFrom

```solidity
function transferFrom(address _from, address _to, uint256 _value) public returns (bool)
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

_Arbitrarily adds tokens to any account_


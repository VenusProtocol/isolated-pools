# Solidity API

## ERC20Base

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### balanceOf

```solidity
function balanceOf(address who) external view returns (uint256)
```

## ERC20

### transfer

```solidity
function transfer(address to, uint256 value) external virtual returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external virtual returns (bool)
```

## ERC20NS

### transfer

```solidity
function transfer(address to, uint256 value) external virtual
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external virtual
```

## StandardToken

_Implementation of the basic standard token.
 See https://github.com/ethereum/EIPs/issues/20_

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

### totalSupply

```solidity
uint256 totalSupply
```

### allowance

```solidity
mapping(address => mapping(address => uint256)) allowance
```

### balanceOf

```solidity
mapping(address => uint256) balanceOf
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

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
function approve(address _spender, uint256 amount) external virtual returns (bool)
```

## NonStandardToken

_Version of ERC20 with no return values for `transfer` and `transferFrom`
 See https://medium.com/coinmonks/missing-return-value-bug-at-least-130-tokens-affected-d67bf08521ca_

### name

```solidity
string name
```

### decimals

```solidity
uint8 decimals
```

### symbol

```solidity
string symbol
```

### totalSupply

```solidity
uint256 totalSupply
```

### allowance

```solidity
mapping(address => mapping(address => uint256)) allowance
```

### balanceOf

```solidity
mapping(address => uint256) balanceOf
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external
```

### approve

```solidity
function approve(address _spender, uint256 amount) external returns (bool)
```

## ERC20Harness

### failTransferFromAddresses

```solidity
mapping(address => bool) failTransferFromAddresses
```

### failTransferToAddresses

```solidity
mapping(address => bool) failTransferToAddresses
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### harnessSetFailTransferFromAddress

```solidity
function harnessSetFailTransferFromAddress(address src, bool _fail) public
```

### harnessSetFailTransferToAddress

```solidity
function harnessSetFailTransferToAddress(address dst, bool _fail) public
```

### harnessSetBalance

```solidity
function harnessSetBalance(address _account, uint256 _amount) public
```

### transfer

```solidity
function transfer(address dst, uint256 amount) external returns (bool success)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) external returns (bool success)
```


# Solidity API

## FaucetToken

A simple test token that lets anyone get more of it.

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

## FaucetNonStandardToken

A simple test token that lets anyone get more of it.

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol) public
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

## FaucetTokenReEntrantHarness

A test token that is malicious and tries to re-enter callers

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

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

### totalSupply_

```solidity
uint256 totalSupply_
```

### allowance_

```solidity
mapping(address => mapping(address => uint256)) allowance_
```

### balanceOf_

```solidity
mapping(address => uint256) balanceOf_
```

### reEntryCallData

```solidity
bytes reEntryCallData
```

### reEntryFun

```solidity
string reEntryFun
```

### constructor

```solidity
constructor(uint256 _initialAmount, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, bytes _reEntryCallData, string _reEntryFun) public
```

### reEnter

```solidity
modifier reEnter(string funName)
```

### compareStrings

```solidity
function compareStrings(string a, string b) internal pure returns (bool)
```

### allocateTo

```solidity
function allocateTo(address _owner, uint256 value) public
```

### totalSupply

```solidity
function totalSupply() public returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) public returns (uint256 remaining)
```

### approve

```solidity
function approve(address spender, uint256 amount) public returns (bool success)
```

### balanceOf

```solidity
function balanceOf(address owner) public returns (uint256 balance)
```

### transfer

```solidity
function transfer(address dst, uint256 amount) public returns (bool success)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amount) public returns (bool success)
```

### _approve

```solidity
function _approve(address owner, address spender, uint256 amount) internal
```

### _transfer

```solidity
function _transfer(address src, address dst, uint256 amount) internal
```


# Solidity API

## RewardsDistributor

### RewardToken

```solidity
struct RewardToken {
  uint224 index;
  uint32 block;
}
```

### rewardTokenSupplyState

```solidity
mapping(address => struct RewardsDistributor.RewardToken) rewardTokenSupplyState
```

The REWARD TOKEN market supply state for each market

### rewardTokenSupplierIndex

```solidity
mapping(address => mapping(address => uint256)) rewardTokenSupplierIndex
```

The REWARD TOKEN borrow index for each market for each supplier as of the last time they accrued REWARD TOKEN

### rewardTokenInitialIndex

```solidity
uint224 rewardTokenInitialIndex
```

The initial REWARD TOKEN index for a market

### rewardTokenAccured

```solidity
mapping(address => uint256) rewardTokenAccured
```

The REWARD TOKEN accrued but not yet transferred to each user

### rewardTokenBorrowSpeeds

```solidity
mapping(address => uint256) rewardTokenBorrowSpeeds
```

The rate at which rewardToken is distributed to the corresponding borrow market (per block)

### rewardTokenSupplySpeeds

```solidity
mapping(address => uint256) rewardTokenSupplySpeeds
```

The rate at which rewardToken is distributed to the corresponding supply market (per block)

### rewardTokenBorrowState

```solidity
mapping(address => struct RewardsDistributor.RewardToken) rewardTokenBorrowState
```

The REWARD TOKEN market borrow state for each market

### rewardTokenContributorSpeeds

```solidity
mapping(address => uint256) rewardTokenContributorSpeeds
```

The portion of REWARD TOKEN that each contributor receives per block

### lastContributorBlock

```solidity
mapping(address => uint256) lastContributorBlock
```

Last block at which a contributor's REWARD TOKEN rewards have been allocated

### DistributedSupplierRewardToken

```solidity
event DistributedSupplierRewardToken(contract VToken vToken, address supplier, uint256 rewardTokenDelta, uint256 rewardTokenSupplyIndex)
```

Emitted when REWARD TOKEN is distributed to a supplier

### DistributedBorrowerRewardToken

```solidity
event DistributedBorrowerRewardToken(contract VToken vToken, address borrower, uint256 rewardTokenDelta, uint256 rewardTokenBorrowIndex)
```

Emitted when REWARD TOKEN is distributed to a borrower

### RewardTokenSupplySpeedUpdated

```solidity
event RewardTokenSupplySpeedUpdated(contract VToken vToken, uint256 newSpeed)
```

Emitted when a new supply-side REWARD TOKEN speed is calculated for a market

### RewardTokenBorrowSpeedUpdated

```solidity
event RewardTokenBorrowSpeedUpdated(contract VToken vToken, uint256 newSpeed)
```

Emitted when a new borrow-side REWARD TOKEN speed is calculated for a market

### RewardTokenGranted

```solidity
event RewardTokenGranted(address recipient, uint256 amount)
```

Emitted when REWARD TOKEN is granted by admin

### ContributorRewardTokenSpeedUpdated

```solidity
event ContributorRewardTokenSpeedUpdated(address contributor, uint256 newSpeed)
```

Emitted when a new REWARD TOKEN speed is set for a contributor

### rewardTokenBorrowerIndex

```solidity
mapping(address => mapping(address => uint256)) rewardTokenBorrowerIndex
```

The REWARD TOKEN borrow index for each market for each borrower as of the last time they accrued REWARD TOKEN

### comptroller

```solidity
contract Comptroller comptroller
```

### rewardToken

```solidity
contract IERC20 rewardToken
```

### initialize

```solidity
function initialize(contract Comptroller _comptroller, contract IERC20 _rewardToken) public
```

_Initializes the deployer to owner._

### initializeMarket

```solidity
function initializeMarket(address vToken) external
```

### _setRewardTokenSpeeds

```solidity
function _setRewardTokenSpeeds(contract VToken[] vTokens, uint256[] supplySpeeds, uint256[] borrowSpeeds) public
```

Set REWARD TOKEN borrow and supply speeds for the specified markets.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vTokens | contract VToken[] | The markets whose REWARD TOKEN speed to update. |
| supplySpeeds | uint256[] | New supply-side REWARD TOKEN speed for the corresponding market. |
| borrowSpeeds | uint256[] | New borrow-side REWARD TOKEN speed for the corresponding market. |

### _setContributorRewardTokenSpeed

```solidity
function _setContributorRewardTokenSpeed(address contributor, uint256 rewardTokenSpeed) public
```

Set REWARD TOKEN speed for a single contributor

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contributor | address | The contributor whose REWARD TOKEN speed to update |
| rewardTokenSpeed | uint256 | New REWARD TOKEN speed for contributor |

### updateContributorRewards

```solidity
function updateContributorRewards(address contributor) public
```

Calculate additional accrued REWARD TOKEN for a contributor since last accrual

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contributor | address | The address to calculate contributor rewards for |

### setRewardTokenSpeedInternal

```solidity
function setRewardTokenSpeedInternal(contract VToken vToken, uint256 supplySpeed, uint256 borrowSpeed) internal
```

Set REWARD TOKEN speed for a single market

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | contract VToken | The market whose REWARD TOKEN speed to update |
| supplySpeed | uint256 | New supply-side REWARD TOKEN speed for market |
| borrowSpeed | uint256 | New borrow-side REWARD TOKEN speed for market |

### distributeSupplierRewardToken

```solidity
function distributeSupplierRewardToken(address vToken, address supplier) public
```

### _distributeSupplierRewardToken

```solidity
function _distributeSupplierRewardToken(address vToken, address supplier) internal
```

### distributeBorrowerRewardToken

```solidity
function distributeBorrowerRewardToken(address vToken, address borrower, struct ExponentialNoError.Exp marketBorrowIndex) external
```

### _distributeBorrowerRewardToken

```solidity
function _distributeBorrowerRewardToken(address vToken, address borrower, struct ExponentialNoError.Exp marketBorrowIndex) internal
```

Calculate REWARD TOKEN accrued by a borrower and possibly transfer it to them

_Borrowers will not begin to accrue until after the first interaction with the protocol._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market in which the borrower is interacting |
| borrower | address | The address of the borrower to distribute REWARD TOKEN to |
| marketBorrowIndex | struct ExponentialNoError.Exp |  |

### grantRewardTokenInternal

```solidity
function grantRewardTokenInternal(address user, uint256 amount) internal returns (uint256)
```

Transfer REWARD TOKEN to the user

_Note: If there is not enough REWARD TOKEN, we do not perform the transfer all._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | The address of the user to transfer REWARD TOKEN to |
| amount | uint256 | The amount of REWARD TOKEN to (possibly) transfer |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of REWARD TOKEN which was NOT transferred to the user |

### updateRewardTokenSupplyIndex

```solidity
function updateRewardTokenSupplyIndex(address vToken) external
```

### _updateRewardTokenSupplyIndex

```solidity
function _updateRewardTokenSupplyIndex(address vToken) internal
```

Accrue REWARD TOKEN to the market by updating the supply index

_Index is a cumulative sum of the REWARD TOKEN per vToken accrued._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market whose supply index to update |

### updateRewardTokenBorrowIndex

```solidity
function updateRewardTokenBorrowIndex(address vToken, struct ExponentialNoError.Exp marketBorrowIndex) external
```

### _updateRewardTokenBorrowIndex

```solidity
function _updateRewardTokenBorrowIndex(address vToken, struct ExponentialNoError.Exp marketBorrowIndex) internal
```

Accrue REWARD TOKEN to the market by updating the borrow index

_Index is a cumulative sum of the REWARD TOKEN per vToken accrued._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vToken | address | The market whose borrow index to update |
| marketBorrowIndex | struct ExponentialNoError.Exp |  |

### _grantRewardToken

```solidity
function _grantRewardToken(address recipient, uint256 amount) external
```

Transfer REWARD TOKEN to the recipient

_Note: If there is not enough REWARD TOKEN, we do not perform the transfer all._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address of the recipient to transfer REWARD TOKEN to |
| amount | uint256 | The amount of REWARD TOKEN to (possibly) transfer |

### claimRewardToken

```solidity
function claimRewardToken(address[] holders, contract VToken[] vTokens, bool borrowers, bool suppliers) internal
```

Claim all rewardToken accrued by the holders

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holders | address[] | The addresses to claim REWARD TOKEN for |
| vTokens | contract VToken[] | The list of markets to claim REWARD TOKEN in |
| borrowers | bool | Whether or not to claim REWARD TOKEN earned by borrowing |
| suppliers | bool | Whether or not to claim REWARD TOKEN earned by supplying |

### claimRewardToken

```solidity
function claimRewardToken(address holder) public
```

Claim all the rewardToken accrued by holder in all markets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holder | address | The address to claim REWARD TOKEN for |

### claimRewardToken

```solidity
function claimRewardToken(address holder, contract VToken[] vTokens) public
```

Claim all the rewardToken accrued by holder in the specified markets

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| holder | address | The address to claim REWARD TOKEN for |
| vTokens | contract VToken[] | The list of markets to claim REWARD TOKEN in |

### getBlockNumber

```solidity
function getBlockNumber() public view virtual returns (uint256)
```

### onlyComptroller

```solidity
modifier onlyComptroller()
```


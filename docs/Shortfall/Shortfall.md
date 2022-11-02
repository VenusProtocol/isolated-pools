# Solidity API

## Shortfall

### AuctionType

```solidity
enum AuctionType {
  LARGE_POOL_DEBT,
  LARGE_RISK_FUND
}
```

### AuctionStatus

```solidity
enum AuctionStatus {
  NOT_STARTED,
  STARTED,
  ENDED
}
```

### Auction

```solidity
struct Auction {
  uint256 startBlock;
  enum Shortfall.AuctionType auctionType;
  enum Shortfall.AuctionStatus status;
  contract VToken[] markets;
  uint256 seizedRiskFund;
  address highestBidder;
  uint256 highestBidBps;
  uint256 highestBidBlock;
  uint256 startBidBps;
  mapping(contract VToken => uint256) marketDebt;
}
```

### AuctionStarted

```solidity
event AuctionStarted(address comptroller, uint256 startBlock, enum Shortfall.AuctionType auctionType, contract VToken[] markets, uint256[] marketsDebt, uint256 seizedRiskFund, uint256 startBidBps)
```

Emitted when a auction starts

### BidPlaced

```solidity
event BidPlaced(address comptroller, uint256 bidBps, address bidder)
```

Emitted when a bid is placed

### AuctionClosed

```solidity
event AuctionClosed(address comptroller, address highestBidder, uint256 highestBidBps, uint256 seizedRiskFind, contract VToken[] markets, uint256[] marketDebt)
```

Emitted when a auction is completed

### AuctionRestarted

```solidity
event AuctionRestarted(address comptroller)
```

Emitted when a auction is restarted

### poolRegistry

```solidity
address poolRegistry
```

Pool registry address

### riskFund

```solidity
contract IRiskFund riskFund
```

Risk fund address

### minimumPoolBadDebt

```solidity
uint256 minimumPoolBadDebt
```

Minimum USD debt in pool for shortfall to trigger

### incentiveBps

```solidity
uint256 incentiveBps
```

Incentive to auction participants.

### MAX_BPS

```solidity
uint256 MAX_BPS
```

Max basis points i.e., 100%

### nextBidderBlockLimit

```solidity
uint256 nextBidderBlockLimit
```

Time to wait for next bidder. wait for 10 blocks

### waitForFirstBidder

```solidity
uint256 waitForFirstBidder
```

Time to wait for first bidder. wait for 100 blocks

### BUSD

```solidity
contract IERC20 BUSD
```

BUSD contract address

### auctions

```solidity
mapping(address => struct Shortfall.Auction) auctions
```

Auctions for each pool

### initialize

```solidity
function initialize(contract IERC20 _BUSD, contract IRiskFund _riskFund, uint256 _minimumPoolBadDebt) public
```

Initalize the shortfall contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _BUSD | contract IERC20 |  |
| _riskFund | contract IRiskFund |  |
| _minimumPoolBadDebt | uint256 | Minimum bad debt in BUSD for a pool to start auction |

### updateMinimumPoolBadDebt

```solidity
function updateMinimumPoolBadDebt(uint256 _minimumPoolBadDebt) public
```

Update minimum pool bad debt to start auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minimumPoolBadDebt | uint256 | Minimum bad debt in BUSD for a pool to start auction |

### setPoolRegistry

```solidity
function setPoolRegistry(address _poolRegistry) public
```

After Pool Registry is deployed we need to set the pool registry address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolRegistry | address | Address of pool registry contract |

### onlyPoolRegistry

```solidity
modifier onlyPoolRegistry()
```

Modifier to allow only pool registry to call functions

### startAuction

```solidity
function startAuction(address comptroller) public
```

Start a auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |

### placeBid

```solidity
function placeBid(address comptroller, uint256 bidBps) external
```

Place a bid in a auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |
| bidBps | uint256 | The bid m% or n% |

### closeAuction

```solidity
function closeAuction(address comptroller) external
```

Close an auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | comptroller of the pool |

### restartAuction

```solidity
function restartAuction(address comptroller) external
```

Restart an auction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| comptroller | address | ID of the pool |


# Solidity API

## MockPyth

### priceFeeds

```solidity
mapping(bytes32 => struct PythStructs.PriceFeed) priceFeeds
```

### queryPriceFeed

```solidity
function queryPriceFeed(bytes32 id) public view returns (struct PythStructs.PriceFeed priceFeed)
```

### updatePriceFeedsHarness

```solidity
function updatePriceFeedsHarness(struct PythStructs.PriceFeed[] feeds) external
```

### getLatestAvailablePriceWithinDuration

```solidity
function getLatestAvailablePriceWithinDuration(bytes32 id, uint64 duration) external view returns (struct PythStructs.Price price)
```

Returns the latest price as long as it was updated within `duration` seconds of the current time.

_This function is a sanity-checked version of `getLatestAvailablePriceUnchecked` which is useful in
applications that require a sufficiently-recent price. Reverts if the price wasn't updated sufficiently
recently._

### _diff

```solidity
function _diff(uint256 x, uint256 y) internal pure returns (uint256)
```

### updatePriceFeedsIfNecessary

```solidity
function updatePriceFeedsIfNecessary(bytes[] updateData, bytes32[] priceIds, uint64[] publishTimes) external payable
```

Wrapper around updatePriceFeeds that rejects fast if a price update is not necessary. A price update is
necessary if the current on-chain publishTime is older than the given publishTime. It relies solely on the
given `publishTimes` for the price feeds and does not read the actual price update publish time within `updateData`.

This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.

`priceIds` and `publishTimes` are two arrays with the same size that correspond to senders known publishTime
of each priceId when calling this method. If all of price feeds within `priceIds` have updated and have
a newer or equal publish time than the given publish time, it will reject the transaction to save gas.
Otherwise, it calls updatePriceFeeds method to update the prices.

_Reverts if update is not needed or the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |
| priceIds | bytes32[] | Array of price ids. |
| publishTimes | uint64[] | Array of publishTimes. `publishTimes[i]` corresponds to known `publishTime` of `priceIds[i]` |

### getUpdateFee

```solidity
function getUpdateFee(uint256 updateDataSize) external pure returns (uint256 feeAmount)
```

Returns the required fee to update an array of price updates.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateDataSize | uint256 | Number of price updates. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| feeAmount | uint256 | The required fee in Wei. |

### updatePriceFeeds

```solidity
function updatePriceFeeds(bytes[] updateData) external payable
```

Update price feeds with given update messages.
This method requires the caller to pay a fee in wei; the required fee can be computed by calling
`getUpdateFee` with the length of the `updateData` array.
Prices will be updated if they are more recent than the current stored prices.
The call will succeed even if the update is not the most recent.

_Reverts if the transferred fee is not sufficient or the updateData is invalid._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| updateData | bytes[] | Array of price update data. |

### getCurrentPrice

```solidity
function getCurrentPrice(bytes32 id) external pure returns (struct PythStructs.Price price)
```

Returns the current price and confidence interval.

_Reverts if the current price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getEmaPrice

```solidity
function getEmaPrice(bytes32 id) external pure returns (struct PythStructs.Price price)
```

Returns the exponential moving average price and confidence interval.

_Reverts if the current exponential moving average price is not available._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | The Pyth Price Feed ID of which to fetch the current price and confidence interval. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |

### getLatestAvailablePriceUnsafe

```solidity
function getLatestAvailablePriceUnsafe(bytes32 id) external pure returns (struct PythStructs.Price price, uint64 publishTime)
```

Returns the latest available price, along with the timestamp when it was generated.

_This function returns the same price as `getCurrentPrice` in the case where a price was available
at the time this `PriceFeed` was published (`publish_time`). However, if a price was not available
at that time, this function returns the price from the latest time at which the price was available.

The returned price can be from arbitrarily far in the past; this function makes no guarantees that
the returned price is recent or useful for any particular application.

Users of this function should check the returned timestamp to ensure that the returned price is
sufficiently recent for their application. If you are considering using this function, it may be
safer / easier to use either `getCurrentPrice` or `getLatestAvailablePriceWithinDuration`._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | struct PythStructs.Price | - please read the documentation of PythStructs.Price to understand how to use this safely. |
| publishTime | uint64 | - the UNIX timestamp of when this price was computed. |


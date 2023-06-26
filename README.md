# Overview

[Venus](https://app.venus.io) is a decentralized finance (DeFi) algorithmic money market protocol on BNB Chain.

Decentralized lending pools are very similar to traditional lending services offered by banks, except that they are offered by P2P decentralized platforms. Users can leverage assets by borrowing and lending assets listed in a pool. Lending pools help crypto holders earn a substantial income through interest paid on their supplied assets and access assets they don't currently own without selling any of their portfolio.

The first generation of lending pools, including the Venus Core Pool, aggregate a diverse group of assets for users to interact with. This introduces significant risk to the entire protocol's liquidity if any token included in the pool experiences extreme volatility. It is difficult to list new tokens due to the lack of specific risk parameters. The Venus Core Pool also lacks risk analysis parameters for the pool's shortfall which would give users a view into the current market stability.

**Venus Isolated Pools** is designed to tackle all of the shortcomings that its previous versions had. Isolated Pools is composed of independent collections of assets with custom risk management configurations, giving users broader opportunities to manage risk, allocate their assets in the protocol and earn yield. Multiple isolated pools also reduce the impact of any potential asset failure affecting the liquidity of the protocol. Rewards can be customized per market in each pool to provide the best incentives to users.

## Contract Summaries

### PoolRegistry

The Isolated Pools architecture centers around the `PoolRegistry` contract. The `PoolRegistry` maintains a directory of isolated lending pools and can perform actions like registering new pools, adding new markets to existing pools, setting and updating the pool's required metadata, and providing the getter methods to get information on the pools.

![image](https://user-images.githubusercontent.com/47150934/236290058-6b14a499-7afe-46e4-bca6-d72e3db8a28e.png)

### Risk Fund

The risk fund concerns three main contracts:

- ProtocolShareReserve
- RiskFund
- ReserveHelpers

The three contracts are designed to hold fees that have been accumulated from liquidations and spread, send a portion to the protocol treasury, and send the remainder to the RiskFund. When `reduceReserves()` is called in a `vToken` contract, all accumulated liquidation fees and spread are sent to the `ProtocolShareReserve` contract. Once funds are transferred to the `ProtocolShareReserve`, anyone can call `releaseFunds()` to transfer 70% to the `protocolIncome` address and the other 30% to the `riskFund` contract. Once in the `riskFund` contract, the tokens can be swapped via `PancakeSwap` pairs to the convertible base asset, which can be updated by the owner of the contract. When tokens are converted to the `convertibleBaseAsset`, they can be used in the `Shortfall` contract to auction off the pool's bad debt. Note that just as each pool is isolated, the risk funds for each pool are also isolated: only the risk fund for the same pool can be used when auctioning off the bad debt of the pool.

### Shortfall

`Shortfall` is an auction contract designed to auction off the `convertibleBaseAsset` accumulated in `RiskFund`. The `convertibleBaseAsset` is auctioned in exchange for users paying off the pool's bad debt. An auction can be started by anyone once a pool's bad debt has reached a minimum value. This value is set and can be changed by the authorized accounts. If the pool’s bad debt exceeds the risk fund plus a 10% incentive, then the auction winner is determined by who will pay off the largest percentage of the pool's bad debt. The auction winner then exchanges for the entire risk fund. Otherwise, if the risk fund covers the pool's bad debt plus the 10% incentive, then the auction winner is determined by who will take the smallest percentage of the risk fund in exchange for paying off all the pool's bad debt.

### Rewards

Users can receive additional rewards through a `RewardsDistributor`. Each `RewardsDistributor` proxy is initialized with a specific reward token and `Comptroller`, which can then distribute the reward token to users that supply or borrow in the associated pool. Authorized users can set the reward token borrow and supply speeds for each market in the pool. This sets a fixed amount of reward token to be released each block for borrowers and suppliers, which is distributed based on a user’s percentage of the borrows or supplies respectively. The owner can also set up reward distributions to contributor addresses (distinct from suppliers and borrowers) by setting their contributor reward token speed, which similarly allocates a fixed amount of reward token per block.

The owner has the ability to transfer any amount of reward tokens held by the contract to any other address. Rewards are not distributed automatically and must be claimed by a user calling `claimRewardToken()`. Users should be aware that it is up to the owner and other centralized entities to ensure that the `RewardsDistributor` holds enough tokens to distribute the accumulated rewards of users and contributors.

### PoolLens

The `PoolLens` contract is designed to retrieve important information for each registered pool. A list of essential information for all pools within the lending protocol can be acquired through the function `getAllPools()`. Additionally, the following records can be looked up for specific pools and markets:

- the vToken balance of a given user;
- the pool data (oracle address, associated vToken, liquidation incentive, etc) of a pool via its associated comptroller address;
- the vToken address in a pool for a given asset;
- a list of all pools that support an asset;
- the underlying asset price of a vToken;
- the metadata (exchange/borrow/supply rate, total supply, collateral factor, etc) of any vToken.

### Rate Models

These contracts help algorithmically determine the interest rate based on supply and demand. If the demand is low, then the interest rates should be lower. In times of high utilization, the interest rates should go up. As such, the lending market borrowers will earn interest equal to the borrowing rate multiplied by utilization ratio.

### VToken

Each asset that is supported by a pool is integrated through an instance of the `VToken` contract. As outlined in the protocol overview, each isolated pool creates its own `vToken` corresponding to an asset. Within a given pool, each included `vToken` is referred to as a market of the pool. The main actions a user regularly interacts with in a market are:

- mint/redeem of vTokens;
- transfer of vTokens;
- borrow/repay a loan on an underlying asset;
- liquidate a borrow or liquidate/heal an account.

A user supplies the underlying asset to a pool by minting `vTokens`, where the corresponding `vToken` amount is determined by the `exchangeRate`. The `exchangeRate` will change over time, dependent on a number of factors, some of which accrue interest. Additionally, once users have minted `vToken` in a pool, they can borrow any asset in the isolated pool by using their `vToken` as collateral. In order to borrow an asset or use a `vToken` as collateral, the user must be entered into each corresponding market (else, the `vToken` will not be considered collateral for a borrow). Note that a user may borrow up to a portion of their collateral determined by the market’s collateral factor. However, if their borrowed amount exceeds an amount calculated using the market’s corresponding liquidation threshold, the borrow is eligible for liquidation. When a user repays a borrow, they must also pay off interest accrued on the borrow.

The Venus protocol includes unique mechanisms for healing an account and liquidating an account. These actions are performed in the `Comptroller` and consider all borrows and collateral for which a given account is entered within a market. These functions may only be called on an account with a total collateral amount that is no larger than a universal `minLiquidatableCollateral` value, which is used for all markets within a `Comptroller`. Both functions settle all of an account’s borrows, but `healAccount()` may add `badDebt` to a vToken. For more detail, see the description of `healAccount()` and `liquidateAccount()` in the `Comptroller` summary section below.

### Comptroller

The `Comptroller` is designed to provide checks for all minting, redeeming, transferring, borrowing, lending, repaying, liquidating, and seizing done by the `vToken` contract. Each pool has one `Comptroller` checking these interactions across markets. When a user interacts with a given market by one of these main actions, a call is made to a corresponding hook in the associated `Comptroller`, which either allows or reverts the transaction. These hooks also update supply and borrow rewards as they are called. The comptroller holds the logic for assessing liquidity snapshots of an account via the collateral factor and liquidation threshold. This check determines the collateral needed for a borrow, as well as how much of a borrow may be liquidated. A user may borrow a portion of their collateral with the maximum amount determined by the markets collateral factor. However, if their borrowed amount exceeds an amount calculated using the market’s corresponding liquidation threshold, the borrow is eligible for liquidation.

The `Comptroller` also includes two functions `liquidateAccount()` and `healAccount()`, which are meant to handle accounts that do not exceed the `minLiquidatableCollateral` for the `Comptroller`:

- `healAccount()`: This function is called to seize all of a given user’s collateral, requiring the `msg.sender` repay a certain percentage of the debt calculated by `collateral/(borrows*liquidationIncentive)`. The function can only be called if the calculated percentage does not exceed 100%, because otherwise no `badDebt` would be created and `liquidateAccount()` should be used instead. The difference in the actual amount of debt and debt paid off is recorded as `badDebt` for each market, which can then be auctioned off for the risk reserves of the associated pool.

- `liquidateAccount()`: This function can only be called if the collateral seized will cover all borrows of an account, as well as the liquidation incentive. Otherwise, the pool will incur bad debt, in which case the function `healAccount()` should be used instead. This function skips the logic verifying that the repay amount does not exceed the close factor.

# Development

## Prerequisites

- NodeJS - 12.x
- Solc - v0.8.13 (https://github.com/ethereum/solidity/releases/tag/v0.8.13)

## Installing

```bash

yarn install

```

## Run Tests

```bash

yarn test

npx hardhat coverage

REPORT_GAS=true npx hardhat test

```

- To run fork tests add FORK_MAINNET=true and QUICK_NODE_KEY in the .env file.

## Deployment

```bash

npx hardhat deploy

```

- This command will execute all the deployment scripts in `./deploy` directory - It will skip only deployment scripts which implement a `skip` condition - Here is example of a skip condition: - Skipping deployment script on `bsctestnet` network `func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "bsctestnet";`
- The default network will be `hardhat`
- Deployment to another network: - Make sure the desired network is configured in `hardhat.config.ts` - Add `MNEMONIC` variable in `.env` file - Execute deploy command by adding `--network <network_name>` in the deploy command above - E.g. `npx hardhat deploy --network bsctestnet`
- Execution of single or custom set of scripts is possible, if:
  - In the deployment scripts you have added `tags` for example: - `func.tags = ["MockTokens"];`
  - Once this is done, adding `--tags "<tag_name>,<tag_name>..."` to the deployment command will execute only the scripts containing the tags.

## Source Code Verification

In order to verify the source code of already deployed contracts, run:
`npx hardhat etherscan-verify --network <network_name>`

Make sure you have added `ETHERSCAN_API_KEY` in `.env` file.

## Hardhat Commands

```bash

npx hardhat accounts

npx hardhat compile

npx hardhat clean

npx hardhat test

npx hardhat node

npx hardhat help

REPORT_GAS=true npx hardhat test

npx hardhat coverage

TS_NODE_FILES=true npx ts-node scripts/deploy.ts

npx eslint '**/*.{js,ts}'

npx eslint '**/*.{js,ts}' --fix

npx prettier '**/*.{json,sol,md}' --check

npx prettier '**/*.{json,sol,md}' --write

npx solhint 'contracts/**/*.sol'

npx solhint 'contracts/**/*.sol' --fix



MNEMONIC="<>" BSC_API_KEY="<>" npx hardhat run ./script/hardhat/deploy.ts --network testnet

```

## Documentation

Documentation is autogenerated using [solidity-docgen](https://github.com/OpenZeppelin/solidity-docgen).

They can be generated by running `yarn docgen`

## Compound Fork Commit

https://github.com/compound-finance/compound-protocol/tree/a3214f67b73310d547e00fc578e8355911c9d376

# Links

- Website : https://venus.io
- Twitter : https://twitter.com/venusprotocol
- Telegram : https://t.me/venusprotocol
- Discord : https://discord.com/invite/pTQ9EBHYtF
- Github: https://github.com/VenusProtocol
- Youtube: https://www.youtube.com/@venusprotocolofficial

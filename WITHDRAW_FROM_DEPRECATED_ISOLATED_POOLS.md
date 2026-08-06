# How to Withdraw from Deprecated Venus Isolated Pools

> **Your funds are safe.** The Venus Isolated Pool contracts remain fully operational on-chain.
> This guide explains how to repay any borrows and withdraw your supplied assets directly via a
> block explorer — no Venus frontend required.

## Background

Venus is deprecating Isolated Pools from the dApp interface. The Dashboard now shows a banner if
your wallet holds a position in an isolated pool on any supported chain. This guide is the
withdrawal path that banner links to.

**What is affected:** The Isolated Pool markets listed in this guide.

**What is NOT affected:** The Venus Core Pool, core isolation mode, and transaction history remain
unchanged.

---

## Before You Start

Before interacting with contracts on a block explorer, make sure you have:

- A Web3 wallet (MetaMask or similar) connected to the correct network
- A small amount of native gas token (BNB on BSC, ETH on Ethereum/Arbitrum) to pay transaction fees
- Enough of the **borrowed underlying token** in your wallet to repay any outstanding borrows

> **Important — Proxy contracts:** All Isolated Pool Comptrollers and vTokens are
> **upgradeable proxy contracts**. On the block explorer, you **must** use the
> **"Read as Proxy"** and **"Write as Proxy"** tabs (not the plain "Read Contract" or "Write
> Contract" tabs) to see the correct functions. Look for the "Read/Write as Proxy" option after
> clicking "Contract" on the explorer.

---

## Step 1 — Find Your Positions

### Method A: Check the dApp banner

The Dashboard deprecation banner lists every chain where your connected wallet has an active
isolated pool position. Use this as your starting point.

### Method B: Check individual vToken contracts

For each pool on the chains you use (see the [Reference Tables](#reference-tables) below):

1. Go to the block explorer for that chain (links in the reference tables).
2. Navigate to a **vToken contract address** from the table.
3. Click **Contract → Read as Proxy**.
4. Call `balanceOf` with your wallet address → a non-zero value means you have supplied assets in
   that market.
5. Call `borrowBalanceStored` with your wallet address → a non-zero value means you have an
   outstanding borrow in that market.

> **Tip:** You only need to check pools on chains where you have ever interacted with Venus Isolated
> Pools. The reference tables below list every active market.

---

## Step 2 — Repay Any Borrows

> **Do this before withdrawing collateral.** An outstanding borrow blocks redemption of the assets
> that back it. Repay every market where `borrowBalanceStored` returns a non-zero value.

For each market with an outstanding borrow:

### 2a. Find the underlying token

1. Open the vToken contract on the explorer → **Read as Proxy**.
2. Call `underlying()` — it returns the ERC-20 token address you borrowed.

### 2b. Approve the vToken to spend your underlying token

1. Navigate to the **underlying token** address returned above.
2. Click **Contract → Write Contract** (ERC-20 tokens are typically not proxies — use the plain
   Write tab).
3. Connect your wallet.
4. Call `approve`:
   - `spender`: paste the **vToken address** (not the underlying address)
   - `amount`: to approve the exact outstanding debt, call `borrowBalanceCurrent` on the vToken
     first (see tip below), then enter that value; or simply enter the maximum:
     `115792089237316195423570985008687907853269984665640564039457584007913129639935`
     (this is `type(uint256).max` — the contract will only pull what you actually owe)
5. Confirm the transaction in your wallet.

> **Tip — checking current debt:** `borrowBalanceStored` returns the last-accrued value and may be
> slightly less than the live debt. For the exact current figure, call `borrowBalanceCurrent` on the
> vToken (this is a state-changing call on some explorers; simulate it or use the stored value with
> a small buffer).

### 2c. Repay the borrow

1. Go back to the **vToken** contract → **Write as Proxy**.
2. Connect your wallet.
3. Call `repayBorrow`:
   - `repayAmount`: enter `115792089237316195423570985008687907853269984665640564039457584007913129639935`
     to repay the full outstanding balance (the contract caps the pull to your actual debt), or
     enter the exact amount in the token's smallest unit (wei).
4. Confirm the transaction.
5. After confirmation, verify that `borrowBalanceStored(yourAddress)` now returns `0`.

Repeat Steps 2a–2c for every market where you have an outstanding borrow.

---

## Step 3 — Withdraw Your Supplied Assets

Once all borrows are repaid, you can redeem your supplied assets.

For each market where `balanceOf(yourAddress)` returned a non-zero value:

### Option A: Full withdrawal (recommended)

1. Open the vToken contract on the explorer → **Read as Proxy**.
2. Call `balanceOf` with your address and **copy the exact integer value** returned. This is your
   vToken balance in 8-decimal units — do not convert it.
3. Go to **Write as Proxy**.
4. Connect your wallet.
5. Call `redeem`:
   - `redeemTokens`: paste the exact integer you copied from `balanceOf`
6. Confirm the transaction. The protocol burns your vTokens and returns the underlying asset.

### Option B: Partial withdrawal

Use `redeemUnderlying` if you want to withdraw a specific amount of the underlying token:

1. In **Write as Proxy**, call `redeemUnderlying`:
   - `redeemAmount`: the amount of underlying tokens you want to receive, in the token's smallest
     unit (e.g. for USDT with 18 decimals on BSC, 1 USDT = `1000000000000000000`; for USDT with
     6 decimals on Ethereum/Arbitrum, 1 USDT = `1000000`).
2. Confirm the transaction.

> **Decimal reference:** vTokens always have **8 decimals**. Underlying token decimals vary — check
> by calling `decimals()` on the underlying token contract, or look it up on the explorer's token
> info page. When doing a full exit, always use the exact value from `balanceOf` to avoid leaving
> dust.

Repeat for every market where you have a supplied balance.

---

## Step 4 — Optional: Exit the Market and Claim Rewards

### Exit the market

Once you have fully repaid and withdrawn from a market, you can optionally remove it from your
active-markets list:

1. Open the pool's **Comptroller** contract (address from the reference tables below) →
   **Write as Proxy**.
2. Connect your wallet.
3. Call `exitMarket`:
   - `vTokenAddress`: the vToken contract address for the market you just exited
4. Confirm the transaction.

### Claim pending rewards

If the pool has a `RewardsDistributor`, you may have unclaimed reward tokens (XVS or other):

1. Find the `RewardsDistributor` address for your pool in the [deployment files](./deployments/).
   (They are named `RewardsDistributor_<PoolName>_<index>` in the `*_addresses.json` files.)
2. Open the RewardsDistributor contract on the explorer → **Write as Proxy**.
3. Connect your wallet.
4. Call `claimRewardToken`:
   - `holder`: your wallet address
5. Confirm the transaction.

---

## Special Case — Native BNB / WBNB (LiquidStakedBNB Pool on BSC)

The **vWBNB** market in the BSC **LiquidStakedBNB** pool uses **WBNB** (Wrapped BNB) as its
underlying. When you call `redeem` on vWBNB, you receive **WBNB**, not native BNB.

**To unwrap WBNB back to native BNB**, you have two options:

**Option 1 — Use the NativeTokenGateway (recommended):**

Instead of calling `redeem` directly, use the `NativeTokenGateway` contract
(`0x24896601A4bf1b6a27E51Cb3eff750Bd9FE00d08` on BSC mainnet):

1. First approve the Gateway to transfer your vWBNB:
   - Go to vWBNB → **Write as Proxy** → `approve`
   - `spender`: `0x24896601A4bf1b6a27E51Cb3eff750Bd9FE00d08`
   - `amount`: your full `balanceOf` value (or max-uint)
2. Then call `redeemUnderlyingAndUnwrap` on the NativeTokenGateway (Write Contract):
   - `vToken`: `0xe10E80B7FD3a29fE46E16C30CC8F4dd938B742e2` (vWBNB address)
   - `redeemAmount`: the underlying WBNB amount you want to receive as native BNB
3. You receive native BNB directly.

**Option 2 — Redeem then unwrap manually:**

1. Call `redeem` on vWBNB normally → you receive WBNB.
2. Go to the WBNB token contract on BscScan.
3. Call `withdraw` with the amount of WBNB to convert to BNB.

---

## Reference Tables

> All addresses below are taken directly from this repository's `deployments/` folder. You can
> cross-check them at any time by viewing the corresponding `*_addresses.json` file.

### BSC Mainnet (Chain ID: 56) — [BscScan](https://bscscan.com)

**Registry & Lens**

| Contract     | Address                                      |
| ------------ | -------------------------------------------- |
| PoolRegistry | `0x9F7b01A536aFA00EF10310A162877fd792cD0666` |
| PoolLens     | `0x9459a33c0a4EAd7794497Da85867859CdB06aCc5` |

**Stablecoins Pool** — Comptroller: `0x94c1495cD4c557f1560Cbd68EAB0d197e6291571`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vEURA         | `0x795DE779Be00Ea46eA97a28BDD38d9ED570BCF0F` |
| vUSDD         | `0xc3a45ad8812189cAb659aD99E64B1376f6aCD035` |
| vUSDT         | `0x5e3072305F9caE1c7A82F6Fe9E38811c74922c3B` |
| vlisUSD       | `0xCa2D81AA7C09A1a025De797600A7081146dceEd9` |

**DeFi Pool** — Comptroller: `0x3344417c9360b963ca93A4e8305361AEde340Ab9`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vALPACA       | `0x02c5Fb0F26761093D297165e902e96D08576D344` |
| vANKR         | `0x19CE11C8817a1828D1d357DFBF62dCf5b0B2A362` |
| vBSW          | `0x8f657dFD3a1354DEB4545765fE6840cc54AFd379` |
| vPLANET       | `0xFf1112ba7f88a53D4D23ED4e14A117A2aE17C6be` |
| vTWT          | `0x736bf1D21A28b5DC19A1aC8cA71Fc2856C23c03F` |
| vUSDD         | `0xA615467caE6B9E0bb98BC04B4411d9296fd1dFa0` |
| vUSDT         | `0x1D8bBDE12B6b34140604E18e9f9c6e14deC16854` |
| vankrBNB      | `0x53728FD51060a85ac41974C6C3Eb1DaE42776723` |

**GameFi Pool** — Comptroller: `0x1b43ea8622e76627B81665B1eCeBB4867566B963`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vFLOKI        | `0xc353B7a1E13dDba393B5E120D4169Da7185aA2cb` |
| vRACA         | `0xE5FE5527A5b76C75eedE77FdFA6B80D52444A465` |
| vUSDD         | `0x9f2FD23bd0A5E08C5f2b9DD6CF9C96Bfb5fA515C` |
| vUSDT         | `0x4978591f17670A846137d9d613e333C38dc68A37` |

**Tron Pool** — Comptroller: `0x23b4404E4E5eC5FF5a6FFb70B7d14E3FabF237B0`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vBTT          | `0x49c26e12959345472E2Fd95E5f79F8381058d3Ee` |
| vNFT          | `0x85baA9CD6186B416Ef92c0587Cd9E9Be3BCe2a4D` |
| vTRX          | `0x836beb2cB723C498136e1119248436A645845F4E` |
| vUSDD         | `0xf1da185CCe5BeD1BeBbb3007Ef738Ea4224025F7` |
| vUSDT         | `0x281E5378f99A4bc55b295ABc0A3E7eD32Deba059` |
| vWIN          | `0xb114cfA615c828D88021a41bFc524B800E64a9D5` |

**Meme Pool** — Comptroller: `0x33B6fa34cd23e5aeeD1B112d5988B026b8A5567d`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vBabyDoge     | `0x52eD99Cd0a56d60451dD4314058854bc0845bbB5` |
| vUSDT         | `0x4a9613D06a241B76b81d3777FCe3DDd1F61D4Bd0` |

**Liquid Staked BNB Pool** — Comptroller: `0xd933909A4a2b7A4638903028f44D1d38ce27c352`

| vToken Symbol         | vToken Address                               |
| --------------------- | -------------------------------------------- |
| vBNBx                 | `0x5E21bF67a6af41c74C1773E4b473ca5ce8fd3791` |
| vWBNB ¹               | `0xe10E80B7FD3a29fE46E16C30CC8F4dd938B742e2` |
| vankrBNB              | `0xBfe25459BA784e70E2D7a718Be99a1f3521cA17f` |
| vasBNB                | `0x4A50a0a1c832190362e1491D5bB464b1bc2Bd288` |
| vslisBNB              | `0xd3CC9d8f3689B83c91b7B59cAB4946B063EB894A` |
| vstkBNB               | `0xcc5D9e502574cda17215E70bC0B4546663785227` |
| vUSDD                 | `0x3ee4be3425e5CC72445cd4C5325A6B5A15507670` |
| vUSDT                 | `0xB3CD745D46A7551C7DF21e0DEfEB710f546bca62` |
| vPT-clisBNB-24APR2025 | `0xA537ACf381b12Bbb91C58398b66D1D220f1C77c8` |

¹ Redeeming vWBNB yields WBNB — see [Special Case](#special-case--native-bnb--wbnb-liquidstakedbnb-pool-on-bsc) above.

**Liquid Staked ETH Pool (BSC)** — Comptroller: `0xBE609449Eb4D76AD8545f957bBE04b596E8fC529`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vETH          | `0xeCCACF760FEA7943C5b0285BD09F601505A29c05` |
| vweETH        | `0xc5b24f347254bD8cF8988913d1fd0F795274900F` |
| vwstETH       | `0x94180a3948296530024Ef7d60f60B85cfe0422c8` |

**BTC Pool** — Comptroller: `0x9DF11376Cf28867E2B0741348044780FbB7cb1d6`

| vToken Symbol             | vToken Address                               |
| ------------------------- | -------------------------------------------- |
| vBTCB                     | `0x8F2AE20b25c327714248C95dFD3b02815cC82302` |
| vPT-SolvBTC.BBN-27MAR2025 | `0x02243F036897E3bE1cce1E540FA362fd58749149` |

---

### Ethereum Mainnet (Chain ID: 1) — [Etherscan](https://etherscan.io)

**Registry & Lens**

| Contract     | Address                                      |
| ------------ | -------------------------------------------- |
| PoolRegistry | `0x61CAff113CCaf05FFc6540302c37adcf077C5179` |
| PoolLens     | `0x277950603178BDD223eB53B9b7cF5D0053aa3473` |

**Core Pool** — Comptroller: `0x687a01ecF6d3907658f7A7c714749fAC32336D1B`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vBAL          | `0x0Ec5488e4F8f319213a14cab188E01fB8517Faa8` |
| vDAI          | `0xd8AdD9B41D4E1cd64Edad8722AB0bA8D35536657` |
| vEIGEN        | `0x256AdDBe0a387c98f487e44b85c29eb983413c5e` |
| vFRAX         | `0x4fAfbDc4F2a9876Bd1764827b26fb8dc4FD1dB95` |
| vLBTC         | `0x25C20e6e110A1cE3FEbaCC8b7E48368c7b2F0C91` |
| vTUSD         | `0x13eB80FDBe5C5f4a7039728E258A6f05fb3B912b` |
| vUSDC         | `0x17C07e0c232f2f80DfDbd7a95b942D893A4C5ACb` |
| vUSDS         | `0x0c6B19287999f1e31a5c0a44393b24B62D2C0468` |
| vUSDT         | `0x8C3e3821259B82fFb32B2450A95d2dcbf161C24E` |
| vUSDe         | `0xa0EE2bAA024cC3AA1BC9395522D07B7970Ca75b3` |
| vWBTC         | `0x8716554364f20BCA783cb2BAA744d39361fd1D8d` |
| vWETH         | `0x7c8ff7d2A1372433726f879BD945fFb250B94c65` |
| vcrvUSD       | `0x672208C10aaAA2F9A6719F449C4C8227bc0BC202` |
| veBTC         | `0x325cEB02fe1C2fF816A83a5770eA0E88e2faEcF2` |
| vsFRAX        | `0x17142a05fe678e9584FA1d88EfAC1bF181bF7ABe` |
| vsUSDS        | `0xE36Ae842DbbD7aE372ebA02C8239cd431cC063d6` |
| vsUSDe        | `0xa836ce315b7A6Bb19397Ee996551659B1D92298e` |
| vtBTC         | `0x5e35C312862d53FD566737892aDCf010cb4928F7` |
| vweETHs       | `0xc42E4bfb996ED35235bda505430cBE404Eb49F77` |
| vyvUSDC-1     | `0xf87c0a64dc3a8622D6c63265FA29137788163879` |
| vyvUSDS-1     | `0x520d67226Bc904aC122dcE66ed2f8f61AA1ED764` |
| vyvUSDT-1     | `0x475d0C68a8CD275c15D1F01F4f291804E445F677` |
| vyvWETH-1     | `0xba3916302cBA4aBcB51a01e706fC6051AaF272A0` |

**Curve Pool** — Comptroller: `0x67aA3eCc5831a65A5Ba7be76BED3B5dc7DB60796`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vCRV          | `0x30aD10Bd5Be62CAb37863C2BfcC6E8fb4fD85BDa` |
| vcrvUSD       | `0x2d499800239C4CD3012473Cb1EAE33562F0A6933` |

**Ethena Pool** — Comptroller: `0x562d2b6FF1dbf5f63E233662416782318cC081E4`

| vToken Symbol       | vToken Address                               |
| ------------------- | -------------------------------------------- |
| vPT-USDe-27MAR2025  | `0x62D9E2010Cff87Bae05B91d5E04605ef864ABc3B` |
| vPT-sUSDE-27MAR2025 | `0xCca202a95E8096315E3F19E46e19E1b326634889` |
| vUSDC               | `0xa8e7f9473635a5CB79646f14356a9Fc394CA111A` |
| vsUSDe              | `0x0792b9c60C728C1D2Fd6665b3D7A08762a9b28e0` |

**Liquid Staked ETH Pool** — Comptroller: `0xF522cd0360EF8c2FF48B648d53EA1717Ec0F3Ac3`

| vToken Symbol       | vToken Address                               |
| ------------------- | -------------------------------------------- |
| vPT-weETH-26DEC2024 | `0x76697f8eaeA4bE01C678376aAb97498Ee8f80D5C` |
| vWETH               | `0xc82780Db1257C788F262FBbDA960B3706Dfdcaf2` |
| vezETH              | `0xA854D35664c658280fFf27B6eDC6C4195c3229B3` |
| vpufETH             | `0xE0ee5dDeBFe0abe0a4Af50299D68b74Cec31668e` |
| vrsETH              | `0xDB6C345f864883a8F4cae87852Ac342589E76D1B` |
| vsfrxETH            | `0xF9E9Fe17C00a8B96a8ac20c4E344C8688D7b947E` |
| vweETH              | `0xb4933AF59868986316Ed37fa865C829Eba2df0C7` |
| vweETHs             | `0xEF26C64bC06A8dE4CA5D31f119835f9A1d9433b9` |
| vwstETH             | `0x4a240F0ee138697726C8a3E43eFE6Ac3593432CB` |

---

### Arbitrum One (Chain ID: 42161) — [Arbiscan](https://arbiscan.io)

**Registry & Lens**

| Contract     | Address                                      |
| ------------ | -------------------------------------------- |
| PoolRegistry | `0x382238f07Bc4Fe4aA99e561adE8A4164b5f815DA` |
| PoolLens     | `0x53F34FF95367B2A4542461a6A63fD321F8da22AD` |

**Core Pool** — Comptroller: `0x317c1A5739F39046E20b08ac9BeEa3f10fD43326`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vARB          | `0xAeB0FEd69354f34831fe1D16475D9A83ddaCaDA6` |
| vUSDC         | `0x7D8609f8da70fF9027E9bc5229Af4F6727662707` |
| vUSDT         | `0xB9F9117d4200dC296F9AcD1e8bE1937df834a2fD` |
| vWBTC         | `0xaDa57840B372D4c28623E87FC175dE8490792811` |
| vWETH         | `0x68a34332983f4Bf866768DD6D6E638b02eF5e1f0` |
| vgmBTC-USDC   | `0x4f3a73f318C5EA67A86eaaCE24309F29f89900dF` |
| vgmWETH-USDC  | `0x9bb8cEc9C0d46F53b4f2173BB2A0221F66c353cC` |

**Liquid Staked ETH Pool** — Comptroller: `0x52bAB1aF7Ff770551BD05b9FC2329a0Bf5E23F16`

| vToken Symbol | vToken Address                               |
| ------------- | -------------------------------------------- |
| vWETH         | `0x39D6d13Ea59548637104E40e729E4aABE27FE106` |
| vweETH        | `0x246a35E79a3a0618535A469aDaF5091cAA9f7E88` |
| vwstETH       | `0x9df6B5132135f14719696bBAe3C54BAb272fDb16` |

---

## Safety & Troubleshooting

### Key safety rules

- **Always repay borrows before withdrawing collateral.** Attempting to redeem collateral while you
  have an active borrow will revert with a liquidity shortfall error.
- **Use "Read/Write as Proxy" tabs.** Using the non-proxy tabs will show the implementation
  contract's ABI and will not reflect the current state.
- **Verify addresses against this repo.** All addresses in this guide match the
  [`deployments/`](./deployments/) folder in this repository. Cross-check any address before
  signing a transaction.
- **Amounts are in wei (smallest unit).** For example, 1 USDT on BSC (18 decimals) =
  `1000000000000000000`; 1 USDT on Ethereum/Arbitrum (6 decimals) = `1000000`. When doing a full
  exit, copy the exact integer from `balanceOf` rather than hand-typing a decimal amount.

### Common revert reasons

| Error message                                         | Likely cause                                                                     | Fix                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `REVERT: insufficient approval`                       | The underlying token approve step was skipped or the approved amount was too low | Call `approve` on the underlying token with a sufficient amount before calling `repayBorrow` |
| `REVERT: redeem tokens zero`                          | Passed `0` to `redeem`                                                           | Re-read `balanceOf` and use the actual non-zero value                                        |
| `REVERT: insufficient balance`                        | Your wallet does not hold enough of the underlying token to repay the borrow     | Acquire the required underlying token first                                                  |
| `REVERT: comptroller rejection` / liquidity shortfall | Trying to redeem collateral while a borrow is still open in the same pool        | Repay all borrows in the pool first                                                          |
| Transaction fails with no error                       | You may be calling the non-proxy ABI                                             | Switch to "Write as Proxy" on the explorer                                                   |

### Advanced: discovering positions with PoolLens

If you are comfortable with on-chain reads, you can batch-query balances across multiple markets
using the `PoolLens` contract:

1. Open the `PoolLens` address for the chain (see Reference Tables above) → **Read Contract**.
2. Call `vTokenBalances(vTokenAddress, yourWalletAddress)` for a single market — the return struct
   includes `balanceOf` (your vToken supply balance) and `borrowBalanceCurrent` (your outstanding
   borrow).
3. For multiple markets at once, call `vTokenBalancesAll(vTokenAddresses[], yourWalletAddress)`,
   passing an array of vToken addresses from the reference tables above. This returns the same
   struct for every market in one call.

These calls let you scan several markets without checking each vToken individually.

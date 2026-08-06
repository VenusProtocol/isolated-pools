# How to withdraw from the deprecated Venus isolated pools

Venus **isolated pools** have been deprecated. They are no longer shown in the Venus dApp, but
**the contracts are still live on-chain and your funds are still yours.** Repaying and withdrawing
were never disabled — you can do both yourself, directly from a block explorer, in a few minutes.

This guide shows exactly how.

> **This is only about isolated pools.** Your positions in the **Core pool** (including Core
> isolation mode / E-mode) are unaffected and keep working normally in the Venus dApp.

**What still works and what does not, in every isolated market:**

| Action                            | Status      |
| --------------------------------- | ----------- |
| Withdraw your supply (`redeem`)   | ✅ Enabled  |
| Repay your borrow (`repayBorrow`) | ✅ Enabled  |
| Claim pending rewards             | ✅ Enabled  |
| Supply new funds (`mint`)         | ❌ Disabled |
| Borrow more (`borrow`)            | ❌ Disabled |

A handful of markets are fully frozen — they are marked in the [market reference](#market-reference)
below, and covered in [Troubleshooting](#troubleshooting).

---

## Before you start

You need:

- The wallet that holds the position (MetaMask, Rabby, Trust Wallet, a hardware wallet, …).
- A little of the chain's native token for gas — BNB on BNB Chain, ETH on Ethereum and Arbitrum.
- The block explorer for your chain:
  - BNB Chain → [bscscan.com](https://bscscan.com)
  - Ethereum → [etherscan.io](https://etherscan.io)
  - Arbitrum One → [arbiscan.io](https://arbiscan.io)

Two things worth knowing before you touch anything:

1. **vToken vs. underlying token.** When you supplied USDT you received `vUSDT_DeFi` — a receipt
   token. Withdrawing means handing the vToken back and getting your USDT out. **All Venus vTokens
   have 8 decimals**; the underlying token's decimals vary (18 for most, 6 for TRX and USDC, 9 for
   FLOKI and BabyDoge — the exact value is in the [market reference](#market-reference)).
2. **Explorers take raw integer amounts.** There is no decimal point. `1 USDT` with 18 decimals is
   typed as `1000000000000000000`. To avoid this entirely, this guide tells you to copy the exact
   integer the contract itself gives you — no maths required.

⚠️ **Never** share your seed phrase or private key. Venus staff will never DM you first, and no
"recovery service" is needed: withdrawing is permissionless and costs only gas. Only use the
contract addresses listed in this document.

---

## Step 1 — Find your position

**The quick way.** Open your address on the explorer and look at the **Token Holdings** dropdown
next to your balance. Venus receipt tokens are named like `Venus USDT (DeFi)` or
`Venus wstETH (Liquid Staked ETH)` — the part in brackets is the pool. Any of those means you still
have a supply position there.

**The exact way.** Find your market in the [market reference](#market-reference) and open its
**vToken** address on the explorer, then:

1. Go to **Contract → Read as Proxy**.
2. Call `balanceOf` with your wallet address → this is your **supply**, in vToken units (8 decimals).
   Any value greater than `0` means you still have funds in that market.
3. Call `borrowBalanceStored` with your wallet address → this is your **debt**, in underlying units.
   `0` means you have nothing to repay.

Do this for every market in your pool. If `balanceOf` and `borrowBalanceStored` are both `0`
everywhere, you are done — nothing is left.

> **You must clear the debt before you can withdraw the collateral backing it.** If you have any
> borrow in a pool, do Step 2 first.

---

## Step 2 — Repay your borrows

Skip this step if `borrowBalanceStored` returned `0` for every market in the pool.

Repeat the following for each asset you borrowed.

### 2.1 — Approve the vToken to take your repayment

Your debt is denominated in the underlying token, so the vToken contract needs permission to pull it
from your wallet.

1. Open the **underlying token** address (from the [market reference](#market-reference)) on the
   explorer → **Contract → Write Contract** → **Connect to Web3** and connect your wallet. (Some
   tokens are upgradeable — if you only see a **Write as Proxy** tab, use that one.)
2. Call `approve` with:

   - `spender` = the **vToken address** of the market you are repaying.
   - `amount` = `115792089237316195423570985008687907853269984665640564039457584007913129639935`

   That number is the maximum a uint256 can hold. It is the standard "unlimited approval" value and
   saves you from computing decimals. If you prefer a tight approval instead, use your
   `borrowBalanceStored` value plus a small margin — interest accrues every block, so an exact
   approval can fall a few wei short.

3. Send the transaction and wait for it to confirm.

### 2.2 — Repay

1. Open the **vToken** address → **Contract → Write as Proxy** → connect your wallet.
2. Call `repayBorrow` with:

   - `repayAmount` = `115792089237316195423570985008687907853269984665640564039457584007913129639935`

   The contract caps the repayment at what you actually owe, so this repays your debt in full and
   **never takes more than that** — regardless of how large your approval was. To repay only part of
   the debt, put that amount in underlying units instead.

3. Send the transaction.

Confirm it worked: back in **Read as Proxy**, `borrowBalanceStored` for your address should now
return `0`.

> **Optional:** revoke the unlimited approval afterwards by calling `approve` again on the
> underlying token with the same `spender` and `amount` = `0`.

---

## Step 3 — Withdraw your supply

Repeat for each asset you supplied.

1. Open the **vToken** address → **Contract → Read as Proxy** → `balanceOf(your address)`.
   **Copy that number exactly.** It already includes all the interest you have earned.
2. Go to **Contract → Write as Proxy** → connect your wallet.
3. Call `redeem` with `redeemTokens` = the number you just copied.
4. Send the transaction.

The underlying tokens land in your wallet in the same transaction. Calling `balanceOf` again should
now return `0`.

**Want to withdraw only part of it?** Use `redeemUnderlying` instead and pass the amount of the
**underlying** asset you want, in the underlying token's decimals. Use `redeem` with your full
`balanceOf` when you want everything out — that leaves no dust behind.

### Worked example

Withdrawing USDT from the DeFi pool on BNB Chain:

1. Open `0x1D8bBDE12B6b34140604E18e9f9c6e14deC16854` on BscScan.
2. **Read as Proxy → `balanceOf`** with your address returns `13500000000`.
   (That is 135.00000000 vUSDT — vTokens have 8 decimals.)
3. **Write as Proxy → `redeem`** with `redeemTokens` = `13500000000`.
4. Confirm in your wallet. The USDT arrives, and `balanceOf` now returns `0`.

---

## Step 4 — Optional clean-up

**Claim any pending rewards.** Some isolated markets still hold unclaimed XVS or partner rewards.
They stay claimable after you withdraw, so this is not urgent — but it is easy to forget.

1. Open the **Comptroller** address of your pool → **Read as Proxy** → `getRewardDistributors()`.
   It returns a list of RewardsDistributor addresses (it may be empty — then there is nothing to
   claim).
2. Open each of those addresses → **Write Contract** (or **Write as Proxy**, whichever tab the
   explorer shows) → `claimRewardToken` with `holder` = your wallet address.

**Unwrap WBNB / WETH.** If you supplied native BNB or ETH through the Venus dApp, the protocol
wrapped it for you, so `redeem` returns **WBNB** or **WETH**. To turn it back into the native coin,
open the WBNB/WETH token contract → **Write Contract** → `withdraw` with the amount in wei.

**Disable the market as collateral.** Purely cosmetic once your balance is `0`, but if you want a
clean slate: open the pool's **Comptroller** → **Write as Proxy** → `exitMarket` with the vToken
address. This only succeeds when you have no outstanding borrow in that market.

---

## Troubleshooting

**"Write as Proxy" tab is missing.** Use **Write as Proxy**, not **Write Contract**, for vTokens and
Comptrollers — they are beacon proxies. If the tab does not appear, hard-refresh the explorer page.

**The market is marked "Withdrawals paused" in the table below.** A few markets — matured Pendle PT
markets, and rsETH on Ethereum — have every action paused by governance, so `redeem` will revert.
This cannot be resolved from the explorer. Reach out to the Venus team with your wallet address and
the market, via [Discord](https://discord.com/invite/pTQ9EBHYtF) or
[Telegram](https://t.me/venusprotocol).

**Common revert reasons:**

| Revert                                     | What it means                                                                                                                                                | What to do                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `InsufficientLiquidity`                    | You still owe money in this pool, and withdrawing this much would leave the debt under-collateralised.                                                       | Repay first (Step 2), or withdraw a smaller amount.                                                                           |
| `RedeemTransferOutNotPossible`             | The market does not hold enough of the underlying token right now — it is lent out to borrowers.                                                             | Call `getCash()` on the vToken (Read as Proxy) to see what is available and withdraw up to that, then come back for the rest. |
| `ActionPaused(market, action)`             | That action is disabled by governance. Action `0` is MINT and `2` is BORROW — both are disabled on purpose and are not needed to exit. Action `1` is REDEEM. | Nothing to do for MINT/BORROW. If REDEEM is paused, see above.                                                                |
| `PriceError`                               | The price oracle for one of the long-tail assets in your account is not responding, so the collateral check cannot run.                                      | Contact the Venus team via Discord or Telegram.                                                                               |
| `ERC20: transfer amount exceeds allowance` | The approval in Step 2.1 was too small or was sent to the wrong `spender`.                                                                                   | Re-run Step 2.1, making sure `spender` is the **vToken** address.                                                             |

**The transaction simulation fails before I can send it.** Wallets simulate against the current
block; the usual cause is one of the reverts above. Work through them rather than force-sending.

**I do not recognise a Venus token in my wallet.** Cross-check its address against the
[market reference](#market-reference). Anything not listed there is not a Venus isolated pool token.

---

## Market reference

Every deprecated isolated pool, on every chain that has one. Pool contracts are grouped by their
**Comptroller** — the contract that governs the pool — with each market's **vToken** (the contract
you call) and its **underlying token**.

Status column, verified on-chain on **2026-08-06** (BNB Chain block 114,311,391 · Ethereum block
25,694,339 · Arbitrum One block 491,628,878):

- **Open** — repay and withdraw both work today.
- **Withdrawals paused** — every action is paused by governance; see
  [Troubleshooting](#troubleshooting).
- **Closed — market is empty** — paused, and nobody holds a position in it.

### BNB Chain

#### BTC pool

Comptroller: `0x9DF11376Cf28867E2B0741348044780FbB7cb1d6`

| Asset                    | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status                                                           |
| ------------------------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| BTCB                     | `0x8F2AE20b25c327714248C95dFD3b02815cC82302` | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` | 18                  | Open                                                             |
| PT-SolvBTC.BBN-27MAR2025 | `0x02243F036897E3bE1cce1E540FA362fd58749149` | `0x541B5eEAC7D4434C8f87e2d32019d67611179606` | 18                  | **Withdrawals paused** — see [Troubleshooting](#troubleshooting) |

#### DeFi pool

Comptroller: `0x3344417c9360b963ca93A4e8305361AEde340Ab9`

| Asset   | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ------- | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| ALPACA  | `0x02c5Fb0F26761093D297165e902e96D08576D344` | `0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F` | 18                  | Open   |
| ANKR    | `0x19CE11C8817a1828D1d357DFBF62dCf5b0B2A362` | `0xf307910A4c7bbc79691fD374889b36d8531B08e3` | 18                  | Open   |
| ankrBNB | `0x53728FD51060a85ac41974C6C3Eb1DaE42776723` | `0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827` | 18                  | Open   |
| BSW     | `0x8f657dFD3a1354DEB4545765fE6840cc54AFd379` | `0x965F527D9159dCe6288a2219DB51fc6Eef120dD1` | 18                  | Open   |
| PLANET  | `0xFf1112ba7f88a53D4D23ED4e14A117A2aE17C6be` | `0xCa6d678e74f553f0E59cccC03ae644a3c2c5EE7d` | 18                  | Open   |
| TWT     | `0x736bf1D21A28b5DC19A1aC8cA71Fc2856C23c03F` | `0x4B0F1812e5Df2A09796481Ff14017e6005508003` | 18                  | Open   |
| USDD    | `0xA615467caE6B9E0bb98BC04B4411d9296fd1dFa0` | `0xd17479997F34dd9156Deef8F95A52D81D265be9c` | 18                  | Open   |
| USDT    | `0x1D8bBDE12B6b34140604E18e9f9c6e14deC16854` | `0x55d398326f99059fF775485246999027B3197955` | 18                  | Open   |

#### GameFi pool

Comptroller: `0x1b43ea8622e76627B81665B1eCeBB4867566B963`

| Asset | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ----- | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| FLOKI | `0xc353B7a1E13dDba393B5E120D4169Da7185aA2cb` | `0xfb5B838b6cfEEdC2873aB27866079AC55363D37E` | 9                   | Open   |
| RACA  | `0xE5FE5527A5b76C75eedE77FdFA6B80D52444A465` | `0x12BB890508c125661E03b09EC06E404bc9289040` | 18                  | Open   |
| USDD  | `0x9f2FD23bd0A5E08C5f2b9DD6CF9C96Bfb5fA515C` | `0xd17479997F34dd9156Deef8F95A52D81D265be9c` | 18                  | Open   |
| USDT  | `0x4978591f17670A846137d9d613e333C38dc68A37` | `0x55d398326f99059fF775485246999027B3197955` | 18                  | Open   |

#### Liquid Staked BNB pool

Comptroller: `0xd933909A4a2b7A4638903028f44D1d38ce27c352`

| Asset                | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| -------------------- | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| ankrBNB              | `0xBfe25459BA784e70E2D7a718Be99a1f3521cA17f` | `0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827` | 18                  | Open   |
| asBNB                | `0x4A50a0a1c832190362e1491D5bB464b1bc2Bd288` | `0x77734e70b6E88b4d82fE632a168EDf6e700912b6` | 18                  | Open   |
| BNBx                 | `0x5E21bF67a6af41c74C1773E4b473ca5ce8fd3791` | `0x1bdd3Cf7F79cfB8EdbB955f20ad99211551BA275` | 18                  | Open   |
| PT-clisBNB-24APR2025 | `0xA537ACf381b12Bbb91C58398b66D1D220f1C77c8` | `0xE8F1C9804770e11Ab73395bE54686Ad656601E9e` | 18                  | Open   |
| slisBNB              | `0xd3CC9d8f3689B83c91b7B59cAB4946B063EB894A` | `0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B` | 18                  | Open   |
| stkBNB               | `0xcc5D9e502574cda17215E70bC0B4546663785227` | `0xc2E9d07F66A89c44062459A47a0D2Dc038E4fb16` | 18                  | Open   |
| WBNB                 | `0xe10E80B7FD3a29fE46E16C30CC8F4dd938B742e2` | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18                  | Open   |

#### Liquid Staked ETH pool

Comptroller: `0xBE609449Eb4D76AD8545f957bBE04b596E8fC529`

| Asset  | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| ETH    | `0xeCCACF760FEA7943C5b0285BD09F601505A29c05` | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` | 18                  | Open   |
| weETH  | `0xc5b24f347254bD8cF8988913d1fd0F795274900F` | `0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A` | 18                  | Open   |
| wstETH | `0x94180a3948296530024Ef7d60f60B85cfe0422c8` | `0x26c5e01524d2E6280A48F2c50fF6De7e52E9611C` | 18                  | Open   |

#### Meme pool

Comptroller: `0x33B6fa34cd23e5aeeD1B112d5988B026b8A5567d`

| Asset    | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| -------- | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| BabyDoge | `0x52eD99Cd0a56d60451dD4314058854bc0845bbB5` | `0xc748673057861a797275CD8A068AbB95A902e8de` | 9                   | Open   |
| USDT     | `0x4a9613D06a241B76b81d3777FCe3DDd1F61D4Bd0` | `0x55d398326f99059fF775485246999027B3197955` | 18                  | Open   |

#### Stablecoins pool

Comptroller: `0x94c1495cD4c557f1560Cbd68EAB0d197e6291571`

| Asset  | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| EURA   | `0x795DE779Be00Ea46eA97a28BDD38d9ED570BCF0F` | `0x12f31B73D812C6Bb0d735a218c086d44D5fe5f89` | 18                  | Open   |
| lisUSD | `0xCa2D81AA7C09A1a025De797600A7081146dceEd9` | `0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5` | 18                  | Open   |
| USDD   | `0xc3a45ad8812189cAb659aD99E64B1376f6aCD035` | `0xd17479997F34dd9156Deef8F95A52D81D265be9c` | 18                  | Open   |
| USDT   | `0x5e3072305F9caE1c7A82F6Fe9E38811c74922c3B` | `0x55d398326f99059fF775485246999027B3197955` | 18                  | Open   |

#### Tron pool

Comptroller: `0x23b4404E4E5eC5FF5a6FFb70B7d14E3FabF237B0`

| Asset | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ----- | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| BTT   | `0x49c26e12959345472E2Fd95E5f79F8381058d3Ee` | `0x352Cb5E19b12FC216548a2677bD0fce83BaE434B` | 18                  | Open   |
| TRX   | `0x836beb2cB723C498136e1119248436A645845F4E` | `0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3` | 6                   | Open   |
| USDD  | `0xf1da185CCe5BeD1BeBbb3007Ef738Ea4224025F7` | `0xd17479997F34dd9156Deef8F95A52D81D265be9c` | 18                  | Open   |
| USDT  | `0x281E5378f99A4bc55b295ABc0A3E7eD32Deba059` | `0x55d398326f99059fF775485246999027B3197955` | 18                  | Open   |
| WIN   | `0xb114cfA615c828D88021a41bFc524B800E64a9D5` | `0xaeF0d72a118ce24feE3cD1d43d383897D05B4e99` | 18                  | Open   |

### Ethereum

#### Curve pool

Comptroller: `0x67aA3eCc5831a65A5Ba7be76BED3B5dc7DB60796`

| Asset  | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| CRV    | `0x30aD10Bd5Be62CAb37863C2BfcC6E8fb4fD85BDa` | `0xD533a949740bb3306d119CC777fa900bA034cd52` | 18                  | Open   |
| crvUSD | `0x2d499800239C4CD3012473Cb1EAE33562F0A6933` | `0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E` | 18                  | Open   |

#### Ethena pool

Comptroller: `0x562d2b6FF1dbf5f63E233662416782318cC081E4`

| Asset              | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status                   |
| ------------------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ------------------------ |
| PT-sUSDE-27MAR2025 | `0xCca202a95E8096315E3F19E46e19E1b326634889` | `0xE00bd3Df25fb187d6ABBB620b3dfd19839947b81` | 18                  | Closed — market is empty |
| PT-USDe-27MAR2025  | `0x62D9E2010Cff87Bae05B91d5E04605ef864ABc3B` | `0x8A47b431A7D947c6a3ED6E42d501803615a97EAa` | 18                  | Closed — market is empty |
| sUSDe              | `0x0792b9c60C728C1D2Fd6665b3D7A08762a9b28e0` | `0x9D39A5DE30e57443BfF2A8307A4256c8797A3497` | 18                  | Closed — market is empty |
| USDC               | `0xa8e7f9473635a5CB79646f14356a9Fc394CA111A` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6                   | Closed — market is empty |

#### Liquid Staked ETH pool

Comptroller: `0xF522cd0360EF8c2FF48B648d53EA1717Ec0F3Ac3`

| Asset              | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status                                                           |
| ------------------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| ezETH              | `0xA854D35664c658280fFf27B6eDC6C4195c3229B3` | `0xbf5495Efe5DB9ce00f80364C8B423567e58d2110` | 18                  | Open                                                             |
| PT-weETH-26DEC2024 | `0x76697f8eaeA4bE01C678376aAb97498Ee8f80D5C` | `0x6ee2b5E19ECBa773a352E5B21415Dc419A700d1d` | 18                  | Closed — market is empty                                         |
| pufETH             | `0xE0ee5dDeBFe0abe0a4Af50299D68b74Cec31668e` | `0xD9A442856C234a39a81a089C06451EBAa4306a72` | 18                  | Open                                                             |
| rsETH              | `0xDB6C345f864883a8F4cae87852Ac342589E76D1B` | `0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7` | 18                  | **Withdrawals paused** — see [Troubleshooting](#troubleshooting) |
| sfrxETH            | `0xF9E9Fe17C00a8B96a8ac20c4E344C8688D7b947E` | `0xac3E018457B222d93114458476f3E3416Abbe38F` | 18                  | Open                                                             |
| weETH              | `0xb4933AF59868986316Ed37fa865C829Eba2df0C7` | `0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee` | 18                  | Open                                                             |
| weETHs             | `0xEF26C64bC06A8dE4CA5D31f119835f9A1d9433b9` | `0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88` | 18                  | Open                                                             |
| WETH               | `0xc82780Db1257C788F262FBbDA960B3706Dfdcaf2` | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 18                  | Open                                                             |
| wstETH             | `0x4a240F0ee138697726C8a3E43eFE6Ac3593432CB` | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` | 18                  | Open                                                             |

### Arbitrum One

#### Liquid Staked ETH pool

Comptroller: `0x52bAB1aF7Ff770551BD05b9FC2329a0Bf5E23F16`

| Asset  | vToken — the contract you interact with      | Underlying token                             | Underlying decimals | Status |
| ------ | -------------------------------------------- | -------------------------------------------- | ------------------- | ------ |
| weETH  | `0x246a35E79a3a0618535A469aDaF5091cAA9f7E88` | `0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe` | 18                  | Open   |
| WETH   | `0x39D6d13Ea59548637104E40e729E4aABE27FE106` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | 18                  | Open   |
| wstETH | `0x9df6B5132135f14719696bBAe3C54BAb272fDb16` | `0x5979D7b546E38E414F7E9822514be443A4800529` | 18                  | Open   |

---

Source of truth for these addresses: the `deployments/` folder of this repository.

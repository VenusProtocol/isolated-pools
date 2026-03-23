# Exchange Rate Manipulation (Donation Attack)

An attacker can artificially inflate a vToken market's exchange rate by transferring underlying tokens directly to the contract, then exploit the inflated rate to drain value from other depositors.

## The Vulnerability

vToken exchange rate is calculated as:

```
exchangeRate = (totalCash + totalBorrows + badDebt - totalReserves) / totalSupply
```

The problem: `_getCashPrior()` originally returned `IERC20.balanceOf(address(this))`. Since `balanceOf` reflects **all** tokens held — including unsolicited transfers — anyone could manipulate `totalCash` without going through the protocol.

### Attack Flow

```
1. Attacker calls IERC20(underlying).transfer(vToken, largeAmount)
   → vToken.balanceOf increases, but no vTokens are minted
   → Supply cap is NOT checked (only checked during mint/mintBehalf)

2. exchangeRate spikes because totalCash increased while totalSupply stayed the same

3. Attacker (or accomplice) redeems vTokens at the inflated rate
   → Receives more underlying than was legitimately deposited
   → Remaining depositors are left with a shortfall (bad debt)
```

## Real-World Incident: THE Token (BSC Core Pool — March 15, 2026)

> **This exploit hit Venus Core Pool on BSC mainnet, not Isolated Pools.**
> The `internalCash` fix is applied to Isolated Pools as a **preventive measure** since the same vulnerable pattern existed here.

[BlockSec Phalcon tx trace](https://app.blocksec.com/phalcon/explorer/tx/bsc/0x4f477e941c12bbf32a58dc12db7bb0cb4d31d41ff25b2457e6af3c15d7f5663f)

- **Target:** THE (Thena) token market in Venus Core Pool on BSC
- **Method:** Direct token transfer to inflate `balanceOf` → inflated exchange rate
- **Supply cap bypass:** `balanceOf` increases are invisible to supply cap checks
- **Impact:** ~$2.2 M bad debt
- **Response:** Market paused via ACM

## The Fix: `internalCash`

A new storage variable `internalCash` (`VTokenInterfaces.sol:138`) tracks cash balance explicitly. Direct transfers are now ignored because `_getCashPrior()` returns `internalCash` instead of `balanceOf`.

`internalCash` is only updated through protocol entry points:

| Entry point        | Update                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `_doTransferIn()`  | `internalCash += actualAmount` (on mint, repay, etc.)              |
| `_doTransferOut()` | `internalCash -= amount` (on redeem, borrow, etc.)                 |
| `syncCash()`       | One-time ACM-gated call: `internalCash = balanceOf(address(this))` |

`syncCash()` is a migration function — called once after upgrading each vToken to bootstrap `internalCash` from the existing balance. It's gated by AccessControlManager so only authorized callers can invoke it.

### Storage Layout

Adding `internalCash` to `VTokenStorage` reduced `__gap` from 48 to 47 slots (`VTokenInterfaces.sol:145`), preserving upgrade compatibility.

## Test Suites

### `DonationAttack/`

Proves the vulnerability exists **before** upgrade and is blocked **after** upgrade, across 7 chains: Ethereum, Arbitrum One, OP Mainnet, Base Mainnet, opBNB Mainnet, Unichain Mainnet, zkSync Mainnet.

Each chain file tests:

| Phase                             | What's verified                         |
| --------------------------------- | --------------------------------------- |
| Before upgrade                    | Donation attack succeeds on all markets |
| After upgrade — `syncCash`        | `internalCash` initialized correctly    |
| After upgrade — exchange rates    | Rates unaffected by direct transfers    |
| After upgrade — donation attack   | Attack reverts                          |
| After upgrade — normal operations | mint, borrow, repay, redeem still work  |

### `vTokenStorageChecks/`

Pre/post upgrade storage snapshot comparison on the same 7 chains.

Each chain file tests:

| Check             | What's verified                               |
| ----------------- | --------------------------------------------- |
| Storage layout    | No slot collisions after upgrade              |
| `syncCash`        | `internalCash` matches `balanceOf` after sync |
| `accrueInterest`  | Interest accrual unaffected by upgrade        |
| Donation attack   | Blocked post-upgrade                          |
| Normal operations | Standard protocol flows still work            |

### Running Fork Tests

Each test requires a fork RPC endpoint via environment variable:

```bash
# Donation attack tests
FORK=true FORKED_NETWORK=ethereum HARDHAT_FORK_NETWORK=ethereum npx hardhat test tests/hardhat/Fork/ExchangeRateManipulation/DonationAttack/ethereum.ts
FORK=true FORKED_NETWORK=arbitrumone HARDHAT_FORK_NETWORK=arbitrumone npx hardhat test tests/hardhat/Fork/ExchangeRateManipulation/DonationAttack/arbitrumone.ts

# Storage checks
FORK=true FORKED_NETWORK=ethereum HARDHAT_FORK_NETWORK=ethereum npx hardhat test tests/hardhat/Fork/ExchangeRateManipulation/vTokenStorageChecks/ethereum.ts
FORK=true FORKED_NETWORK=arbitrumone HARDHAT_FORK_NETWORK=arbitrumone npx hardhat test tests/hardhat/Fork/ExchangeRateManipulation/vTokenStorageChecks/arbitrumone.ts
```

## Key Contract Files

| File                             | What changed                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `contracts/VToken.sol`           | `_getCashPrior()` returns `internalCash`; `_doTransferIn()` / `_doTransferOut()` update it; `syncCash()` added |
| `contracts/VTokenInterfaces.sol` | `internalCash` storage variable (slot from `__gap`), `CashSynced` event                                        |

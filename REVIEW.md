# REVIEW.md

What reviewers, human or AI, should look for in this repository. Repository context is in [CLAUDE.md](CLAUDE.md).

## How to report

- Open with a one-line count: `N findings: X high, Y medium, Z low, W nits`.
- Every finding names a file and line, what breaks, and a concrete scenario (state and inputs → wrong result).
  A finding without a file and line does not count.
- At most three nits per review. Anything prettier, solhint or eslint already enforces is not a finding.
- Do not restate the diff, and do not praise it.
- Severity: **high**, funds can be lost or a market or pool can be frozen; **medium**, wrong accounting,
  permissions or upgrade breakage without direct loss; **low**, a missing check or event with limited impact.

Skip these paths: `deployments/**`, generated ABIs and artifacts, `docgen` output, `CHANGELOG.md`, and `yarn.lock`.
Exception: a `yarn.lock` or `package.json` change that bumps `@venusprotocol/*` or `@openzeppelin/*` changes compiled
code and must be reviewed.

## What a bad change looks like here

### Access control

- A new or changed external function that changes state without `_checkAccessAllowed`, or whose string is not the
  function's exact signature (name and parameter types, no spaces, no parameter names). The ACM grant would never match.
- A function moved between `onlyOwner` and the ACM without the PR naming the VIP that changes the grants.
- A setter that loosens risk (raises a collateral factor or cap, unpauses) reachable by a role meant only to tighten.

### Upgrade safety and storage

- A state variable inserted, reordered, retyped or removed in an upgradeable contract (`ComptrollerStorage`,
  `VTokenStorage`, `SpokeComptrollerStorage`, `PoolRegistry`, `ShortfallStorage`, `RewardsDistributorStorage`). New
  variables are appended and `__gap` shrinks by the same number of slots.
- A constructor that sets state other than immutables, a missing `_disableInitializers()`, or new initialization logic
  outside a `reinitializer`.
- Blast radius: `Comptroller` and `VToken` are beacon proxies, so a change reaches every pool on the chain at the next
  beacon upgrade, including retired exit-only pools. Check the change against paused markets and markets with bad debt.
- `yarn check:upgrades` not run, or failing.

### Accounting

- Cash is `internalCash`, not the token balance. Any path that moves underlying in or out must update it; a direct
  donation must not move the exchange rate.
- `badDebt` stays in the exchange-rate numerator. Changes to healing, bad-debt recovery or reserves must keep cash,
  borrows, `badDebt` and reserves consistent.
- Reads or writes that depend on the borrow index or rates without `accrueInterest()` first, including admin setters
  that change the interest rate model or reserve factor.
- A new division that rounds in the caller's favour.
- Rate math that assumes block time: a market can be block- or time-based, so use its own `blocksOrSecondsPerYear`.

### Reentrancy and external calls

- A new external entry point that moves tokens or calls out without `nonReentrant` (every user entry point on `VToken`
  carries it).
- State written after an external call to the underlying, the oracle, a hook or a rewards distributor.

### Comptroller hooks, pauses and loops

- A user action that does not pass through its `pre*Hook` (pause state, listing, caps, liquidity check).
- A price read in a hook without the `updatePrice` / `updatePrices` call the existing hooks make first.
- A loop over an account's markets or all markets without `_ensureMaxLoops`.
- Liquidation changes that skip the shortfall check, the close factor, or the `minLiquidatableCollateral` routing
  between `liquidateBorrow` and `liquidateAccount` / `healAccount`.

### Spoke pools

- `SpokeComptroller` is a fork of `Comptroller`. A fix or new check in one is a finding in the other unless the PR
  says why it does not apply.
- A new entry point that bypasses the supply or liquidation allowlist, the ACM-gated `enterMarketForAccount`, or the
  `DeviationBoundedOracle` pricing of borrow power.

### Multi-chain and deployment

- Code that does not compile under the zkSync config (`yarn compile` builds both).
- Deploy scripts that hard-code addresses instead of reading `deployments/` or the network config, that redeploy or
  re-transfer on a second run, or that leave ownership anywhere but pending with the network's Normal Timelock.
- Deploy scripts that grant mainnet permissions or set risk parameters. That is a VIP's job.

### Tests

- New behaviour without a unit test, or a bug fix without a regression test that fails before the fix.
- A change to live-market math or liquidation without a fork test.

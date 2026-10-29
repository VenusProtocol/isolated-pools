# CLAUDE.md

Guidance for AI agents and new contributors working in this repository. Keep it under ~80 lines; link out for detail.
Review rules live in [REVIEW.md](REVIEW.md).

## What this repo is

Venus **Isolated Pools** contracts: lending pools, each with its own `Comptroller`, markets (`VToken`), price oracle
and risk fund wiring, plus the **hub-funded spoke pool** fork (`contracts/Spoke/SpokeComptroller.sol`). Outside BNB
Chain, the Core pool of every Venus network runs on these contracts. The non-Core isolated pools on BNB Chain, Ethereum
and Arbitrum are retired and exit-only, but their markets stay live for repay, redeem and liquidation.

## Stack

- Solidity `0.8.25` (legacy and test contracts also build with `0.6.6` / `0.5.16`), Hardhat + hardhat-deploy, Foundry
  for some tests, a separate zkSync build (`hardhat.config.zksync.ts`).
- Yarn 3 (`.yarnrc.yml` pins `.yarn/releases/yarn-3.2.0.cjs`, `node-modules` linker), Node `>=18`.
- Access control through `AccessControlManager` (`AccessControlledV8`), ownership through `Ownable2StepUpgradeable`.
- `Comptroller` and `VToken` are **beacon proxies**: one implementation serves every pool on a chain.

## Layout

- `contracts/`: `Comptroller.sol`, `VToken.sol`, `Pool/` (`PoolRegistry`), `Spoke/`, `Shortfall/`, `Rewards/`,
  `Lens/`, `Gateway/`, interest rate models; `contracts/test/` holds mocks only.
- `deploy/`: numbered hardhat-deploy scripts; `deployments/<network>/` is generated output, never hand-edited.
- `tests/hardhat/` (unit, `Fork/`, `Spoke/`), `tests/foundry/`, `tests/integration/`.
- `audits/`: published audit reports. `docgen-templates/`: templates for the generated contract docs.

## Commands

```bash
yarn                    # install (runs patch-package and husky install)
yarn compile            # Hardhat + zkSync builds
yarn test               # Hardhat unit tests
yarn test:foundry       # Foundry tests
yarn lint               # solhint + eslint + prettier --check
yarn verify             # lint + unit + Foundry tests, the same checks CI runs on a PR
yarn check:upgrades     # upgrade-safety and storage-layout checks (needs a compile; storage layout reads live chains)
```

Fork tests: set `FORK=true`, `FORKED_NETWORK=<network>` and an `ARCHIVE_NODE_<network>` RPC in `.env`
(see `.env.example`), then `yarn test:fork`. To dry-run deploy scripts against a live network:
`HARDHAT_FORK_NETWORK=<network> npx hardhat deploy`.

## Conventions

- Branch from and target `develop`. Releases are cut by semantic-release (`chore(release): ... [skip ci]` commits).
- Conventional commit messages (enforced by commitlint); staged files are formatted and linted on commit.
- New code uses custom errors, emits an event with old and new values on every setter, and documents external
  functions with NatSpec including `@custom:access`, `@custom:error` and `@custom:event`.
- ACM-gated functions call `_checkAccessAllowed("<exact function signature>")`; the grant itself is made by a VIP.
- Upgradeable contracts append storage only and shrink `__gap` by the slots they add.

## Non-goals

- The Core pool (Diamond `Comptroller`, `vBNB`, VAI, Prime) lives in `venus-protocol`; oracles in `oracle`; governance
  proposals in `vips`; the Liquidity Hub in `venus-liquidity-hub`.
- Deploy scripts do not grant mainnet permissions or configure risk parameters; governance does that through VIPs.

## Links

- Technical reference: https://docs-v4.venus.io/technical-reference/reference-isolated-pools
- Deployed addresses: https://docs-v4.venus.io/deployed-contracts/markets
- Setup, fork tests and deployment details: [README.md](README.md)

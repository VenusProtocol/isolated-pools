import GovernanceBscMainnet from "@venusprotocol/governance-contracts/deployments/bscmainnet.json";
import OracleBscMainnet from "@venusprotocol/oracle/deployments/bscmainnet.json";
import PsrBscMainnet from "@venusprotocol/protocol-reserve/deployments/bscmainnet.json";
import { getAddress } from "ethers/lib/utils";

import { contracts as MainnetContracts } from "../../../../deployments/bscmainnet.json";

/**
 * Addresses the hub-funded spoke pool suite binds against. Everything here is already live on
 * bscmainnet; nothing in this file is deployed by the suite. Addresses come from the package the
 * repo compiles against rather than from literals, so a dependency bump moves them here too.
 *
 * The two exceptions are the hub-side addresses, which live in a repo this one does not depend on.
 * They are recorded as literals and re-derived from the chain in `assertions.ts`, so a wrong value
 * fails loudly instead of silently testing the wrong contract.
 */
/**
 * Checksum every address on the way in. The deployment records these are read from are not
 * consistent about case - `@venusprotocol/governance-contracts` stores the bscmainnet
 * AccessControlManager lower case and the NormalTimelock checksummed - and an on-chain read always
 * returns the checksummed form, so a raw `===` against a recorded value is a coin flip. That is not
 * a hypothetical: `deploy/024-deploy-spoke-comptroller.ts` compares them raw and aborts on this
 * chain because of it (see `deployment.ts`).
 */
const addr = (a: string) => getAddress(a);

export const bscmainnet = {
  // ── Governance ───────────────────────────────────────────────────────────
  NORMAL_TIMELOCK: addr(GovernanceBscMainnet.contracts.NormalTimelock.address),
  ACM: addr(GovernanceBscMainnet.contracts.AccessControlManager.address),

  // ── Isolated pools ───────────────────────────────────────────────────────
  POOL_REGISTRY: addr(MainnetContracts.PoolRegistry.address),
  VTOKEN_BEACON: addr(MainnetContracts.VTokenBeacon.address),
  COMPTROLLER_BEACON: addr(MainnetContracts.ComptrollerBeacon.address),
  SHORTFALL: addr(MainnetContracts.Shortfall.address),
  // An existing pool, used only as a control when checking that spoke changes do not leak.
  COMPTROLLER_STABLECOINS: addr(MainnetContracts.Comptroller_Stablecoins.address),

  PSR: addr(PsrBscMainnet.contracts.ProtocolShareReserve.address),

  // ── Oracles ──────────────────────────────────────────────────────────────
  RESILIENT_ORACLE: addr(OracleBscMainnet.contracts.ResilientOracle.address),
  DEVIATION_BOUNDED_ORACLE: addr(OracleBscMainnet.contracts.DeviationBoundedOracle.address),

  // ── Assets ───────────────────────────────────────────────────────────────
  // USDT is the liquidity asset: it matches the live Hub's asset, so the hub-funded leg is real.
  USDT: addr("0x55d398326f99059fF775485246999027B3197955"),
  // BTCB is the collateral asset. Chosen because the live DeviationBoundedOracle has it initialized
  // and bounded-pricing enabled, which is what puts the spoke pool's bounded collateral pricing on a
  // real oracle rather than a permissive fallback. USDT is deliberately NOT initialized there; see
  // `oracle.ts`.
  BTCB: addr("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"),

  // TRX is the one BEP-20 in the live DeviationBoundedOracle's initialized set with fewer than 18
  // decimals (it has 6). A market listed against it carries an initial exchange rate BELOW 1e18,
  // which is the regime `AdapterSpokeV1._bumpToSettleable` and `_redeemPayout` exist for and which
  // no 18-decimal market can reach.
  TRX: addr("0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3"),

  // Whales impersonated to fund actors. Both are contracts holding far more than the suite moves.
  USDT_HOLDER: addr("0xa180Fe01B906A1bE37BE6c534a3300785b20d947"),
  BTCB_HOLDER: addr("0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B"), // core-pool vBTCB
  TRX_HOLDER: addr("0xC5D3466aA484B040eE977073fcF337f2c00071c1"), // core-pool vTRX

  // ── Liquidity Hub (venus-liquidity-hub, bscmainnet) ──────────────────────
  HUB_USDT: addr("0x18AfDACF30F8671021dec4b78297E39d2FE87226"),
  // The generic YieldGroup implementation the Core family runs on. The spoke source is the same
  // contract behind its own beacon, so the suite mints its beacon from this deployed implementation
  // instead of rebuilding it from source it does not have.
  YIELD_GROUP_IMPL: addr("0x3BccED778CAaf97AE8ff8Bedc16d2165aA15771b"),
  CORE_SOURCE_USDT: addr("0xC9E6ceD9589363f8dC5695Be2C79AB4dDaECC94B"),
  CORE_BEACON: addr("0x195a0F1BCF73C3Beb609a1271E8E08b8E4c098C6"),
  HUB_BEACON: addr("0x0f20e1004962e2DF16c16FC15460Dc6480626321"),
};

/// Action enum in `ComptrollerInterface`, mirrored for readability in the tests.
export enum Action {
  MINT,
  REDEEM,
  BORROW,
  REPAY,
  SEIZE,
  LIQUIDATE,
  TRANSFER,
  ENTER_MARKET,
  EXIT_MARKET,
}

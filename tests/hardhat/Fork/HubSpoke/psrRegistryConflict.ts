import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

import { initMainnetUser } from "../utils";
import { bscmainnet } from "./constants";
import { PSR_ABI, SpokeStack, addSpokeMarkets, configureSpokeStack, deploySpokeStack, listSpokePool } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

/// `IProtocolShareReserve.IncomeType.SPREAD`, the type `VToken._reduceReservesFresh` reports.
const INCOME_TYPE_SPREAD = 0;

/**
 * Giving the spoke pool a registry of its own is not free: `ProtocolShareReserve` stores exactly one
 * registry address and rejects any non-core pool whose vToken that registry does not know. Both
 * `VToken` call sites are unconditional, so the check gates `reduceReserves` and, more expensively,
 * every liquidation in the pool.
 *
 * This suite pins both directions of that trade so the constraint is a failing test rather than a
 * paragraph someone has to remember: the spoke pool cannot take income while PSR points at the
 * isolated-pools registry, and the isolated pools cannot take income once it points at the spoke's.
 * Neither is a defect in this repo. Both are the reason PSR has to support more than one registry
 * before this pool is wired into it.
 */
if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: ProtocolShareReserve holds one pool registry", () => {
    let s: SpokeStack;
    let psr: Contract;
    let snapshot: SnapshotRestorer;

    // A pool that is live on this chain today, and the party this trade is made at the expense of.
    let livePoolAsset: string;

    before(async () => {
      s = await deploySpokeStack(false);
      psr = await ethers.getContractAt(PSR_ABI, bscmainnet.PSR);

      const livePool = await ethers.getContractAt("Comptroller", bscmainnet.COMPTROLLER_STABLECOINS);
      const [firstMarket] = await livePool.getAllMarkets();
      livePoolAsset = await (await ethers.getContractAt("VToken", firstMarket)).underlying();

      snapshot = await takeSnapshot();
    });

    afterEach(async () => {
      await snapshot.restore();
    });

    const reportIncome = (comptroller: string, asset: string) =>
      psr.updateAssetsState(comptroller, asset, INCOME_TYPE_SPREAD);

    it("starts pointed at the isolated-pools registry", async () => {
      expect(await psr.poolRegistry()).to.equal(bscmainnet.POOL_REGISTRY);
      expect(await psr.poolRegistry()).to.not.equal(s.registry.address);
    });

    it("rejects the spoke pool while it points at the isolated-pools registry", async () => {
      // Listed, funded and working - and still unknown to the registry PSR asks. Every liquidation
      // in this pool would revert here, after the collateral has already moved.
      await configureSpokeStackWithoutPsr(s);
      await listSpokePool(s);
      await addSpokeMarkets(s);
      await pointPsrAt(bscmainnet.POOL_REGISTRY);

      await expect(reportIncome(s.spoke.address, bscmainnet.USDT)).to.be.reverted;
    });

    it("accepts the spoke pool once it points at the spoke registry", async () => {
      await configureSpokeStackWithoutPsr(s);
      await listSpokePool(s);
      await addSpokeMarkets(s);
      await pointPsrAt(s.registry.address);

      await expect(reportIncome(s.spoke.address, bscmainnet.USDT)).to.not.be.reverted;
    });

    it("stops accepting the live isolated pools at the same moment", async () => {
      // The whole cost of the switch, in one assertion. This pool takes income today and would stop
      // the block this change lands, which is why the PSR upgrade has to come first.
      await expect(reportIncome(bscmainnet.COMPTROLLER_STABLECOINS, livePoolAsset)).to.not.be.reverted;

      await pointPsrAt(s.registry.address);

      await expect(reportIncome(bscmainnet.COMPTROLLER_STABLECOINS, livePoolAsset)).to.be.reverted;
    });

    async function pointPsrAt(registry: string) {
      const owner = await initMainnetUser(await psr.owner(), ethers.utils.parseUnits("10"));
      await psr.connect(owner).setPoolRegistry(registry);
    }

    /// `configureSpokeStack` re-points PSR as its last step, which is the one thing these tests set
    /// for themselves.
    async function configureSpokeStackWithoutPsr(stack: SpokeStack) {
      const before = await psr.poolRegistry();
      await configureSpokeStack(stack);
      await pointPsrAt(before);
    }
  });
}

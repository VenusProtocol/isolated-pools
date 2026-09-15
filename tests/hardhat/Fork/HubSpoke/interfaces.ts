import { expect } from "chai";
import { ethers } from "hardhat";

import { bscmainnet } from "./constants";
import { SpokeForkFixture, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

/**
 * The live half of the cross-repository interface guard: the members `AdapterSpokeV1` calls,
 * answered by a real pool rather than by an ABI.
 *
 * The declaration-level half of the guard - the first-party interfaces against their
 * implementations, and against the members the hub compiles against - reads compiled ABIs and
 * nothing else, so it lives in `tests/hardhat/Spoke/interfaces.ts` and runs under the ordinary
 * `test` job. Only the assertions below need a bscmainnet fork, so only they sit behind this gate.
 */
if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: the hub-side interfaces against the real contracts", () => {
    let f: SpokeForkFixture;

    before(async () => {
      f = await spokeForkFixture();
    });

    it("answers every ISpokeComptroller member the adapter calls on the live pool", async () => {
      const spoke = await ethers.getContractAt("ISpokeComptroller", f.spoke.address);
      expect(await spoke.supplyCaps(f.vUSDT.address)).to.be.gt(0);
      expect(await spoke.actionPaused(f.vUSDT.address, 0)).to.be.false; // MINT
      expect(await spoke.actionPaused(f.vUSDT.address, 1)).to.be.false; // REDEEM
      expect(await spoke.isSupplyAllowlistEnabled(f.vUSDT.address)).to.be.false;
      expect(await spoke.isAllowedSupplier(f.vUSDT.address, f.spokeSource.address)).to.be.false;
    });

    it("pins the MINT and REDEEM positions the hub hard-codes", async () => {
      // `AdapterSpokeV1` passes literal 0 and 1 for MINT and REDEEM. Reordering the enum in
      // `ComptrollerInterface` would leave the adapter reading a different action's pause flag.
      await f.spoke.connect(f.timelock).setActionsPaused([f.vUSDT.address], [0], true);
      const spoke = await ethers.getContractAt("ISpokeComptroller", f.spoke.address);
      expect(await spoke.actionPaused(f.vUSDT.address, 0)).to.be.true;
      expect(await spoke.actionPaused(f.vUSDT.address, 1)).to.be.false;

      await f.spoke.connect(f.timelock).setActionsPaused([f.vUSDT.address], [1], true);
      expect(await spoke.actionPaused(f.vUSDT.address, 1)).to.be.true;
    });

    it("answers every IVTokenIsolated member on a live spoke market", async () => {
      const market = await ethers.getContractAt("IVTokenIsolated", f.vUSDT.address);
      expect(await market.underlying()).to.equal(bscmainnet.USDT);
      expect(await market.comptroller()).to.equal(f.spoke.address);
      expect(await market.exchangeRateStored()).to.be.gt(0);
      expect(await market.totalSupply()).to.be.gt(0);
      expect(await market.getCash()).to.be.gt(0);
      expect(await market.totalBorrows()).to.equal(0);
      expect(await market.totalReserves()).to.equal(0);
      expect(await market.badDebt()).to.equal(0);
      expect(await market.blocksOrSecondsPerYear()).to.equal(42_048_000);
      expect(await market.balanceOf(f.spokeSource.address)).to.equal(0);
    });
  });
}

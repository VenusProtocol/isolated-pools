import { expect } from "chai";
import { artifacts, ethers } from "hardhat";

import { bscmainnet } from "./constants";
import { SpokeForkFixture, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

/**
 * The hub side compiles against its own minimal views of the two isolated-pools contracts it
 * touches. Nothing on that side depends on this repo, so nothing keeps those views in step with the
 * contracts they describe - a renamed getter or a widened return type is a silent miscompile there
 * and a revert in production here.
 *
 * These tests are the joint. Two different shapes, because the two views are in different states:
 *
 * - `ISpokeComptroller` is now bound to this repo's own `SpokeComptrollerViewInterface`, so there is
 *   no second copy of those declarations here to drift. What still has to hold is that the
 *   first-party interface matches the implementation, and that it keeps offering the exact members
 *   the hub's adapter compiles against - listed below as data, because the hub's own copy of them
 *   lives in a repo this suite cannot import.
 * - `IVTokenIsolated` is still a vendored copy, because binding it to `VTokenInterface` would change
 *   the adapter's call sites (`comptroller()` returns `ComptrollerInterface` here and `address`
 *   there). It is checked member for member against the real `VToken`.
 */

/**
 * The exact members `AdapterSpokeV1` calls on a spoke pool, with the return types it decodes. This
 * list is the contract between the two repos; the hub declares the same four in its own
 * `ISpokeComptroller`. Removing one from `SpokeComptrollerViewInterface`, renaming it, or widening
 * what it returns breaks the hub's build, and this fails first.
 */
const HUB_REQUIRES = [
  { sig: "supplyCaps(address)", returns: "uint256" },
  { sig: "actionPaused(address,uint8)", returns: "bool" },
  { sig: "isSupplyAllowlistEnabled(address)", returns: "bool" },
  { sig: "isAllowedSupplier(address,address)", returns: "bool" },
];
if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: the hub-side interfaces against the real contracts", () => {
    let f: SpokeForkFixture;

    before(async () => {
      f = await spokeForkFixture();
    });

    const conformance = (interfaceName: string, implementationName: string) => {
      it(`${interfaceName} matches ${implementationName} selector for selector`, async () => {
        const iface = new ethers.utils.Interface((await artifacts.readArtifact(interfaceName)).abi);
        const impl = new ethers.utils.Interface((await artifacts.readArtifact(implementationName)).abi);
        const implBySelector = new Map(
          Object.keys(impl.functions).map(sig => [impl.getSighash(sig), impl.functions[sig]]),
        );

        for (const sig of Object.keys(iface.functions)) {
          const selector = iface.getSighash(sig);
          const declared = iface.functions[sig];
          const actual = implBySelector.get(selector);
          if (actual === undefined) {
            throw new Error(`${implementationName} has no function at ${selector} (${sig})`);
          }

          const declaredOutputs = (declared.outputs ?? []).map(o => o.type).join(",");
          const actualOutputs = (actual.outputs ?? []).map(o => o.type).join(",");
          expect(actualOutputs, `${sig} returns`).to.equal(declaredOutputs);
        }
      });
    };

    // `actionPaused` is the one worth naming: the view interface declares it as `(address,uint8)`
    // while the pool implements it as `(address,Action)`. The enum encodes as `uint8`, so the
    // selectors agree - but only as long as the enum stays at or below 256 members and keeps its
    // ordering, which is what makes this check worth running rather than assuming.
    conformance("SpokeComptrollerViewInterface", "SpokeComptroller");
    conformance("IVTokenIsolated", "VToken");

    it("keeps offering every member the hub's adapter compiles against", async () => {
      const iface = new ethers.utils.Interface((await artifacts.readArtifact("SpokeComptrollerViewInterface")).abi);
      const declared = new Set(Object.keys(iface.functions));
      for (const { sig, returns } of HUB_REQUIRES) {
        expect(declared.has(sig), `SpokeComptrollerViewInterface no longer declares ${sig}`).to.be.true;
        expect((iface.functions[sig].outputs ?? []).map(o => o.type).join(","), `${sig} returns`).to.equal(returns);
      }
    });

    it("resolves the adapter's own interface name to those declarations", async () => {
      // `ISpokeComptroller` is the name `AdapterSpokeV1` imports. It is an empty extension of the
      // first-party interface, so the two ABIs are identical; if that shim ever grows a declaration
      // of its own, this catches it.
      const shim = new ethers.utils.Interface((await artifacts.readArtifact("ISpokeComptroller")).abi);
      const first = new ethers.utils.Interface((await artifacts.readArtifact("SpokeComptrollerViewInterface")).abi);
      expect(Object.keys(shim.functions).sort()).to.deep.equal(Object.keys(first.functions).sort());
    });

    it("answers every one of those members on the live pool", async () => {
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

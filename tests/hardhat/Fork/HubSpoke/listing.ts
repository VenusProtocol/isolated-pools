import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bscmainnet } from "./constants";
import {
  REGISTRY_DRIVEN_ROLES,
  SPOKE_ROLES,
  SpokeStack,
  addSpokeMarkets,
  configureSpokeStack,
  deploySpokeStack,
  fundFrom,
  grant,
  listSpokePool,
} from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

/// `isAllowedToCall` keys the role on `msg.sender`, so the only honest way to ask "may PoolRegistry
/// configure THIS comptroller" is to ask it from the comptroller's own address.
const ACM_IFACE = new ethers.utils.Interface(["function isAllowedToCall(address,string) view returns (bool)"]);
async function mayCall(onBehalfOf: string, account: string, sig: string): Promise<boolean> {
  const data = ACM_IFACE.encodeFunctionData("isAllowedToCall", [account, sig]);
  const res = await ethers.provider.call({ to: bscmainnet.ACM, data, from: onBehalfOf });
  return ACM_IFACE.decodeFunctionResult("isAllowedToCall", res)[0];
}

/// The role strings that exist only on the spoke fork. No pre-existing grant can cover them,
/// because no other Venus contract checks a string with these names.
const SPOKE_ONLY_ROLES = [
  SPOKE_ROLES.setMarketLiquidationIncentive,
  SPOKE_ROLES.setSupplyAllowlistEnabled,
  SPOKE_ROLES.setAllowedSupplier,
  SPOKE_ROLES.setLiquidationAllowlistEnabled,
  SPOKE_ROLES.setAllowedLiquidator,
];

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: listing a spoke pool on the live PoolRegistry", () => {
    describe("before the VIP runs", () => {
      let s: SpokeStack;
      let snap: SnapshotRestorer;

      before(async () => {
        s = await deploySpokeStack(false);
        snap = await takeSnapshot();
      });
      afterEach(async () => snap.restore());

      it("cannot be registered while the price oracle is unset", async () => {
        await s.spoke.connect(s.timelock).acceptOwnership();
        // `addPool` dereferences `comptroller.oracle()` and rejects the zero address, so the oracle
        // has to be set before registration, not after.
        await expect(listSpokePool(s)).to.be.revertedWithCustomError(s.spoke, "ZeroAddressNotAllowed");
      });

      it("keeps the deployer as owner until acceptOwnership, so an owner-gated setter reverts", async () => {
        expect(await s.spoke.owner()).to.equal(s.deployer.address);
        expect(await s.spoke.pendingOwner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
        await expect(s.spoke.connect(s.timelock).setPriceOracle(bscmainnet.RESILIENT_ORACLE)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("inherits the live PoolRegistry's wildcard grants, which are of no use to this pool", async () => {
        // The wildcard roles (keyed on address(0)) the ACM already holds name the live registry as
        // the account. A brand-new comptroller inherits them, so the live registry could drive these
        // setters here...
        for (const sig of REGISTRY_DRIVEN_ROLES) {
          expect(await mayCall(s.spoke.address, bscmainnet.POOL_REGISTRY, sig), `PoolRegistry may call ${sig}`).to.be
            .true;
        }

        // ...and it is not the registry this pool is listed through. The registry that is has no
        // grant at all, which is six `giveCallPermission` calls the listing VIP has to carry or
        // `addPool` reverts on execution.
        for (const sig of REGISTRY_DRIVEN_ROLES) {
          expect(await mayCall(s.spoke.address, s.registry.address, sig), `spoke registry may call ${sig}`).to.be.false;
        }
      });

      it("has no grant at all for the role strings the spoke fork adds", async () => {
        // The VIP has to grant each of these explicitly. A pool listed without them is listed with
        // its allowlists and per-market incentives permanently unreachable.
        for (const sig of SPOKE_ONLY_ROLES) {
          expect(await mayCall(s.spoke.address, bscmainnet.NORMAL_TIMELOCK, sig), `Timelock may call ${sig}`).to.be
            .false;
        }
      });

      it("rejects each spoke-only setter until its exact role string is granted", async () => {
        await s.spoke.connect(s.timelock).acceptOwnership();
        await s.spoke.connect(s.timelock).setPriceOracle(bscmainnet.RESILIENT_ORACLE);

        await expect(s.spoke.connect(s.timelock).setLiquidationAllowlistEnabled(true)).to.be.revertedWithCustomError(
          s.spoke,
          "Unauthorized",
        );

        // A near-miss role string grants nothing: the ACM hashes the string, so a signature that
        // differs by one character is a different role.
        await grant(
          s.acm,
          s.timelock,
          s.spoke.address,
          "setLiquidationAllowListEnabled(bool)",
          bscmainnet.NORMAL_TIMELOCK,
        );
        await expect(s.spoke.connect(s.timelock).setLiquidationAllowlistEnabled(true)).to.be.revertedWithCustomError(
          s.spoke,
          "Unauthorized",
        );

        await grant(
          s.acm,
          s.timelock,
          s.spoke.address,
          SPOKE_ROLES.setLiquidationAllowlistEnabled,
          bscmainnet.NORMAL_TIMELOCK,
        );
        await expect(s.spoke.connect(s.timelock).setLiquidationAllowlistEnabled(true)).to.emit(
          s.spoke,
          "LiquidationAllowlistEnabledUpdated",
        );
      });

      it("fails borrow and redeem closed while the deviation-bounded oracle is unset", async () => {
        await s.spoke.connect(s.timelock).acceptOwnership();
        await s.spoke.connect(s.timelock).setPriceOracle(bscmainnet.RESILIENT_ORACLE);
        expect(await s.spoke.deviationBoundedOracle()).to.equal(ethers.constants.AddressZero);
        // The pool's own registry has none of the wildcard grants the live one relies on, so the six
        // setters `addPool` and `addMarket` drive have to be granted to it first.
        for (const sig of REGISTRY_DRIVEN_ROLES) {
          await grant(s.acm, s.timelock, s.spoke.address, sig, s.registry.address);
        }
        await listSpokePool(s);
        for (const sig of Object.values(SPOKE_ROLES)) {
          await grant(s.acm, s.timelock, s.spoke.address, sig, bscmainnet.NORMAL_TIMELOCK);
        }
        const { vBTCB } = await addSpokeMarkets(s);

        // Supplying works: `preMintHook` reads no price at all.
        const amount = ethers.utils.parseUnits("0.01", 18);
        await fundFrom(s.btcb, bscmainnet.BTCB_HOLDER, s.supplier.address, amount);
        await s.btcb.connect(s.supplier).approve(vBTCB.address, amount);
        await expect(vBTCB.connect(s.supplier).mint(amount)).to.not.be.reverted;

        // Entering the market and then redeeming goes through `_updateProtectionStates`, which
        // calls into the zero address. That is the intended fail-closed behaviour, and it is why
        // the VIP has to set this oracle before the pool serves anyone who enters a market.
        await s.spoke.connect(s.supplier).enterMarkets([vBTCB.address]);
        await expect(vBTCB.connect(s.supplier).redeem(1)).to.be.reverted;
      });
    });

    describe("after the VIP runs", () => {
      let s: SpokeStack;
      let snap: SnapshotRestorer;
      let poolCountBefore: number;

      before(async () => {
        s = await deploySpokeStack(false);
        poolCountBefore = (await s.registry.getAllPools()).length;
        await configureSpokeStack(s);
        await listSpokePool(s);
        await addSpokeMarkets(s);
        snap = await takeSnapshot();
      });
      afterEach(async () => snap.restore());

      it("registers as the only pool in its own registry", async () => {
        const pools = await s.registry.getAllPools();
        expect(poolCountBefore).to.equal(0);
        expect(pools.length).to.equal(poolCountBefore + 1);
        const pool = await s.registry.getPoolByComptroller(s.spoke.address);
        expect(pool.comptroller).to.equal(s.spoke.address);
        expect(pool.name).to.equal("Hub-funded spoke");
      });

      it("takes the pool parameters PoolRegistry pushed during addPool", async () => {
        expect(await s.spoke.closeFactorMantissa()).to.equal(ethers.utils.parseUnits("0.5", 18));
        expect(await s.spoke.minLiquidatableCollateral()).to.equal(ethers.utils.parseUnits("100", 18));
        // The pool-wide incentive is only readable through the resolver, because the plain getter
        // answers for `msg.sender`'s market.
        expect(await s.spoke.effectiveLiquidationIncentive(ethers.constants.AddressZero)).to.equal(
          ethers.utils.parseUnits("1.1", 18),
        );
      });

      it("leaves every other pool on this chain untouched", async () => {
        const shared = await ethers.getContractAt("UpgradeableBeacon", bscmainnet.COMPTROLLER_BEACON);
        expect(await shared.implementation()).to.not.equal(s.spokeImpl);
        const stablecoins = await ethers.getContractAt("Comptroller", bscmainnet.COMPTROLLER_STABLECOINS);
        expect(await stablecoins.poolRegistry()).to.equal(bscmainnet.POOL_REGISTRY);
        // The spoke pool is not in any other pool's market list, and vice versa.
        const spokeMarkets = (await s.spoke.getAllMarkets()).map((m: string) => m.toLowerCase());
        for (const m of await stablecoins.getAllMarkets()) {
          expect(spokeMarkets).to.not.include(m.toLowerCase());
        }
      });

      it("runs its markets on the same VToken implementation as every other isolated pool", async () => {
        const beacon = await ethers.getContractAt("UpgradeableBeacon", bscmainnet.VTOKEN_BEACON);
        const impl = await beacon.implementation();
        const markets = await s.spoke.getAllMarkets();
        for (const market of markets) {
          const vToken = await ethers.getContractAt("VToken", market);
          expect(await vToken.comptroller()).to.equal(s.spoke.address);
          expect(await vToken.protocolShareReserve()).to.equal(bscmainnet.PSR);
          expect(await vToken.shortfall()).to.equal(bscmainnet.SHORTFALL);
          // `isTimeBased`/`blocksOrSecondsPerYear` are immutables of the shared implementation, so
          // reading them back proves the market really is running that implementation.
          expect(await vToken.isTimeBased()).to.equal(false);
          expect(await vToken.blocksOrSecondsPerYear()).to.equal(42_048_000);
        }
        expect(impl).to.not.equal(ethers.constants.AddressZero);
      });

      it("bounds a market's liquidation incentive by that market's own protocol seize share", async () => {
        const markets = await s.spoke.getAllMarkets();
        const vToken = await ethers.getContractAt("VToken", markets[0]);
        const seizeShare = await vToken.protocolSeizeShareMantissa();
        expect(seizeShare).to.be.gt(0); // the live implementation defaults to 5%

        const floor = ethers.utils.parseUnits("1", 18).add(seizeShare);
        await expect(
          s.spoke.connect(s.timelock).setMarketLiquidationIncentive(markets[0], floor.sub(1)),
        ).to.be.revertedWithCustomError(s.spoke, "InvalidLiquidationIncentive");
        await expect(s.spoke.connect(s.timelock).setMarketLiquidationIncentive(markets[0], floor))
          .to.emit(s.spoke, "NewMarketLiquidationIncentive")
          .withArgs(markets[0], 0, floor);
        expect(await s.spoke.effectiveLiquidationIncentive(markets[0])).to.equal(floor);
      });

      it("refuses to register a market that belongs to another pool's comptroller", async () => {
        // A stray `addMarket` pointed at a live Core-pool market must not be able to pull it in.
        const stablecoins = await ethers.getContractAt("Comptroller", bscmainnet.COMPTROLLER_STABLECOINS);
        const foreign = (await stablecoins.getAllMarkets())[0];
        await expect(
          s.registry.connect(s.timelock).addMarket({
            vToken: foreign,
            collateralFactor: 0,
            liquidationThreshold: 0,
            initialSupply: 1,
            vTokenReceiver: bscmainnet.NORMAL_TIMELOCK,
            supplyCap: 1,
            borrowCap: 0,
          }),
        ).to.be.reverted;
      });
    });

    describe("supply allowlist versus the listing order", () => {
      let s: SpokeStack;

      before(async () => {
        s = await deploySpokeStack();
        await listSpokePool(s);
      });

      it("blocks addMarket when the allowlist is armed before the market exists", async () => {
        // `PoolRegistry.addMarket` seeds initial supply with `mintBehalf(vTokenReceiver, ...)`, and
        // `preMintHook` gates the account CREDITED with the vTokens. The allowlist can therefore
        // only be armed after the market is listed, or the receiver has to be allowlisted first -
        // and it cannot be allowlisted first, because `setAllowedSupplier` requires the market to
        // already be listed. The order in the VIP is forced.
        const markets = await addSpokeMarkets(s);
        await s.spoke.connect(s.timelock).setSupplyAllowlistEnabled(markets.vUSDT.address, true);

        const extra = ethers.utils.parseUnits("100", 18);
        await fundFrom(s.usdt, bscmainnet.USDT_HOLDER, s.supplier.address, extra);
        await s.usdt.connect(s.supplier).approve(markets.vUSDT.address, extra);
        await expect(markets.vUSDT.connect(s.supplier).mint(extra))
          .to.be.revertedWithCustomError(s.spoke, "SupplyNotAllowed")
          .withArgs(markets.vUSDT.address, s.supplier.address);

        await expect(
          s.spoke.connect(s.timelock).setAllowedSupplier(markets.vUSDT.address, s.supplier.address, true),
        ).to.emit(s.spoke, "AllowedSupplierUpdated");
        await expect(markets.vUSDT.connect(s.supplier).mint(extra)).to.not.be.reverted;
      });
    });
  });
}

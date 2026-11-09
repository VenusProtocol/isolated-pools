import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { bscmainnet } from "./constants";
import { SpokeForkFixture, fundFrom, grant, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const EXP_SCALE = ethers.constants.WeiPerEther;
const usd = (whole: string) => ethers.utils.parseUnits(whole, 18);

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: bounded collateral pricing against the live DeviationBoundedOracle", () => {
    let f: SpokeForkFixture;
    let snap: SnapshotRestorer;

    before(async () => {
      f = await spokeForkFixture();
      snap = await takeSnapshot();
    });
    afterEach(async () => snap.restore());

    it("is wired to the deployed oracle, and that oracle prices this pool's markets", async () => {
      expect(await f.spoke.deviationBoundedOracle()).to.equal(bscmainnet.DEVIATION_BOUNDED_ORACLE);
      // The oracle resolves a market to its asset through `underlying()`, so a market listed after
      // the asset was configured is priced without any oracle-side change. That is what lets a new
      // spoke market reuse the chain's existing protection state.
      const [collateral, debt] = await f.boundedOracle.getBoundedPricesView(f.vBTCB.address);
      expect(collateral).to.be.gt(0);
      expect(debt).to.be.gt(0);
    });

    it("has BTCB under a live bound and USDT under none", async () => {
      // The asset the borrowers post is protected; the asset the Hub supplies is not initialized on
      // this oracle at all. That is a configuration fact a listing VIP has to act on: an
      // uninitialized asset does not revert, it silently falls through to spot, so a spoke pool
      // that lists one as COLLATERAL has an inert bound and nothing says so.
      expect(await f.boundedOracle.isBoundedPricingEnabled(bscmainnet.BTCB)).to.be.true;
      expect(await f.boundedOracle.isBoundedPricingEnabled(bscmainnet.USDT)).to.be.false;

      const spot: BigNumber = await f.oracle.getPrice(bscmainnet.USDT);
      const [collateral, debt] = await f.boundedOracle.getBoundedPricesView(f.vUSDT.address);
      expect(collateral).to.equal(spot);
      expect(debt).to.equal(spot);
    });

    it("lets the pool latch protection without any grant of its own", async () => {
      // `updateProtectionState` is unpermissioned, which is what allows the comptroller to call it
      // from `preBorrowHook` and `preRedeemHook`. If it were ever gated, the listing VIP would have
      // to grant the pool a role on the oracle and every borrow would revert until it did.
      await expect(f.boundedOracle.connect(f.outsider).updateProtectionState(f.vBTCB.address)).to.not.be.reverted;
    });

    it("prices borrowing capacity at the bound and liquidation at spot", async () => {
      await seedAndCollateralise(f);

      const spot: BigNumber = await f.oracle.getPrice(bscmainnet.BTCB);
      const collateralBalance = await f.vBTCB.balanceOf(f.borrower.address);
      const exchangeRate = await f.vBTCB.exchangeRateStored();
      const posted = collateralBalance.mul(exchangeRate).div(EXP_SCALE);

      // Protection is not active at the pinned block, so the bound equals spot and the two views
      // agree. This is the baseline the next test moves away from.
      const [, borrowingPower] = await f.spoke.getBorrowingPower(f.borrower.address);
      const [, liquidity] = await f.spoke.getAccountLiquidity(f.borrower.address);
      expect(borrowingPower).to.be.closeTo(posted.mul(spot).div(EXP_SCALE).mul(75).div(100), usd("1"));
      // The liquidation-threshold view weights the same collateral at 0.8 instead of 0.75.
      expect(liquidity).to.be.gt(borrowingPower);
    });

    it("cuts borrowing capacity, but not liquidation pricing, once protection latches", async () => {
      await seedAndCollateralise(f);
      const beforePower = (await f.spoke.getBorrowingPower(f.borrower.address))[1];
      const beforeLiquidity = (await f.spoke.getAccountLiquidity(f.borrower.address))[1];

      await latchProtection(f);
      expect(await f.boundedOracle.currentlyUsingProtectedPrice(bscmainnet.BTCB)).to.be.true;

      // Borrowing is weighted by the collateral factor and so reads the bound, which is now the
      // conservative end of a widened window.
      const afterPower = (await f.spoke.getBorrowingPower(f.borrower.address))[1];
      expect(afterPower).to.be.lt(beforePower);

      // Liquidation routing stays on spot, so a bounded price cannot make a healthy account
      // liquidatable.
      expect((await f.spoke.getAccountLiquidity(f.borrower.address))[1]).to.equal(beforeLiquidity);
    });

    it("holds a borrow to the bounded capacity, not the spot capacity", async () => {
      await seedAndCollateralise(f);
      await latchProtection(f);

      const [, bounded] = await f.spoke.getBorrowingPower(f.borrower.address);
      // A borrow inside the bound settles...
      await expect(f.vUSDT.connect(f.borrower).borrow(bounded.div(2))).to.not.be.reverted;
      // ...and one that only spot would have allowed does not.
      await expect(f.vUSDT.connect(f.borrower).borrow(bounded)).to.be.revertedWithCustomError(
        f.spoke,
        "InsufficientLiquidity",
      );
    });

    it("leaves the Hub's own supply and exit untouched by protection", async () => {
      // The YieldGroup never enters a market, so `_checkRedeemAllowed` returns before it reaches
      // `_updateProtectionStates`. A latched bound therefore cannot freeze the Hub's redemptions,
      // only the borrowers' capacity.
      await seedAndCollateralise(f);
      await latchProtection(f);

      const src = await impersonate(f.spokeSource.address);
      expect(await f.spoke.getAssetsIn(f.spokeSource.address)).to.have.lengthOf(0);
      const held = await f.vUSDT.balanceOf(f.spokeSource.address);
      expect(held).to.be.gt(0);
      await expect(f.vUSDT.connect(src).redeem(held)).to.not.be.reverted;
    });
  });
}

async function impersonate(who: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

/// Fund the liquidity market from the Hub and put real BTCB collateral behind a borrower.
async function seedAndCollateralise(f: SpokeForkFixture) {
  const { registerSpokeResource, registerOnHub } = await import("./fixture");
  await registerSpokeResource(f);
  await registerOnHub(f, usd("2000000"));

  const deposit = usd("200000");
  await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, deposit);
  await f.usdt.connect(f.supplier).approve(f.hub.address, deposit);
  await f.hub.connect(f.supplier).deposit(deposit, f.supplier.address);

  const collateral = ethers.utils.parseUnits("2", 18);
  await fundFrom(f.btcb, bscmainnet.BTCB_HOLDER, f.borrower.address, collateral);
  await f.btcb.connect(f.borrower).approve(f.vBTCB.address, collateral);
  await f.vBTCB.connect(f.borrower).mint(collateral);
  await f.spoke.connect(f.borrower).enterMarkets([f.vBTCB.address]);
}

/**
 * Widen BTCB's price window past its trigger threshold through the oracle's own keeper surface, then
 * let the pool observe it. Nothing is faked: `updateMinPrice` is the call the production keeper
 * makes, and the trigger, the cooldown and the resulting bound are all the deployed oracle's.
 */
async function latchProtection(f: SpokeForkFixture) {
  await grant(
    f.acm,
    f.timelock,
    bscmainnet.DEVIATION_BOUNDED_ORACLE,
    "updateMinPrice(address,uint128)",
    bscmainnet.NORMAL_TIMELOCK,
  );
  const spot: BigNumber = await f.oracle.getPrice(bscmainnet.BTCB);
  // Half of spot: far outside the 12.5% trigger this asset is configured with.
  await f.boundedOracle.connect(f.timelock).updateMinPrice(bscmainnet.BTCB, spot.div(2));
  await f.boundedOracle.connect(f.outsider).updateProtectionState(f.vBTCB.address);
}

import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { bscmainnet } from "./constants";
import { SpokeForkFixture, fundFrom, grant, registerOnHub, registerSpokeResource, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const usd = (whole: string) => ethers.utils.parseUnits(whole, 18);
const HUB_CAP = usd("2000000");
const EXP_SCALE = ethers.constants.WeiPerEther;

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: bad debt and how the Hub marks it", () => {
    let f: SpokeForkFixture;
    let snap: SnapshotRestorer;

    before(async () => {
      f = await spokeForkFixture();
      await registerSpokeResource(f);
      await registerOnHub(f, HUB_CAP);

      // Take the borrow rate to zero for the whole suite. Every assertion here is about a single
      // write-off moving a single number; leaving interest running would mean asserting against a
      // tolerance instead of against the value, and a tolerance wide enough to absorb accrual is
      // wide enough to hide the effect being measured.
      await grant(
        f.acm,
        f.timelock,
        f.irm.address,
        "updateJumpRateModel(uint256,uint256,uint256,uint256)",
        bscmainnet.NORMAL_TIMELOCK,
      );
      await f.irm.connect(f.timelock).updateJumpRateModel(0, 0, 0, usd("0.8"));

      snap = await takeSnapshot();
    });
    afterEach(async () => snap.restore());

    it("writes a loss the market's own exchange rate refuses to show", async () => {
      const { hubBefore } = await fundAndDefault(f);

      const rateBefore = await f.vUSDT.exchangeRateStored();
      await healAs(f, f.liquidator);
      const badDebt = await f.vUSDT.badDebt();

      expect(badDebt).to.be.gt(0);
      // `_exchangeRateStored` keeps `badDebt` in its numerator, so the write-off moves value out of
      // `totalBorrows` and into `badDebt` and the rate does not budge. No supplier is marked down by
      // the market, which is exactly why the adapter cannot value the position at this rate.
      expect(await f.vUSDT.exchangeRateStored()).to.equal(rateBefore);
      expect(hubBefore).to.be.gt(0);
    });

    it("marks the Hub down immediately, by its pro-rata share of the loss", async () => {
      const { hubBefore } = await fundAndDefault(f);
      const share = (await f.vUSDT.balanceOf(f.spokeSource.address)).mul(EXP_SCALE).div(await f.vUSDT.totalSupply());

      await healAs(f, f.liquidator);
      const badDebt = await f.vUSDT.badDebt();
      const hubAfter: BigNumber = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);

      // The drop is the position's pro-rata share of the loss, to within the rounding of one
      // division - not the whole loss, because the Hub is not the market's only supplier here.
      const expectedDrop = badDebt.mul(share).div(EXP_SCALE);
      // Two truncating divisions stand between this and the adapter's own single-step rounding, so
      // the comparison is exact to the wei only up to that. The tolerance is ~1e-18 of the value.
      expect(hubBefore.sub(hubAfter)).to.be.closeTo(expectedDrop, 1_000);
      expect(hubAfter).to.be.lt(hubBefore);
    });

    it("lands the loss on every Hub depositor at once, not on whoever exits last", async () => {
      await fundAndDefault(f);

      // Two more depositors, both in before the loss and holding equal stakes.
      const each = usd("20000");
      for (const who of [f.borrower, f.outsider]) {
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, who.address, each);
        await f.usdt.connect(who).approve(f.hub.address, each);
        await f.hub.connect(who).deposit(each, who.address);
      }
      const ppsBefore: BigNumber = await f.hub.convertToAssets(EXP_SCALE);

      await healAs(f, f.liquidator);

      // One price per share moves for everyone in the same block. Nobody exits at the pre-loss
      // price at the expense of whoever is left.
      const ppsAfter: BigNumber = await f.hub.convertToAssets(EXP_SCALE);
      expect(ppsAfter).to.be.lt(ppsBefore);

      const a: BigNumber = await f.hub.convertToAssets(await f.hub.balanceOf(f.borrower.address));
      const b: BigNumber = await f.hub.convertToAssets(await f.hub.balanceOf(f.outsider.address));
      // Not wei-identical: the two deposits landed in different blocks and the Hub's share price
      // moves every block, so they bought marginally different share counts. What matters is that
      // the loss did not fall on one of them - a nine-decimal relative agreement is far tighter than
      // any exit-order effect would be.
      expect(a.sub(b).abs()).to.be.lt(a.div(1_000_000_000));
      expect(a).to.be.lt(each);
    });

    it("never values the position above what the market can actually pay", async () => {
      await fundAndDefault(f);
      await healAs(f, f.liquidator);

      const value = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);
      const naive = (await f.vUSDT.balanceOf(f.spokeSource.address))
        .mul(await f.vUSDT.exchangeRateStored())
        .div(EXP_SCALE);
      // The market's own rate would report `naive`, which includes debt nobody will ever repay.
      expect(value).to.be.lt(naive);

      // And a redeem still burns at the market's un-haircut rate, so an exit costs fewer tokens than
      // this mark implies. The mark can understate what the position delivers, never overstate it.
      const liquid = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
      expect(liquid).to.be.lte(value);
      expect(liquid).to.be.lte((await f.vUSDT.getCash()).sub(await f.vUSDT.totalReserves()));
    });

    it("recovers the mark when a Shortfall auction repays the debt", async () => {
      const { hubBefore } = await fundAndDefault(f);
      await healAs(f, f.liquidator);
      const badDebt = await f.vUSDT.badDebt();
      const marked = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);

      // What an auction settlement does on chain: the Shortfall contract delivers the underlying to
      // the market and calls back to lower `badDebt` and raise cash by the same amount.
      const shortfall = await impersonate(bscmainnet.SHORTFALL);
      await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, bscmainnet.SHORTFALL, badDebt);
      await f.usdt.connect(shortfall).transfer(f.vUSDT.address, badDebt);
      await f.vUSDT.connect(shortfall).badDebtRecovered(badDebt);

      expect(await f.vUSDT.badDebt()).to.equal(0);
      const recovered = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);
      expect(recovered).to.be.gt(marked);
      expect(recovered).to.be.closeTo(hubBefore, 2);
    });

    it("routes an under-threshold account to healAccount and refuses the other two paths", async () => {
      await fundAndDefault(f);

      // Too small for a regular liquidation...
      const repay = usd("10");
      await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.liquidator.address, repay);
      await f.usdt.connect(f.liquidator).approve(f.vUSDT.address, repay);
      await expect(
        f.vUSDT.connect(f.liquidator).liquidateBorrow(f.borrower.address, repay, f.vBTCB.address),
      ).to.be.revertedWithCustomError(f.spoke, "MinimalCollateralViolated");

      // ...and the collateral cannot clear the debt, so `liquidateAccount` is the wrong batch path.
      await expect(
        f.spoke
          .connect(f.liquidator)
          .liquidateAccount(f.borrower.address, [
            { vTokenCollateral: f.vBTCB.address, vTokenBorrowed: f.vUSDT.address, repayAmount: repay },
          ]),
      ).to.be.revertedWithCustomError(f.spoke, "DebtExceedsClearableAmount");

      await expect(healAs(f, f.liquidator)).to.not.be.reverted;
    });

    it("routes by each collateral market's own liquidation incentive", async () => {
      // `maxClearableDebt` sums `collateralValue / liquidationIncentive` at each market's own
      // incentive, so this market's override is what moved the account from `liquidateAccount` to
      // `healAccount`. Put it back on the pool-wide value and the routing flips.
      await fundAndDefault(f);
      expect(await f.spoke.effectiveLiquidationIncentive(f.vBTCB.address)).to.equal(usd("2"));
      // The pool-wide value is untouched, and the market with no override still reads it.
      expect(await f.spoke.effectiveLiquidationIncentive(f.vUSDT.address)).to.equal(usd("1.1"));

      await f.spoke.connect(f.timelock).setMarketLiquidationIncentive(f.vBTCB.address, usd("1.1"));
      // At the pool-wide discount the collateral covers the debt, so healing would forgive nothing.
      await expect(f.spoke.connect(f.liquidator).healAccount(f.borrower.address)).to.be.revertedWithCustomError(
        f.spoke,
        "CollateralCoversDebt",
      );
    });
  });
}

/**
 * `healAccount` makes the caller repay its share of the debt, so the healer has to hold and approve
 * the underlying of every market the borrower owes in. A keeper that forgets this reverts on the
 * transfer, not on any policy check.
 */
async function healAs(f: SpokeForkFixture, who: SignerWithAddress) {
  const owed = await f.vUSDT.callStatic.borrowBalanceCurrent(f.borrower.address);
  await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, who.address, owed);
  await f.usdt.connect(who).approve(f.vUSDT.address, owed);
  return f.spoke.connect(who).healAccount(f.borrower.address);
}

async function impersonate(who: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

/**
 * Fund the market from the Hub, open a small borrow against BTCB, then move the two risk parameters
 * that decide the account's fate: the liquidation threshold, which puts it under water, and the
 * collateral market's own liquidation incentive, which shrinks what that collateral can clear below
 * what is owed. That is the exact state `healAccount` exists for, and the only one that produces bad
 * debt.
 *
 * Both are governance parameters on this pool, so nothing outside the spoke pool is touched. Moving
 * a live price feed would reach the ResilientOracle, which every other pool on this chain shares.
 */
async function fundAndDefault(f: SpokeForkFixture, deposit = usd("100000")) {
  await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, deposit);
  await f.usdt.connect(f.supplier).approve(f.hub.address, deposit);
  await f.hub.connect(f.supplier).deposit(deposit, f.supplier.address);

  // Sized against the live BTCB price so the position sits under `minLiquidatableCollateral`
  // (100 USD), which is what takes the regular liquidation path off the table.
  const btcbPrice: BigNumber = await f.oracle.getPrice(bscmainnet.BTCB);
  const collateral = usd("90").mul(EXP_SCALE).div(btcbPrice);
  await fundFrom(f.btcb, bscmainnet.BTCB_HOLDER, f.borrower.address, collateral);
  await f.btcb.connect(f.borrower).approve(f.vBTCB.address, collateral);
  await f.vBTCB.connect(f.borrower).mint(collateral);
  await f.spoke.connect(f.borrower).enterMarkets([f.vBTCB.address]);
  await f.vUSDT.connect(f.borrower).borrow(usd("65")); // 0.75 x 90 = 67.5 of borrowing power

  // Under water on the liquidation threshold...
  await f.spoke.connect(f.timelock).setCollateralFactor(f.vBTCB.address, usd("0.1"), usd("0.1"));
  // ...and the collateral can no longer clear the debt at this market's discount:
  // maxClearableDebt = 90 / 2 = 45, against 65 owed.
  await f.spoke.connect(f.timelock).setMarketLiquidationIncentive(f.vBTCB.address, usd("2"));

  const [, , shortfall] = await f.spoke.getAccountLiquidity(f.borrower.address);
  expect(shortfall).to.be.gt(0);

  const hubBefore: BigNumber = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);
  return { hubBefore };
}

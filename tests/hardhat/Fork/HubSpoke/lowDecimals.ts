import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { IERC20, VToken } from "../../../../typechain";
import { bscmainnet } from "./constants";
import { SpokeForkFixture, addLowDecimalMarket, fundFrom, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const EXP_SCALE = ethers.constants.WeiPerEther;
const trxAmt = (whole: string) => ethers.utils.parseUnits(whole, 6);

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: a market whose exchange rate is below 1e18", () => {
    let f: SpokeForkFixture;
    let vTRX: VToken;
    let trxSource: Contract;
    let trx: IERC20;
    let trxHub: Contract;
    let snap: SnapshotRestorer;

    before(async () => {
      f = await spokeForkFixture();
      ({ vTRX, trxSource, trx, trxHub } = await addLowDecimalMarket(f));
      snap = await takeSnapshot();
    });
    afterEach(async () => snap.restore());

    it("really is the sub-EXP_SCALE regime", async () => {
      // 10 ** (18 + 6 - 8) = 1e16. Everything below turns on this being under 1e18; an 18-decimal
      // market lists at 1e28 and never reaches it.
      const rate: BigNumber = await vTRX.exchangeRateStored();
      expect(rate).to.be.lt(EXP_SCALE);
      const meta = await ethers.getContractAt("IERC20Metadata", bscmainnet.TRX);
      expect(await meta.decimals()).to.equal(6);
    });

    it("round-trips a deposit", async () => {
      const amount = trxAmt("100000");
      await deposit(amount);
      // Worth what went in, to within the single unit the mint truncates away: the deposit buys
      // `floor(amount * 1e18 / rate)` vTokens and the remainder is not enough for one more.
      const held: BigNumber = await f.adapter.totalAssets(vTRX.address, trxSource.address);
      expect(amount.sub(held)).to.be.lte(1);

      const out = amount.sub(trxAmt("1"));
      const before = await trx.balanceOf(f.supplier.address);
      await withdrawAsHub(out, f.supplier.address);
      expect(await trx.balanceOf(f.supplier.address)).to.equal(before.add(out));
    });

    it("settles a one-unit withdrawal the market would otherwise pay nothing for", async () => {
      // At a rate of 1e16 a 1-unit request burns 100 vTokens and still truncates its payout to
      // zero, which the market rejects outright with "redeemAmount is zero". The adapter raises the
      // request to the smallest one that settles and still forwards exactly what was asked for.
      await deposit(trxAmt("100000"));

      const before = await trx.balanceOf(f.supplier.address);
      const idleBefore = await trx.balanceOf(trxSource.address);
      await withdrawAsHub(1, f.supplier.address, { gasLimit: 3_000_000 });

      expect(await trx.balanceOf(f.supplier.address)).to.equal(before.add(1));
      // The surplus the bump redeemed stays idle on the YieldGroup, where `totalAssets` counts it
      // and the next withdrawal spends it first.
      expect(await trx.balanceOf(trxSource.address)).to.be.gte(idleBefore);
    });

    it("raises a request the market would pay nothing for, instead of reverting the withdrawal", async () => {
      await deposit(trxAmt("100000"));
      const rate: BigNumber = await vTRX.exchangeRateStored();
      // The regime the bump exists for: one unit buys `floor(1e18 / rate)` vTokens, and those are
      // worth less than one unit back, so the payout truncates away.
      expect(EXP_SCALE.mod(rate), `rate ${rate} must not divide 1e18 evenly`).to.not.equal(0);

      const src = await impersonate(trxSource.address);
      await expect(vTRX.connect(src).redeemUnderlying(1)).to.be.revertedWith("redeemAmount is zero");

      // Through the adapter the same request settles, and the caller still receives exactly what it
      // asked for. A dust remainder handed down a withdraw cascade therefore does not revert an
      // otherwise valid withdrawal.
      const before = await trx.balanceOf(f.outsider.address);
      const idleBefore = await trx.balanceOf(trxSource.address);
      await withdrawAsHub(1, f.outsider.address);
      expect(await trx.balanceOf(f.outsider.address)).to.equal(before.add(1));
      // The over-redeemed remainder is retained as idle rather than left in the market or lost.
      expect(await trx.balanceOf(trxSource.address)).to.be.gt(idleBefore);
    });

    it("certifies a bound the holder's own vTokens can actually settle", async () => {
      // KNOWN FAILURE - reports a real defect in `AdapterSpokeV1.maxWithdraw`, not a test artifact.
      //
      // `maxWithdraw` bounds the answer by the position's PRO-RATA value,
      // `vBal * (cash + totalBorrows - totalReserves) / totalSupply`, then certifies it against the
      // market's payable cash and against the payout its own redeem arithmetic would produce. It
      // never checks the third constraint: that the burn implied by that request fits inside the
      // holder's OWN vToken balance. A redeem rounds its burn UP, so the last unit of the pro-rata
      // value can need one more vToken than the holder owns, and `redeemUnderlying` then reverts
      // with an arithmetic underflow while burning.
      //
      // Not a loss of funds - `redeem(balanceOf)` still exits the position - but the adapter only
      // ever calls `redeemUnderlying`, so the Hub has no path to that last unit:
      // `YieldGroupBase.withdraw` surfaces the skipped leg as `ResourceLiquidityInsufficient` and
      // the whole withdrawal reverts. It also blocks the drain-to-zero that `removeResource`
      // requires, which the adapter's own NatSpec states this flooring is designed to allow.
      //
      // Reachable when `vBal * backing` does not divide `totalSupply` evenly, which needs a second
      // supplier - here the market's own listing seed. It shows up at a low exchange rate because
      // one vToken is then worth a fraction of one underlying unit; at the 1e28 rate of an
      // 18-decimal market the pro-rata truncation is far larger than one vToken and hides it.
      await deposit(trxAmt("100000"));

      const rate: BigNumber = await vTRX.exchangeRateStored();
      const liquid: BigNumber = await f.adapter.maxWithdraw(vTRX.address, trxSource.address);
      const held: BigNumber = await vTRX.balanceOf(trxSource.address);

      // The burn `redeemUnderlying(liquid)` performs, computed the way `_redeemFresh` does.
      let burn = liquid.mul(EXP_SCALE).div(rate);
      const probe = burn.mul(rate).div(EXP_SCALE);
      if (!probe.isZero() && !probe.eq(liquid)) burn = burn.add(1);

      expect(burn, `certified ${liquid} needs ${burn} vTokens, holder owns ${held}`).to.be.lte(held);

      // And therefore the position can be emptied through the adapter, which is what
      // `removeResource` gates on.
      await withdrawAsHub(liquid, f.supplier.address, { gasLimit: 5_000_000 });
      expect(await f.adapter.receiptBalance(vTRX.address, trxSource.address)).to.equal(0);
      await expect(trxSource.connect(f.timelock).removeResource(vTRX.address)).to.not.be.reverted;
    });

    it("reports capacity in the underlying's own units, not the vToken's", async () => {
      const room: BigNumber = await f.adapter.connect(await impersonate(trxSource.address)).maxDeposit(vTRX.address);
      const cap = await f.spoke.supplyCaps(vTRX.address);
      const supplied = (await vTRX.totalSupply()).mul(await vTRX.exchangeRateStored()).div(EXP_SCALE);
      expect(room).to.be.lte(cap.sub(supplied));
      // Within the 0.1% margin the adapter withholds to absorb an accrual between this read and the
      // mint it sizes.
      expect(room).to.be.gt(cap.sub(supplied).mul(998).div(1000));
    });

    /// Deposit through the TRX Hub, which is the only way a YieldGroup is ever funded.
    async function deposit(amount: BigNumber) {
      await fundFrom(trx, bscmainnet.TRX_HOLDER, f.supplier.address, amount);
      await trx.connect(f.supplier).approve(trxHub.address, amount);
      await trxHub.connect(f.supplier).deposit(amount, f.supplier.address, { gasLimit: 5_000_000 });
    }

    /// Pull straight from the source as its Hub, so the assertion is about the adapter's own
    /// arithmetic rather than about the Hub's share maths on top of it.
    async function withdrawAsHub(amount: BigNumber | number, to: string, overrides?: object) {
      const hubSigner = await impersonate(trxHub.address);
      return trxSource.connect(hubSigner).withdraw(amount, to, overrides ?? { gasLimit: 3_000_000 });
    }
  });
}

async function impersonate(who: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

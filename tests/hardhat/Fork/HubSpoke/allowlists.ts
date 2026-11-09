import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { bscmainnet } from "./constants";
import { SpokeForkFixture, fundFrom, registerOnHub, registerSpokeResource, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const usd = (whole: string) => ethers.utils.parseUnits(whole, 18);
const HUB_CAP = usd("2000000");

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: allowlists, liquidation and griefing", () => {
    let f: SpokeForkFixture;
    let snap: SnapshotRestorer;

    before(async () => {
      f = await spokeForkFixture();
      await registerSpokeResource(f);
      await registerOnHub(f, HUB_CAP);
      snap = await takeSnapshot();
    });
    afterEach(async () => snap.restore());

    describe("supply allowlist", () => {
      it("meters the account credited with the vTokens, not the account paying", async () => {
        // `mintBehalf` lets a third party fund a mint attributed to someone else. Metering the
        // recipient is what bounds the market's supply, so the payer is deliberately unchecked.
        const amount = usd("1000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.outsider.address, amount.mul(2));
        await f.usdt.connect(f.outsider).approve(f.vUSDT.address, amount.mul(2));

        // The outsider cannot supply for itself...
        await expect(f.vUSDT.connect(f.outsider).mint(amount))
          .to.be.revertedWithCustomError(f.spoke, "SupplyNotAllowed")
          .withArgs(f.vUSDT.address, f.outsider.address);

        // ...but it can pay for a mint credited to the allowlisted YieldGroup, which is a donation
        // to the Hub's position rather than a way around the allowlist.
        const before = await f.vUSDT.balanceOf(f.spokeSource.address);
        await f.vUSDT.connect(f.outsider).mintBehalf(f.spokeSource.address, amount);
        expect(await f.vUSDT.balanceOf(f.spokeSource.address)).to.be.gt(before);
      });

      it("lets an account that loses its grant keep and exit its position", async () => {
        const amount = usd("10000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);

        await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, f.spokeSource.address, false);
        // Supply is closed...
        expect(await f.spokeSource.maxDeposit()).to.equal(0);
        // ...but the position is untouched and the exit still works. Redeeming is never gated.
        expect(await f.spokeSource.maxWithdraw()).to.be.gt(0);
        const shares = await f.hub.balanceOf(f.supplier.address);
        await expect(f.hub.connect(f.supplier).redeem(shares, f.supplier.address, f.supplier.address)).to.not.be
          .reverted;
      });

      it("does not stop an allowlisted holder transferring vTokens to a non-allowlisted one", async () => {
        // Recorded as observed behaviour, not as an endorsement: `preMintHook` is the only
        // enforcement point, and `preTransferHook` never checks the destination. Any design that
        // needs "the Hub is the sole holder of the liquidity market" as an invariant does not get
        // it from this contract.
        const amount = usd("10000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, f.supplier.address, true);
        await f.usdt.connect(f.supplier).approve(f.vUSDT.address, amount);
        await f.vUSDT.connect(f.supplier).mint(amount);

        const held = await f.vUSDT.balanceOf(f.supplier.address);
        expect(await f.spoke.isAllowedSupplier(f.vUSDT.address, f.outsider.address)).to.be.false;
        await expect(f.vUSDT.connect(f.supplier).transfer(f.outsider.address, held)).to.not.be.reverted;
        expect(await f.vUSDT.balanceOf(f.outsider.address)).to.equal(held);
      });

      it("is per market, so closing the liquidity market leaves the collateral market open", async () => {
        expect(await f.spoke.isSupplyAllowlistEnabled(f.vUSDT.address)).to.be.true;
        expect(await f.spoke.isSupplyAllowlistEnabled(f.vBTCB.address)).to.be.false;

        const collateral = ethers.utils.parseUnits("0.01", 18);
        await fundFrom(f.btcb, bscmainnet.BTCB_HOLDER, f.outsider.address, collateral);
        await f.btcb.connect(f.outsider).approve(f.vBTCB.address, collateral);
        await expect(f.vBTCB.connect(f.outsider).mint(collateral)).to.not.be.reverted;
      });
    });

    describe("griefing the Hub's capacity", () => {
      it("cannot be squatted by a third party while the allowlist is armed", async () => {
        // The whole point of the allowlist: with it on, nobody but the source can consume the
        // market's supply cap, so the Hub's advertised capacity cannot be taken away from it.
        const roomBefore: BigNumber = await f.spokeSource.maxDeposit();
        const amount = usd("100000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.outsider.address, amount);
        await f.usdt.connect(f.outsider).approve(f.vUSDT.address, amount);
        await expect(f.vUSDT.connect(f.outsider).mint(amount)).to.be.revertedWithCustomError(
          f.spoke,
          "SupplyNotAllowed",
        );
        expect(await f.spokeSource.maxDeposit()).to.equal(roomBefore);
      });

      it("is squattable the moment the allowlist is lifted", async () => {
        // Stated explicitly because it is the cost of running a spoke market with the allowlist
        // off: anyone can then take the cap the Hub was sized for, and the Hub's own routing has
        // to absorb that.
        await f.spoke.connect(f.timelock).setSupplyAllowlistEnabled(f.vUSDT.address, false);
        const roomBefore: BigNumber = await f.spokeSource.maxDeposit();
        const amount = roomBefore.div(2);
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.outsider.address, amount);
        await f.usdt.connect(f.outsider).approve(f.vUSDT.address, amount);
        await f.vUSDT.connect(f.outsider).mint(amount);
        expect(await f.spokeSource.maxDeposit()).to.be.lt(roomBefore);
      });

      it("cannot be drained by a borrower below the Hub's own exit, only slowed", async () => {
        const deposited = usd("100000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, deposited);
        await f.usdt.connect(f.supplier).approve(f.hub.address, deposited);
        await f.hub.connect(f.supplier).deposit(deposited, f.supplier.address);
        await borrowAgainst(f, usd("100000"), ethers.utils.parseUnits("4", 18));

        // Every borrowable wei is out, so the market's cash is only the seed the pool was listed
        // with. The position is still fully valued; it is the liquidity that is gone, and the
        // adapter reports exactly that rather than an optimistic number.
        expect(await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address)).to.be.gte(deposited);
        const liquid = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        expect(liquid).to.be.lt(deposited);
        expect(liquid).to.be.lte(await f.vUSDT.getCash());

        // Repaying restores it, so this is a delay and not a loss.
        await f.usdt.connect(f.borrower).approve(f.vUSDT.address, ethers.constants.MaxUint256);
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.borrower.address, usd("1000"));
        await f.vUSDT.connect(f.borrower).repayBorrow(ethers.constants.MaxUint256);
        expect(await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address)).to.be.gt(liquid);
      });
    });

    describe("liquidation allowlist", () => {
      beforeEach(async () => {
        const deposited = usd("100000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, deposited);
        await f.usdt.connect(f.supplier).approve(f.hub.address, deposited);
        await f.hub.connect(f.supplier).deposit(deposited, f.supplier.address);
      });

      it("is off by default, so any keeper can liquidate", async () => {
        expect(await f.spoke.isLiquidationAllowlistEnabled()).to.be.false;
        await makeLiquidatable(f);
        await expect(liquidate(f, f.liquidator.address)).to.not.be.reverted;
      });

      it("restricts seizing to the accounts on it once enabled", async () => {
        await f.spoke.connect(f.timelock).setLiquidationAllowlistEnabled(true);
        await makeLiquidatable(f);

        await expect(liquidate(f, f.liquidator.address))
          .to.be.revertedWithCustomError(f.spoke, "LiquidationNotAllowed")
          .withArgs(f.liquidator.address);

        await f.spoke.connect(f.timelock).setAllowedLiquidator(f.liquidator.address, true);
        await expect(liquidate(f, f.liquidator.address)).to.not.be.reverted;
      });

      it("is pool-wide, so it also gates the keeper that records bad debt", async () => {
        // `healAccount` seizes across every market the borrower is in and cannot attribute the
        // seizure to one of them, which is why the list is not per market. The operational
        // consequence is that any keeper relied on to write off bad debt has to be on it too.
        await f.spoke.connect(f.timelock).setLiquidationAllowlistEnabled(true);
        await makeLiquidatable(f);
        await expect(f.spoke.connect(f.liquidator).healAccount(f.borrower.address)).to.be.revertedWithCustomError(
          f.spoke,
          "LiquidationNotAllowed",
        );
      });

      it("never puts the Hub's own position at risk of being seized", async () => {
        // The YieldGroup supplies and never borrows, so it has no shortfall to liquidate and holds
        // no collateral membership to seize from.
        expect(await f.spoke.getAssetsIn(f.spokeSource.address)).to.have.lengthOf(0);
        const [, liquidity, shortfall] = await f.spoke.getAccountLiquidity(f.spokeSource.address);
        expect(liquidity).to.equal(0);
        expect(shortfall).to.equal(0);
        const vBalBefore = await f.vUSDT.balanceOf(f.spokeSource.address);
        await makeLiquidatable(f);
        await liquidate(f, f.liquidator.address);
        expect(await f.vUSDT.balanceOf(f.spokeSource.address)).to.equal(vBalBefore);
      });
    });
  });
}

/// Impersonate `who` with enough gas money to send a transaction.
async function impersonate(who: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

async function borrowAgainst(f: SpokeForkFixture, borrowAmount: BigNumber, collateral: BigNumber) {
  await fundFrom(f.btcb, bscmainnet.BTCB_HOLDER, f.borrower.address, collateral);
  await f.btcb.connect(f.borrower).approve(f.vBTCB.address, collateral);
  await f.vBTCB.connect(f.borrower).mint(collateral);
  await f.spoke.connect(f.borrower).enterMarkets([f.vBTCB.address]);
  await f.vUSDT.connect(f.borrower).borrow(borrowAmount);
}

/**
 * Put the borrower under water on real prices. The collateral factor is 0.75 and the liquidation
 * threshold 0.8, so raising the threshold above the position's health is the one lever that does not
 * require moving a live price feed - and it moves exactly the parameter a risk-parameter VIP would.
 */
async function makeLiquidatable(f: SpokeForkFixture) {
  await borrowAgainst(f, ethers.utils.parseUnits("40000", 18), ethers.utils.parseUnits("1", 18));
  await f.spoke
    .connect(f.timelock)
    .setCollateralFactor(f.vBTCB.address, ethers.utils.parseUnits("0.1", 18), ethers.utils.parseUnits("0.1", 18));
  const [, , shortfall] = await f.spoke.getAccountLiquidity(f.borrower.address);
  expect(shortfall).to.be.gt(0);
}

async function liquidate(f: SpokeForkFixture, who: string) {
  const signer = await impersonate(who);
  const repay = ethers.utils.parseUnits("1000", 18);
  await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, who, repay);
  await f.usdt.connect(signer).approve(f.vUSDT.address, repay);
  return f.vUSDT.connect(signer).liquidateBorrow(f.borrower.address, repay, f.vBTCB.address);
}

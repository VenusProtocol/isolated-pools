import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { Action, bscmainnet } from "./constants";
import { SpokeForkFixture, fundFrom, grant, registerOnHub, registerSpokeResource, spokeForkFixture } from "./fixture";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const usd = (whole: string) => ethers.utils.parseUnits(whole, 18);
const HUB_CAP = usd("2000000");
const EXP_SCALE = ethers.constants.WeiPerEther;

if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: the Hub funding a spoke market", () => {
    let f: SpokeForkFixture;
    let snap: SnapshotRestorer;

    before(async () => {
      f = await spokeForkFixture();
      snap = await takeSnapshot();
    });
    afterEach(async () => snap.restore());

    // ── Registration ───────────────────────────────────────────────────────
    describe("registering the market as a resource", () => {
      it("is refused while the market's allowlist is on without the source on it", async () => {
        await f.spoke.connect(f.timelock).setSupplyAllowlistEnabled(f.vUSDT.address, true);
        await expect(f.spokeSource.connect(f.timelock).addResource(f.vUSDT.address, f.adapter.address))
          .to.be.revertedWithCustomError(f.adapter, "SupplyNotAllowed")
          .withArgs(f.vUSDT.address, f.spokeSource.address);

        await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, f.spokeSource.address, true);
        await expect(f.spokeSource.connect(f.timelock).addResource(f.vUSDT.address, f.adapter.address)).to.not.be
          .reverted;
      });

      it("gates on the YieldGroup, not the Hub, the adapter or the depositor", async () => {
        await f.spoke.connect(f.timelock).setSupplyAllowlistEnabled(f.vUSDT.address, true);
        // The account credited with the vTokens under delegatecall is the YieldGroup, so that is
        // the only address whose grant matters. Allowlisting anything else changes nothing.
        for (const wrong of [bscmainnet.HUB_USDT, f.adapter.address, f.supplier.address]) {
          await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, wrong, true);
        }
        await expect(
          f.spokeSource.connect(f.timelock).addResource(f.vUSDT.address, f.adapter.address),
        ).to.be.revertedWithCustomError(f.adapter, "SupplyNotAllowed");
      });

      it("rejects a market from a pool that is not a spoke pool", async () => {
        // `validateRegistration` doubles as the type probe: the allowlist accessors exist only on
        // the spoke fork, so the call itself reverts against the shared Comptroller.
        const stablecoins = await ethers.getContractAt("Comptroller", bscmainnet.COMPTROLLER_STABLECOINS);
        const foreign = (await stablecoins.getAllMarkets())[0];
        await expect(f.spokeSource.connect(f.timelock).addResource(foreign, f.adapter.address)).to.be.reverted;
      });

      it("rejects a spoke market whose underlying is not the source's asset", async () => {
        await expect(f.spokeSource.connect(f.timelock).addResource(f.vBTCB.address, f.adapter.address)).to.be.reverted;
      });
    });

    // ── Deposit ────────────────────────────────────────────────────────────
    describe("deposit", () => {
      beforeEach(async () => {
        await registerSpokeResource(f);
        await registerOnHub(f, HUB_CAP);
      });

      it("mints vTokens to the YieldGroup and never makes it a market member", async () => {
        const amount = usd("50000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);

        const cashBefore = await f.vUSDT.getCash();
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);

        expect(await f.vUSDT.getCash()).to.equal(cashBefore.add(amount));
        expect(await f.vUSDT.balanceOf(f.spokeSource.address)).to.be.gt(0);
        expect(await f.vUSDT.balanceOf(f.adapter.address)).to.equal(0);
        expect(await f.usdt.balanceOf(f.adapter.address)).to.equal(0);
        // Supply-only, so it never enters the market. That is what lets `_checkRedeemAllowed`
        // return before it touches the deviation-bounded oracle.
        expect(await f.spoke.getAssetsIn(f.spokeSource.address)).to.have.lengthOf(0);
        expect(await f.spoke.checkMembership(f.spokeSource.address, f.vUSDT.address)).to.be.false;
      });

      it("values the position at exactly what was supplied, to the wei", async () => {
        const amount = usd("50000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);
        expect(await f.spokeSource.totalAssets()).to.equal(amount);
        expect(await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address)).to.equal(amount);
      });

      it("places exactly maxDeposit(), which is the honest headroom of the live market", async () => {
        const room: BigNumber = await f.spokeSource.maxDeposit();
        expect(room).to.be.gt(0);

        // Driven from the Hub's own address rather than through `Hub.deposit`, so the assertion is
        // about the adapter's headroom alone and not about the Hub's dual cap, which is a separate
        // and much smaller bound.
        const hubSigner = await impersonate(bscmainnet.HUB_USDT);
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, bscmainnet.HUB_USDT, room);
        await f.usdt.connect(hubSigner).approve(f.spokeSource.address, room);

        const placed = await f.spokeSource.connect(hubSigner).callStatic.deposit(room);
        // Explicit gas limit, because `_tryDepositOneResource` routes around a leg that reverts and
        // an estimated limit can settle on exactly the gas at which the inner delegatecall runs out
        // under the 63/64 rule - which the cascade then reports as a skip rather than a failure.
        // See "a gas-estimated deposit can be routed away from this market" below.
        await f.spokeSource.connect(hubSigner).deposit(room, { gasLimit: 3_000_000 });
        // Every wei advertised is placed: nothing is refunded to the caller, and the position is
        // worth what went in.
        expect(placed).to.equal(room);
        expect(await f.usdt.balanceOf(bscmainnet.HUB_USDT)).to.equal(0);
        expect(await f.spokeSource.totalAssets()).to.equal(room);
      });

      it("reports zero room, and routes around the market, once the supply cap is full", async () => {
        // A third party can fill the cap even though it cannot supply to an allowlisted market:
        // here the cap is lowered instead, which is the same end state and is reachable by
        // governance alone.
        const supplied = (await f.vUSDT.totalSupply())
          .mul(await f.vUSDT.exchangeRateStored())
          .div(ethers.constants.WeiPerEther);
        await f.spoke.connect(f.timelock).setMarketSupplyCaps([f.vUSDT.address], [supplied]);
        expect(await adapterRoomForSource(f)).to.equal(0);
        expect(await f.spokeSource.maxDeposit()).to.equal(0);

        // The Hub still takes the deposit: the cascade skips a full leg and places it in the next
        // group, rather than reverting the depositor's transaction.
        const amount = usd("1000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        const before = await f.vUSDT.getCash();
        await expect(f.hub.connect(f.supplier).deposit(amount, f.supplier.address)).to.not.be.reverted;
        expect(await f.vUSDT.getCash()).to.equal(before);
      });

      it("reads a supply cap of zero as a real cap and uint256 max as uncapped", async () => {
        // Inverted relative to the Core Comptroller, where zero is what disables minting.
        await f.spoke.connect(f.timelock).setMarketSupplyCaps([f.vUSDT.address], [0]);
        expect(await adapterRoomForSource(f)).to.equal(0);
        const amount = usd("100");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.vUSDT.address, amount);
        await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, f.supplier.address, true);
        await expect(f.vUSDT.connect(f.supplier).mint(amount)).to.be.revertedWithCustomError(
          f.spoke,
          "SupplyCapExceeded",
        );

        await f.spoke.connect(f.timelock).setMarketSupplyCaps([f.vUSDT.address], [ethers.constants.MaxUint256]);
        expect(await adapterRoomForSource(f)).to.equal(await f.adapter.UNCAPPED_DEPOSIT_ROOM());
        await expect(f.vUSDT.connect(f.supplier).mint(amount)).to.not.be.reverted;
      });

      it("never loses a deposit when a gas-estimated call routes it away from this market", async () => {
        // `YieldGroupBase._tryDepositOneResource` wraps the adapter dispatch in try/catch so a
        // resource that reverts is routed around rather than bubbled. Under the 63/64 rule the
        // inner call gets only a fraction of the remaining gas, so an `eth_estimateGas` limit can
        // land on a value where the inner mint runs out of gas and the leg is reported as skipped.
        // The Hub's backstop is what makes that safe: `_routeDeposit` reverts `HubCapacityExceeded`
        // if anything is left unplaced, so the depositor is never silently under-served - the
        // deposit lands in another group, or the whole transaction reverts.
        const amount = usd("25000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);

        const sharesBefore = await f.hub.balanceOf(f.supplier.address);
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);
        expect(await f.hub.balanceOf(f.supplier.address)).to.be.gt(sharesBefore);
        // Whatever the routing chose, the depositor's claim is worth what they paid.
        expect(await f.hub.maxWithdraw(f.supplier.address)).to.be.gte(amount.mul(9999).div(10000));
        expect(await f.usdt.balanceOf(f.hub.address)).to.equal(0);
      });

      it("reports zero room while MINT is paused, instead of letting the deposit revert", async () => {
        await f.spoke.connect(f.timelock).setActionsPaused([f.vUSDT.address], [Action.MINT], true);
        expect(await adapterRoomForSource(f)).to.equal(0);

        const amount = usd("1000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        const before = await f.vUSDT.getCash();
        await expect(f.hub.connect(f.supplier).deposit(amount, f.supplier.address)).to.not.be.reverted;
        expect(await f.vUSDT.getCash()).to.equal(before);
      });
    });

    // ── Withdraw ───────────────────────────────────────────────────────────
    describe("withdraw", () => {
      const deposited = usd("100000");

      beforeEach(async () => {
        await registerSpokeResource(f);
        await registerOnHub(f, HUB_CAP);
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, deposited);
        await f.usdt.connect(f.supplier).approve(f.hub.address, deposited);
        await f.hub.connect(f.supplier).deposit(deposited, f.supplier.address);
      });

      it("returns the whole position and leaves nothing stranded", async () => {
        const shares = await f.hub.balanceOf(f.supplier.address);
        const before = await f.usdt.balanceOf(f.supplier.address);
        await f.hub.connect(f.supplier).redeem(shares, f.supplier.address, f.supplier.address);

        expect(await f.usdt.balanceOf(f.supplier.address)).to.be.gte(before.add(deposited));
        expect(await f.vUSDT.balanceOf(f.spokeSource.address)).to.equal(0);
        expect(await f.usdt.balanceOf(f.spokeSource.address)).to.equal(0);
        expect(await f.usdt.balanceOf(f.adapter.address)).to.equal(0);
      });

      it("lets a fully drained market be deregistered", async () => {
        const shares = await f.hub.balanceOf(f.supplier.address);
        await f.hub.connect(f.supplier).redeem(shares, f.supplier.address, f.supplier.address);
        // `removeResource` gates on the raw receipt balance, so the redeem has to have burned every
        // last vToken - a value-based check would round a residual to zero and orphan it.
        expect(await f.adapter.receiptBalance(f.vUSDT.address, f.spokeSource.address)).to.equal(0);
        await expect(f.spokeSource.connect(f.timelock).removeResource(f.vUSDT.address)).to.not.be.reverted;
      });

      it("never certifies more than the market's payable cash", async () => {
        await borrowAgainstCollateral(f, usd("70000"));
        await f.adapter.accrue(f.vUSDT.address);

        const liquid: BigNumber = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        const payable = (await f.vUSDT.getCash()).sub(await f.vUSDT.totalReserves());
        const position = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);

        expect(liquid).to.be.gt(0);
        expect(liquid).to.be.lte(payable);
        expect(liquid).to.be.lte(position);
        // Floored to what a whole number of vTokens is worth, because the redeem rounds its burn
        // up: asking for the payable cash exactly would overshoot it by up to one vToken.
        const rate = await f.vUSDT.exchangeRateStored();
        expect(payable.mul(EXP_SCALE).div(rate).mul(rate).div(EXP_SCALE)).to.equal(liquid);
      });

      it("settles exactly the certified bound when the market is not accruing under it", async () => {
        await borrowAgainstCollateral(f, usd("70000"));
        // Freeze the rate. `maxWithdraw` reads stored state, and its own NatSpec says the figure is
        // exact only for a caller that settled this market's interest in the same transaction - the
        // Hub does, through `accrue`, but a test cannot read and redeem atomically. Taking the rate
        // to zero removes the moving part instead of papering over it with a tolerance, so what is
        // left is the arithmetic this assertion is actually about.
        await grant(
          f.acm,
          f.timelock,
          f.irm.address,
          "updateJumpRateModel(uint256,uint256,uint256,uint256)",
          bscmainnet.NORMAL_TIMELOCK,
        );
        await f.irm.connect(f.timelock).updateJumpRateModel(0, 0, 0, ethers.utils.parseUnits("0.8", 18));
        await f.adapter.accrue(f.vUSDT.address);

        const liquid: BigNumber = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        const hubSigner = await impersonate(bscmainnet.HUB_USDT);
        const before = await f.usdt.balanceOf(f.outsider.address);
        await f.spokeSource.connect(hubSigner).withdraw(liquid, f.outsider.address, { gasLimit: 3_000_000 });
        expect(await f.usdt.balanceOf(f.outsider.address)).to.equal(before.add(liquid));
      });

      it("cannot settle a wei more than the certified bound", async () => {
        await borrowAgainstCollateral(f, usd("70000"));
        await grant(
          f.acm,
          f.timelock,
          f.irm.address,
          "updateJumpRateModel(uint256,uint256,uint256,uint256)",
          bscmainnet.NORMAL_TIMELOCK,
        );
        await f.irm.connect(f.timelock).updateJumpRateModel(0, 0, 0, ethers.utils.parseUnits("0.8", 18));
        await f.adapter.accrue(f.vUSDT.address);

        const liquid: BigNumber = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        const hubSigner = await impersonate(bscmainnet.HUB_USDT);
        // One wei past the bound is one whole vToken past the market's payable cash, because the
        // redeem rounds its burn up. The YieldGroup surfaces that as a liquidity shortfall rather
        // than routing around it, which is what stops a partial withdrawal being reported as whole.
        await expect(
          f.spokeSource.connect(hubSigner).withdraw(liquid.add(1), f.outsider.address, { gasLimit: 3_000_000 }),
        ).to.be.reverted;
      });

      it("is optimistic by exactly the reserves the next accrual books on a stale market", async () => {
        // The documented staleness: read against unaccrued state, the bound counts cash that the
        // next accrual moves into reserves and, past the sweep threshold, out to the
        // ProtocolShareReserve entirely. This is why every Hub routing path accrues first.
        await borrowAgainstCollateral(f, usd("70000"));
        const stale: BigNumber = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        await f.adapter.accrue(f.vUSDT.address);
        const fresh: BigNumber = await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address);
        expect(fresh).to.be.lt(stale);
      });

      it("reports zero withdrawable while REDEEM is paused", async () => {
        await f.spoke.connect(f.timelock).setActionsPaused([f.vUSDT.address], [Action.REDEEM], true);
        expect(await f.adapter.maxWithdraw(f.vUSDT.address, f.spokeSource.address)).to.equal(0);
      });
    });

    // ── Accrual ────────────────────────────────────────────────────────────
    describe("interest", () => {
      beforeEach(async () => {
        await registerSpokeResource(f);
        await registerOnHub(f, HUB_CAP);
        const amount = usd("100000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);
        await borrowAgainstCollateral(f, usd("50000"));
      });

      it("grows the position once the market accrues, and accrue() makes the read fresh", async () => {
        const stale = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);
        await ethers.provider.send("hardhat_mine", ["0x100000"]); // ~1M blocks

        // Stored state has not moved yet: `totalAssets` reads `getCash`/`totalBorrows` as stored.
        expect(await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address)).to.equal(stale);
        await f.adapter.accrue(f.vUSDT.address);
        const fresh = await f.adapter.totalAssets(f.vUSDT.address, f.spokeSource.address);
        expect(fresh).to.be.gt(stale);
      });

      it("annualises from the market's own cadence rather than a YieldGroup constant", async () => {
        const apy = await f.adapter.spotAPYBps(f.vUSDT.address, 0);
        const expected = (await f.vUSDT.supplyRatePerBlock())
          .mul(await f.vUSDT.blocksOrSecondsPerYear())
          .div(BigNumber.from(10).pow(14));
        expect(apy).to.equal(expected);
        // The `blocksPerYear` argument is ignored, which is what lets one source hold block-based
        // and time-based markets side by side.
        expect(await f.adapter.spotAPYBps(f.vUSDT.address, 12_345_678)).to.equal(apy);
      });
    });

    // ── The adapter itself ─────────────────────────────────────────────────
    describe("adapter safety", () => {
      it("refuses a direct call to either mutating entry point", async () => {
        await expect(f.adapter.deposit(f.vUSDT.address, 1)).to.be.revertedWithCustomError(f.adapter, "NotDelegateCall");
        await expect(f.adapter.withdraw(f.vUSDT.address, 1, f.supplier.address)).to.be.revertedWithCustomError(
          f.adapter,
          "NotDelegateCall",
        );
      });

      it("holds no storage of its own, so delegatecall cannot collide with the YieldGroup's", async () => {
        await registerSpokeResource(f);
        await registerOnHub(f, HUB_CAP);
        const amount = usd("10000");
        await fundFrom(f.usdt, bscmainnet.USDT_HOLDER, f.supplier.address, amount);
        await f.usdt.connect(f.supplier).approve(f.hub.address, amount);
        await f.hub.connect(f.supplier).deposit(amount, f.supplier.address);

        for (let slot = 0; slot < 8; slot++) {
          expect(await ethers.provider.getStorageAt(f.adapter.address, slot)).to.equal(ethers.constants.HashZero);
        }
      });
    });
  });
}

/**
 * `AdapterSpokeV1.maxDeposit` reads the market's supply allowlist against `msg.sender`, because the
 * YieldGroup calls it as a plain call and is therefore the prospective supplier. Asking it from any
 * other address answers about that address, so every capacity assertion has to ask as the source.
 */
async function adapterRoomForSource(f: SpokeForkFixture): Promise<BigNumber> {
  return f.adapter.connect(await impersonate(f.spokeSource.address)).maxDeposit(f.vUSDT.address);
}

/// Impersonate `who` with enough gas money to send a transaction.
async function impersonate(who: string) {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

/// Put real collateral behind a real borrow, so the market's cash is genuinely short of its NAV.
async function borrowAgainstCollateral(f: SpokeForkFixture, borrowAmount: BigNumber) {
  const collateral = ethers.utils.parseUnits("2", 18); // 2 BTCB, far more than the borrow needs
  await fundFrom(f.btcb, bscmainnet.BTCB_HOLDER, f.borrower.address, collateral);
  await f.btcb.connect(f.borrower).approve(f.vBTCB.address, collateral);
  await f.vBTCB.connect(f.borrower).mint(collateral);
  await f.spoke.connect(f.borrower).enterMarkets([f.vBTCB.address]);
  await f.vUSDT.connect(f.borrower).borrow(borrowAmount);
}

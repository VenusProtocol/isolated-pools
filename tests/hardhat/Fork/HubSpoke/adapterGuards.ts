import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, Contract, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { AdapterSpokeV1, ISpokeComptroller, IVTokenIsolated, MockToken } from "../../../../typechain";
import { setForkBlock } from "../utils";
import { bscmainnet } from "./constants";
import { BLOCK_NUMBER, HUB_ABI, MAX_UINT128, deployYieldGroup, grant } from "./fixture";

const { expect } = chai;
chai.use(smock.matchers);

/// Compound's mantissa scale, the unit every exchange rate and rate mantissa here is expressed in.
const EXP = parseUnits("1", 18);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

/**
 * The half of `AdapterSpokeV1` a live spoke market cannot drive.
 *
 * Every other file in this directory funds a real market through the real Hub, and between them they
 * exercise each of the adapter's ten members. What none of them can reach is the adapter's defensive
 * half. An isolated-pools `VToken` always returns `NO_ERROR` and reverts on failure, so the three
 * `VToken*Failed` branches never fire against one. No spoke pool lists a fee-on-transfer underlying,
 * so `VTokenUnderfilled` never fires. No live market carries a holder balance against a zero total
 * supply, holds reserves above its entire backing, or reports a zero exchange rate. Those branches
 * exist precisely because the adapter does not own the contracts it reads, and a fork suite is
 * structurally unable to put a contract it does not own into a state it refuses to enter.
 *
 * So the MARKET is faked here and nothing else is. The `YieldGroup` is the real one, minted from the
 * implementation deployed on this chain, reached through its own `depositResource` /
 * `withdrawResource` entry points so the adapter arrives by the same delegatecall the Hub uses. The
 * adapter is the real one. The fakes are built from `IVTokenIsolated` and `ISpokeComptroller`, the
 * two interfaces the adapter compiles against, and `interfaces.ts` pins both to the deployed
 * contracts selector for selector - so a fake cannot drift into answering a surface the live pool
 * does not have.
 */
if (FORK && FORKED_NETWORK === "bscmainnet") {
  describe("HubSpoke: the adapter guards a live market cannot trip", () => {
    /// A plausible rate for an 18-decimal market listed at the usual 1e28 seed, so one vToken is worth
    /// far more than one unit of underlying and the sub-one-vToken guards have a real threshold.
    const RATE_SEEDED = parseUnits("2", 28);
    /// `ceil(RATE_SEEDED / 1e18)` - the smallest deposit that mints a whole vToken at that rate.
    const ONE_VTOKEN_UNIT = RATE_SEEDED.add(EXP).sub(1).div(EXP);
    const ACTION_MINT = 0;
    const ACTION_REDEEM = 1;

    let deployer: SignerWithAddress;
    let timelock: SignerWithAddress;
    let acm: Contract;

    let asset: MockToken;
    let hub: FakeContract<Contract>;
    let yieldGroup: Contract;
    let hubSigner: SignerWithAddress;
    let adapter: AdapterSpokeV1;
    let market: FakeContract<IVTokenIsolated>;
    let comptroller: FakeContract<ISpokeComptroller>;

    // Rebuilt for every test rather than snapshot-restored. A fake's configured behaviour lives in
    // JavaScript, not in the EVM, so a value one test sets on a fake survives a chain rewind and
    // silently becomes the next test's starting state.
    beforeEach(async () => {
      await setForkBlock(BLOCK_NUMBER);
      [deployer] = await ethers.getSigners();
      timelock = await impersonate(bscmainnet.NORMAL_TIMELOCK);
      acm = await ethers.getContractAt("AccessControlManager", bscmainnet.ACM);

      asset = (await (
        await ethers.getContractFactory("MockToken", deployer)
      ).deploy("Spoke Asset", "SPOKE", 18)) as MockToken;

      hub = await smock.fake(HUB_ABI);
      hub.asset.returns(asset.address);
      hubSigner = await impersonate(hub.address);

      yieldGroup = await deployYieldGroup(deployer, hub.address, asset.address);
      adapter = (await (await ethers.getContractFactory("AdapterSpokeV1", deployer)).deploy()) as AdapterSpokeV1;

      market = await smock.fake<IVTokenIsolated>("IVTokenIsolated");
      comptroller = await smock.fake<ISpokeComptroller>("ISpokeComptroller");
      seedHealthyMarket();

      await grant(acm, timelock, yieldGroup.address, "addResource(address,address)", bscmainnet.NORMAL_TIMELOCK);
      await yieldGroup.connect(timelock).addResource(market.address, adapter.address);
    });

    /// A market the adapter is happy with, so each test moves exactly one thing away from it: uncapped,
    /// unpaused, no supply allowlist, and holding far more cash than anything asked of it.
    function seedHealthyMarket() {
      market.comptroller.returns(comptroller.address);
      market.underlying.returns(asset.address);
      market.exchangeRateStored.returns(RATE_SEEDED);
      market.totalSupply.returns(parseUnits("1", 18));
      market.balanceOf.returns(parseUnits("1", 18));
      market.getCash.returns(parseUnits("1000000", 18));
      market.totalBorrows.returns(0);
      market.totalReserves.returns(0);
      market.badDebt.returns(0);
      market.mint.returns(0);
      market.redeemUnderlying.returns(0);
      market.accrueInterest.returns(0);
      market.supplyRatePerBlock.returns(0);
      market.blocksOrSecondsPerYear.returns(0);

      comptroller.isSupplyAllowlistEnabled.returns(false);
      comptroller.isAllowedSupplier.returns(true);
      comptroller.actionPaused.returns(false);
      comptroller.supplyCaps.returns(constants.MaxUint256);
    }

    /// Fund the Hub and route `amount` into the market through the real YieldGroup, the same
    /// delegatecall the Hub's own deposit path takes.
    async function depositAsHub(amount: BigNumber) {
      await asset.connect(hubSigner).faucet(amount);
      await asset.connect(hubSigner).approve(yieldGroup.address, amount);
      return yieldGroup.connect(hubSigner).depositResource(market.address, amount);
    }

    describe("deposit", () => {
      it("refuses an amount too small to mint a single vToken", async () => {
        // `maxDeposit` already declines to advertise a sub-one-vToken remainder, so a market is only
        // ever offered one by a cascade splitting a request across resources. Minting it would hand the
        // market the underlying and issue nothing back; reverting hands the leg to the next resource.
        const amount = ONE_VTOKEN_UNIT.sub(1);
        await expect(depositAsHub(amount))
          .to.be.revertedWithCustomError(adapter, "DepositBelowOneVToken")
          .withArgs(market.address, amount, ONE_VTOKEN_UNIT);
        expect(market.mint).to.have.callCount(0);
      });

      it("accepts exactly one vToken unit, the smallest amount that mints", async () => {
        // The boundary the guard above sits on: one wei less is refused, this is placed.
        await depositAsHub(ONE_VTOKEN_UNIT);
        expect(market.mint).to.have.been.calledWith(ONE_VTOKEN_UNIT);
      });

      it("surfaces a non-zero mint error code instead of booking the deposit", async () => {
        // Isolated pools revert rather than return a code, so this is only reachable if a future market
        // reintroduces Compound's convention. Swallowed, it would leave the YieldGroup accounting for
        // underlying it holds no vTokens against.
        market.mint.returns(7);
        await expect(depositAsHub(parseUnits("1000", 18)))
          .to.be.revertedWithCustomError(adapter, "VTokenMintFailed")
          .withArgs(market.address, 7);
      });

      it("approves the market out of the YieldGroup's balance, never the adapter's", async () => {
        // The approval is what proves the delegatecall context: it is granted in the YieldGroup's
        // storage, from the YieldGroup's own balance, which is what lets the market pull the
        // underlying and credit the vTokens back there. A direct call would have granted it from the
        // adapter, whose balance is always zero.
        //
        // The allowance is still standing afterwards only because this market is a fake and never
        // pulls it. Against a real market the mint consumes it, which is why the adapter does not
        // reset it - and why a fake is the only place this is observable at all.
        const amount = parseUnits("1000", 18);
        await depositAsHub(amount);
        expect(await asset.allowance(yieldGroup.address, market.address)).to.equal(amount);
        expect(await asset.allowance(adapter.address, market.address)).to.equal(0);
        expect(market.mint).to.have.been.calledWith(amount);
      });
    });

    describe("withdraw", () => {
      const amount = parseUnits("1000", 18);

      it("surfaces a non-zero redeem error code", async () => {
        market.redeemUnderlying.returns(9);
        await expect(yieldGroup.connect(hubSigner).withdrawResource(market.address, amount, deployer.address))
          .to.be.revertedWithCustomError(adapter, "VTokenRedeemFailed")
          .withArgs(market.address, 9);
      });

      it("rejects a redeem that reported success but delivered nothing", async () => {
        // The shape a fee-on-transfer underlying takes, and the shape a market bug takes: the call
        // returns `NO_ERROR` and the YieldGroup's balance does not move. Forwarding `amount` anyway
        // would pay the recipient out of the YieldGroup's idle balance, which belongs to someone else.
        await expect(yieldGroup.connect(hubSigner).withdrawResource(market.address, amount, deployer.address))
          .to.be.revertedWithCustomError(adapter, "VTokenUnderfilled")
          .withArgs(market.address, amount, 0);
      });

      it("refuses to certify more than the market's payable cash before it ever redeems", async () => {
        // The YieldGroup's own liquidity check runs first, against `maxWithdraw`. A request above it is
        // rejected there, so the adapter is never handed a redeem the market would fail.
        market.getCash.returns(parseUnits("10", 18));
        const liquid = await adapter.maxWithdraw(market.address, yieldGroup.address);
        await expect(yieldGroup.connect(hubSigner).withdrawResource(market.address, liquid.add(1), deployer.address)).to
          .be.reverted;
        expect(market.redeemUnderlying).to.have.callCount(0);
      });
    });

    describe("accrue", () => {
      it("surfaces a non-zero accrual error code", async () => {
        market.accrueInterest.returns(3);
        await expect(adapter.accrue(market.address))
          .to.be.revertedWithCustomError(adapter, "VTokenAccrueFailed")
          .withArgs(market.address, 3);
      });

      it("needs no delegatecall context, because it settles the market and not the caller", async () => {
        await adapter.accrue(market.address);
        expect(market.accrueInterest).to.have.callCount(1);
      });
    });

    describe("totalAssets", () => {
      it("reports zero rather than dividing by a zero supply", async () => {
        // Unreachable while the holder's balance is non-zero, since those vTokens are part of the
        // supply. Kept as a division guard rather than an assumption about a contract this one reads.
        market.balanceOf.returns(parseUnits("1", 18));
        market.totalSupply.returns(0);
        expect(await adapter.totalAssets(market.address, yieldGroup.address)).to.equal(0);
      });

      it("reports zero when reserves have swallowed the whole backing", async () => {
        market.getCash.returns(parseUnits("10", 18));
        market.totalBorrows.returns(0);
        market.totalReserves.returns(parseUnits("10", 18));
        expect(await adapter.totalAssets(market.address, yieldGroup.address)).to.equal(0);
      });

      it("values the position off the components, with written-off debt excluded", async () => {
        // The market's own rate keeps `badDebt` in its numerator. Dropping it is what marks every Hub
        // depositor down at the same instant instead of by exit order. `badDebt` is set absurdly high
        // here so that any path still reading `exchangeRateStored` would be obvious.
        market.balanceOf.returns(parseUnits("1", 18));
        market.totalSupply.returns(parseUnits("2", 18));
        market.getCash.returns(parseUnits("100", 18));
        market.totalBorrows.returns(parseUnits("60", 18));
        market.totalReserves.returns(parseUnits("10", 18));
        market.badDebt.returns(parseUnits("1000000", 18));

        // (100 + 60 - 10) / 2 = 75, with `badDebt` playing no part.
        expect(await adapter.totalAssets(market.address, yieldGroup.address)).to.equal(parseUnits("75", 18));
      });
    });

    describe("maxWithdraw", () => {
      it("reports zero against a market with a zero exchange rate", async () => {
        market.exchangeRateStored.returns(0);
        expect(await adapter.maxWithdraw(market.address, yieldGroup.address)).to.equal(0);
      });

      it("reports zero when reserves are at or above the market's cash", async () => {
        // `_redeemFresh` gates on `getCash() - totalReserves`, so reserves sitting inside cash are not
        // payable liquidity and a market in this state settles nothing.
        market.getCash.returns(parseUnits("10", 18));
        market.totalReserves.returns(parseUnits("10", 18));
        expect(await adapter.maxWithdraw(market.address, yieldGroup.address)).to.equal(0);
      });

      it("reports zero while REDEEM is paused, before reading anything else", async () => {
        comptroller.actionPaused.whenCalledWith(market.address, ACTION_REDEEM).returns(true);
        expect(await adapter.maxWithdraw(market.address, yieldGroup.address)).to.equal(0);
      });

      it("certifies only a bound the market's own redeem arithmetic settles", async () => {
        // The invariant the whole-vToken floor and the payout mirror exist to hold, checked across the
        // rate regimes a real market spans: at `1e18`, above it, at a seeded 1e28 rate, and below it -
        // the last being the case where a redeem burns plenty of tokens and still truncates its payout
        // to zero. Whatever this certifies has to survive the market's round-up against payable cash.
        const cash = parseUnits("1234567", 18);
        const reserves = parseUnits("7", 18);
        market.getCash.returns(cash);
        market.totalReserves.returns(reserves);
        market.totalBorrows.returns(0);

        for (const rate of [EXP, parseUnits("3", 18), RATE_SEEDED, parseUnits("1", 16)]) {
          market.exchangeRateStored.returns(rate);
          const liquid: BigNumber = await adapter.maxWithdraw(market.address, yieldGroup.address);
          if (liquid.isZero()) continue;
          const payout = marketPayout(rate, bumpToSettleable(rate, liquid));
          expect(payout, `rate ${rate.toString()}`).to.be.gt(0);
          expect(payout, `rate ${rate.toString()}`).to.be.lte(cash.sub(reserves));
        }
      });
    });

    describe("maxDeposit", () => {
      it("reports a finite room for an uncapped market, so a YieldGroup can sum it", async () => {
        // `YieldGroupBase.maxDeposit()` adds up the room of every queued resource in checked
        // arithmetic. Passing `type(uint256).max` through would overflow that sum the moment a second
        // uncapped market joined the queue, and the Hub would read the revert as zero capacity against
        // a balance it could never move.
        comptroller.supplyCaps.returns(constants.MaxUint256);
        expect(await adapter.maxDeposit(market.address)).to.equal(MAX_UINT128);
      });

      it("treats a cap of zero as a real cap rather than an unset sentinel", async () => {
        // Inverted against the YieldGroup's own resource cap, where zero means unbounded. Reading it
        // the YieldGroup's way would advertise unlimited room into a market that rejects every mint.
        comptroller.supplyCaps.returns(0);
        expect(await adapter.maxDeposit(market.address)).to.equal(0);
      });

      it("withholds a tenth of a percent of the raw headroom", async () => {
        // `exchangeRateStored` is pre-accrual while the market re-checks the cap after accruing, so raw
        // headroom is optimistic on an interest-accruing market. The margin absorbs a typical
        // inter-slot accrual; the routing cascade is the backstop for anything larger.
        const cap = parseUnits("1000000", 18);
        const supplied = parseUnits("400000", 18);
        comptroller.supplyCaps.returns(cap);
        market.exchangeRateStored.returns(EXP);
        market.totalSupply.returns(supplied);

        const raw = cap.sub(supplied);
        expect(await adapter.maxDeposit(market.address)).to.equal(raw.sub(raw.div(1000)));
      });

      it("reports zero once the trimmed headroom is worth less than one vToken", async () => {
        // Room that cannot mint a whole vToken is room a deposit would mint nothing for, so advertising
        // it only books a leg the cascade has to unwind.
        const supply = parseUnits("1", 18);
        market.totalSupply.returns(supply);
        comptroller.supplyCaps.returns(supply.mul(RATE_SEEDED).div(EXP).add(ONE_VTOKEN_UNIT).sub(1));
        expect(await adapter.maxDeposit(market.address)).to.equal(0);
      });

      it("reports zero at or above the cap instead of underflowing", async () => {
        market.exchangeRateStored.returns(EXP);
        market.totalSupply.returns(parseUnits("500", 18));
        comptroller.supplyCaps.returns(parseUnits("500", 18));
        expect(await adapter.maxDeposit(market.address)).to.equal(0);
      });

      it("reports zero while MINT is paused", async () => {
        comptroller.actionPaused.whenCalledWith(market.address, ACTION_MINT).returns(true);
        expect(await adapter.maxDeposit(market.address)).to.equal(0);
      });
    });

    describe("spotAPYBps", () => {
      it("saturates instead of wrapping a rate that overflows the return type", async () => {
        // A wrapped cast would report a tiny APY for an enormous one, and the Hub ranks resources by
        // this number. Saturating is wrong in a direction that cannot be mistaken for a real rate.
        market.supplyRatePerBlock.returns(EXP);
        market.blocksOrSecondsPerYear.returns(parseUnits("1", 16));
        expect(await adapter.spotAPYBps(market.address, 0)).to.equal(BigNumber.from(2).pow(64).sub(1));
      });

      it("annualises with the market's own cadence and ignores the argument", async () => {
        // One YieldGroup can hold block-based and time-based markets at once, so a group-level constant
        // would misprice whichever kind it was not configured for.
        market.supplyRatePerBlock.returns(parseUnits("1", 9));
        market.blocksOrSecondsPerYear.returns(10_512_000);
        const expected = BigNumber.from(10).pow(9).mul(10_512_000).div(parseUnits("1", 14));
        expect(await adapter.spotAPYBps(market.address, 0)).to.equal(expected);
        expect(await adapter.spotAPYBps(market.address, 123_456_789)).to.equal(expected);
      });
    });

    describe("asset and receiptBalance", () => {
      it("resolves the market's underlying", async () => {
        expect(await adapter.asset(market.address)).to.equal(asset.address);
      });

      it("reports the holder's vToken balance, not its underlying value", async () => {
        // The YieldGroup uses this to decide a resource is fully drained and can be deregistered, so it
        // has to be the raw receipt count rather than anything the exchange rate has been applied to.
        market.balanceOf.whenCalledWith(yieldGroup.address).returns(parseUnits("3", 8));
        expect(await adapter.receiptBalance(market.address, yieldGroup.address)).to.equal(parseUnits("3", 8));
      });
    });

    describe("validateRegistration", () => {
      it("rejects a market whose supply allowlist is armed without the caller on it", async () => {
        comptroller.isSupplyAllowlistEnabled.returns(true);
        comptroller.isAllowedSupplier.returns(false);
        await expect(adapter.connect(deployer).validateRegistration(market.address))
          .to.be.revertedWithCustomError(adapter, "SupplyNotAllowed")
          .withArgs(market.address, deployer.address);
      });

      it("accepts a market whose allowlist is armed with the caller on it", async () => {
        comptroller.isSupplyAllowlistEnabled.returns(true);
        comptroller.isAllowedSupplier.returns(true);
        await expect(adapter.validateRegistration(market.address)).to.not.be.reverted;
      });
    });

    describe("delegatecall discipline", () => {
      it("refuses a direct call to either mutating entry point", async () => {
        // A direct call would mint the vTokens to the adapter itself, where nothing can redeem them.
        await expect(adapter.deposit(market.address, 1)).to.be.revertedWithCustomError(adapter, "NotDelegateCall");
        await expect(adapter.withdraw(market.address, 1, deployer.address)).to.be.revertedWithCustomError(
          adapter,
          "NotDelegateCall",
        );
      });

      it("holds no storage of its own, so a delegatecall cannot collide with the YieldGroup's", async () => {
        const before = await Promise.all([yieldGroup.hub(), yieldGroup.asset(), yieldGroup.resources()]);
        await depositAsHub(parseUnits("1000", 18));
        expect(await Promise.all([yieldGroup.hub(), yieldGroup.asset(), yieldGroup.resources()])).to.deep.equal(before);
      });
    });
  });
}

/// Impersonate `who` with enough gas money to send a transaction.
async function impersonate(who: string): Promise<SignerWithAddress> {
  await ethers.provider.send("hardhat_impersonateAccount", [who]);
  await ethers.provider.send("hardhat_setBalance", [who, "0x56bc75e2d63100000"]);
  return ethers.getSigner(who);
}

/// Mirror of `AdapterSpokeV1._redeemPayout`: what the market pays out for `redeemUnderlying(request)`.
function marketPayout(rate: BigNumber, request: BigNumber): BigNumber {
  let tokens = request.mul(EXP).div(rate);
  const probe = tokens.mul(rate).div(EXP);
  if (!probe.isZero() && !probe.eq(request)) tokens = tokens.add(1);
  return tokens.mul(rate).div(EXP);
}

/// Mirror of `AdapterSpokeV1._bumpToSettleable`: the request `withdraw` actually issues for `amount`.
function bumpToSettleable(rate: BigNumber, amount: BigNumber): BigNumber {
  if (rate.isZero()) return amount;
  if (!marketPayout(rate, amount).isZero()) return amount;
  const minTokens = EXP.add(rate).sub(1).div(rate);
  return minTokens.mul(rate).add(EXP).sub(1).div(EXP);
}

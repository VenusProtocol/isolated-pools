import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SpokeComptroller } from "../../../typechain";
import { ONE, SpokeFixture, TestMarket, deploySpokeComptroller, givePosition, setRiskWeights } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

// Every market prices at 1 with an exchange rate of 1, so a vToken balance is also its collateral value and the
// arithmetic under test stays visible:
//   maxClearableDebt = sum over the account's collateral markets of balance / thatMarketsIncentive
const POOL_WIDE_INCENTIVE = parseUnits("1.2", 18);
const MARKET_A_INCENTIVE = parseUnits("1.1", 18);
const COLLATERAL_A = parseUnits("110", 18); // 110 / 1.1 = 100
const COLLATERAL_B = parseUnits("120", 18); // 120 / 1.2 = 100, through the pool-wide fallback
const MAX_CLEARABLE_DEBT = parseUnits("200", 18);
const TOTAL_COLLATERAL = COLLATERAL_A.add(COLLATERAL_B);

const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);

// Above the whole position, so the batch operations are the correct path throughout.
const HIGH_MIN_COLLATERAL = parseUnits("1000", 18);
// Below it, so a single liquidation is the correct path.
const LOW_MIN_COLLATERAL = parseUnits("100", 18);

describe("SpokeComptroller: per-market liquidation incentive", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let collateralA: TestMarket;
  let collateralB: TestMarket;
  let debtMarket: TestMarket;
  let liquidator: SignerWithAddress;
  let borrower: SignerWithAddress;

  /// Only market A carries an incentive of its own. B falls back to the pool-wide value, and the debt market never
  /// has one set, which is the state every borrow-only market is in.
  async function incentiveFixture(minLiquidatableCollateral = HIGH_MIN_COLLATERAL): Promise<SpokeFixture> {
    const f = await deploySpokeComptroller({
      marketCount: 3,
      liquidationIncentive: POOL_WIDE_INCENTIVE,
      minLiquidatableCollateral,
    });
    await f.comptroller.setMarketLiquidationIncentive(f.markets[0].vToken.address, MARKET_A_INCENTIVE);
    return f;
  }

  const lowMinFixture = () => incentiveFixture(LOW_MIN_COLLATERAL);

  /// Collateral in A and B, debt in the third market. The debt market is entered while holding no collateral in
  /// it, which is what `preBorrowHook` does to every borrower.
  async function givePositionWithDebt(debt: BigNumber): Promise<void> {
    await givePosition(comptroller, borrower, [
      { market: collateralA, collateral: COLLATERAL_A },
      { market: collateralB, collateral: COLLATERAL_B },
      { market: debtMarket, borrow: debt },
    ]);
  }

  function bind(f: SpokeFixture): void {
    fixture = f;
    f.resetPrices();
    ({ comptroller } = f);
    [collateralA, collateralB, debtMarket] = f.markets;
    for (const { vToken } of f.markets) {
      vToken.seize.reset();
      vToken.healBorrow.reset();
    }
  }

  beforeEach(async () => {
    [, liquidator, borrower] = await ethers.getSigners();
    bind(await loadFixture(incentiveFixture));
  });

  describe("maxClearableDebt", () => {
    it("sums each market's collateral at that market's own incentive", async () => {
      await givePositionWithDebt(parseUnits("250", 18));

      // 110 / 1.1 + 120 / 1.2 = 200, surfaced through the revert rather than read directly.
      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("250", 18), MAX_CLEARABLE_DEBT);
    });

    it("falls back to the pool-wide incentive for a market with no value of its own", async () => {
      await comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, POOL_WIDE_INCENTIVE);
      await givePositionWithDebt(parseUnits("250", 18));

      // Both markets now divide by 1.2: (110 + 120) / 1.2, truncated once per market.
      const expected = COLLATERAL_A.mul(ONE)
        .div(POOL_WIDE_INCENTIVE)
        .add(COLLATERAL_B.mul(ONE).div(POOL_WIDE_INCENTIVE));
      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("250", 18), expected);
    });

    it("truncates once per market rather than once on the total", async () => {
      // 1 / 1.1 does not divide evenly. Dividing each market separately and then adding loses a wei that
      // adding first and dividing once would keep: 1818181818181818180 against 1818181818181818181. Rounding
      // down per market is the conservative direction, since it can only route an account to healAccount.
      const incentive = parseUnits("1.1", 18);
      await comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, incentive);
      await comptroller.setMarketLiquidationIncentive(collateralB.vToken.address, incentive);
      await givePosition(comptroller, borrower, [
        { market: collateralA, collateral: ONE },
        { market: collateralB, collateral: ONE },
        { market: debtMarket, borrow: parseUnits("2", 18) },
      ]);

      const perMarketTruncation = BigNumber.from("1818181818181818180");
      expect(ONE.add(ONE).mul(ONE).div(incentive)).to.equal(perMarketTruncation.add(1));

      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("2", 18), perMarketTruncation);
    });
  });

  describe("routing between liquidateAccount and healAccount", () => {
    it("sends an account whose collateral covers the debt to liquidateAccount", async () => {
      await givePositionWithDebt(parseUnits("150", 18));

      await expect(comptroller.connect(liquidator).healAccount(borrower.address))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs(parseUnits("150", 18), MAX_CLEARABLE_DEBT);
      // Past the collateral gate; it now fails on the closing check, which fake markets cannot satisfy.
      await expect(
        comptroller.connect(liquidator).liquidateAccount(borrower.address, []),
      ).to.be.revertedWithCustomError(comptroller, "NonzeroBorrowBalanceAfterLiquidation");
    });

    it("sends an account whose collateral falls short to healAccount", async () => {
      await givePositionWithDebt(parseUnits("250", 18));

      await expect(
        comptroller.connect(liquidator).liquidateAccount(borrower.address, []),
      ).to.be.revertedWithCustomError(comptroller, "InsufficientCollateral");
      await comptroller.connect(liquidator).healAccount(borrower.address);
    });

    it("sends an account whose debt exactly equals maxClearableDebt to healAccount", async () => {
      await givePositionWithDebt(MAX_CLEARABLE_DEBT);

      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(MAX_CLEARABLE_DEBT, MAX_CLEARABLE_DEBT);

      // percentage is exactly 1, so healing repays the whole debt and forgives nothing.
      await comptroller.connect(liquidator).healAccount(borrower.address);
      expect(debtMarket.vToken.healBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        borrower.address,
        MAX_CLEARABLE_DEBT,
      );
    });

    it("rejects a batch liquidation while the collateral is above the threshold", async () => {
      bind(await loadFixture(lowMinFixture));
      await givePositionWithDebt(parseUnits("250", 18));

      for (const call of [
        comptroller.connect(liquidator).healAccount(borrower.address),
        comptroller.connect(liquidator).liquidateAccount(borrower.address, []),
      ]) {
        await expect(call)
          .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
          .withArgs(LOW_MIN_COLLATERAL, TOTAL_COLLATERAL);
      }
    });

    it("rejects a single liquidation while the collateral is below the threshold", async () => {
      await givePositionWithDebt(parseUnits("250", 18));

      await expect(
        comptroller.preLiquidateHook(
          debtMarket.vToken.address,
          collateralA.vToken.address,
          borrower.address,
          parseUnits("1", 18),
          false,
        ),
      )
        .to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated")
        .withArgs(HIGH_MIN_COLLATERAL, TOTAL_COLLATERAL);
    });
  });

  // Without risk weights every account is in shortfall, which leaves the shortfall guards untested. These set the
  // liquidation threshold so that a healthy account can exist.
  describe("a healthy account", () => {
    const HEALTHY_DEBT = parseUnits("150", 18);

    beforeEach(async () => {
      for (const market of [collateralA, collateralB]) {
        await setRiskWeights(comptroller, market, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      }
      // 0.8 * 230 = 184 of weighted collateral against 150 of debt, so there is no shortfall. The debt is also
      // below maxClearableDebt, so neither batch path can exit on its collateral check first.
      await givePositionWithDebt(HEALTHY_DEBT);
      const { shortfall } = await comptroller.getAccountLiquidity(borrower.address);
      expect(shortfall).to.equal(0);
    });

    it("cannot be healed", async () => {
      await expect(comptroller.connect(liquidator).healAccount(borrower.address)).to.be.revertedWithCustomError(
        comptroller,
        "InsufficientShortfall",
      );
    });

    it("cannot be batch liquidated", async () => {
      await expect(
        comptroller.connect(liquidator).liquidateAccount(borrower.address, []),
      ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
    });

    it("cannot be liquidated one market at a time", async () => {
      bind(await loadFixture(lowMinFixture));
      for (const market of [collateralA, collateralB]) {
        await setRiskWeights(comptroller, market, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      }
      await givePositionWithDebt(HEALTHY_DEBT);

      await expect(
        comptroller.preLiquidateHook(
          debtMarket.vToken.address,
          collateralA.vToken.address,
          borrower.address,
          parseUnits("1", 18),
          false,
        ),
      ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
    });
  });

  describe("healAccount", () => {
    it("repays maxClearableDebt/borrows of the debt and seizes every collateral market in full", async () => {
      await givePositionWithDebt(parseUnits("250", 18));

      await comptroller.connect(liquidator).healAccount(borrower.address);

      // percentage = 200/250 = 0.8, so 0.8 * 250 = 200 is repaid and the remaining 50 becomes bad debt.
      expect(debtMarket.vToken.healBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        borrower.address,
        MAX_CLEARABLE_DEBT,
      );
      expect(collateralA.vToken.seize).to.have.been.calledOnceWith(liquidator.address, borrower.address, COLLATERAL_A);
      expect(collateralB.vToken.seize).to.have.been.calledOnceWith(liquidator.address, borrower.address, COLLATERAL_B);
      expect(debtMarket.vToken.seize).to.not.have.been.called;
    });

    it("repays less when a collateral market's incentive is raised, since the same collateral clears less debt", async () => {
      await comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, parseUnits("2", 18));
      await givePositionWithDebt(parseUnits("250", 18));

      // 110 / 2 + 120 / 1.2 = 155, so percentage = 155/250 = 0.62 and 155 is repaid.
      await comptroller.connect(liquidator).healAccount(borrower.address);

      expect(debtMarket.vToken.healBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        borrower.address,
        parseUnits("155", 18),
      );
    });
  });

  describe("liquidateCalculateSeizeTokens", () => {
    it("prices the seizure at the collateral market's incentive, not the pool-wide one", async () => {
      const repayAmount = parseUnits("100", 18);

      const [, seizeFromA] = await comptroller.liquidateCalculateSeizeTokens(
        debtMarket.vToken.address,
        collateralA.vToken.address,
        repayAmount,
      );
      const [, seizeFromB] = await comptroller.liquidateCalculateSeizeTokens(
        debtMarket.vToken.address,
        collateralB.vToken.address,
        repayAmount,
      );

      expect(seizeFromA).to.equal(parseUnits("110", 18)); // market A's own 1.1
      expect(seizeFromB).to.equal(parseUnits("120", 18)); // pool-wide 1.2, market B has no value of its own
    });
  });

  // A pool that `PoolRegistry.addPool` has not registered has no pool-wide incentive, so a market with no value of
  // its own divides by zero. Nothing can reach that state through the registry, and these pin why.
  describe("with no incentive set anywhere", () => {
    let unregistered: SpokeFixture;

    beforeEach(async () => {
      unregistered = await deploySpokeComptroller({ marketCount: 2, liquidationIncentive: null });
      expect(await unregistered.comptroller.liquidationIncentiveMantissa()).to.equal(0);
      expect(await unregistered.comptroller.liquidationIncentives(unregistered.markets[0].vToken.address)).to.equal(0);
    });

    it("reverts the snapshot for an account that actually holds collateral", async () => {
      await givePosition(unregistered.comptroller, borrower, [
        { market: unregistered.markets[0], collateral: ONE },
        { market: unregistered.markets[1], borrow: ONE },
      ]);

      await expect(unregistered.comptroller.connect(liquidator).healAccount(borrower.address)).to.be.revertedWithPanic(
        0x12,
      );
    });

    it("is unreachable for a market the account holds no collateral in, which the balance guard skips", async () => {
      await givePosition(unregistered.comptroller, borrower, [
        { market: unregistered.markets[0], collateral: 0 },
        { market: unregistered.markets[1], borrow: ONE },
      ]);

      // No collateral anywhere, so the accumulator never divides and healing writes the whole debt off.
      await unregistered.comptroller.connect(liquidator).healAccount(borrower.address);
      expect(unregistered.markets[1].vToken.healBorrow).to.have.been.calledOnceWith(
        liquidator.address,
        borrower.address,
        0,
      );
    });
  });

  describe("setMarketLiquidationIncentive", () => {
    it("reverts if access control denies the call", async () => {
      fixture.acm.isAllowedToCall
        .whenCalledWith(borrower.address, "setMarketLiquidationIncentive(address,uint256)")
        .returns(false);

      await expect(
        comptroller.connect(borrower).setMarketLiquidationIncentive(collateralA.vToken.address, parseUnits("1.3", 18)),
      ).to.be.revertedWithCustomError(comptroller, "Unauthorized");
    });

    it("reverts if the market is not listed", async () => {
      await expect(comptroller.setMarketLiquidationIncentive(liquidator.address, parseUnits("1.3", 18)))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(liquidator.address);
    });

    it("reverts below 1e18, which would seize less value than was repaid", async () => {
      collateralA.vToken.protocolSeizeShareMantissa.returns(0);

      await expect(
        comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, ONE.sub(1)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationIncentive");
    });

    it("accepts exactly 1e18 when the market takes no protocol seize share", async () => {
      collateralA.vToken.protocolSeizeShareMantissa.returns(0);
      await comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, ONE);

      expect(await comptroller.liquidationIncentives(collateralA.vToken.address)).to.equal(ONE);
    });

    it("reverts below 1e18 plus the market's protocol seize share, which the liquidator does not get", async () => {
      // `VToken._seize` hands the protocol its share out of the collateral seized, so the liquidator only keeps
      // `incentive - protocolSeizeShareMantissa` of the value it repaid. Anything under 1.05 here is a loss.
      const seizeShare = parseUnits("0.05", 18);
      collateralA.vToken.protocolSeizeShareMantissa.returns(seizeShare);
      const floor = ONE.add(seizeShare);

      await expect(
        comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, floor.sub(1)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationIncentive");

      await comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, floor);
      expect(await comptroller.liquidationIncentives(collateralA.vToken.address)).to.equal(floor);
    });

    it("rejects zero, so a mistaken value cannot silently fall back to the pool-wide incentive", async () => {
      await expect(
        comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, 0),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationIncentive");
      expect(await comptroller.liquidationIncentives(collateralA.vToken.address)).to.equal(MARKET_A_INCENTIVE);
    });

    it("stores the value and reports the one it replaced", async () => {
      const updated = parseUnits("1.35", 18);

      await expect(comptroller.setMarketLiquidationIncentive(collateralA.vToken.address, updated))
        .to.emit(comptroller, "NewMarketLiquidationIncentive")
        .withArgs(collateralA.vToken.address, MARKET_A_INCENTIVE, updated);
      expect(await comptroller.liquidationIncentives(collateralA.vToken.address)).to.equal(updated);
    });
  });

  describe("liquidationIncentiveMantissa", () => {
    /// The getter answers for `msg.sender`, and a signer-bound contract cannot override `from`, so the call goes out
    /// through the provider instead.
    const asCaller = (from: string) => comptroller.connect(ethers.provider).liquidationIncentiveMantissa({ from });

    it("answers the pool-wide value to a caller that is not a market of this pool", async () => {
      expect(await comptroller.liquidationIncentiveMantissa()).to.equal(POOL_WIDE_INCENTIVE);
      expect(await asCaller(liquidator.address)).to.equal(POOL_WIDE_INCENTIVE);
    });

    it("answers a calling market with the incentive that prices its own collateral", async () => {
      // `VToken._seize` and `VToken.setProtocolSeizeShare` both read this getter on themselves, so the answer has to
      // depend on which market is asking.
      expect(await asCaller(collateralA.vToken.address)).to.equal(MARKET_A_INCENTIVE);
      expect(await asCaller(collateralB.vToken.address)).to.equal(POOL_WIDE_INCENTIVE);
    });
  });

  describe("effectiveLiquidationIncentive", () => {
    it("reports a market's incentive without depending on who is asking", async () => {
      expect(await comptroller.effectiveLiquidationIncentive(collateralA.vToken.address)).to.equal(MARKET_A_INCENTIVE);
      expect(await comptroller.effectiveLiquidationIncentive(collateralB.vToken.address)).to.equal(POOL_WIDE_INCENTIVE);
      expect(await comptroller.effectiveLiquidationIncentive(liquidator.address)).to.equal(POOL_WIDE_INCENTIVE);
    });
  });

  describe("setLiquidationIncentive", () => {
    it("still guards the 1e18 floor, now with a custom error", async () => {
      await expect(comptroller.setLiquidationIncentive(ONE.sub(1))).to.be.revertedWithCustomError(
        comptroller,
        "InvalidLiquidationIncentive",
      );
    });

    it("keeps serving as the fallback for markets without a value of their own", async () => {
      const updated = parseUnits("1.5", 18);
      await comptroller.setLiquidationIncentive(updated);
      await givePositionWithDebt(parseUnits("250", 18));

      // A keeps its own 1.1 while B now divides by the new pool-wide 1.5.
      const expected = COLLATERAL_A.mul(ONE).div(MARKET_A_INCENTIVE).add(COLLATERAL_B.mul(ONE).div(updated));
      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "InsufficientCollateral")
        .withArgs(parseUnits("250", 18), expected);
    });
  });
});

import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { IDeviationBoundedOracle, SpokeComptroller } from "../../../typechain";
import {
  ONE,
  SpokeFixture,
  TestMarket,
  configureBoundedPricing,
  deploySpokeComptroller,
  givePosition,
  resetFakeHistory,
  setRiskWeights,
} from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

// The collateral market: 10 vTokens at an exchange rate of 1, priced at 100, weighted 0.5 for borrowing and 0.8
// for liquidation. The debt market carries 400 of borrow at a price of 1.
//
// Every figure below follows from those, through `_accumulateMarket`:
//   weightedCollateral = collateralFactor * collateralPrice * balance
//   borrows            = debtPrice * borrowBalance
const COLLATERAL_BALANCE = parseUnits("10", 18);
const COLLATERAL_SPOT = parseUnits("100", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);
const DEBT_SPOT = ONE;
const DEBT_BALANCE = parseUnits("400", 18);

// 0.5 * 100 * 10 = 500, less 400 of debt.
const CAPACITY_AT_SPOT_100 = parseUnits("100", 18);
// 0.5 * 150 * 10 = 750, less 400.
const CAPACITY_AT_SPOT_150 = parseUnits("350", 18);
// 0.8 * 150 * 10 = 1200, less 400.
const LIQUIDATION_VIEW_AT_SPOT_150 = parseUnits("800", 18);

const PUMPED_SPOT = parseUnits("150", 18);
const TRIGGER_THRESHOLD = parseUnits("0.2", 18);

describe("SpokeComptroller: deviation-bounded pricing", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let collateral: TestMarket;
  let debt: TestMarket;
  let borrower: SignerWithAddress;

  describe("against the real DeviationBoundedOracle", () => {
    let boundedOracle: IDeviationBoundedOracle;

    async function realOracleFixture(): Promise<SpokeFixture> {
      const f = await deploySpokeComptroller({ realBoundedOracle: true, spotPrice: COLLATERAL_SPOT });
      // The debt market prices at 1 while the collateral market prices at 100.
      f.setBaselinePrice(f.markets[1], DEBT_SPOT);
      await setRiskWeights(f.comptroller, f.markets[0], COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      return f;
    }

    beforeEach(async () => {
      [, , borrower] = await ethers.getSigners();
      fixture = await loadFixture(realOracleFixture);
      fixture.resetPrices();
      ({ comptroller } = fixture);
      [collateral, debt] = fixture.markets;
      boundedOracle = fixture.boundedOracle as IDeviationBoundedOracle;
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: COLLATERAL_BALANCE },
        { market: debt, borrow: DEBT_BALANCE },
      ]);
    });

    describe("collateral leg", () => {
      it("caps borrowing capacity at the window low when the collateral price deviates upward", async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
        });
        // A 50% print against a window seeded at 100 exceeds the 20% trigger, so the collateral leg resolves to
        // min(spot, windowMin) = 100 rather than the 150 the pump asked for.
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        const [collateralPrice, debtPrice] = await boundedOracle.getBoundedPricesView(collateral.vToken.address);
        expect(collateralPrice).to.equal(COLLATERAL_SPOT);
        expect(debtPrice).to.equal(PUMPED_SPOT);

        const { liquidity, shortfall } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(CAPACITY_AT_SPOT_100);
        expect(shortfall).to.equal(0);
      });

      it("hands the pumped price straight through when bounded pricing is not enabled for the asset", async () => {
        // Same pump, no configuration: the oracle returns spot on both legs and the capacity inflates by 250.
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(CAPACITY_AT_SPOT_150);
      });
    });

    describe("debt leg", () => {
      it("keeps measuring debt at the window high when the borrowed asset's price is dumped", async () => {
        await configureBoundedPricing(boundedOracle, debt.underlying, { triggerThreshold: TRIGGER_THRESHOLD });
        // Halving the debt price would halve measured debt and free 200 of capacity. The max leg refuses: the
        // window high stays at the pre-dump 1, so the debt is still valued at 400.
        fixture.setSpotPrice(debt, parseUnits("0.5", 18));

        const [, debtPrice] = await boundedOracle.getBoundedPricesView(debt.vToken.address);
        expect(debtPrice).to.equal(DEBT_SPOT);

        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(CAPACITY_AT_SPOT_100);
      });

      it("lets the dump through when bounded pricing is not enabled for the asset", async () => {
        fixture.setSpotPrice(debt, parseUnits("0.5", 18));

        // 500 of weighted collateral less 200 of debt.
        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(parseUnits("300", 18));
      });
    });

    // The property the whole design rests on: bounding must never reach the numbers that route a liquidation.
    describe("liquidation-threshold path", () => {
      it("prices collateral and debt at spot while the collateral price is protected", async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
        });
        fixture.setSpotPrice(collateral, PUMPED_SPOT);
        await boundedOracle.updateProtectionState(collateral.vToken.address);
        expect(await boundedOracle.currentlyUsingProtectedPrice(collateral.underlying)).to.equal(true);

        const { liquidity, shortfall } = await comptroller.getAccountLiquidity(borrower.address);
        expect(liquidity).to.equal(LIQUIDATION_VIEW_AT_SPOT_150);
        expect(shortfall).to.equal(0);
      });

      it("reports the same numbers with the asset unprotected, so protection cannot move a liquidation", async () => {
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        const { liquidity, shortfall } = await comptroller.getAccountLiquidity(borrower.address);
        expect(liquidity).to.equal(LIQUIDATION_VIEW_AT_SPOT_150);
        expect(shortfall).to.equal(0);
      });
    });

    describe("hypothetical redeem", () => {
      const redeemTokens = parseUnits("4", 18);

      it("restricts a redeem while the collateral price is bounded", async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
        });
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        // The redeem effect uses the same bounded collateral price as the collateral itself: 0.5 * 100 * 4 = 200
        // against 500 of weighted collateral and 400 of debt, so the account is 100 short.
        const { liquidity, shortfall } = await comptroller.getHypotheticalAccountLiquidity(
          borrower.address,
          collateral.vToken.address,
          redeemTokens,
          0,
        );
        expect(shortfall).to.equal(parseUnits("100", 18));
        expect(liquidity).to.equal(0);
      });

      it("allows the same redeem when the price is not bounded, proving bounding only ever restricts", async () => {
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        // 0.5 * 150 * 4 = 300 of effect against 750 of weighted collateral and 400 of debt.
        const { liquidity, shortfall } = await comptroller.getHypotheticalAccountLiquidity(
          borrower.address,
          collateral.vToken.address,
          redeemTokens,
          0,
        );
        expect(liquidity).to.equal(parseUnits("50", 18));
        expect(shortfall).to.equal(0);
      });
    });

    describe("latching", () => {
      // Once the window spans 100 to 150, the trigger comparison is
      //   spot > windowMin * 1.2 (= 120)  ||  spot < windowMax * 0.8 (= 120)
      // so every price except exactly 120 re-triggers on its own. 120 is therefore the single spot at which the
      // stored flag is the only thing that can still bound the price, which is what isolates the latch.
      const NEUTRAL_SPOT = parseUnits("120", 18);

      beforeEach(async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
        });
      });

      it("stays protected after the price returns to a level that would not trigger on its own", async () => {
        fixture.setSpotPrice(collateral, PUMPED_SPOT);
        await boundedOracle.updateProtectionState(collateral.vToken.address);
        fixture.setSpotPrice(collateral, NEUTRAL_SPOT);

        expect(await boundedOracle.currentlyUsingProtectedPrice(collateral.underlying)).to.equal(true);
        const [collateralPrice, debtPrice] = await boundedOracle.getBoundedPricesView(collateral.vToken.address);
        expect(collateralPrice).to.equal(COLLATERAL_SPOT);
        expect(debtPrice).to.equal(PUMPED_SPOT);

        // Capacity stays at the protected figure rather than the 200 that 120 of unbounded spot would give.
        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(CAPACITY_AT_SPOT_100);
      });

      it("prices at spot at the same level when the deviation was never recorded", async () => {
        fixture.setSpotPrice(collateral, NEUTRAL_SPOT);

        expect(await boundedOracle.currentlyUsingProtectedPrice(collateral.underlying)).to.equal(false);
        // 0.5 * 120 * 10 = 600, less 400.
        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(parseUnits("200", 18));
      });
    });

    describe("transient cache", () => {
      // `updateProtectionState` caches the resolved pair for the rest of the transaction, and the view falls back
      // to recomputing on a miss. Both routes have to agree, or a borrow would be priced differently from the
      // view that quoted it.
      it("resolves to the same capacity whether or not the pair was cached first", async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
          caching: true,
        });
        fixture.setSpotPrice(collateral, PUMPED_SPOT);

        const beforeCaching = await comptroller.getBorrowingPower(borrower.address);
        await boundedOracle.updateProtectionState(collateral.vToken.address);
        const afterCaching = await comptroller.getBorrowingPower(borrower.address);

        expect(beforeCaching.liquidity).to.equal(CAPACITY_AT_SPOT_100);
        expect(afterCaching.liquidity).to.equal(CAPACITY_AT_SPOT_100);
      });

      it("resolves identically with caching disabled for the asset", async () => {
        await configureBoundedPricing(boundedOracle, collateral.underlying, {
          triggerThreshold: TRIGGER_THRESHOLD,
          caching: false,
        });
        fixture.setSpotPrice(collateral, PUMPED_SPOT);
        await boundedOracle.updateProtectionState(collateral.vToken.address);

        const { liquidity } = await comptroller.getBorrowingPower(borrower.address);
        expect(liquidity).to.equal(CAPACITY_AT_SPOT_100);
      });
    });

    it("prices an asset the oracle holds no configuration for at spot on both legs", async () => {
      const [collateralPrice, debtPrice] = await boundedOracle.getBoundedPricesView(collateral.vToken.address);

      expect(collateralPrice).to.equal(COLLATERAL_SPOT);
      expect(debtPrice).to.equal(COLLATERAL_SPOT);
    });
  });

  // Call counts need a fake: the point is which hooks reach the oracle, not what it answers.
  describe("protection state pre-pass", () => {
    let boundedOracle: FakeContract<IDeviationBoundedOracle>;

    // Weights on both markets and a heavily over-collateralised position, so the liquidity check always passes
    // and the only thing these tests observe is which hooks reach the oracle.
    async function prePassFixture(): Promise<SpokeFixture> {
      const f = await deploySpokeComptroller();
      for (const market of f.markets) {
        await setRiskWeights(f.comptroller, market, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      }
      return f;
    }

    beforeEach(async () => {
      [, , borrower] = await ethers.getSigners();
      fixture = await loadFixture(prePassFixture);
      fixture.resetPrices();
      ({ comptroller } = fixture);
      [collateral, debt] = fixture.markets;
      boundedOracle = fixture.boundedOracle as FakeContract<IDeviationBoundedOracle>;
      resetFakeHistory(fixture);
      // Collateral in both markets so that exiting either one still leaves the small debt covered; otherwise
      // `exitMarket` reverts on the liquidity check before it can be observed reaching the oracle.
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: parseUnits("1000", 18) },
        { market: debt, collateral: parseUnits("1000", 18), borrow: parseUnits("1", 18) },
      ]);
      await setBalance(debt.vToken.address, parseEther("1"));
      boundedOracle.updateProtectionState.reset();
    });

    it("runs once per entered market on borrow", async () => {
      await comptroller
        .connect(debt.vToken.wallet)
        .preBorrowHook(debt.vToken.address, borrower.address, parseUnits("1", 18));

      expect(boundedOracle.updateProtectionState).to.have.callCount(2);
      expect(boundedOracle.updateProtectionState).to.have.been.calledWith(collateral.vToken.address);
      expect(boundedOracle.updateProtectionState).to.have.been.calledWith(debt.vToken.address);
    });

    it("runs on redeem", async () => {
      await comptroller.preRedeemHook(collateral.vToken.address, borrower.address, parseUnits("1", 18));

      expect(boundedOracle.updateProtectionState).to.have.callCount(2);
    });

    it("runs on transfer, which reaches the same redeem check", async () => {
      const [, recipient] = await ethers.getSigners();
      await comptroller.preTransferHook(
        collateral.vToken.address,
        borrower.address,
        recipient.address,
        parseUnits("1", 18),
      );

      expect(boundedOracle.updateProtectionState).to.have.callCount(2);
    });

    it("runs on exitMarket, which also reaches the redeem check", async () => {
      await comptroller.connect(borrower).exitMarket(collateral.vToken.address);

      expect(boundedOracle.updateProtectionState).to.have.callCount(2);
    });

    it("never runs on any path that routes a liquidation", async () => {
      const [, liquidator] = await ethers.getSigners();
      // 1000 of collateral in each market at a price of 1, against a minimum of 100.
      const totalCollateral = parseUnits("2000", 18);
      const minLiquidatableCollateral = parseUnits("100", 18);

      // Each of these reverts only *after* computing a liquidity snapshot, so the snapshot loop really did run on
      // every one of them. Asserting the specific error is what proves that, rather than swallowing the revert and
      // learning nothing about how far the call got.
      await expect(
        comptroller.preLiquidateHook(
          debt.vToken.address,
          collateral.vToken.address,
          borrower.address,
          parseUnits("1", 18),
          false,
        ),
      ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
      await expect(comptroller.connect(liquidator).healAccount(borrower.address))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs(minLiquidatableCollateral, totalCollateral);
      await expect(comptroller.connect(liquidator).liquidateAccount(borrower.address, []))
        .to.be.revertedWithCustomError(comptroller, "CollateralExceedsThreshold")
        .withArgs(minLiquidatableCollateral, totalCollateral);
      await comptroller.preSeizeHook(
        collateral.vToken.address,
        debt.vToken.address,
        liquidator.address,
        borrower.address,
      );

      expect(boundedOracle.updateProtectionState).to.have.callCount(0);
    });

    it("never runs on mint or repay", async () => {
      await comptroller.preMintHook(collateral.vToken.address, borrower.address, parseUnits("1", 18));
      await comptroller.preRepayHook(debt.vToken.address, borrower.address);

      expect(boundedOracle.updateProtectionState).to.have.callCount(0);
    });
  });

  describe("with no bounded oracle set", () => {
    // `_safeGetPrices` calls the zero address, which returns no data, and decoding the missing return values
    // reverts. Borrowing capacity therefore fails closed rather than falling back to unbounded spot.
    it("reverts the borrowing-power path once an account holds a position", async () => {
      const f = await deploySpokeComptroller({ setBoundedOracle: false });
      const [, , account] = await ethers.getSigners();
      await setRiskWeights(f.comptroller, f.markets[0], COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await givePosition(f.comptroller, account, [{ market: f.markets[0], collateral: COLLATERAL_BALANCE }]);

      expect(await f.comptroller.deviationBoundedOracle()).to.equal(constants.AddressZero);
      await expect(f.comptroller.getBorrowingPower(account.address)).to.be.reverted;
    });

    it("still serves the liquidation-threshold path, which never reads the bounded oracle", async () => {
      const f = await deploySpokeComptroller({ setBoundedOracle: false, spotPrice: COLLATERAL_SPOT });
      const [, , account] = await ethers.getSigners();
      await setRiskWeights(f.comptroller, f.markets[0], COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await givePosition(f.comptroller, account, [{ market: f.markets[0], collateral: COLLATERAL_BALANCE }]);

      // 0.8 * 100 * 10, with no debt.
      const { liquidity, shortfall } = await f.comptroller.getAccountLiquidity(account.address);
      expect(liquidity).to.equal(parseUnits("800", 18));
      expect(shortfall).to.equal(0);
    });

    it("answers the borrowing-power path for an account in no markets, so listing is not blocked", async () => {
      const f = await deploySpokeComptroller({ setBoundedOracle: false });
      const [, , account] = await ethers.getSigners();

      const { liquidity, shortfall } = await f.comptroller.getBorrowingPower(account.address);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });
  });

  describe("setDeviationBoundedOracle", () => {
    beforeEach(async () => {
      fixture = await loadFixture(deploySpokeComptroller);
      ({ comptroller } = fixture);
    });

    it("rejects a caller that is not the owner", async () => {
      const [, stranger] = await ethers.getSigners();

      await expect(comptroller.connect(stranger).setDeviationBoundedOracle(stranger.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("rejects the zero address", async () => {
      await expect(comptroller.setDeviationBoundedOracle(constants.AddressZero)).to.be.revertedWithCustomError(
        comptroller,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the new oracle and reports the one it replaced", async () => {
      const previous = await comptroller.deviationBoundedOracle();
      const [, , , replacement] = await ethers.getSigners();

      await expect(comptroller.setDeviationBoundedOracle(replacement.address))
        .to.emit(comptroller, "NewDeviationBoundedOracle")
        .withArgs(previous, replacement.address);
      expect(await comptroller.deviationBoundedOracle()).to.equal(replacement.address);
    });
  });
});

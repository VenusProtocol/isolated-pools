import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { SpokeComptroller } from "../../../typechain";
import {
  SpokeFixture,
  TestMarket,
  deploySpokeComptroller,
  givePosition,
  resetFakeHistory,
  setRiskWeights,
} from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const COLLATERAL = parseUnits("1000", 18);
const COLLATERAL_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);
const BORROW_AMOUNT = parseUnits("100", 18);
const CLOSE_FACTOR = parseUnits("0.5", 18);

describe("SpokeComptroller: policy hooks", () => {
  let fixture: SpokeFixture;
  let comptroller: MockContract<SpokeComptroller>;
  let collateral: TestMarket;
  let debt: TestMarket;
  let borrower: SignerWithAddress;
  let stranger: SignerWithAddress;

  /// A borrower with collateral worth 1000 in one market and nothing borrowed yet. The collateral factor leaves
  /// 500 of borrowing power, so the amounts below stay clear of the liquidity check unless a test aims at it.
  async function collateralizedBorrower(): Promise<void> {
    await setRiskWeights(comptroller, collateral, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await setRiskWeights(comptroller, debt, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await givePosition(comptroller, borrower, [{ market: collateral, collateral: COLLATERAL }]);
  }

  beforeEach(async () => {
    [, borrower, stranger] = await ethers.getSigners();
    fixture = await loadFixture(deploySpokeComptroller);
    fixture.resetPrices();
    resetFakeHistory(fixture);
    ({ comptroller } = fixture);
    [collateral, debt] = fixture.markets;
    // The fakes stand in for markets that call the hooks, and a fake needs gas to send a transaction.
    for (const market of fixture.markets) {
      await setBalance(market.vToken.address, parseEther("1"));
    }
  });

  // Two hooks refuse to serve an arbitrary caller, and in both cases the check is what keeps an outsider from
  // writing to storage on someone else's behalf. Nothing else in the suite calls them with the wrong sender.
  describe("caller checks", () => {
    it("lets a market enter a borrower that is not yet in it", async () => {
      await collateralizedBorrower();

      await expect(
        comptroller.connect(debt.vToken.wallet).preBorrowHook(debt.vToken.address, borrower.address, BORROW_AMOUNT),
      )
        .to.emit(comptroller, "MarketEntered")
        .withArgs(debt.vToken.address, borrower.address);

      expect(await comptroller.checkMembership(borrower.address, debt.vToken.address)).to.equal(true);
    });

    it("rejects any other caller borrowing for an account that is not in the market", async () => {
      await collateralizedBorrower();

      await expect(comptroller.connect(stranger).preBorrowHook(debt.vToken.address, borrower.address, BORROW_AMOUNT))
        .to.be.revertedWithCustomError(comptroller, "UnexpectedSender")
        .withArgs(debt.vToken.address, stranger.address);
    });

    it("accepts any caller once the account is already in the market", async () => {
      // The membership branch is the only thing the sender check guards, so an entered account makes the hook
      // callable by anyone. Harmless, because the hook writes nothing else.
      await collateralizedBorrower();
      await comptroller.connect(borrower).enterMarkets([debt.vToken.address]);

      await expect(
        comptroller.connect(stranger).callStatic.preBorrowHook(debt.vToken.address, borrower.address, BORROW_AMOUNT),
      ).to.not.be.reverted;
    });

    it("restricts listing a market to the pool registry", async () => {
      const unlisted = await smock.fake<TestMarket["vToken"]>("VToken");
      unlisted.isVToken.returns(true);

      await expect(comptroller.connect(stranger).supportMarket(unlisted.address))
        .to.be.revertedWithCustomError(comptroller, "UnexpectedSender")
        .withArgs(fixture.poolRegistry.address, stranger.address);
    });
  });

  describe("borrow caps", () => {
    const borrow = (amount = BORROW_AMOUNT) =>
      comptroller.connect(borrower).callStatic.preBorrowHook(debt.vToken.address, borrower.address, amount);

    beforeEach(async () => {
      await collateralizedBorrower();
      await comptroller.connect(borrower).enterMarkets([debt.vToken.address]);
    });

    it("blocks a borrow that would take total borrows past the cap", async () => {
      debt.vToken.totalBorrows.returns(parseUnits("900", 18));
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [parseUnits("1000", 18)]);

      await expect(borrow(parseUnits("100", 18).add(1)))
        .to.be.revertedWithCustomError(comptroller, "BorrowCapExceeded")
        .withArgs(debt.vToken.address, parseUnits("1000", 18));
    });

    it("allows a borrow that lands exactly on the cap", async () => {
      debt.vToken.totalBorrows.returns(parseUnits("900", 18));
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [parseUnits("1000", 18)]);

      await expect(borrow(parseUnits("100", 18))).to.not.be.reverted;
    });

    it("counts the market's bad debt against the cap", async () => {
      // Bad debt is principal the pool has already written off. Leaving it out of the sum would let a market
      // re-lend the room its own losses occupy.
      debt.vToken.totalBorrows.returns(parseUnits("900", 18));
      debt.vToken.badDebt.returns(parseUnits("50", 18));
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [parseUnits("1000", 18)]);

      await expect(borrow(parseUnits("50", 18))).to.not.be.reverted;
      await expect(borrow(parseUnits("50", 18).add(1))).to.be.revertedWithCustomError(comptroller, "BorrowCapExceeded");
    });

    it("blocks every borrow while the cap is zero, which is what a newly listed market defaults to", async () => {
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [0]);

      await expect(borrow(1))
        .to.be.revertedWithCustomError(comptroller, "BorrowCapExceeded")
        .withArgs(debt.vToken.address, 0);
    });

    it("skips the cap arithmetic entirely for an uncapped market", async () => {
      // `type(uint256).max` is the documented uncapped value, and skipping the reads is the reason it is special
      // cased rather than just being a very large cap.
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [constants.MaxUint256]);
      debt.vToken.totalBorrows.reset();
      debt.vToken.badDebt.reset();

      await borrow();

      expect(debt.vToken.totalBorrows).to.have.callCount(0);
      expect(debt.vToken.badDebt).to.have.callCount(0);
    });

    it("reports the cap before the liquidity check", async () => {
      // A borrow can fail both checks at once. The cap is a market-wide limit and cheaper to reason about, so it
      // is the one the borrower should be told about.
      await comptroller.setMarketBorrowCaps([debt.vToken.address], [parseUnits("1", 18)]);

      await expect(borrow(parseUnits("600", 18))).to.be.revertedWithCustomError(comptroller, "BorrowCapExceeded");
    });
  });

  describe("close factor", () => {
    /// Collateral 200 at a 0.8 threshold against a borrow of 300: under water, and above the 100 collateral
    /// threshold that would route the account to the batch operations instead.
    const BORROW_BALANCE = parseUnits("300", 18);

    const liquidate = (repayAmount: string) =>
      comptroller.callStatic.preLiquidateHook(
        debt.vToken.address,
        collateral.vToken.address,
        borrower.address,
        parseUnits(repayAmount, 18),
        false,
      );

    beforeEach(async () => {
      await comptroller.setCloseFactor(CLOSE_FACTOR);
      await setRiskWeights(comptroller, collateral, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await setRiskWeights(comptroller, debt, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: parseUnits("200", 18) },
        { market: debt, borrow: BORROW_BALANCE },
      ]);
    });

    it("caps a single liquidation at the close factor share of the borrow", async () => {
      // 0.5 of 300.
      await expect(liquidate("150")).to.not.be.reverted;
      await expect(liquidate("150.000000000000000001")).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
    });

    it("moves with the close factor", async () => {
      await comptroller.setCloseFactor(parseUnits("0.9", 18));

      await expect(liquidate("270")).to.not.be.reverted;
      await expect(liquidate("270.000000000000000001")).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
    });

    it("is the last check, so a healthy account is reported as healthy", async () => {
      collateral.vToken.getAccountSnapshot
        .whenCalledWith(borrower.address)
        .returns([0, parseUnits("1000", 18), 0, parseUnits("1", 18)]);

      await expect(liquidate("1000")).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
    });
  });

  describe("forced liquidation", () => {
    const liquidate = (repayAmount: string, skipLiquidityCheck = false) =>
      comptroller.callStatic.preLiquidateHook(
        debt.vToken.address,
        collateral.vToken.address,
        borrower.address,
        parseUnits(repayAmount, 18),
        skipLiquidityCheck,
      );

    beforeEach(async () => {
      await comptroller.setCloseFactor(CLOSE_FACTOR);
      await setRiskWeights(comptroller, collateral, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await setRiskWeights(comptroller, debt, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      // Fully collateralized, and holding far less collateral than `minLiquidatableCollateral`. Every check the
      // flag is supposed to skip would reject this account.
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: parseUnits("10", 18) },
        { market: debt, borrow: parseUnits("1", 18) },
      ]);
    });

    it("rejects a healthy account while the flag is off", async () => {
      await expect(liquidate("1")).to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated");
    });

    it("liquidates a healthy account once the borrowed market is flagged", async () => {
      await comptroller.setForcedLiquidation(debt.vToken.address, true);

      // The whole borrow at once, which both the close factor and the collateral threshold would otherwise block.
      await expect(liquidate("1")).to.not.be.reverted;
    });

    it("still refuses to repay more than the account owes", async () => {
      await comptroller.setForcedLiquidation(debt.vToken.address, true);

      await expect(liquidate("1.000000000000000001")).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
    });

    it("is keyed by the borrowed market, not the pool", async () => {
      // Flagging the collateral market must not make debt in another market forcibly liquidatable.
      await comptroller.setForcedLiquidation(collateral.vToken.address, true);

      await expect(liquidate("1")).to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated");
    });

    it("takes the same branch when the caller passes skipLiquidityCheck", async () => {
      // The batch operations pass this flag on every order they place, which is how a batch liquidation clears
      // debt the regular path would refuse to touch.
      await expect(liquidate("1", true)).to.not.be.reverted;
      await expect(liquidate("1.000000000000000001", true)).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
    });

    it("stores the flag per market and emits the change", async () => {
      await expect(comptroller.setForcedLiquidation(debt.vToken.address, true))
        .to.emit(comptroller, "IsForcedLiquidationEnabledUpdated")
        .withArgs(debt.vToken.address, true);

      expect(await comptroller.isForcedLiquidationEnabled(debt.vToken.address)).to.equal(true);
      expect(await comptroller.isForcedLiquidationEnabled(collateral.vToken.address)).to.equal(false);
    });

    it("refuses to flag a market that is not listed", async () => {
      await expect(comptroller.setForcedLiquidation(stranger.address, true))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(stranger.address);
    });
  });

  describe("updatePrices", () => {
    it("refreshes every market the account has entered", async () => {
      await givePosition(comptroller, borrower, [{ market: collateral }, { market: debt }]);
      fixture.oracle.updatePrice.reset();

      await comptroller.updatePrices(borrower.address);

      expect(fixture.oracle.updatePrice).to.have.callCount(2);
      expect(fixture.oracle.updatePrice).to.have.been.calledWith(collateral.vToken.address);
      expect(fixture.oracle.updatePrice).to.have.been.calledWith(debt.vToken.address);
    });

    it("does nothing for an account in no markets", async () => {
      fixture.oracle.updatePrice.reset();

      await comptroller.updatePrices(stranger.address);

      expect(fixture.oracle.updatePrice).to.have.callCount(0);
    });

    it("is callable by anyone, since it only pushes prices the oracle already publishes", async () => {
      await givePosition(comptroller, borrower, [{ market: collateral }]);

      await expect(comptroller.connect(stranger).updatePrices(borrower.address)).to.not.be.reverted;
    });

    it("runs on the borrow path", async () => {
      await collateralizedBorrower();
      await comptroller.connect(borrower).enterMarkets([debt.vToken.address]);
      fixture.oracle.updatePrice.reset();

      await comptroller.connect(borrower).preBorrowHook(debt.vToken.address, borrower.address, BORROW_AMOUNT);

      expect(fixture.oracle.updatePrice).to.have.callCount(2);
    });

    it("runs on the liquidation path", async () => {
      await comptroller.setCloseFactor(CLOSE_FACTOR);
      await setRiskWeights(comptroller, collateral, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
      await givePosition(comptroller, borrower, [
        { market: collateral, collateral: parseUnits("200", 18) },
        { market: debt, borrow: parseUnits("300", 18) },
      ]);
      fixture.oracle.updatePrice.reset();

      await comptroller.preLiquidateHook(
        debt.vToken.address,
        collateral.vToken.address,
        borrower.address,
        parseUnits("150", 18),
        false,
      );

      expect(fixture.oracle.updatePrice).to.have.callCount(2);
    });

    it("runs on the repay path, for the repaid market alone", async () => {
      // A repayment can only improve the account, so it is the market being repaid that has to be priced fresh,
      // not the whole position.
      await givePosition(comptroller, borrower, [{ market: collateral }, { market: debt }]);
      fixture.oracle.updatePrice.reset();

      await comptroller.preRepayHook(debt.vToken.address, borrower.address);

      expect(fixture.oracle.updatePrice).to.have.callCount(1);
      expect(fixture.oracle.updatePrice).to.have.been.calledWith(debt.vToken.address);
    });
  });
});

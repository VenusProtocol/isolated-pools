import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { vTokenTestFixture } from "../util/TokenTestHelpers";

const factor = parseUnits("0.02", 18);
const reserves = parseUnits("3", 12);
const cash = reserves.mul(2);

describe("VToken", function () {
  let root, accounts;

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  describe("_setReserveFactorFresh", () => {
    let vToken;
    let acm;
    beforeEach(async () => {
      const { comptroller, accessControlManager, ...contracts } = await vTokenTestFixture();
      acm = accessControlManager;
      ({ vToken } = contracts);
      await comptroller.connect(root).setMarketSupplyCaps([vToken.address], [100000000000]);
    });

    it("rejects change by non-admin", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(vToken.connect(accounts[0]).setReserveFactor(factor)).revertedWithCustomError(
        vToken,
        "Unauthorized",
      );
      acm.isAllowedToCall.returns(true);
    });

    it("rejects change if market not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(vToken.harnessSetReserveFactorFresh(factor)).to.be.revertedWithCustomError(
        vToken,
        "SetReserveFactorFreshCheck",
      );
    });

    it("rejects newReserveFactor that descales to 1", async () => {
      await expect(vToken.harnessSetReserveFactorFresh(parseUnits("1.01", 18))).to.be.revertedWithCustomError(
        vToken,
        "SetReserveFactorBoundsCheck",
      );
    });

    it("accepts newReserveFactor in valid range and emits log", async () => {
      await expect(vToken.harnessSetReserveFactorFresh(factor))
        .to.emit(vToken, "NewReserveFactor")
        .withArgs("300000000000000000", factor.toString());

      expect((await vToken.reserveFactorMantissa()).toString()).to.equal(factor.toString());
    });

    it("accepts a change back to zero", async () => {
      await vToken.accrueInterest();
      await vToken.harnessSetReserveFactorFresh(factor);

      await vToken.accrueInterest();
      const result = await vToken.harnessSetReserveFactorFresh(0);

      await expect(result).to.emit(vToken, "NewReserveFactor").withArgs(factor.toString(), "0");

      expect(await vToken.reserveFactorMantissa()).to.equal("0");
    });
  });

  describe("setReserveFactor", () => {
    let vToken;
    let interestRateModel;
    beforeEach(async () => {
      const { comptroller, ...contracts } = await vTokenTestFixture();
      ({ vToken, interestRateModel } = contracts);

      await comptroller.connect(root).setMarketSupplyCaps([vToken.address], [100000000000]);
      await vToken.connect(root).harnessSetReserveFactorFresh(0);
    });

    it("emits a reserve factor failure if interest accrual fails", async () => {
      await vToken.harnessFastForward(1);
      interestRateModel.getBorrowRate.reverts("NTEREST_RATE_MODEL_ERROR");
      await expect(vToken.setReserveFactor(factor)).to.be.reverted;
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
      interestRateModel.getBorrowRate.reset();
    });

    it("returns error from setReserveFactorFresh without emitting any extra logs", async () => {
      await expect(vToken.harnessSetReserveFactorFresh(parseUnits("29", 18))).to.be.revertedWithCustomError(
        vToken,
        "SetReserveFactorBoundsCheck",
      );
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
    });

    it("returns success from setReserveFactorFresh", async () => {
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
      await vToken.harnessFastForward(5);
      await vToken.setReserveFactor(factor);
      expect(await vToken.reserveFactorMantissa()).to.equal(factor);
    });
  });

  describe("reduceReservesFresh", () => {
    let vToken;
    let underlying;
    let psr;
    beforeEach(async () => {
      ({ vToken, underlying, protocolShareReserve: psr } = await vTokenTestFixture());
      await vToken.connect(root).harnessSetTotalReserves(reserves);
      await underlying.harnessSetBalance(vToken.address, cash);
    });

    afterEach(async () => {
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
    });

    it("fails if market not fresh", async () => {
      await vToken.harnessSetAccrualBlockNumber(await ethers.provider.getBlockNumber());
      await mine(1);
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
      await expect(vToken.harnessReduceReservesFresh(reserves)).to.be.revertedWithCustomError(
        vToken,
        "ReduceReservesFreshCheck",
      );
      expect(await vToken.totalReserves()).to.equal(reserves);
    });

    it("fails if amount exceeds available cash", async () => {
      // Reduce cash to zero
      await vToken.harnessSetTotalReserves(reserves.mul(2));
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
      await vToken.accrueInterest();

      await expect(vToken.harnessReduceReservesFresh(reserves)).to.be.revertedWithCustomError(
        vToken,
        "ReduceReservesCashNotAvailable",
      );
    });

    it("fails if reduction exceeds reserve amount", async () => {
      // Reduce cash to zero
      await vToken.harnessSetTotalReserves(reserves);
      await underlying.harnessSetBalance(vToken.address, cash);
      await expect(vToken.harnessReduceReservesFresh(reserves.mul(2))).to.be.revertedWithCustomError(
        vToken,
        "ReduceReservesCashValidation",
      );
    });

    it("if there isn't enough cash, reduces with available cash", async () => {
      const underlyingBalance = await underlying.balanceOf(vToken.address);
      const largeReserves = underlyingBalance.mul(2);
      await vToken.harnessSetTotalReserves(largeReserves);
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());

      await expect(vToken.accrueInterest())
        .to.emit(vToken, "SpreadReservesReduced")
        .withArgs(psr.address, underlyingBalance.toString(), largeReserves.sub(underlyingBalance));

      expect(await vToken.totalReserves()).to.equal(largeReserves.sub(underlyingBalance));
    });

    it("increases admin balance and reduces reserves on success", async () => {
      // setup
      await underlying.harnessSetBalance(vToken.address, cash);
      await vToken.harnessSetTotalReserves(reserves);
      const balance = await underlying.balanceOf(psr.address);
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());

      // Distribute income while accruing interest
      await expect(vToken.accrueInterest())
        .to.emit(vToken, "SpreadReservesReduced")
        .withArgs(psr.address, reserves.toString(), "0");

      expect(await underlying.balanceOf(psr.address)).to.equal(balance.add(reserves));
      expect(await vToken.totalReserves()).to.equal(0);
    });
  });

  describe("reduceReserves", () => {
    let vToken;
    let underlying;
    let interestRateModel;
    beforeEach(async () => {
      ({ vToken, underlying, interestRateModel } = await vTokenTestFixture());
      await vToken.harnessSetTotalReserves(reserves);
      await underlying.harnessSetBalance(vToken.address, cash);
    });

    it("emits a reserve-reduction failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("INTEREST_RATE_MODEL_ERROR");
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
      await expect(vToken.reduceReserves(reserves)).to.be.reverted;
      interestRateModel.getBorrowRate.reset();
    });

    it("returns error from reduceReservesFresh without emitting any extra logs", async () => {
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
      await vToken.accrueInterest();
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());

      // Set it high so we don't reduce reserves when accruing interest
      await vToken.setReduceReservesBlockDelta(100);
      await expect(vToken.reduceReserves(reserves)).to.be.revertedWithCustomError(
        vToken,
        "ReduceReservesCashValidation",
      );
    });

    it("returns success code from reduceReservesFresh and reduces the correct amount", async () => {
      expect(await vToken.totalReserves()).to.equal(reserves);
      await vToken.harnessSetBlockNumber(await ethers.provider.getBlockNumber());
      await vToken.reduceReserves(reserves);
      expect(await vToken.totalReserves()).to.equal(0);
    });
  });
});

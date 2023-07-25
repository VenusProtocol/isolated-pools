import { FakeContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { InterestRateModel, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const blockNumber = 2e7;
const borrowIndex = parseUnits("1", 18).toBigInt();
const borrowRate = parseUnits("0.000001", 18).toBigInt();

async function pretendBlock(
  vToken: VTokenHarness,
  accrualBlock: BigNumberish = blockNumber,
  deltaBlocks: BigNumberish = 1,
) {
  await vToken.harnessSetAccrualBlockNumber(accrualBlock);
  await vToken.harnessSetBlockNumber(BigNumber.from(accrualBlock).add(deltaBlocks));
  await vToken.harnessSetBorrowIndex(borrowIndex);
}

async function preAccrue({
  vToken,
  interestRateModel,
}: {
  vToken: VTokenHarness;
  interestRateModel: FakeContract<InterestRateModel>;
}) {
  interestRateModel.getBorrowRate.reset();
  interestRateModel.getBorrowRate.returns(borrowRate);
  interestRateModel.getSupplyRate.reset();
  await vToken.harnessExchangeRateDetails(0, 0, 0);
}

describe("VToken", () => {
  let vToken: VTokenHarness;
  let interestRateModel: FakeContract<InterestRateModel>;

  beforeEach(async () => {
    const contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, interestRateModel } = contracts);
    await vToken.setReduceReservesBlockDelta(convertToUnit(4, 10));
  });

  beforeEach(async () => {
    await preAccrue({ vToken, interestRateModel });
  });

  describe("accrueInterest", () => {
    it("reverts if the interest rate is absurdly high", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      expect(await vToken.getBorrowRateMaxMantissa()).to.equal(parseUnits("0.000005", 18)); // 0.0005% per block
      interestRateModel.getBorrowRate.returns(parseUnits("0.00001", 18)); // 0.0010% per block
      await expect(vToken.accrueInterest()).to.be.revertedWith("borrow rate is absurdly high");
    });

    it("fails if new borrow rate calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(vToken.accrueInterest()).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("fails if simple interest factor calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, parseUnits("5", 70));
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new borrow index calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, parseUnits("5", 60));
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new borrow interest index calculation fails", async () => {
      await pretendBlock(vToken);
      await vToken.harnessSetBorrowIndex(constants.MaxUint256);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if interest accumulated calculation fails", async () => {
      await vToken.harnessExchangeRateDetails(0, constants.MaxUint256, 0);
      await pretendBlock(vToken);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new total borrows calculation fails", async () => {
      interestRateModel.getBorrowRate.returns("1");
      await pretendBlock(vToken);
      await vToken.harnessExchangeRateDetails(0, constants.MaxUint256, 0);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if interest accumulated for reserves calculation fails", async () => {
      interestRateModel.getBorrowRate.returns(parseUnits("0.000001", 18));
      await vToken.harnessExchangeRateDetails(0, parseUnits("1", 30), constants.MaxUint256);
      await vToken.harnessSetReserveFactorFresh(parseUnits("1", 10));
      await pretendBlock(vToken, blockNumber, parseUnits("5", 20));
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new total reserves calculation fails", async () => {
      interestRateModel.getBorrowRate.returns("1");
      await vToken.harnessExchangeRateDetails(0, parseUnits("1", 56), constants.MaxUint256);
      await vToken.harnessSetReserveFactorFresh(parseUnits("1", 17));
      await pretendBlock(vToken);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("succeeds and saves updated values in storage on success", async () => {
      const startingTotalBorrows = parseUnits("1", 22);
      const startingTotalReserves = parseUnits("1", 20);
      const reserveFactor = parseUnits("1", 17);

      await vToken.harnessExchangeRateDetails(0, startingTotalBorrows, startingTotalReserves);
      await vToken.harnessSetReserveFactorFresh(reserveFactor);
      await pretendBlock(vToken);

      const expectedAccrualBlockNumber = blockNumber + 1;
      const expectedBorrowIndex = BigNumber.from(borrowIndex).add(
        BigNumber.from(borrowIndex).mul(borrowRate).div(parseUnits("1", 18)),
      );
      const expectedTotalBorrows = startingTotalBorrows.add(
        startingTotalBorrows.mul(borrowRate).div(parseUnits("1", 18)),
      );
      const expectedTotalReserves = startingTotalReserves.add(
        startingTotalBorrows.mul(borrowRate).mul(reserveFactor).div(parseUnits("1", 36)),
      );

      const receipt = await vToken.accrueInterest();
      const expectedInterestAccumulated = expectedTotalBorrows.sub(startingTotalBorrows);

      await expect(receipt)
        .to.emit(vToken, "AccrueInterest")
        .withArgs(0, expectedInterestAccumulated, expectedBorrowIndex, expectedTotalBorrows);

      expect(await vToken.accrualBlockNumber()).to.equal(expectedAccrualBlockNumber);
      expect(await vToken.borrowIndex()).to.equal(expectedBorrowIndex);
      expect(await vToken.totalBorrows()).to.equal(expectedTotalBorrows);
      expect(await vToken.totalReserves()).to.equal(expectedTotalReserves);
    });
  });
});

import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { constants } from "ethers";

import { convertToUnit } from "../../../helpers/utils";
import { InterestRateModel, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const blockNumber = 2e7;
const borrowIndex = convertToUnit("1", 18);
const borrowRate = convertToUnit("0.000001", 18);

async function pretendBlock(
  vToken: MockContract<VTokenHarness>,
  accrualBlock: number | string = blockNumber,
  deltaBlocks: number | string = 1,
) {
  await vToken.harnessSetAccrualBlockNumber(accrualBlock);
  await vToken.harnessSetBlockNumber(new BigNumber(accrualBlock).plus(deltaBlocks).toFixed());
  await vToken.harnessSetBorrowIndex(borrowIndex);
}

async function preAccrue({
  vToken,
  interestRateModel,
}: {
  vToken: MockContract<VTokenHarness>;
  interestRateModel: FakeContract<InterestRateModel>;
}) {
  interestRateModel.getBorrowRate.reset();
  interestRateModel.getBorrowRate.returns(borrowRate);
  interestRateModel.getSupplyRate.reset();
  await vToken.harnessExchangeRateDetails(0, 0, 0);
}

describe("VToken", () => {
  let vToken: MockContract<VTokenHarness>;
  let interestRateModel: FakeContract<InterestRateModel>;

  beforeEach(async () => {
    const contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, interestRateModel } = contracts);
  });

  beforeEach(async () => {
    await preAccrue({ vToken, interestRateModel });
  });

  describe("accrueInterest", () => {
    it("reverts if the interest rate is absurdly high", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      expect(await vToken.getBorrowRateMaxMantissa()).to.equal(convertToUnit("0.000005", 18)); // 0.0005% per block
      interestRateModel.getBorrowRate.returns(convertToUnit("0.00001", 18)); // 0.0010% per block
      await expect(vToken.accrueInterest()).to.be.revertedWith("borrow rate is absurdly high");
    });

    it("fails if new borrow rate calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(vToken.accrueInterest()).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("fails if simple interest factor calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, convertToUnit("5", 70));
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new borrow index calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, convertToUnit("5", 60));
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
      interestRateModel.getBorrowRate.returns(convertToUnit("0.000001", 18));
      await vToken.harnessExchangeRateDetails(0, convertToUnit("1", 30), constants.MaxUint256);
      await vToken.harnessSetReserveFactorFresh(convertToUnit("1", 10));
      await pretendBlock(vToken, blockNumber, 5e20);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if new total reserves calculation fails", async () => {
      interestRateModel.getBorrowRate.returns("1");
      await vToken.harnessExchangeRateDetails(0, convertToUnit("1", 56), constants.MaxUint256);
      await vToken.harnessSetReserveFactorFresh(convertToUnit("1", 17));
      await pretendBlock(vToken);
      await expect(vToken.accrueInterest()).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("succeeds and saves updated values in storage on success", async () => {
      const startingTotalBorrows = new BigNumber(1e22);
      const startingTotalReserves = new BigNumber(1e20);
      const reserveFactor = new BigNumber(1e17);

      await vToken.harnessExchangeRateDetails(0, startingTotalBorrows.toFixed(), startingTotalReserves.toFixed());
      await vToken.harnessSetReserveFactorFresh(reserveFactor.toFixed());
      await pretendBlock(vToken);

      const expectedAccrualBlockNumber = blockNumber + 1;
      const expectedBorrowIndex = new BigNumber(borrowIndex).plus(
        new BigNumber(borrowIndex).multipliedBy(borrowRate).dividedBy(1e18),
      );
      const expectedTotalBorrows = startingTotalBorrows.plus(
        startingTotalBorrows.multipliedBy(borrowRate).dividedBy(1e18),
      );
      const expectedTotalReserves = startingTotalReserves.plus(
        startingTotalBorrows.multipliedBy(borrowRate).multipliedBy(reserveFactor).dividedBy(1e36),
      );

      const receipt = await vToken.accrueInterest();
      const expectedInterestAccumulated = expectedTotalBorrows.minus(startingTotalBorrows);

      await expect(receipt)
        .to.emit(vToken, "AccrueInterest")
        .withArgs(
          0,
          expectedInterestAccumulated.toFixed(),
          expectedBorrowIndex.toFixed(),
          expectedTotalBorrows.toFixed(),
        );

      expect(await vToken.accrualBlockNumber()).to.equal(expectedAccrualBlockNumber);
      expect(await vToken.borrowIndex()).to.equal(expectedBorrowIndex);
      expect(await vToken.totalBorrows()).to.equal(expectedTotalBorrows);
      expect(await vToken.totalReserves()).to.equal(expectedTotalReserves);
    });
  });
});

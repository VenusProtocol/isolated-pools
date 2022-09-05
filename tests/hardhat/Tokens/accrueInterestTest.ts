import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { CErc20Harness, ERC20Harness, Comptroller, InterestRateModel, AccessControlManager } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { cTokenTestFixture } from "../util/TokenTestHelpers";


const blockNumber = 2e7;
const borrowIndex = convertToUnit("1", 18);
const borrowRate = convertToUnit("0.000001", 18);

async function pretendBlock(
  cToken: MockContract<CErc20Harness>,
  accrualBlock: number | string = blockNumber,
  deltaBlocks: number | string = 1
) {
  await cToken.harnessSetAccrualBlockNumber(accrualBlock);
  await cToken.harnessSetBlockNumber(new BigNumber(accrualBlock).plus(deltaBlocks).toFixed());
  await cToken.harnessSetBorrowIndex(borrowIndex);
}

async function preAccrue({ cToken, interestRateModel }: {
  cToken: MockContract<CErc20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
}) {
  interestRateModel.getBorrowRate.reset();
  interestRateModel.getBorrowRate.returns(borrowRate);
  interestRateModel.getSupplyRate.reset();
  await cToken.harnessExchangeRateDetails(0, 0, 0);
}

describe('CToken', () => {
  let root: Signer;
  let accounts: Signer[];
  let cToken: MockContract<CErc20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(cTokenTestFixture);
    ({ cToken, interestRateModel } = contracts);
  });

  beforeEach(async () => {
    await preAccrue({ cToken, interestRateModel });
  });

  describe('accrueInterest', () => {
    it('reverts if the interest rate is absurdly high', async () => {
      await pretendBlock(cToken, blockNumber, 1);
      expect(await cToken.getBorrowRateMaxMantissa()).to.equal(convertToUnit("0.000005", 18)); // 0.0005% per block
      interestRateModel.getBorrowRate.returns(convertToUnit("0.00001", 18)); // 0.0010% per block
      await expect(cToken.accrueInterest()).to.be.revertedWith("borrow rate is absurdly high");
    });

    it('fails if new borrow rate calculation fails', async () => {
      await pretendBlock(cToken, blockNumber, 1);
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(cToken.accrueInterest()).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it('fails if simple interest factor calculation fails', async () => {
      await pretendBlock(cToken, blockNumber, convertToUnit("5", 70));
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if new borrow index calculation fails', async () => {
      await pretendBlock(cToken, blockNumber, convertToUnit("5", 60));
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if new borrow interest index calculation fails', async () => {
      await pretendBlock(cToken);
      await cToken.harnessSetBorrowIndex(constants.MaxUint256);
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if interest accumulated calculation fails', async () => {
      await cToken.harnessExchangeRateDetails(0, constants.MaxUint256, 0);
      await pretendBlock(cToken)
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if new total borrows calculation fails', async () => {
      interestRateModel.getBorrowRate.returns("1");
      await pretendBlock(cToken)
      await cToken.harnessExchangeRateDetails(0, constants.MaxUint256, 0);
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if interest accumulated for reserves calculation fails', async () => {
      interestRateModel.getBorrowRate.returns(convertToUnit("0.000001", 18));
      await cToken.harnessExchangeRateDetails(0, convertToUnit("1", 30), constants.MaxUint256);
      await cToken.harnessSetReserveFactorFresh(convertToUnit("1", 10));
      await pretendBlock(cToken, blockNumber, 5e20)
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('fails if new total reserves calculation fails', async () => {
      interestRateModel.getBorrowRate.returns("1");
      await cToken.harnessExchangeRateDetails(0, convertToUnit("1", 56), constants.MaxUint256);
      await cToken.harnessSetReserveFactorFresh(convertToUnit("1", 17));
      await pretendBlock(cToken)
      await expect(cToken.accrueInterest()).to.be.reverted;
    });

    it('succeeds and saves updated values in storage on success', async () => {
      const startingTotalBorrows = new BigNumber(1e22);
      const startingTotalReserves = new BigNumber(1e20);
      const reserveFactor = new BigNumber(1e17);

      await cToken.harnessExchangeRateDetails(0, startingTotalBorrows.toFixed(), startingTotalReserves.toFixed());
      await cToken.harnessSetReserveFactorFresh(reserveFactor.toFixed());
      await pretendBlock(cToken)

      const expectedAccrualBlockNumber = blockNumber + 1;
      const expectedBorrowIndex =
        new BigNumber(borrowIndex).plus(new BigNumber(borrowIndex).multipliedBy(borrowRate).dividedBy(1e18));
      const expectedTotalBorrows = startingTotalBorrows.plus(startingTotalBorrows.multipliedBy(borrowRate).dividedBy(1e18));
      const expectedTotalReserves =
        startingTotalReserves.plus(startingTotalBorrows.multipliedBy(borrowRate).multipliedBy(reserveFactor).dividedBy(1e36));

      const receipt = await cToken.accrueInterest();
      const expectedInterestAccumulated = expectedTotalBorrows.minus(startingTotalBorrows);

      //expect(receipt).toSucceed();
      expect(receipt)
        .to.emit(cToken, "AccrueInterest")
        .withArgs(0, expectedInterestAccumulated.toFixed(), expectedBorrowIndex.toFixed(), expectedTotalBorrows.toFixed());

      expect(await cToken.accrualBlockNumber()).to.equal(expectedAccrualBlockNumber);
      expect(await cToken.borrowIndex()).to.equal(expectedBorrowIndex);
      expect(await cToken.totalBorrows()).to.equal(expectedTotalBorrows);
      expect(await cToken.totalReserves()).to.equal(expectedTotalReserves);
    });
  });
});

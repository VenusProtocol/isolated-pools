import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { VTokenHarness } from "../../../typechain";
import { VTokenTestFixture, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const borrowAmount = convertToUnit("1000", 18);

async function preBorrow(contracts: VTokenTestFixture, borrower: Signer, borrowAmount: BigNumberish) {
  const { comptroller, interestRateModel, underlying, vToken, stableInterestRateModel } = contracts;
  comptroller.preBorrowHook.reset();

  interestRateModel.getBorrowRate.reset();
  stableInterestRateModel.getBorrowRate.reset();

  const borrowerAddress = await borrower.getAddress();
  await underlying.harnessSetBalance(vToken.address, borrowAmount);
  await vToken.harnessSetFailTransferToAddress(borrowerAddress, false);
  await vToken.harnessSetAccountBorrows(borrowerAddress, 0, 0);
  await vToken.harnessSetTotalBorrows(0);
}

async function borrow(vToken: MockContract<VTokenHarness>, borrower: Signer, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrow(borrowAmount);
}

async function borrowStable(vToken: MockContract<VTokenHarness>, borrower: Signer, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrowStable(borrowAmount);
}

describe("VToken", function () {
  let contracts: VTokenTestFixture;
  let vToken: MockContract<VTokenHarness>;
  let _root: Signer;
  let borrower: Signer;
  let borrowerAddress: string;

  beforeEach(async () => {
    [_root, borrower] = await ethers.getSigners();
    borrowerAddress = await borrower.getAddress();
    contracts = await loadFixture(vTokenTestFixture);
    ({ vToken } = contracts);
  });

  describe("swapBorrowRateMode: tests", () => {
    it("fails if variable debt is 0", async () => {
      await expect(vToken.swapBorrowRateMode(1)).to.be.revertedWith("vToken: swapBorrowRateMode variable debt is 0");
    });

    it("fails if stable debt is 0", async () => {
      await expect(vToken.swapBorrowRateMode(2)).to.be.revertedWith("vToken: swapBorrowRateMode stable debt is 0");
    });

    it("Swapping borrow rate mode from variable to stable", async () => {
      await preBorrow(contracts, borrower, borrowAmount);
      await borrow(vToken, borrower, borrowAmount);
      let variableBorrow, stableBorrow;
      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(borrowAmount);

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(0);

      await vToken.connect(borrower).swapBorrowRateMode(1);

      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(0);

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(borrowAmount);
    });

    it("Swapping borrow rate mode from variable to stable", async () => {
      await preBorrow(contracts, borrower, borrowAmount);
      await borrowStable(vToken, borrower, borrowAmount);
      let variableBorrow, stableBorrow;
      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(0);

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(borrowAmount);

      await vToken.connect(borrower).swapBorrowRateMode(2);

      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(borrowAmount);

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(0);
    });
  });

  describe("swapBorrowRateModeWithAmount: tests", () => {
    it("fails if variable debt is 0", async () => {
      await expect(vToken.swapBorrowRateModeWithAmount(1, borrowAmount)).to.be.revertedWith(
        "vToken: swapBorrowRateMode variable debt is 0",
      );
    });

    it("fails if stable debt is 0", async () => {
      await expect(vToken.swapBorrowRateModeWithAmount(2, borrowAmount)).to.be.revertedWith(
        "vToken: swapBorrowRateMode stable debt is 0",
      );
    });

    it("Swapping borrow rate mode from variable to stable with amount", async () => {
      await preBorrow(contracts, borrower, borrowAmount);
      await borrow(vToken, borrower, borrowAmount);
      let variableBorrow, stableBorrow;
      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(borrowAmount);

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(0);

      await vToken.connect(borrower).swapBorrowRateModeWithAmount(1, convertToUnit("400", 18));

      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(convertToUnit("600", 18));

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(convertToUnit("400", 18));
    });

    it("Swapping borrow rate mode from variable to stable with amount", async () => {
      await preBorrow(contracts, borrower, borrowAmount);
      await borrowStable(vToken, borrower, borrowAmount);
      let variableBorrow, stableBorrow;
      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(convertToUnit("0", 18));

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(convertToUnit("1000", 18));

      await vToken.connect(borrower).swapBorrowRateModeWithAmount(2, convertToUnit("200", 18));

      variableBorrow = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(variableBorrow.principal).equal(convertToUnit("200", 18));

      stableBorrow = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(stableBorrow.principal).equal(convertToUnit("800", 18));
    });
  });
});

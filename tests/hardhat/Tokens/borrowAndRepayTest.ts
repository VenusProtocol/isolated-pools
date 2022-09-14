import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { VBep20Harness, ERC20Harness, Comptroller, InterestRateModel } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  preApprove, pretendBorrow, vTokenTestFixture, VTokenTestFixture
} from "../util/TokenTestHelpers";



const repayAmount = convertToUnit("100", 18);
const borrowAmount = convertToUnit("1000", 18);

async function preBorrow(
  contracts: VTokenTestFixture,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  comptroller.borrowAllowed.reset();
  comptroller.borrowAllowed.returns(Error.NO_ERROR);
  comptroller.borrowVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const borrowerAddress = await borrower.getAddress();
  await underlying.harnessSetBalance(vToken.address, borrowAmount);
  await vToken.harnessSetFailTransferToAddress(borrowerAddress, false);
  await vToken.harnessSetAccountBorrows(borrowerAddress, 0, 0);
  await vToken.harnessSetTotalBorrows(0);
}

async function borrowFresh(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  return vToken.harnessBorrowFresh(await borrower.getAddress(), borrowAmount);
}

async function borrow(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrow(borrowAmount);
}

async function preRepay(
  contracts: VTokenTestFixture,
  benefactor: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  // setup either benefactor OR borrower for success in repaying
  comptroller.repayBorrowAllowed.reset();
  comptroller.repayBorrowAllowed.returns(Error.NO_ERROR);
  comptroller.repayBorrowVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  await underlying.harnessSetFailTransferFromAddress(await benefactor.getAddress(), false);
  await underlying.harnessSetFailTransferFromAddress(await borrower.getAddress(), false);
  await pretendBorrow(vToken, borrower, 1, 1, repayAmount);
  await preApprove(underlying, vToken, benefactor, repayAmount, { faucet: true });
  await preApprove(underlying, vToken, borrower, repayAmount, { faucet: true });
}

async function repayBorrowFresh(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  const payerAddress = await payer.getAddress();
  const borrowerAddress = await borrower.getAddress();
  return vToken.connect(payer).harnessRepayBorrowFresh(payerAddress, borrowerAddress, repayAmount);
}

async function repayBorrow(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).repayBorrow(repayAmount);
}

async function repayBorrowBehalf(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(payer).repayBorrowBehalf(await borrower.getAddress(), repayAmount);
}

describe('VToken', function () {
  let contracts: VTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let vToken: MockContract<VBep20Harness>;
  let underlying: MockContract<ERC20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let root: Signer;
  let borrower: Signer;
  let benefactor: Signer;
  let accounts: Signer[];
  let borrowerAddress: string;

  beforeEach(async () => {
    [root, borrower, benefactor, ...accounts] = await ethers.getSigners();
    borrowerAddress = await borrower.getAddress();
    contracts = await loadFixture(vTokenTestFixture);
    ({ comptroller, vToken, underlying, interestRateModel } = contracts);
  });

  describe('borrowFresh', () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("fails if comptroller tells it to", async () => {
      comptroller.borrowAllowed.returns(11);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWithCustomError(vToken, "BorrowComptrollerRejection")
        .withArgs(11);
    });

    it("proceeds if comptroller tells it to", async () => {
      //await expect(
        await borrowFresh(vToken, borrower, borrowAmount)
      //).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWithCustomError(vToken, "BorrowFreshnessCheck");
    });

    it("continues if fresh", async () => {
      //await expect(
        await vToken.accrueInterest()
      //).toSucceed();
      //await expect(
        await borrowFresh(vToken, borrower, borrowAmount)
      //).toSucceed();
    });

    it("fails if error if protocol has less than borrowAmount of underlying", async () => {
      await expect(borrowFresh(vToken, borrower, new BigNumber(borrowAmount).plus(1).toString()))
        .to.be.revertedWithCustomError(vToken, "BorrowCashNotAvailable");
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(vToken, borrower, 0, 3, 5);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(vToken, borrower, 1e-18, 1e-18, constants.MaxUint256);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await vToken.harnessSetTotalBorrows(constants.MaxUint256);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("reverts if transfer out fails", async () => {
      await vToken.harnessSetFailTransferToAddress(borrowerAddress, true);
      await expect(borrowFresh(vToken, borrower, borrowAmount))
        .to.be.revertedWith("TOKEN_TRANSFER_OUT_FAILED");
    });

    xit("reverts if borrowVerify fails", async() => {
      comptroller.borrowVerify.reverts("Oups");
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWith("borrowVerify rejected borrow");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await underlying.balanceOf(vToken.address);
      const beforeProtocolBorrows = await vToken.totalBorrows();
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      const result = await borrowFresh(vToken, borrower, borrowAmount);
      //expect(result).toSucceed();
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
      expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.sub(borrowAmount));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
      expect(result)
        .to.emit(underlying, "Transfer")
        .withArgs(vToken.address, borrowerAddress, borrowAmount);

      expect(result)
        .to.emit(vToken, "Borrow")
        .withArgs(borrowerAddress, borrowAmount, borrowAmount, beforeProtocolBorrows.add(borrowAmount).toString());
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await vToken.totalBorrows();
      await pretendBorrow(vToken, borrower, 0, 3, 0);
      await borrowFresh(vToken, borrower, borrowAmount);
      const borrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(borrowSnap.principal).to.equal(borrowAmount);
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("3", 18));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
    });
  });

  describe('borrow', () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(borrow(vToken, borrower, borrowAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      await expect(borrow(vToken, borrower, new BigNumber(borrowAmount).plus(1).toString()))
        .to.be.revertedWithCustomError(vToken, "BorrowCashNotAvailable");
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      await vToken.harnessFastForward(5);
      //expect(
        await borrow(vToken, borrower, borrowAmount)
      //).toSucceed();
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
    });
  });

  describe('repayBorrowFresh', () => {
    [true, false].forEach((benefactorIsPayer) => {
      let payer: Signer;
      let payerAddress: string;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          payerAddress = await payer.getAddress();
          await preRepay(contracts, payer, borrower, repayAmount);
        });

        it("fails if repay is not allowed", async () => {
          comptroller.repayBorrowAllowed.returns(11);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWithCustomError(vToken, "RepayBorrowComptrollerRejection")
            .withArgs(11);
        });

        it("fails if block number ≠ current block number", async () => {
          await vToken.harnessFastForward(5);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWithCustomError(vToken, "RepayBorrowFreshnessCheck");
        });

        it("fails if insufficient approval", async() => {
          await preApprove(underlying, vToken, payer, 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWith("Insufficient allowance");
        });

        it("fails if insufficient balance", async() => {
          await underlying.harnessSetBalance(await payer.getAddress(), 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWith("Insufficient balance");
        });

        it("returns an error if calculating account new account borrow balance fails", async () => {
          await pretendBorrow(vToken, borrower, 1, 1, 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await vToken.harnessSetTotalBorrows(1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
        });


        it("reverts if doTransferIn fails", async () => {
          await underlying.harnessSetFailTransferFromAddress(payerAddress, true);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
        });

        xit("reverts if repayBorrowVerify fails", async() => {
          comptroller.repayBorrowVerify.reverts("Oups");
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.be.revertedWith("repayBorrowVerify rejected repayBorrow");
        });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await underlying.balanceOf(vToken.address);
          const result = await repayBorrowFresh(vToken, payer, borrower, repayAmount);
          expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.add(repayAmount));
          expect(result)
            .to.emit(underlying, "Transfer")
            .withArgs(payerAddress, vToken.address, repayAmount);
          expect(result)
            .to.emit(vToken, "RepayBorrow")
            .withArgs(payerAddress, borrowerAddress, repayAmount, "0", "0");
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await vToken.totalBorrows();
          const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
          //expect(
            await repayBorrowFresh(vToken, payer, borrower, repayAmount)
          //).toSucceed();
          const afterAccountBorrows = await vToken.harnessAccountBorrows(borrowerAddress);
          expect(afterAccountBorrows.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
          expect(afterAccountBorrows.interestIndex).to.equal(convertToUnit("1", 18));
          expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.sub(repayAmount));
        });
      });
    });
  });

  describe('repayBorrow', () => {
    beforeEach(async () => {
      await preRepay(contracts, borrower, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 1);
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.revertedWith('Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      //expect(
        await repayBorrow(vToken, borrower, repayAmount)
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await vToken.harnessFastForward(5);
      //expect(
        await repayBorrow(vToken, borrower, constants.MaxUint256)
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 3);
      await vToken.harnessFastForward(5);
      await expect(repayBorrow(vToken, borrower, constants.MaxUint256)).to.be.revertedWith('Insufficient balance');
    });
  });

  describe('repayBorrowBehalf', () => {
    let payer: Signer;
    let payerAddress: string;

    beforeEach(async () => {
      payer = benefactor;
      payerAddress = await payer.getAddress();
      await preRepay(contracts, payer, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(payerAddress, 1);
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.revertedWith('Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      //expect(
        await repayBorrowBehalf(vToken, payer, borrower, repayAmount)
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);;
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });
  });
});

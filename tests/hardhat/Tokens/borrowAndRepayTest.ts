import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { CErc20Harness, ERC20Harness, Comptroller, InterestRateModel } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  preApprove, pretendBorrow, cTokenTestFixture, CTokenTestFixture
} from "../util/TokenTestHelpers";



const repayAmount = convertToUnit("100", 18);
const borrowAmount = convertToUnit("1000", 18);

async function preBorrow(
  contracts: CTokenTestFixture,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, cToken } = contracts;
  comptroller.borrowAllowed.reset();
  comptroller.borrowAllowed.returns(Error.NO_ERROR);
  comptroller.borrowVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const borrowerAddress = await borrower.getAddress();
  await underlying.harnessSetBalance(cToken.address, borrowAmount);
  await cToken.harnessSetFailTransferToAddress(borrowerAddress, false);
  await cToken.harnessSetAccountBorrows(borrowerAddress, 0, 0);
  await cToken.harnessSetTotalBorrows(0);
}

async function borrowFresh(
  cToken: MockContract<CErc20Harness>,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  return cToken.harnessBorrowFresh(await borrower.getAddress(), borrowAmount);
}

async function borrow(
  cToken: MockContract<CErc20Harness>,
  borrower: Signer,
  borrowAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await cToken.harnessFastForward(1);
  return cToken.connect(borrower).borrow(borrowAmount);
}

async function preRepay(
  contracts: CTokenTestFixture,
  benefactor: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, cToken } = contracts;
  // setup either benefactor OR borrower for success in repaying
  comptroller.repayBorrowAllowed.reset();
  comptroller.repayBorrowAllowed.returns(Error.NO_ERROR);
  comptroller.repayBorrowVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  await underlying.harnessSetFailTransferFromAddress(await benefactor.getAddress(), false);
  await underlying.harnessSetFailTransferFromAddress(await borrower.getAddress(), false);
  await pretendBorrow(cToken, borrower, 1, 1, repayAmount);
  await preApprove(underlying, cToken, benefactor, repayAmount, { faucet: true });
  await preApprove(underlying, cToken, borrower, repayAmount, { faucet: true });
}

async function repayBorrowFresh(
  cToken: MockContract<CErc20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  const payerAddress = await payer.getAddress();
  const borrowerAddress = await borrower.getAddress();
  return cToken.connect(payer).harnessRepayBorrowFresh(payerAddress, borrowerAddress, repayAmount);
}

async function repayBorrow(
  cToken: MockContract<CErc20Harness>,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await cToken.harnessFastForward(1);
  return cToken.connect(borrower).repayBorrow(repayAmount);
}

async function repayBorrowBehalf(
  cToken: MockContract<CErc20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish
) {
  // make sure to have a block delta so we accrue interest
  await cToken.harnessFastForward(1);
  return cToken.connect(payer).repayBorrowBehalf(await borrower.getAddress(), repayAmount);
}

describe('CToken', function () {
  let contracts: CTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let cToken: MockContract<CErc20Harness>;
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
    contracts = await loadFixture(cTokenTestFixture);
    ({ comptroller, cToken, underlying, interestRateModel } = contracts);
  });

  describe('borrowFresh', () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("fails if comptroller tells it to", async () => {
      comptroller.borrowAllowed.returns(11);
      await expect(borrowFresh(cToken, borrower, borrowAmount))
        .to.be.revertedWithCustomError(cToken, "BorrowComptrollerRejection")
        .withArgs(11);
    });

    it("proceeds if comptroller tells it to", async () => {
      //await expect(
        await borrowFresh(cToken, borrower, borrowAmount)
      //).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await cToken.harnessFastForward(5);
      await expect(borrowFresh(cToken, borrower, borrowAmount))
        .to.be.revertedWithCustomError(cToken, "BorrowFreshnessCheck");
    });

    it("continues if fresh", async () => {
      //await expect(
        await cToken.accrueInterest()
      //).toSucceed();
      //await expect(
        await borrowFresh(cToken, borrower, borrowAmount)
      //).toSucceed();
    });

    it("fails if error if protocol has less than borrowAmount of underlying", async () => {
      await expect(borrowFresh(cToken, borrower, new BigNumber(borrowAmount).plus(1).toString()))
        .to.be.revertedWithCustomError(cToken, "BorrowCashNotAvailable");
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(cToken, borrower, 0, 3, 5);
      await expect(borrowFresh(cToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(cToken, borrower, 1e-18, 1e-18, constants.MaxUint256);
      await expect(borrowFresh(cToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await cToken.harnessSetTotalBorrows(constants.MaxUint256);
      await expect(borrowFresh(cToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("reverts if transfer out fails", async () => {
      await cToken.harnessSetFailTransferToAddress(borrowerAddress, true);
      await expect(borrowFresh(cToken, borrower, borrowAmount))
        .to.be.revertedWith("TOKEN_TRANSFER_OUT_FAILED");
    });

    xit("reverts if borrowVerify fails", async() => {
      comptroller.borrowVerify.reverts("Oups");
      await expect(borrowFresh(cToken, borrower, borrowAmount)).to.be.revertedWith("borrowVerify rejected borrow");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await underlying.balanceOf(cToken.address);
      const beforeProtocolBorrows = await cToken.totalBorrows();
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      const result = await borrowFresh(cToken, borrower, borrowAmount);
      //expect(result).toSucceed();
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
      expect(await underlying.balanceOf(cToken.address)).to.equal(beforeProtocolCash.sub(borrowAmount));
      expect(await cToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
      expect(result)
        .to.emit(underlying, "Transfer")
        .withArgs(cToken.address, borrowerAddress, borrowAmount);

      expect(result)
        .to.emit(cToken, "Borrow")
        .withArgs(borrowerAddress, borrowAmount, borrowAmount, beforeProtocolBorrows.add(borrowAmount).toString());
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await cToken.totalBorrows();
      await pretendBorrow(cToken, borrower, 0, 3, 0);
      await borrowFresh(cToken, borrower, borrowAmount);
      const borrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
      expect(borrowSnap.principal).to.equal(borrowAmount);
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("3", 18));
      expect(await cToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
    });
  });

  describe('borrow', () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(borrow(cToken, borrower, borrowAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      await expect(borrow(cToken, borrower, new BigNumber(borrowAmount).plus(1).toString()))
        .to.be.revertedWithCustomError(cToken, "BorrowCashNotAvailable");
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      await cToken.harnessFastForward(5);
      //expect(
        await borrow(cToken, borrower, borrowAmount)
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
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWithCustomError(cToken, "RepayBorrowComptrollerRejection")
            .withArgs(11);
        });

        it("fails if block number ≠ current block number", async () => {
          await cToken.harnessFastForward(5);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWithCustomError(cToken, "RepayBorrowFreshnessCheck");
        });

        it("fails if insufficient approval", async() => {
          await preApprove(underlying, cToken, payer, 1);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWith("Insufficient allowance");
        });

        it("fails if insufficient balance", async() => {
          await underlying.harnessSetBalance(await payer.getAddress(), 1);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWith("Insufficient balance");
        });


        it("returns an error if calculating account new account borrow balance fails", async () => {
          await pretendBorrow(cToken, borrower, 1, 1, 1);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount)).to.be.reverted;
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await cToken.harnessSetTotalBorrows(1);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount)).to.be.reverted;
        });


        it("reverts if doTransferIn fails", async () => {
          await underlying.harnessSetFailTransferFromAddress(payerAddress, true);
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
        });

        xit("reverts if repayBorrowVerify fails", async() => {
          comptroller.repayBorrowVerify.reverts("Oups");
          await expect(repayBorrowFresh(cToken, payer, borrower, repayAmount))
            .to.be.revertedWith("repayBorrowVerify rejected repayBorrow");
        });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await underlying.balanceOf(cToken.address);
          const result = await repayBorrowFresh(cToken, payer, borrower, repayAmount);
          expect(await underlying.balanceOf(cToken.address)).to.equal(beforeProtocolCash.add(repayAmount));
          expect(result)
            .to.emit(underlying, "Transfer")
            .withArgs(payerAddress, cToken.address, repayAmount);
          expect(result)
            .to.emit(cToken, "RepayBorrow")
            .withArgs(payerAddress, borrowerAddress, repayAmount, "0", "0");
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await cToken.totalBorrows();
          const beforeAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
          //expect(
            await repayBorrowFresh(cToken, payer, borrower, repayAmount)
          //).toSucceed();
          const afterAccountBorrows = await cToken.harnessAccountBorrows(borrowerAddress);
          expect(afterAccountBorrows.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
          expect(afterAccountBorrows.interestIndex).to.equal(convertToUnit("1", 18));
          expect(await cToken.totalBorrows()).to.equal(beforeProtocolBorrows.sub(repayAmount));
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
      await expect(repayBorrow(cToken, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 1);
      await expect(repayBorrow(cToken, borrower, repayAmount)).to.be.revertedWith('Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await cToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
      //expect(
        await repayBorrow(cToken, borrower, repayAmount)
      //).toSucceed();
      const afterAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await cToken.harnessFastForward(5);
      //expect(
        await repayBorrow(cToken, borrower, constants.MaxUint256)
      //).toSucceed();
      const afterAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 3);
      await cToken.harnessFastForward(5);
      await expect(repayBorrow(cToken, borrower, constants.MaxUint256)).to.be.revertedWith('Insufficient balance');
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
      await expect(repayBorrowBehalf(cToken, payer, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(payerAddress, 1);
      await expect(repayBorrowBehalf(cToken, payer, borrower, repayAmount)).to.be.revertedWith('Insufficient balance');
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await cToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);
      //expect(
        await repayBorrowBehalf(cToken, payer, borrower, repayAmount)
      //).toSucceed();
      const afterAccountBorrowSnap = await cToken.harnessAccountBorrows(borrowerAddress);;
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });
  });
});

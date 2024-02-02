import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../helpers/utils";
import { Comptroller, ERC20Harness, InterestRateModel, VTokenHarness } from "../../../typechain";
import { VTokenTestFixture, preApprove, pretendBorrow, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = parseUnits("100", 18).toBigInt();
const borrowAmount = parseUnits("1000", 18).toBigInt();

async function preBorrow(contracts: VTokenTestFixture, borrower: SignerWithAddress, borrowAmount: BigNumberish) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  comptroller.preBorrowHook.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  await underlying.harnessSetBalance(vToken.address, borrowAmount);
  await vToken.harnessSetFailTransferToAddress(borrower.address, false);
  await vToken.harnessSetAccountBorrows(borrower.address, 0, 0);
  await vToken.harnessSetTotalBorrows(0);
}

async function borrowFresh(vToken: VTokenHarness, borrower: SignerWithAddress, borrowAmount: BigNumberish) {
  return vToken.harnessBorrowFresh(borrower.address, borrowAmount);
}

async function borrow(vToken: VTokenHarness, borrower: SignerWithAddress, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrow(borrowAmount);
}

async function preRepay(
  contracts: VTokenTestFixture,
  benefactor: SignerWithAddress,
  borrower: SignerWithAddress,
  repayAmount: BigNumberish,
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  // setup either benefactor OR borrower for success in repaying
  comptroller.preRepayHook.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  await underlying.harnessSetFailTransferFromAddress(benefactor.address, false);
  await underlying.harnessSetFailTransferFromAddress(borrower.address, false);
  await pretendBorrow(vToken, borrower, parseUnits("1", 18), parseUnits("1", 18), repayAmount);
  await preApprove(underlying, vToken, benefactor, repayAmount, { faucet: true });
  await preApprove(underlying, vToken, borrower, repayAmount, { faucet: true });
}

async function repayBorrowFresh(
  vToken: VTokenHarness,
  payer: SignerWithAddress,
  borrower: SignerWithAddress,
  repayAmount: BigNumberish,
) {
  const borrowerAddress = borrower.address;
  return vToken.connect(payer).harnessRepayBorrowFresh(payer.address, borrowerAddress, repayAmount);
}

async function repayBorrow(vToken: VTokenHarness, borrower: SignerWithAddress, repayAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).repayBorrow(repayAmount);
}

async function repayBorrowBehalf(
  vToken: VTokenHarness,
  payer: SignerWithAddress,
  borrower: SignerWithAddress,
  repayAmount: BigNumberish,
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(payer).repayBorrowBehalf(borrower.address, repayAmount);
}

describe("VToken", function () {
  let contracts: VTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let vToken: VTokenHarness;
  let underlying: MockContract<ERC20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let _root: SignerWithAddress;
  let borrower: SignerWithAddress;
  let benefactor: SignerWithAddress;
  let trustee: SignerWithAddress;

  beforeEach(async () => {
    [_root, borrower, benefactor, trustee] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ comptroller, vToken, underlying, interestRateModel } = contracts);
  });

  describe("borrowFresh", () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("fails if comptroller tells it to", async () => {
      comptroller.preBorrowHook.reverts();
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      // await expect(
      await borrowFresh(vToken, borrower, borrowAmount);
      // ).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWithCustomError(
        vToken,
        "BorrowFreshnessCheck",
      );
    });

    it("continues if fresh", async () => {
      // await expect(
      await vToken.accrueInterest();
      // ).toSucceed();
      // await expect(
      await borrowFresh(vToken, borrower, borrowAmount);
      // ).toSucceed();
    });

    it("fails if error if protocol has less than borrowAmount of underlying = cash - reserves ", async () => {
      await vToken.harnessSetTotalReserves(convertToUnit("1", 18));
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWithCustomError(
        vToken,
        "BorrowCashNotAvailable",
      );
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(vToken, borrower, parseUnits("0", 18), parseUnits("3", 18), 5);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(vToken, borrower, "1", "1", constants.MaxUint256);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await vToken.harnessSetTotalBorrows(constants.MaxUint256);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("reverts if transfer out fails", async () => {
      await vToken.harnessSetFailTransferToAddress(borrower.address, true);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWith("HARNESS_TOKEN_TRANSFER_OUT_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await underlying.balanceOf(vToken.address);
      const beforeProtocolBorrows = await vToken.totalBorrows();
      const beforeAccountCash = await underlying.balanceOf(borrower.address);
      const result = await borrowFresh(vToken, borrower, borrowAmount);
      // expect(result).toSucceed();
      expect(await underlying.balanceOf(borrower.address)).to.equal(beforeAccountCash.add(borrowAmount));
      expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.sub(borrowAmount));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
      await expect(result).to.emit(underlying, "Transfer").withArgs(vToken.address, borrower.address, borrowAmount);

      await expect(result)
        .to.emit(vToken, "Borrow")
        .withArgs(borrower.address, borrowAmount, borrowAmount, beforeProtocolBorrows.add(borrowAmount).toString());
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await vToken.totalBorrows();
      await pretendBorrow(vToken, borrower, parseUnits("0", 18), parseUnits("3", 18), 0);
      await borrowFresh(vToken, borrower, borrowAmount);
      const borrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      expect(borrowSnap.principal).to.equal(borrowAmount);
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("3", 18));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
    });
  });

  describe("borrow", () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(borrow(vToken, borrower, borrowAmount)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      await expect(borrow(vToken, borrower, borrowAmount + 1n)).to.be.revertedWithCustomError(
        vToken,
        "BorrowCashNotAvailable",
      );
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await underlying.balanceOf(borrower.address);
      await vToken.harnessFastForward(5);
      // expect(
      await borrow(vToken, borrower, borrowAmount);
      expect(await vToken.callStatic.totalBorrowsCurrent()).to.be.equal(borrowAmount);
      // ).toSucceed();
      expect(await underlying.balanceOf(borrower.address)).to.equal(beforeAccountCash.add(borrowAmount));
    });
  });

  describe("borrowBehalf", () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("reverts when caller is not approved by borrower to borrow on his behalf", async () => {
      await vToken.harnessFastForward(5);
      await expect(vToken.connect(trustee).borrowBehalf(borrower.address, borrowAmount)).to.be.revertedWithCustomError(
        vToken,
        "DelegateNotApproved",
      );
    });

    it("returns success from borrowBehalf and transfers the correct amount", async () => {
      const beforeAccountCash = await underlying.balanceOf(trustee.address);
      comptroller.approvedDelegates.returns(true);
      await vToken.connect(trustee).borrowBehalf(borrower.address, borrowAmount);

      expect(await vToken.callStatic.totalBorrowsCurrent()).to.be.equal(borrowAmount);
      expect(await underlying.balanceOf(trustee.address)).to.equal(beforeAccountCash.add(borrowAmount));
    });
  });

  describe("repayBorrowFresh", () => {
    [true, false].forEach(benefactorIsPayer => {
      let payer: SignerWithAddress;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          await preRepay(contracts, payer, borrower, repayAmount);
        });

        it("fails if repay is not allowed", async () => {
          comptroller.preRepayHook.reverts();
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.reverted;
        });

        it("fails if block number ≠ current block number", async () => {
          await vToken.harnessFastForward(5);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWithCustomError(
            vToken,
            "RepayBorrowFreshnessCheck",
          );
        });

        it("fails if insufficient approval", async () => {
          await preApprove(underlying, vToken, payer, 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "Insufficient allowance",
          );
        });

        it("fails if insufficient balance", async () => {
          await underlying.harnessSetBalance(payer.address, 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "Insufficient balance",
          );
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await vToken.harnessSetTotalBorrows(1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWithPanic(
            PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
          );
        });

        it("reverts if doTransferIn fails", async () => {
          await underlying.harnessSetFailTransferFromAddress(payer.address, true);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "SafeERC20: ERC20 operation did not succeed",
          );
        });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await underlying.balanceOf(vToken.address);
          const result = await repayBorrowFresh(vToken, payer, borrower, repayAmount);
          expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.add(repayAmount));
          await expect(result).to.emit(underlying, "Transfer").withArgs(payer.address, vToken.address, repayAmount);
          await expect(result)
            .to.emit(vToken, "RepayBorrow")
            .withArgs(payer.address, borrower.address, repayAmount, "0", "0");
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await vToken.totalBorrows();
          const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
          // expect(
          await repayBorrowFresh(vToken, payer, borrower, repayAmount);
          // ).toSucceed();
          const afterAccountBorrows = await vToken.harnessAccountBorrows(borrower.address);
          expect(afterAccountBorrows.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
          expect(afterAccountBorrows.interestIndex).to.equal(convertToUnit("1", 18));
          expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.sub(repayAmount));
        });
      });
    });
  });

  describe("repayBorrow", () => {
    beforeEach(async () => {
      await preRepay(contracts, borrower, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(borrower.address, 1);
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.revertedWith("Insufficient balance");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      // expect(
      await repayBorrow(vToken, borrower, repayAmount);
      // ).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await vToken.harnessFastForward(5);
      // expect(
      await repayBorrow(vToken, borrower, constants.MaxUint256);
      // ).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      expect(afterAccountBorrowSnap.principal).to.equal(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await underlying.harnessSetBalance(borrower.address, 3);
      await vToken.harnessFastForward(5);
      await expect(repayBorrow(vToken, borrower, constants.MaxUint256)).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("repayBorrowBehalf", () => {
    let payer: SignerWithAddress;

    beforeEach(async () => {
      payer = benefactor;
      await preRepay(contracts, payer, borrower, repayAmount);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(payer.address, 1);
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.revertedWith("Insufficient balance");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      // expect(
      await repayBorrowBehalf(vToken, payer, borrower, repayAmount);
      // ).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrower.address);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });
  });
});

import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  Comptroller,
  ERC20Harness,
  InterestRateModel,
  VTokenHarness,
  VTokenHarness__factory,
} from "../../../typechain";
import { Error } from "../util/Errors";
import {
  adjustBalances,
  fakeComptroller,
  fakeInterestRateModel,
  getBalances,
  makeVToken,
  mockUnderlying,
  preApprove,
  pretendBorrow,
} from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = parseUnits("10", 18).toBigInt();
const seizeTokens = parseUnits("40", 18).toBigInt(); // forced, repayAmount * 4
const exchangeRate = parseUnits("0.2", 18).toBigInt();

type LiquidateTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  borrowedUnderlying: MockContract<ERC20Harness>;
  borrowedRateModel: FakeContract<InterestRateModel>;
  borrowedVToken: VTokenHarness;
  collateralUnderlying: MockContract<ERC20Harness>;
  collateralRateModel: FakeContract<InterestRateModel>;
  collateralVToken: VTokenHarness;
};

async function liquidateTestFixture(): Promise<LiquidateTestFixture> {
  const comptroller = await fakeComptroller();
  comptroller.liquidationIncentiveMantissa.returns(parseUnits("1.1", 18));
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);
  const [admin, liquidator, borrower] = await ethers.getSigners();
  const borrowedRateModel = await fakeInterestRateModel();
  const borrowedUnderlying = await mockUnderlying("BAT", "BAT");
  const borrowedVToken = await makeVToken<VTokenHarness__factory>(
    {
      underlying: borrowedUnderlying,
      interestRateModel: borrowedRateModel,
      comptroller,
      accessControlManager,
      admin,
    },
    { kind: "VTokenHarness" },
  );
  const collateralRateModel = await fakeInterestRateModel();
  const collateralUnderlying = await mockUnderlying("ZRX", "ZRX");
  const collateralVToken = await makeVToken<VTokenHarness__factory>(
    {
      underlying: collateralUnderlying,
      interestRateModel: collateralRateModel,
      comptroller,
      accessControlManager,
      admin,
    },
    { kind: "VTokenHarness" },
  );
  await collateralVToken.harnessSetExchangeRate(exchangeRate);

  // setup for success in liquidating
  await collateralVToken.harnessSetTotalSupply(parseUnits("10", 18));
  await collateralVToken.harnessSetBalance(liquidator.address, 0);
  await collateralVToken.harnessSetBalance(borrower.address, seizeTokens);
  await pretendBorrow(collateralVToken, borrower, parseUnits("0", 18), parseUnits("1", 18), 0);
  await pretendBorrow(borrowedVToken, borrower, parseUnits("1", 18), parseUnits("1", 18), repayAmount);
  await preApprove(borrowedUnderlying, borrowedVToken, liquidator, repayAmount, { faucet: true });

  return {
    accessControlManager,
    comptroller,
    borrowedUnderlying,
    borrowedRateModel,
    borrowedVToken,
    collateralUnderlying,
    collateralRateModel,
    collateralVToken,
  };
}

function configure({
  comptroller,
  accessControlManager,
  borrowedUnderlying,
  collateralRateModel,
  borrowedRateModel,
}: LiquidateTestFixture) {
  accessControlManager.isAllowedToCall.returns(true);

  comptroller.preLiquidateHook.reset();
  comptroller.preRepayHook.reset();
  comptroller.preSeizeHook.reset();

  comptroller.liquidateCalculateSeizeTokens.reset();
  comptroller.liquidateCalculateSeizeTokens.returns([Error.NO_ERROR, seizeTokens]);

  borrowedUnderlying.transferFrom.reset();

  for (const model of [borrowedRateModel, collateralRateModel]) {
    model.getBorrowRate.reset();
    model.getBorrowRate.returns(0);
  }
}

async function liquidateFresh(
  vToken: VTokenHarness,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  repayAmount: BigNumberish,
  vTokenCollateral: VTokenHarness,
  skipLiquidityCheck: boolean = false,
) {
  return vToken.harnessLiquidateBorrowFresh(
    liquidator.address,
    borrower.address,
    repayAmount,
    vTokenCollateral.address,
    skipLiquidityCheck,
  );
}

async function liquidate(
  vToken: VTokenHarness,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  repayAmount: BigNumberish,
  vTokenCollateral: VTokenHarness,
) {
  // make sure to have a block delta so we accrue interest

  await vToken.harnessFastForward(1);

  await vTokenCollateral.harnessFastForward(1);

  return vToken.connect(liquidator).liquidateBorrow(borrower.address, repayAmount, vTokenCollateral.address);
}

async function seize(
  vToken: VTokenHarness,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  seizeAmount: BigNumberish,
) {
  return vToken.seize(liquidator.address, borrower.address, seizeAmount);
}

describe("VToken", function () {
  let liquidator: SignerWithAddress;
  let borrower: SignerWithAddress;
  let comptroller: FakeContract<Comptroller>;
  let borrowedUnderlying: MockContract<ERC20Harness>;
  let borrowedRateModel: FakeContract<InterestRateModel>;
  let borrowedVToken: VTokenHarness;
  let collateralRateModel: FakeContract<InterestRateModel>;
  let collateralVToken: VTokenHarness;

  const protocolSeizeShareMantissa = parseUnits("0.05", 18); // 5%

  const liquidationIncentive = parseUnits("1.1", 18);
  const numerator = BigNumber.from(seizeTokens).mul(protocolSeizeShareMantissa);
  const protocolShareTokens = numerator
    .mul(parseUnits("1", 18))
    .div(liquidationIncentive)
    .div(parseUnits("1", 18))
    .toBigInt();
  const liquidatorShareTokens = BigNumber.from(seizeTokens).sub(protocolShareTokens).toString();
  const addReservesAmount = BigNumber.from(protocolShareTokens).mul(exchangeRate).div(parseUnits("1", 18)).toBigInt();

  beforeEach(async () => {
    [, liquidator, borrower] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateTestFixture);
    configure(contracts);
    ({ comptroller, borrowedUnderlying, borrowedRateModel, borrowedVToken, collateralRateModel, collateralVToken } =
      contracts);
  });

  describe("liquidateBorrowFresh", () => {
    it("fails if comptroller tells it to", async () => {
      comptroller.preLiquidateHook.reverts();
      await expect(liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      await liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken);
    });

    it("fails if market not fresh", async () => {
      await borrowedVToken.harnessFastForward(5);
      await expect(
        liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken),
      ).to.be.revertedWithCustomError(borrowedVToken, "LiquidateFreshnessCheck");
    });

    it("fails if collateral market not fresh", async () => {
      await borrowedVToken.harnessFastForward(5);
      await collateralVToken.harnessFastForward(5);
      await borrowedVToken.accrueInterest();
      await expect(
        liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken),
      ).to.be.revertedWithCustomError(borrowedVToken, "LiquidateCollateralFreshnessCheck");
    });

    it("fails if borrower is equal to liquidator", async () => {
      await expect(
        liquidateFresh(borrowedVToken, borrower, borrower, repayAmount, collateralVToken),
      ).to.be.revertedWithCustomError(borrowedVToken, "LiquidateLiquidatorIsBorrower");
    });

    it("fails if repayAmount = 0", async () => {
      await expect(
        liquidateFresh(borrowedVToken, liquidator, borrower, 0, collateralVToken),
      ).to.be.revertedWithCustomError(borrowedVToken, "LiquidateCloseAmountIsZero");
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const liquidatorAddress = liquidator.address;
      const borrowerAddress = borrower.address;
      const beforeBalances = await getBalances(
        [borrowedVToken, collateralVToken],
        [liquidatorAddress, borrowerAddress],
      );
      comptroller.liquidateCalculateSeizeTokens.reverts("Oups");

      await expect(liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted; // With('LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalances([borrowedVToken, collateralVToken], [liquidatorAddress, borrowerAddress]);
      expect(afterBalances).to.deep.equal(beforeBalances);
    });

    it("fails if repay fails", async () => {
      comptroller.preRepayHook.reverts();
      await expect(liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted;
    });

    it("reverts if seize fails", async () => {
      comptroller.preSeizeHook.reverts();
      await expect(liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted;
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const beforeBalances = await getBalances(
        [borrowedVToken, collateralVToken],
        [liquidator.address, borrower.address],
      );

      const result = await liquidateFresh(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken);
      const afterBalances = await getBalances(
        [borrowedVToken, collateralVToken],
        [liquidator.address, borrower.address],
      );

      await expect(result)
        .to.emit(borrowedVToken, "LiquidateBorrow")
        .withArgs(liquidator.address, borrower.address, repayAmount, collateralVToken.address, seizeTokens);

      await expect(result)
        .to.emit(borrowedUnderlying, "Transfer")
        .withArgs(liquidator.address, borrowedVToken.address, repayAmount);

      await expect(result)
        .to.emit(collateralVToken, "Transfer")
        .withArgs(borrower.address, liquidator.address, liquidatorShareTokens);

      await expect(result)
        .to.emit(collateralVToken, "Transfer")
        .withArgs(borrower.address, collateralVToken.address, protocolShareTokens.toString());

      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [borrowedVToken, "cash", repayAmount],
          [borrowedVToken, "borrows", -repayAmount],
          [borrowedVToken, liquidator.address, "cash", -repayAmount],
          [collateralVToken, liquidator.address, "tokens", liquidatorShareTokens],
          [borrowedVToken, borrower.address, "borrows", -repayAmount],
          [collateralVToken, borrower.address, "tokens", -seizeTokens],
          [collateralVToken, collateralVToken.address, "reserves", addReservesAmount],
          [collateralVToken, collateralVToken.address, "tokens", -protocolShareTokens],
        ]),
      );
    });
  });

  describe("liquidateBorrow", () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      borrowedRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      collateralRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
      await expect(liquidate(borrowedVToken, liquidator, borrower, 0, collateralVToken)).to.be.revertedWithCustomError(
        borrowedVToken,
        "LiquidateCloseAmountIsZero",
      );
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalances(
        [borrowedVToken, collateralVToken],
        [liquidator.address, borrower.address],
      );
      const result = await liquidate(borrowedVToken, liquidator, borrower, repayAmount, collateralVToken);
      const receipt = await result.wait();
      const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed).toBigInt();
      const afterBalances = await getBalances(
        [borrowedVToken, collateralVToken],
        [liquidator.address, borrower.address],
      );
      // expect(result).toSucceed();
      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [borrowedVToken, "cash", repayAmount],
          [borrowedVToken, "borrows", -repayAmount],
          [borrowedVToken, liquidator.address, "eth", -gasCost],
          [borrowedVToken, liquidator.address, "cash", -repayAmount],
          [collateralVToken, liquidator.address, "eth", -gasCost],
          [collateralVToken, liquidator.address, "tokens", liquidatorShareTokens],
          [collateralVToken, collateralVToken.address, "reserves", addReservesAmount],
          [borrowedVToken, borrower.address, "borrows", -repayAmount],
          [collateralVToken, borrower.address, "tokens", -seizeTokens],
          [collateralVToken, collateralVToken.address, "tokens", -protocolShareTokens], // total supply decreases
        ]),
      );
    });
  });

  describe("seize", () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      comptroller.preSeizeHook.reverts();
      await expect(collateralVToken.seize(liquidator.address, borrower.address, seizeTokens)).to.be.reverted;
    });

    it("fails if vTokenBalances[borrower] < amount", async () => {
      await collateralVToken.harnessSetBalance(borrower.address, 1);
      await expect(seize(collateralVToken, liquidator, borrower, seizeTokens)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("fails if vTokenBalances[liquidator] overflows", async () => {
      await collateralVToken.harnessSetBalance(liquidator.address, constants.MaxUint256);
      await expect(seize(collateralVToken, liquidator, borrower, seizeTokens)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("succeeds, updates balances, adds to reserves, and emits Transfer and ReservesAdded events", async () => {
      const beforeBalances = await getBalances([collateralVToken], [liquidator.address, borrower.address]);
      const result = await seize(collateralVToken, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalances([collateralVToken], [liquidator.address, borrower.address]);

      await expect(result)
        .to.emit(collateralVToken, "Transfer")
        .withArgs(borrower.address, liquidator.address, liquidatorShareTokens);

      await expect(result)
        .to.emit(collateralVToken, "Transfer")
        .withArgs(borrower.address, collateralVToken.address, protocolShareTokens);

      await expect(result)
        .to.emit(collateralVToken, "ReservesAdded")
        .withArgs(collateralVToken.address, addReservesAmount, addReservesAmount);

      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [collateralVToken, liquidator.address, "tokens", liquidatorShareTokens],
          [collateralVToken, borrower.address, "tokens", -seizeTokens],
          [collateralVToken, collateralVToken.address, "reserves", addReservesAmount],
          [collateralVToken, collateralVToken.address, "tokens", -protocolShareTokens], // total supply decreases
        ]),
      );
    });
  });
});

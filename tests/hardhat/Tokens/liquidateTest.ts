import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { AccessControlManager, Comptroller, Shortfall, VTokenHarness } from "../../../typechain";
import { Error } from "../util/Errors";
import {
  VTokenContracts,
  adjustBalances,
  getBalances,
  makeVToken,
  preApprove,
  pretendBorrow,
} from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = convertToUnit("10", 18);
const seizeTokens = convertToUnit("40", 18); // forced, repayAmount * 4
const exchangeRate = convertToUnit("0.2", 18);

type LiquidateTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  borrowed: VTokenContracts;
  collateral: VTokenContracts;
};

async function liquidateTestFixture(): Promise<LiquidateTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);
  const shortfall = await smock.fake<Shortfall>("Shortfall");
  const [admin, liquidator, borrower] = await ethers.getSigners();
  const borrowed = await makeVToken({ name: "BAT", comptroller, accessControlManager, admin, shortfall });
  const collateral = await makeVToken({ name: "ZRX", comptroller, accessControlManager, admin, shortfall });
  await collateral.vToken.harnessSetExchangeRate(exchangeRate);

  // setup for success in liquidating
  await collateral.vToken.harnessSetTotalSupply(convertToUnit("10", 18));
  await collateral.vToken.harnessSetBalance(await liquidator.getAddress(), 0);
  await collateral.vToken.harnessSetBalance(await borrower.getAddress(), seizeTokens);
  await pretendBorrow(collateral.vToken, borrower, 0, 1, 0);
  await pretendBorrow(borrowed.vToken, borrower, 1, 1, repayAmount);
  await preApprove(borrowed.underlying, borrowed.vToken, liquidator, repayAmount, { faucet: true });

  return { accessControlManager, comptroller, borrowed, collateral };
}

function configure({ comptroller, accessControlManager, collateral, borrowed }: LiquidateTestFixture) {
  accessControlManager.isAllowedToCall.returns(true);

  comptroller.preLiquidateHook.reset();
  comptroller.preRepayHook.reset();
  comptroller.preSeizeHook.reset();

  comptroller.liquidateCalculateSeizeTokens.reset();
  comptroller.liquidateCalculateSeizeTokens.returns([Error.NO_ERROR, seizeTokens]);

  borrowed.underlying.transferFrom.reset();

  for (const model of [borrowed.interestRateModel, collateral.interestRateModel]) {
    model.getBorrowRate.reset();
    model.getBorrowRate.returns(0);
    model.getSupplyRate.reset();
    model.getSupplyRate.returns(0);
  }
}

async function liquidateFresh(
  vToken: MockContract<VTokenHarness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  vTokenCollateral: MockContract<VTokenHarness>,
  skipLiquidityCheck: boolean = false,
) {
  return vToken.harnessLiquidateBorrowFresh(
    await liquidator.getAddress(),
    await borrower.getAddress(),
    repayAmount,
    vTokenCollateral.address,
    skipLiquidityCheck,
  );
}

async function liquidate(
  vToken: MockContract<VTokenHarness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  vTokenCollateral: MockContract<VTokenHarness>,
) {
  // make sure to have a block delta so we accrue interest

  await vToken.harnessFastForward(1);

  await vTokenCollateral.harnessFastForward(1);

  return vToken.connect(liquidator).liquidateBorrow(await borrower.getAddress(), repayAmount, vTokenCollateral.address);
}

async function seize(
  vToken: MockContract<VTokenHarness>,
  liquidator: Signer,
  borrower: Signer,
  seizeAmount: BigNumberish,
) {
  return vToken.seize(await liquidator.getAddress(), await borrower.getAddress(), seizeAmount);
}

describe("VToken", function () {
  let _root: Signer;
  let liquidator: Signer;
  let borrower: Signer;
  let comptroller: FakeContract<Comptroller>;
  let borrowed: VTokenContracts;
  let collateral: VTokenContracts;

  const protocolSeizeShareMantissa = convertToUnit("0.05", 18); // 5%

  const protocolShareTokens = new BigNumber(seizeTokens)
    .multipliedBy(protocolSeizeShareMantissa)
    .dividedBy(convertToUnit("1", 18))
    .toString();
  const liquidatorShareTokens = new BigNumber(seizeTokens).minus(protocolShareTokens).toString();
  const addReservesAmount = new BigNumber(protocolShareTokens)
    .multipliedBy(exchangeRate)
    .dividedBy(convertToUnit("1", 18))
    .toString();

  beforeEach(async () => {
    [_root, liquidator, borrower] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateTestFixture);
    configure(contracts);
    ({ comptroller, borrowed, collateral } = contracts);
  });

  describe("liquidateBorrowFresh", () => {
    it("fails if comptroller tells it to", async () => {
      comptroller.preLiquidateHook.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      await liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
    });

    it("fails if market not fresh", async () => {
      await borrowed.vToken.harnessFastForward(5);
      await expect(
        liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken),
      ).to.be.revertedWithCustomError(borrowed.vToken, "LiquidateFreshnessCheck");
    });

    it("fails if collateral market not fresh", async () => {
      await borrowed.vToken.harnessFastForward(5);
      await collateral.vToken.harnessFastForward(5);
      await borrowed.vToken.accrueInterest();
      await expect(
        liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken),
      ).to.be.revertedWithCustomError(borrowed.vToken, "LiquidateCollateralFreshnessCheck");
    });

    it("fails if borrower is equal to liquidator", async () => {
      await expect(
        liquidateFresh(borrowed.vToken, borrower, borrower, repayAmount, collateral.vToken),
      ).to.be.revertedWithCustomError(borrowed.vToken, "LiquidateLiquidatorIsBorrower");
    });

    it("fails if repayAmount = 0", async () => {
      await expect(
        liquidateFresh(borrowed.vToken, liquidator, borrower, 0, collateral.vToken),
      ).to.be.revertedWithCustomError(borrowed.vToken, "LiquidateCloseAmountIsZero");
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();
      const beforeBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      comptroller.liquidateCalculateSeizeTokens.reverts("Oups");

      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted; // With('LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      expect(afterBalances).to.deep.equal(beforeBalances);
    });

    it("fails if repay fails", async () => {
      comptroller.preRepayHook.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("reverts if seize fails", async () => {
      comptroller.preSeizeHook.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();

      const beforeBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );

      const result = await liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
      const afterBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );

      await expect(result)
        .to.emit(borrowed.vToken, "LiquidateBorrow")
        .withArgs(liquidatorAddress, borrowerAddress, repayAmount, collateral.vToken.address, seizeTokens);

      await expect(result)
        .to.emit(borrowed.underlying, "Transfer")
        .withArgs(liquidatorAddress, borrowed.vToken.address, repayAmount);

      await expect(result)
        .to.emit(collateral.vToken, "Transfer")
        .withArgs(borrowerAddress, liquidatorAddress, liquidatorShareTokens);

      await expect(result)
        .to.emit(collateral.vToken, "Transfer")
        .withArgs(borrowerAddress, collateral.vToken.address, protocolShareTokens);

      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [borrowed.vToken, "cash", repayAmount],
          [borrowed.vToken, "borrows", -repayAmount],
          [borrowed.vToken, liquidatorAddress, "cash", -repayAmount],
          [collateral.vToken, liquidatorAddress, "tokens", liquidatorShareTokens],
          [borrowed.vToken, borrowerAddress, "borrows", -repayAmount],
          [collateral.vToken, borrowerAddress, "tokens", -seizeTokens],
          [collateral.vToken, collateral.vToken.address, "reserves", addReservesAmount],
          [collateral.vToken, collateral.vToken.address, "tokens", -protocolShareTokens],
        ]),
      );
    });
  });

  describe("liquidateBorrow", () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      borrowed.interestRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      collateral.interestRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be.reverted; // With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
      await expect(
        liquidate(borrowed.vToken, liquidator, borrower, 0, collateral.vToken),
      ).to.be.revertedWithCustomError(borrowed.vToken, "LiquidateCloseAmountIsZero");
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();
      const beforeBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      const result = await liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
      const receipt = await result.wait();
      const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed).toString();
      const afterBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      // expect(result).toSucceed();
      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [borrowed.vToken, "cash", repayAmount],
          [borrowed.vToken, "borrows", -repayAmount],
          [borrowed.vToken, liquidatorAddress, "eth", -gasCost],
          [borrowed.vToken, liquidatorAddress, "cash", -repayAmount],
          [collateral.vToken, liquidatorAddress, "eth", -gasCost],
          [collateral.vToken, liquidatorAddress, "tokens", liquidatorShareTokens],
          [collateral.vToken, collateral.vToken.address, "reserves", addReservesAmount],
          [borrowed.vToken, borrowerAddress, "borrows", -repayAmount],
          [collateral.vToken, borrowerAddress, "tokens", -seizeTokens],
          [collateral.vToken, collateral.vToken.address, "tokens", -protocolShareTokens], // total supply decreases
        ]),
      );
    });
  });

  describe("seize", () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      comptroller.preSeizeHook.reverts();
      await expect(seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.reverted;
    });

    it("fails if vTokenBalances[borrower] < amount", async () => {
      await collateral.vToken.harnessSetBalance(await borrower.getAddress(), 1);
      await expect(seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("fails if vTokenBalances[liquidator] overflows", async () => {
      await collateral.vToken.harnessSetBalance(await liquidator.getAddress(), constants.MaxUint256);
      await expect(seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.revertedWithPanic(
        PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
      );
    });

    it("succeeds, updates balances, adds to reserves, and emits Transfer and ReservesAdded events", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();

      const beforeBalances = await getBalances([collateral.vToken], [liquidatorAddress, borrowerAddress]);
      const result = await seize(collateral.vToken, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalances([collateral.vToken], [liquidatorAddress, borrowerAddress]);

      await expect(result)
        .to.emit(collateral.vToken, "Transfer")
        .withArgs(borrowerAddress, liquidatorAddress, liquidatorShareTokens);

      await expect(result)
        .to.emit(collateral.vToken, "Transfer")
        .withArgs(borrowerAddress, collateral.vToken.address, protocolShareTokens);

      await expect(result)
        .to.emit(collateral.vToken, "ReservesAdded")
        .withArgs(collateral.vToken.address, addReservesAmount, addReservesAmount);

      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [collateral.vToken, liquidatorAddress, "tokens", liquidatorShareTokens],
          [collateral.vToken, borrowerAddress, "tokens", -seizeTokens],
          [collateral.vToken, collateral.vToken.address, "reserves", addReservesAmount],
          [collateral.vToken, collateral.vToken.address, "tokens", -protocolShareTokens], // total supply decreases
        ]),
      );
    });
  });
});

/* describe('Comptroller', () => {
  it('liquidateBorrowAllowed allows deprecated markets to be liquidated', async () => {
    let [root, liquidator, borrower] = saddle.accounts;
    let collatAmount = 10;
    let borrowAmount = 2;
    const vTokenCollat = await makeVToken({supportMarket: true, underlyingPrice: 1, collateralFactor: .5});
    const vTokenBorrow = await makeVToken({supportMarket: true, underlyingPrice: 1, comptroller: vTokenCollat.comptroller});
    const comptroller = vTokenCollat.comptroller;

    // borrow some tokens
    await send(vTokenCollat.underlying, 'harnessSetBalance', [borrower, collatAmount]);
    await send(vTokenCollat.underlying, 'approve', [vTokenCollat._address, collatAmount], {from: borrower});
    await send(vTokenBorrow.underlying, 'harnessSetBalance', [vTokenBorrow._address, collatAmount]);
    await send(vTokenBorrow, 'harnessSetTotalSupply', [collatAmount * 10]);
    await send(vTokenBorrow, 'harnessSetExchangeRate', [etherExp(1)]);
    expect(await enterMarkets([vTokenCollat], borrower)).toSucceed();
    expect(await send(vTokenCollat, 'mint', [collatAmount], {from: borrower})).toSucceed();
    expect(await send(vTokenBorrow, 'borrow', [borrowAmount], {from: borrower})).toSucceed();

    // show the account is healthy
    expect(await call(comptroller, 'isDeprecated', [vTokenBorrow._address])).toEqual(false);
    expect(await call(comptroller, 'liquidateBorrowAllowed', [vTokenBorrow._address, vTokenCollat._address, liquidator, borrower, borrowAmount])).toHaveTrollError('INSUFFICIENT_SHORTFALL');

    // show deprecating a market works
    expect(await send(comptroller, '_setCollateralFactor', [vTokenBorrow._address, 0])).toSucceed();
    expect(await send(comptroller, '_setBorrowPaused', [vTokenBorrow._address, true])).toSucceed();
    expect(await send(vTokenBorrow, '_setReserveFactor', [etherMantissa(1)])).toSucceed();

    expect(await call(comptroller, 'isDeprecated', [vTokenBorrow._address])).toEqual(true);

    // show deprecated markets can be liquidated even if healthy
    expect(await send(comptroller, 'liquidateBorrowAllowed', [vTokenBorrow._address, vTokenCollat._address, liquidator, borrower, borrowAmount])).toSucceed();

    // even if deprecated, cant over repay
    await expect(send(comptroller, 'liquidateBorrowAllowed', [vTokenBorrow._address, vTokenCollat._address, liquidator, borrower, borrowAmount * 2])).rejects.toRevert('revert Can not repay more than the total borrow');
  });
}) */

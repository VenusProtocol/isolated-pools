import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, CErc20Harness, ERC20Harness, CErc20Harness__factory, InterestRateModel,
  ERC20Harness__factory, AccessControlManager
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  getBalances, adjustBalances, preApprove, pretendBorrow,
  makeCToken, CTokenContracts
} from "../util/TokenTestHelpers";


const repayAmount = convertToUnit("10", 18);
const seizeTokens = convertToUnit("40", 18); // forced, repayAmount * 4
const exchangeRate = convertToUnit("0.2", 18);

type LiquidateTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  borrowed: CTokenContracts;
  collateral: CTokenContracts;
};

async function liquidateTestFixture(): Promise<LiquidateTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);

  const [admin, liquidator, borrower,] = await ethers.getSigners();
  const borrowed =
    await makeCToken({ name: "BAT", comptroller, accessControlManager, admin});
  const collateral =
    await makeCToken({ name: "ZRX", comptroller, accessControlManager, admin});

  await collateral.cToken.harnessSetExchangeRate(exchangeRate);

  // setup for success in liquidating
  await collateral.cToken.harnessSetTotalSupply(convertToUnit("10", 18));
  await collateral.cToken.harnessSetBalance(await liquidator.getAddress(), 0);
  await collateral.cToken.harnessSetBalance(await borrower.getAddress(), seizeTokens);
  await pretendBorrow(collateral.cToken, borrower, 0, 1, 0);
  await pretendBorrow(borrowed.cToken, borrower, 1, 1, repayAmount);
  await preApprove(borrowed.underlying, borrowed.cToken, liquidator, repayAmount, { faucet: true });

  return { accessControlManager, comptroller, borrowed, collateral };
}

function configure({ comptroller, accessControlManager, collateral, borrowed }: LiquidateTestFixture) {
  accessControlManager.isAllowedToCall.returns(true);

  comptroller.liquidateBorrowAllowed.reset();
  comptroller.liquidateBorrowAllowed.returns(Error.NO_ERROR);
  comptroller.liquidateBorrowVerify.reset();

  comptroller.repayBorrowAllowed.reset();
  comptroller.repayBorrowAllowed.returns(Error.NO_ERROR);
  comptroller.repayBorrowVerify.reset();

  comptroller.seizeAllowed.reset();
  comptroller.seizeAllowed.returns(Error.NO_ERROR);
  comptroller.seizeVerify.reset();

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
  cToken: MockContract<CErc20Harness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  cTokenCollateral: MockContract<CErc20Harness>
) {
  return cToken.harnessLiquidateBorrowFresh(
    await liquidator.getAddress(),
    await borrower.getAddress(),
    repayAmount,
    cTokenCollateral.address
  );
}

async function liquidate(
  cToken: MockContract<CErc20Harness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  cTokenCollateral: MockContract<CErc20Harness>
) {
  // make sure to have a block delta so we accrue interest
  await cToken.harnessFastForward(1);
  await cTokenCollateral.harnessFastForward(1);
  return cToken.connect(liquidator).liquidateBorrow(
    await borrower.getAddress(),
    repayAmount,
    cTokenCollateral.address
  );
}

async function seize(
  cToken: MockContract<CErc20Harness>,
  liquidator: Signer,
  borrower: Signer,
  seizeAmount: BigNumberish
) {
  return cToken.seize(await liquidator.getAddress(), await borrower.getAddress(), seizeAmount);
}

describe('CToken', function () {
  let root: Signer;
  let liquidator: Signer;
  let borrower: Signer;
  let accounts: Signer[];
  let accessControlManager: FakeContract<AccessControlManager>;
  let comptroller: FakeContract<Comptroller>;
  let borrowed: CTokenContracts;
  let collateral: CTokenContracts;

  const protocolSeizeShareMantissa = convertToUnit("0.028", 18); // 2.8%

  const protocolShareTokens = new BigNumber(seizeTokens)
    .multipliedBy(protocolSeizeShareMantissa).dividedBy(convertToUnit("1", 18)).toString();
  const liquidatorShareTokens = new BigNumber(seizeTokens)
    .minus(protocolShareTokens).toString();
  const addReservesAmount = new BigNumber(protocolShareTokens)
    .multipliedBy(exchangeRate).dividedBy(convertToUnit("1", 18)).toString();

  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateTestFixture);
    configure(contracts);
    ({ accessControlManager, comptroller, borrowed, collateral } = contracts);
  });

  describe('liquidateBorrowFresh', () => {
    it("fails if comptroller tells it to", async () => {
      comptroller.liquidateBorrowAllowed.returns(11);
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateComptrollerRejection')
        .withArgs(11);
    });

    it("proceeds if comptroller tells it to", async () => {
      //expect(
      await liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken)
      //).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await borrowed.cToken.harnessFastForward(5);
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateFreshnessCheck');
    });

    it("fails if collateral market not fresh", async () => {
      await borrowed.cToken.harnessFastForward(5);
      await collateral.cToken.harnessFastForward(5);
      await borrowed.cToken.accrueInterest();
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateCollateralFreshnessCheck');
    });

    it("fails if borrower is equal to liquidator", async () => {
      await expect(liquidateFresh(borrowed.cToken, borrower, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateLiquidatorIsBorrower');
    });

    it("fails if repayAmount = 0", async () => {
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, 0, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateCloseAmountIsZero');
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();
      const beforeBalances =
        await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      //await send(cToken.comptroller, 'setFailCalculateSeizeTokens', [true]);
      comptroller.liquidateCalculateSeizeTokens.reverts("Oups");
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.reverted; //With('LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances =
        await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      expect(afterBalances).to.deep.equal(beforeBalances);
    });

    it("fails if repay fails", async () => {
      comptroller.repayBorrowAllowed.returns(11);
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'RepayBorrowComptrollerRejection')
        .withArgs(11);
    });

    it("reverts if seize fails", async () => {
      comptroller.seizeAllowed.returns(11);
      await expect(liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, 'LiquidateSeizeComptrollerRejection')
        .withArgs(11);
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();

      const beforeBalances = await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      const result = await liquidateFresh(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken);
      const afterBalances = await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      //expect(
      //  result
      //).toSucceed();
      expect(result)
        .to.emit(borrowed.cToken, "LiquidateBorrow")
        .withArgs(liquidatorAddress, borrowerAddress, repayAmount, collateral.cToken.address, seizeTokens);

      expect(result)
        .to.emit(borrowed.underlying, "Transfer")
        .withArgs(liquidatorAddress, borrowed.cToken.address, repayAmount);

      expect(result)
        .to.emit(collateral.cToken, "Transfer")
        .withArgs(borrowerAddress, liquidatorAddress, liquidatorShareTokens);

      expect(result)
        .to.emit(collateral.cToken, "Transfer")
        .withArgs(borrowerAddress, collateral.cToken.address, protocolShareTokens);

      expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
        [borrowed.cToken, 'cash', repayAmount],
        [borrowed.cToken, 'borrows', -repayAmount],
        [borrowed.cToken, liquidatorAddress, 'cash', -repayAmount],
        [collateral.cToken, liquidatorAddress, 'tokens', liquidatorShareTokens],
        [borrowed.cToken, borrowerAddress, 'borrows', -repayAmount],
        [collateral.cToken, borrowerAddress, 'tokens', -seizeTokens],
        [collateral.cToken, collateral.cToken.address, 'reserves', addReservesAmount],
        [collateral.cToken, collateral.cToken.address, 'tokens', -protocolShareTokens]
      ]));
    });
  });

  describe('liquidateBorrow', () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      borrowed.interestRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      collateral.interestRateModel.getBorrowRate.reverts("Oups");
      await expect(liquidate(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
      await expect(liquidate(borrowed.cToken, liquidator, borrower, 0, collateral.cToken))
        .to.be.revertedWithCustomError(borrowed.cToken, "LiquidateCloseAmountIsZero");
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();
      const beforeBalances = await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      const result = await liquidate(borrowed.cToken, liquidator, borrower, repayAmount, collateral.cToken);
      const receipt = await result.wait();
      const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed).toString();
      const afterBalances = await getBalances([borrowed.cToken, collateral.cToken], [liquidatorAddress, borrowerAddress]);
      //expect(result).toSucceed();
      expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
        [borrowed.cToken, 'cash', repayAmount],
        [borrowed.cToken, 'borrows', -repayAmount],
        [borrowed.cToken, liquidatorAddress, 'eth', -gasCost],
        [borrowed.cToken, liquidatorAddress, 'cash', -repayAmount],
        [collateral.cToken, liquidatorAddress, 'eth', -gasCost],
        [collateral.cToken, liquidatorAddress, 'tokens', liquidatorShareTokens],
        [collateral.cToken, collateral.cToken.address, 'reserves', addReservesAmount],
        [borrowed.cToken, borrowerAddress, 'borrows', -repayAmount],
        [collateral.cToken, borrowerAddress, 'tokens', -seizeTokens],
        [collateral.cToken, collateral.cToken.address, 'tokens', -protocolShareTokens], // total supply decreases
      ]));
    });
  });

  describe('seize', () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      comptroller.seizeAllowed.returns(11);
      await expect(seize(collateral.cToken, liquidator, borrower, seizeTokens))
        .to.be.revertedWithCustomError(collateral.cToken, "LiquidateSeizeComptrollerRejection")
        .withArgs(11);
    });

    it("fails if cTokenBalances[borrower] < amount", async () => {
      await collateral.cToken.harnessSetBalance(await borrower.getAddress(), 1);
      await expect(seize(collateral.cToken, liquidator, borrower, seizeTokens)).to.be.reverted;
    });

    it("fails if cTokenBalances[liquidator] overflows", async () => {
      await collateral.cToken.harnessSetBalance(await liquidator.getAddress(), constants.MaxUint256);
      await expect(seize(collateral.cToken, liquidator, borrower, seizeTokens)).to.be.reverted;
    });

    it("succeeds, updates balances, adds to reserves, and emits Transfer and ReservesAdded events", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();

      const beforeBalances = await getBalances([collateral.cToken], [liquidatorAddress, borrowerAddress]);
      const result = await seize(collateral.cToken, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalances([collateral.cToken], [liquidatorAddress, borrowerAddress]);
      //expect(result).toSucceed();
      expect(result)
        .to.emit(collateral.cToken, "Transfer")
        .withArgs(borrowerAddress, liquidatorAddress, liquidatorShareTokens);

      expect(result)
        .to.emit(collateral.cToken, "Transfer")
        .withArgs(borrowerAddress, collateral.cToken.address, protocolShareTokens);

      expect(result)
        .to.emit(collateral.cToken, "ReservesAdded")
        .withArgs(collateral.cToken.address, addReservesAmount, addReservesAmount);

      expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
        [collateral.cToken, liquidatorAddress, 'tokens', liquidatorShareTokens],
        [collateral.cToken, borrowerAddress, 'tokens', -seizeTokens],
        [collateral.cToken, collateral.cToken.address, 'reserves', addReservesAmount],
        [collateral.cToken, collateral.cToken.address, 'tokens', -protocolShareTokens], // total supply decreases
      ]));
    });
  });
});

/*describe('Comptroller', () => {
  it('liquidateBorrowAllowed allows deprecated markets to be liquidated', async () => {
    let [root, liquidator, borrower] = saddle.accounts;
    let collatAmount = 10;
    let borrowAmount = 2;
    const cTokenCollat = await makeCToken({supportMarket: true, underlyingPrice: 1, collateralFactor: .5});
    const cTokenBorrow = await makeCToken({supportMarket: true, underlyingPrice: 1, comptroller: cTokenCollat.comptroller});
    const comptroller = cTokenCollat.comptroller;

    // borrow some tokens
    await send(cTokenCollat.underlying, 'harnessSetBalance', [borrower, collatAmount]);
    await send(cTokenCollat.underlying, 'approve', [cTokenCollat._address, collatAmount], {from: borrower});
    await send(cTokenBorrow.underlying, 'harnessSetBalance', [cTokenBorrow._address, collatAmount]);
    await send(cTokenBorrow, 'harnessSetTotalSupply', [collatAmount * 10]);
    await send(cTokenBorrow, 'harnessSetExchangeRate', [etherExp(1)]);
    expect(await enterMarkets([cTokenCollat], borrower)).toSucceed();
    expect(await send(cTokenCollat, 'mint', [collatAmount], {from: borrower})).toSucceed();
    expect(await send(cTokenBorrow, 'borrow', [borrowAmount], {from: borrower})).toSucceed();

    // show the account is healthy
    expect(await call(comptroller, 'isDeprecated', [cTokenBorrow._address])).toEqual(false);
    expect(await call(comptroller, 'liquidateBorrowAllowed', [cTokenBorrow._address, cTokenCollat._address, liquidator, borrower, borrowAmount])).toHaveTrollError('INSUFFICIENT_SHORTFALL');

    // show deprecating a market works
    expect(await send(comptroller, '_setCollateralFactor', [cTokenBorrow._address, 0])).toSucceed();
    expect(await send(comptroller, '_setBorrowPaused', [cTokenBorrow._address, true])).toSucceed();
    expect(await send(cTokenBorrow, '_setReserveFactor', [etherMantissa(1)])).toSucceed();

    expect(await call(comptroller, 'isDeprecated', [cTokenBorrow._address])).toEqual(true);

    // show deprecated markets can be liquidated even if healthy
    expect(await send(comptroller, 'liquidateBorrowAllowed', [cTokenBorrow._address, cTokenCollat._address, liquidator, borrower, borrowAmount])).toSucceed();

    // even if deprecated, cant over repay
    await expect(send(comptroller, 'liquidateBorrowAllowed', [cTokenBorrow._address, cTokenCollat._address, liquidator, borrower, borrowAmount * 2])).rejects.toRevert('revert Can not repay more than the total borrow');
  });
})*/

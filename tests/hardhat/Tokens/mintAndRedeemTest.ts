import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { VBep20Harness, ERC20Harness, Comptroller, InterestRateModel, AccessControlManager } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  getBalances, adjustBalances, preApprove,
  vTokenTestFixture, VTokenTestFixture
} from "../util/TokenTestHelpers";


const exchangeRate = convertToUnit("50000", 18);
const mintAmount = convertToUnit("10000", 18);
const mintTokens = new BigNumber(mintAmount).multipliedBy(convertToUnit("1", 18)).dividedBy(exchangeRate).toString();
const redeemTokens = convertToUnit("1000", 18);
const redeemAmount = new BigNumber(redeemTokens).multipliedBy(exchangeRate).div(convertToUnit("1", 18)).toString();

async function preMint(
  contracts: VTokenTestFixture,
  minter: Signer,
  mintAmount: BigNumberish,
  exchangeRate: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  await preApprove(underlying, vToken, minter, mintAmount, { faucet: true });

  comptroller.mintAllowed.reset();
  comptroller.mintAllowed.returns(Error.NO_ERROR);
  comptroller.mintVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const minterAddress = await minter.getAddress();
  await underlying.harnessSetFailTransferFromAddress(minterAddress, false);
  await vToken.harnessSetBalance(minterAddress, 0);
  await vToken.harnessSetExchangeRate(exchangeRate);
}

async function mintFresh(
  vToken: MockContract<VBep20Harness>,
  minter: Signer,
  mintAmount: BigNumberish
) {
  return vToken.harnessMintFresh(await minter.getAddress(), mintAmount);
}

async function preSupply(
  vToken: MockContract<VBep20Harness>,
  account: Signer,
  tokens: BigNumberish,
  opts: { supply?: boolean } = { supply: true }
) {
  if (opts.supply || opts.supply === undefined) {
    //expect(
      await vToken.harnessSetTotalSupply(tokens)
    //).toSucceed();
  }
  return vToken.harnessSetBalance(await account.getAddress(), tokens);
}

async function preRedeem(
  contracts: VTokenTestFixture,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish,
  exchangeRate: BigNumberish
) {
  const { comptroller, vToken, interestRateModel, underlying } = contracts;
  await preSupply(vToken, redeemer, redeemTokens, { supply: true });

  comptroller.redeemAllowed.reset();
  comptroller.redeemAllowed.returns(Error.NO_ERROR);
  comptroller.redeemVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();
  await underlying.harnessSetBalance(vToken.address, redeemAmount);

  const redeemerAddress = await redeemer.getAddress();
  await underlying.harnessSetBalance(redeemerAddress, 0);
  await underlying.harnessSetFailTransferToAddress(redeemerAddress, false);
  await vToken.harnessSetExchangeRate(exchangeRate);
}

async function redeemFreshTokens(
  vToken: MockContract<VBep20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish
) {
  const redeemerAddress = await redeemer.getAddress();
  return vToken.harnessRedeemFresh(redeemerAddress, redeemTokens, 0);
}

async function redeemFreshAmount(
  vToken: MockContract<VBep20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish
) {
  const redeemerAddress = await redeemer.getAddress();
  return vToken.harnessRedeemFresh(redeemerAddress, 0, redeemAmount);
}

async function quickMint(
  underlying: MockContract<ERC20Harness>,
  vToken: MockContract<VBep20Harness>,
  minter: Signer,
  mintAmount: BigNumberish,
  opts: { approve?: boolean, exchangeRate?: BigNumberish, faucet?: boolean } = { approve: true, faucet: true }
) {
  // make sure to accrue interest
  await vToken.harnessFastForward(1);

  if (opts.approve || opts.approve === undefined) {
    //expect(
      await preApprove(underlying, vToken, minter, mintAmount, opts)
    //).toSucceed();
  }
  if (opts.exchangeRate !== undefined) {
    //expect(
      await vToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return vToken.connect(minter).mint(mintAmount);
}

async function quickRedeem(
  vToken: MockContract<VBep20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  opts: { supply?: boolean, exchangeRate?: BigNumberish } = { supply: true }
) {
  await vToken.harnessFastForward(1);

  if (opts.supply || opts.supply === undefined) {
    //expect(
      await preSupply(vToken, redeemer, redeemTokens, opts)
    //).toSucceed();
  }
  if (opts.exchangeRate !== undefined) {
    //expect(
      await vToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return vToken.connect(redeemer).redeem(redeemTokens);
}

async function quickRedeemUnderlying(
  vToken: MockContract<VBep20Harness>,
  redeemer: Signer,
  redeemAmount: BigNumberish,
  opts: { exchangeRate?: BigNumberish } = {}
) {
  await vToken.harnessFastForward(1);

  if (opts.exchangeRate !== undefined) {
    //expect(
      await vToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return vToken.connect(redeemer).redeemUnderlying(redeemAmount);
}

describe('VToken', function () {
  let root: Signer;
  let minter: Signer;
  let redeemer: Signer;
  let accounts: Signer[];

  let minterAddress: string;
  let redeemerAddress: string;

  let contracts: VTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let vToken: MockContract<VBep20Harness>;
  let underlying: MockContract<ERC20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ comptroller, vToken, underlying, interestRateModel} = contracts);
    minterAddress = await minter.getAddress();
    redeemerAddress = await redeemer.getAddress();
  });

  describe('mintFresh', () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      comptroller.mintAllowed.returns(11);
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWithCustomError(vToken, "MintComptrollerRejection")
        .withArgs(11);
    });

    it("proceeds if comptroller tells it to", async () => {
      //await expect(
        await mintFresh(vToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWithCustomError(vToken, "MintFreshnessCheck");
    });

    it("continues if fresh", async () => {
      //await expect(
        await vToken.accrueInterest()
      //).toSucceed();
      //expect(
        await mintFresh(vToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      //expect(
        await underlying.connect(minter).approve(vToken.address, 1)
      //).toSucceed();
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient allowance");
    });

    it("fails if insufficient balance", async() => {
      await underlying.harnessSetBalance(minterAddress, 1);
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("proceeds if sufficient approval and balance", async () =>{
      //expect(
        await mintFresh(vToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      //expect(
        await vToken.harnessSetExchangeRate(0)
      //).toSucceed();
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
    });

    it("fails if transferring in fails", async () => {
      await underlying.harnessSetFailTransferFromAddress(minterAddress, true);
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([vToken], [minterAddress]);
      const result = await mintFresh(vToken, minter, mintAmount);
      const afterBalances = await getBalances([vToken], [minterAddress]);
      //expect(result).toSucceed();
      expect(result)
        .to.emit(vToken, "Mint")
        .withArgs(minterAddress, mintAmount, mintTokens);

      expect(result)
        .to.emit(vToken, "Transfer")
        .withArgs(vToken.address, minterAddress, mintTokens);

      expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
        [vToken, minterAddress, 'cash', -mintAmount],
        [vToken, minterAddress, 'tokens', mintTokens],
        [vToken, 'cash', mintAmount],
        [vToken, 'tokens', mintTokens]
      ]));
    });
  });

  describe('mint', () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(quickMint(underlying, vToken, minter, mintAmount))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(minterAddress, 1);
      await expect(mintFresh(vToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      //expect(
        await quickMint(underlying, vToken, minter, mintAmount)
      //).toSucceed();
      expect(mintTokens).to.not.equal(0);
      expect(await vToken.balanceOf(await minter.getAddress())).to.equal(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(underlying, vToken, minter, mintAmount))
        .to.emit(vToken, "AccrueInterest")
        .withArgs("1000000000000000000", "0", "0", "0");
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach((redeemFresh) => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("fails if comptroller tells it to", async () =>{
        comptroller.redeemAllowed.returns(11);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(vToken, "RedeemComptrollerRejection")
          .withArgs(11);
      });

      it("fails if not fresh", async () => {
        await vToken.harnessFastForward(5);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(vToken, "RedeemFreshnessCheck");
      });

      it("continues if fresh", async () => {
        //await expect(
          await vToken.accrueInterest()
        //).toSucceed();
        //expect(
          await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)
        //).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async() => {
        await underlying.harnessSetBalance(vToken.address, 1);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(vToken, "RedeemTransferOutNotPossible");
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          //expect(
            await vToken.harnessSetExchangeRate(constants.MaxUint256)
          //).toSucceed();
          await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
            .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
        } else {
          //expect(
            await vToken.harnessSetExchangeRate(0)
          //).toSucceed();
          await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
            .to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
        }
      });

      it("fails if transferring out fails", async () => {
        await underlying.harnessSetFailTransferToAddress(redeemerAddress, true);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWith("TOKEN_TRANSFER_OUT_FAILED");
      });

      it("fails if total supply < redemption amount", async () => {
        await vToken.harnessExchangeRateDetails(0, 0, 0);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be
          .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
      });

      it("reverts if new account balance underflows", async () => {
        await vToken.harnessSetBalance(redeemerAddress, 0);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([vToken], [redeemerAddress]);
        const result = await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount);
        const afterBalances = await getBalances([vToken], [redeemerAddress]);
        //expect(result).toSucceed();
        expect(result)
          .to.emit(vToken, "Redeem")
          .withArgs(redeemAmount, redeemTokens);
        
        expect(result)
          .to.emit(vToken, "Transfer")
          .withArgs(redeemerAddress, vToken.address, redeemTokens);

        expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
          [vToken, redeemerAddress, 'cash', redeemAmount],
          [vToken, redeemerAddress, 'tokens', -redeemTokens],
          [vToken, 'cash', -redeemAmount],
          [vToken, 'tokens', -redeemTokens]
        ]));
      });
    });
  });

  describe('redeem', () => {
    beforeEach(async () => {
      await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(quickRedeem(vToken, redeemer, redeemTokens))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(vToken.address, 0);
      await expect(quickRedeem(vToken, redeemer, redeemTokens, {exchangeRate}))
        .to.be.revertedWithCustomError(vToken, "RedeemTransferOutNotPossible");
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      //expect(
        await underlying.harnessSetBalance(vToken.address, redeemAmount)
      //).toSucceed();
      //expect(
        await quickRedeem(vToken, redeemer, redeemTokens, {exchangeRate})
      //).toSucceed();
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemerAddress)).to.equal(redeemAmount);
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      //expect(
        await underlying.harnessSetBalance(vToken.address, redeemAmount)
      //).toSucceed();
      //expect(
        await quickRedeemUnderlying(vToken, redeemer, redeemAmount, {exchangeRate})
      //).toSucceed();
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemerAddress)).to.equal(redeemAmount);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(underlying, vToken, minter, mintAmount))
        .to.emit(vToken, "AccrueInterest")
        .withArgs("1000000000000000000", "500000000", "0", "0");
    });
  });
});

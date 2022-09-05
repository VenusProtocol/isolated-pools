import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { CErc20Harness, ERC20Harness, Comptroller, InterestRateModel, AccessControlManager } from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";
import {
  getBalances, adjustBalances, preApprove,
  cTokenTestFixture, CTokenTestFixture
} from "../util/TokenTestHelpers";


const exchangeRate = convertToUnit("50000", 18);
const mintAmount = convertToUnit("10000", 18);
const mintTokens = new BigNumber(mintAmount).multipliedBy(convertToUnit("1", 18)).dividedBy(exchangeRate).toString();
const redeemTokens = convertToUnit("1000", 18);
const redeemAmount = new BigNumber(redeemTokens).multipliedBy(exchangeRate).div(convertToUnit("1", 18)).toString();

async function preMint(
  contracts: CTokenTestFixture,
  minter: Signer,
  mintAmount: BigNumberish,
  exchangeRate: BigNumberish
) {
  const { comptroller, interestRateModel, underlying, cToken } = contracts;
  await preApprove(underlying, cToken, minter, mintAmount, { faucet: true });

  comptroller.mintAllowed.reset();
  comptroller.mintAllowed.returns(Error.NO_ERROR);
  comptroller.mintVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const minterAddress = await minter.getAddress();
  await underlying.harnessSetFailTransferFromAddress(minterAddress, false);
  await cToken.harnessSetBalance(minterAddress, 0);
  await cToken.harnessSetExchangeRate(exchangeRate);
}

async function mintFresh(
  cToken: MockContract<CErc20Harness>,
  minter: Signer,
  mintAmount: BigNumberish
) {
  return cToken.harnessMintFresh(await minter.getAddress(), mintAmount);
}

async function preSupply(
  cToken: MockContract<CErc20Harness>,
  account: Signer,
  tokens: BigNumberish,
  opts: { supply?: boolean } = { supply: true }
) {
  if (opts.supply || opts.supply === undefined) {
    //expect(
      await cToken.harnessSetTotalSupply(tokens)
    //).toSucceed();
  }
  return cToken.harnessSetBalance(await account.getAddress(), tokens);
}

async function preRedeem(
  contracts: CTokenTestFixture,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish,
  exchangeRate: BigNumberish
) {
  const { comptroller, cToken, interestRateModel, underlying } = contracts;
  await preSupply(cToken, redeemer, redeemTokens, { supply: true });

  comptroller.redeemAllowed.reset();
  comptroller.redeemAllowed.returns(Error.NO_ERROR);
  comptroller.redeemVerify.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();
  await underlying.harnessSetBalance(cToken.address, redeemAmount);

  const redeemerAddress = await redeemer.getAddress();
  await underlying.harnessSetBalance(redeemerAddress, 0);
  await underlying.harnessSetFailTransferToAddress(redeemerAddress, false);
  await cToken.harnessSetExchangeRate(exchangeRate);
}

async function redeemFreshTokens(
  cToken: MockContract<CErc20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish
) {
  const redeemerAddress = await redeemer.getAddress();
  return cToken.harnessRedeemFresh(redeemerAddress, redeemTokens, 0);
}

async function redeemFreshAmount(
  cToken: MockContract<CErc20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish
) {
  const redeemerAddress = await redeemer.getAddress();
  return cToken.harnessRedeemFresh(redeemerAddress, 0, redeemAmount);
}

async function quickMint(
  underlying: MockContract<ERC20Harness>,
  cToken: MockContract<CErc20Harness>,
  minter: Signer,
  mintAmount: BigNumberish,
  opts: { approve?: boolean, exchangeRate?: BigNumberish, faucet?: boolean } = { approve: true, faucet: true }
) {
  // make sure to accrue interest
  await cToken.harnessFastForward(1);

  if (opts.approve || opts.approve === undefined) {
    //expect(
      await preApprove(underlying, cToken, minter, mintAmount, opts)
    //).toSucceed();
  }
  if (opts.exchangeRate !== undefined) {
    //expect(
      await cToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return cToken.connect(minter).mint(mintAmount);
}

async function quickRedeem(
  cToken: MockContract<CErc20Harness>,
  redeemer: Signer,
  redeemTokens: BigNumberish,
  opts: { supply?: boolean, exchangeRate?: BigNumberish } = { supply: true }
) {
  await cToken.harnessFastForward(1);

  if (opts.supply || opts.supply === undefined) {
    //expect(
      await preSupply(cToken, redeemer, redeemTokens, opts)
    //).toSucceed();
  }
  if (opts.exchangeRate !== undefined) {
    //expect(
      await cToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return cToken.connect(redeemer).redeem(redeemTokens);
}

async function quickRedeemUnderlying(
  cToken: MockContract<CErc20Harness>,
  redeemer: Signer,
  redeemAmount: BigNumberish,
  opts: { exchangeRate?: BigNumberish } = {}
) {
  await cToken.harnessFastForward(1);

  if (opts.exchangeRate !== undefined) {
    //expect(
      await cToken.harnessSetExchangeRate(opts.exchangeRate)
    //).toSucceed();
  }
  return cToken.connect(redeemer).redeemUnderlying(redeemAmount);
}

describe('CToken', function () {
  let root: Signer;
  let minter: Signer;
  let redeemer: Signer;
  let accounts: Signer[];

  let minterAddress: string;
  let redeemerAddress: string;

  let contracts: CTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let cToken: MockContract<CErc20Harness>;
  let underlying: MockContract<ERC20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = await ethers.getSigners();
    contracts = await loadFixture(cTokenTestFixture);
    ({ comptroller, cToken, underlying, interestRateModel} = contracts);
    minterAddress = await minter.getAddress();
    redeemerAddress = await redeemer.getAddress();
  });

  describe('mintFresh', () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      comptroller.mintAllowed.returns(11);
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWithCustomError(cToken, "MintComptrollerRejection")
        .withArgs(11);
    });

    it("proceeds if comptroller tells it to", async () => {
      //await expect(
        await mintFresh(cToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if not fresh", async () => {
      await cToken.harnessFastForward(5);
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWithCustomError(cToken, "MintFreshnessCheck");
    });

    it("continues if fresh", async () => {
      //await expect(
        await cToken.accrueInterest()
      //).toSucceed();
      //expect(
        await mintFresh(cToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      //expect(
        await underlying.connect(minter).approve(cToken.address, 1)
      //).toSucceed();
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient allowance");
    });

    it("fails if insufficient balance", async() => {
      await underlying.harnessSetBalance(minterAddress, 1);
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("proceeds if sufficient approval and balance", async () =>{
      //expect(
        await mintFresh(cToken, minter, mintAmount)
      //).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      //expect(
        await cToken.harnessSetExchangeRate(0)
      //).toSucceed();
      await expect(mintFresh(cToken, minter, mintAmount)).to.be.reverted;
    });

    it("fails if transferring in fails", async () => {
      await underlying.harnessSetFailTransferFromAddress(minterAddress, true);
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([cToken], [minterAddress]);
      const result = await mintFresh(cToken, minter, mintAmount);
      const afterBalances = await getBalances([cToken], [minterAddress]);
      //expect(result).toSucceed();
      expect(result)
        .to.emit(cToken, "Mint")
        .withArgs(minterAddress, mintAmount, mintTokens);

      expect(result)
        .to.emit(cToken, "Transfer")
        .withArgs(cToken.address, minterAddress, mintTokens);

      expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
        [cToken, minterAddress, 'cash', -mintAmount],
        [cToken, minterAddress, 'tokens', mintTokens],
        [cToken, 'cash', mintAmount],
        [cToken, 'tokens', mintTokens]
      ]));
    });
  });

  describe('mint', () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(quickMint(underlying, cToken, minter, mintAmount))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(minterAddress, 1);
      await expect(mintFresh(cToken, minter, mintAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      //expect(
        await quickMint(underlying, cToken, minter, mintAmount)
      //).toSucceed();
      expect(mintTokens).to.not.equal(0);
      expect(await cToken.balanceOf(await minter.getAddress())).to.equal(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(underlying, cToken, minter, mintAmount))
        .to.emit(cToken, "AccrueInterest")
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
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(cToken, "RedeemComptrollerRejection")
          .withArgs(11);
      });

      it("fails if not fresh", async () => {
        await cToken.harnessFastForward(5);
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(cToken, "RedeemFreshnessCheck");
      });

      it("continues if fresh", async () => {
        //await expect(
          await cToken.accrueInterest()
        //).toSucceed();
        //expect(
          await redeemFresh(cToken, redeemer, redeemTokens, redeemAmount)
        //).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async() => {
        await underlying.harnessSetBalance(cToken.address, 1);
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWithCustomError(cToken, "RedeemTransferOutNotPossible");
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          //expect(
            await cToken.harnessSetExchangeRate(constants.MaxUint256)
          //).toSucceed();
          await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount)).to.be.reverted;
        } else {
          //expect(
            await cToken.harnessSetExchangeRate(0)
          //).toSucceed();
          await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount)).to.be.reverted;
        }
      });

      it("fails if transferring out fails", async () => {
        await underlying.harnessSetFailTransferToAddress(redeemerAddress, true);
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount))
          .to.be.revertedWith("TOKEN_TRANSFER_OUT_FAILED");
      });

      it("fails if total supply < redemption amount", async () => {
        await cToken.harnessExchangeRateDetails(0, 0, 0);
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount)).to.be.reverted;
      });

      it("reverts if new account balance underflows", async () => {
        await cToken.harnessSetBalance(redeemerAddress, 0);
        await expect(redeemFresh(cToken, redeemer, redeemTokens, redeemAmount)).to.be.reverted;
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([cToken], [redeemerAddress]);
        const result = await redeemFresh(cToken, redeemer, redeemTokens, redeemAmount);
        const afterBalances = await getBalances([cToken], [redeemerAddress]);
        //expect(result).toSucceed();
        expect(result)
          .to.emit(cToken, "Redeem")
          .withArgs(redeemAmount, redeemTokens);
        
        expect(result)
          .to.emit(cToken, "Transfer")
          .withArgs(redeemerAddress, cToken.address, redeemTokens);

        expect(afterBalances).to.deep.equal(adjustBalances(beforeBalances, [
          [cToken, redeemerAddress, 'cash', redeemAmount],
          [cToken, redeemerAddress, 'tokens', -redeemTokens],
          [cToken, 'cash', -redeemAmount],
          [cToken, 'tokens', -redeemTokens]
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
      await expect(quickRedeem(cToken, redeemer, redeemTokens))
        .to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(cToken.address, 0);
      await expect(quickRedeem(cToken, redeemer, redeemTokens, {exchangeRate})).to.be.reverted;
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      //expect(
        await underlying.harnessSetBalance(cToken.address, redeemAmount)
      //).toSucceed();
      //expect(
        await quickRedeem(cToken, redeemer, redeemTokens, {exchangeRate})
      //).toSucceed();
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemerAddress)).to.equal(redeemAmount);
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      //expect(
        await underlying.harnessSetBalance(cToken.address, redeemAmount)
      //).toSucceed();
      //expect(
        await quickRedeemUnderlying(cToken, redeemer, redeemAmount, {exchangeRate})
      //).toSucceed();
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemerAddress)).to.equal(redeemAmount);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(underlying, cToken, minter, mintAmount))
        .to.emit(cToken, "AccrueInterest")
        .withArgs("1000000000000000000", "500000000", "0", "0");
    });
  });
});

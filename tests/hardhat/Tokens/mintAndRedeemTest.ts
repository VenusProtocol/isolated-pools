import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { Comptroller, ERC20Harness, InterestRateModel, VTokenHarness } from "../../../typechain";
import {
  VTokenTestFixture,
  adjustBalances,
  getBalances,
  preApprove,
  vTokenTestFixture,
} from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const exchangeRate = parseUnits("50000", 18).toBigInt();
const mintAmount = parseUnits("10000", 18).toBigInt();
const mintTokens = BigNumber.from(mintAmount).mul(parseUnits("1", 18)).div(exchangeRate).toBigInt();
const redeemTokens = parseUnits("1000", 18).toBigInt();
const redeemAmount = BigNumber.from(redeemTokens).mul(exchangeRate).div(parseUnits("1", 18)).toBigInt();

async function preMint(
  contracts: VTokenTestFixture,
  minter: SignerWithAddress,
  mintAmount: BigNumberish,
  exchangeRate: BigNumberish,
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  await preApprove(underlying, vToken, minter, mintAmount, { faucet: true });

  comptroller.preMintHook.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();

  const minterAddress = minter.address;
  await underlying.harnessSetFailTransferFromAddress(minterAddress, false);
  await vToken.harnessSetBalance(minterAddress, 0);
  await vToken.harnessSetExchangeRate(exchangeRate);
}

async function mintFresh(vToken: VTokenHarness, minter: SignerWithAddress, mintAmount: BigNumberish) {
  return vToken.harnessMintFresh(minter.address, mintAmount);
}

async function preSupply(
  vToken: VTokenHarness,
  account: SignerWithAddress,
  tokens: BigNumberish,
  opts: { supply?: boolean } = { supply: true },
) {
  if (opts.supply || opts.supply === undefined) {
    await vToken.harnessSetTotalSupply(tokens);
  }
  return vToken.harnessSetBalance(account.address, tokens);
}

async function preRedeem(
  contracts: VTokenTestFixture,
  redeemer: SignerWithAddress,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish,
  exchangeRate: BigNumberish,
) {
  const { comptroller, vToken, interestRateModel, underlying } = contracts;
  await preSupply(vToken, redeemer, redeemTokens, { supply: true });

  comptroller.preRedeemHook.reset();

  interestRateModel.getBorrowRate.reset();
  interestRateModel.getSupplyRate.reset();
  await underlying.harnessSetBalance(vToken.address, redeemAmount);
  await underlying.harnessSetBalance(redeemer.address, 0);
  await underlying.harnessSetFailTransferToAddress(redeemer.address, false);
  await vToken.harnessSetExchangeRate(exchangeRate);
}

async function redeemFreshTokens(vToken: VTokenHarness, redeemer: SignerWithAddress, redeemTokens: BigNumberish) {
  return vToken.harnessRedeemFresh(redeemer.address, redeemTokens, 0);
}

async function redeemFreshAmount(
  vToken: VTokenHarness,
  redeemer: SignerWithAddress,
  redeemTokens: BigNumberish,
  redeemAmount: BigNumberish,
) {
  return vToken.harnessRedeemFresh(redeemer.address, 0, redeemAmount);
}

async function quickMint(
  underlying: MockContract<ERC20Harness>,
  vToken: VTokenHarness,
  minter: SignerWithAddress,
  mintAmount: BigNumberish,
  opts: { approve?: boolean; exchangeRate?: BigNumberish; faucet?: boolean } = { approve: true, faucet: true },
) {
  // make sure to accrue interest
  await vToken.harnessFastForward(1);

  if (opts.approve || opts.approve === undefined) {
    await preApprove(underlying, vToken, minter, mintAmount, opts);
  }
  if (opts.exchangeRate !== undefined) {
    await vToken.harnessSetExchangeRate(opts.exchangeRate);
  }
  return vToken.connect(minter).mint(mintAmount);
}

async function quickRedeem(
  vToken: VTokenHarness,
  redeemer: SignerWithAddress,
  redeemTokens: BigNumberish,
  opts: { supply?: boolean; exchangeRate?: BigNumberish } = { supply: true },
) {
  await vToken.harnessFastForward(1);

  if (opts.supply || opts.supply === undefined) {
    await preSupply(vToken, redeemer, redeemTokens, opts);
  }
  if (opts.exchangeRate !== undefined) {
    await vToken.harnessSetExchangeRate(opts.exchangeRate);
  }
  return vToken.connect(redeemer).redeem(redeemTokens);
}

async function quickRedeemUnderlying(
  vToken: VTokenHarness,
  redeemer: SignerWithAddress,
  redeemAmount: BigNumberish,
  opts: { exchangeRate?: BigNumberish } = {},
) {
  await vToken.harnessFastForward(1);

  if (opts.exchangeRate !== undefined) {
    await vToken.harnessSetExchangeRate(opts.exchangeRate);
  }
  return vToken.connect(redeemer).redeemUnderlying(redeemAmount);
}

describe("VToken", function () {
  let _root: SignerWithAddress;
  let minter: SignerWithAddress;
  let redeemer: SignerWithAddress;

  let contracts: VTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let vToken: VTokenHarness;
  let underlying: MockContract<ERC20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let trustee: SignerWithAddress;

  beforeEach(async () => {
    [_root, minter, redeemer, trustee] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ comptroller, vToken, underlying, interestRateModel } = contracts);
    comptroller.approvedDelegates.returns(false);
  });

  describe("mintFresh", () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      comptroller.preMintHook.reverts();
      await expect(mintFresh(vToken, minter, mintAmount)).to.be.reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      await mintFresh(vToken, minter, mintAmount);
    });

    it("fails if not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWithCustomError(vToken, "MintFreshnessCheck");
    });

    it("continues if fresh", async () => {
      // await expect(
      await vToken.accrueInterest();

      await mintFresh(vToken, minter, mintAmount);
    });

    it("fails if insufficient approval", async () => {
      await underlying.connect(minter).approve(vToken.address, 1);

      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWith("Insufficient allowance");
    });

    it("fails if insufficient balance", async () => {
      await underlying.harnessSetBalance(minter.address, 1);
      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWith("Insufficient balance");
    });

    it("proceeds if sufficient approval and balance", async () => {
      await mintFresh(vToken, minter, mintAmount);
    });

    it("fails if exchange calculation fails", async () => {
      await vToken.harnessSetExchangeRate(0);

      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
    });

    it("fails if transferring in fails", async () => {
      await underlying.harnessSetFailTransferFromAddress(minter.address, true);
      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWith(
        "SafeERC20: ERC20 operation did not succeed",
      );
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([vToken], [minter.address]);
      const result = await mintFresh(vToken, minter, mintAmount);
      const afterBalances = await getBalances([vToken], [minter.address]);

      await expect(result).to.emit(vToken, "Mint").withArgs(minter.address, mintAmount, mintTokens, mintTokens);

      await expect(result)
        .to.emit(vToken, "Transfer")
        .withArgs(ethers.constants.AddressZero, minter.address, mintTokens);

      expect(afterBalances).to.deep.equal(
        adjustBalances(beforeBalances, [
          [vToken, minter.address, "cash", -mintAmount],
          [vToken, minter.address, "tokens", mintTokens],
          [vToken, "cash", mintAmount],
          [vToken, "tokens", mintTokens],
        ]),
      );
    });
  });

  describe("mint", () => {
    beforeEach(async () => {
      await preMint(contracts, minter, mintAmount, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(quickMint(underlying, vToken, minter, mintAmount)).to.be.reverted;
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(minter.address, 1);
      await expect(mintFresh(vToken, minter, mintAmount)).to.be.revertedWith("Insufficient balance");
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      await quickMint(underlying, vToken, minter, mintAmount);

      expect(mintTokens).to.not.equal(0);
      expect(await vToken.balanceOf(minter.address)).to.equal(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      await expect(await quickMint(underlying, vToken, minter, mintAmount))
        .to.emit(vToken, "AccrueInterest")
        .withArgs("0", "0", "1000000000000000000", "0");

      await expect(await quickMint(underlying, vToken, minter, mintAmount))
        .to.emit(vToken, "AccrueInterest")
        .withArgs("10000000000000000000000", "0", "1000000000000000000", "0");
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach(redeemFresh => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("fails if comptroller tells it to", async () => {
        comptroller.preRedeemHook.reverts();
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.reverted;
      });

      it("fails if not fresh", async () => {
        await vToken.harnessFastForward(5);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWithCustomError(
          vToken,
          "RedeemFreshnessCheck",
        );
      });

      it("continues if fresh", async () => {
        await vToken.accrueInterest();

        await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount);
      });

      it("fails if insufficient protocol cash to transfer out", async () => {
        await underlying.harnessSetBalance(vToken.address, 1);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWithCustomError(
          vToken,
          "RedeemTransferOutNotPossible",
        );
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          await vToken.harnessSetExchangeRate(constants.MaxUint256);

          await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWithPanic(
            PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
          );
        } else {
          await vToken.harnessSetExchangeRate(0);
          await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWithPanic(
            PANIC_CODES.DIVISION_BY_ZERO,
          );
        }
      });

      it("fails if transferring out fails", async () => {
        await underlying.harnessSetFailTransferToAddress(redeemer.address, true);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWith(
          "SafeERC20: ERC20 operation did not succeed",
        );
      });

      it("fails if total supply < redemption amount", async () => {
        await vToken.harnessExchangeRateDetails(0, 0, 0);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.to.be.revertedWithPanic(
          PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
        );
      });

      it("reverts if new account balance underflows", async () => {
        await vToken.harnessSetBalance(redeemer.address, 0);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).to.be.revertedWithPanic(
          PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
        );
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([vToken], [redeemer.address]);
        const result = await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount);
        const afterBalances = await getBalances([vToken], [redeemer.address]);

        await expect(result).to.emit(vToken, "Redeem").withArgs(redeemer.address, redeemAmount, redeemTokens, 0);

        await expect(result).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, redeemTokens);

        expect(afterBalances).to.deep.equal(
          adjustBalances(beforeBalances, [
            [vToken, redeemer.address, "cash", redeemAmount],
            [vToken, redeemer.address, "tokens", -redeemTokens],
            [vToken, "cash", -redeemAmount],
            [vToken, "tokens", -redeemTokens],
          ]),
        );
      });
    });
  });

  describe("redeem", () => {
    beforeEach(async () => {
      await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(quickRedeem(vToken, redeemer, redeemTokens)).to.be.reverted;
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(vToken.address, 0);
      await expect(quickRedeem(vToken, redeemer, redeemTokens, { exchangeRate })).to.be.revertedWithCustomError(
        vToken,
        "RedeemTransferOutNotPossible",
      );
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      await underlying.harnessSetBalance(vToken.address, redeemAmount);
      await quickRedeem(vToken, redeemer, redeemTokens, { exchangeRate });
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemer.address)).to.equal(redeemAmount);
    });

    it("revert if exchange rate is high and amount is not enough for a token", async () => {
      const redeemAmount = parseUnits("1", 5);
      const exchangeRate = parseUnits("1", 25);
      await underlying.harnessSetBalance(vToken.address, redeemAmount);
      await expect(quickRedeemUnderlying(vToken, redeemer, redeemAmount, { exchangeRate })).to.be.revertedWith(
        "redeemAmount is zero",
      );
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      await underlying.harnessSetBalance(vToken.address, redeemAmount);
      await quickRedeemUnderlying(vToken, redeemer, redeemAmount, { exchangeRate });
      expect(redeemAmount).to.not.equal(0);
      expect(await underlying.balanceOf(redeemer.address)).to.equal(redeemAmount);
    });

    it("emits an AccrueInterest event", async () => {
      await expect(await quickRedeem(vToken, redeemer, redeemTokens, { exchangeRate }))
        .to.emit(vToken, "AccrueInterest")
        .withArgs("50000000000000000000000000", "0", "1000000000000000000", "0");
    });
  });

  describe("redeemBehalf", () => {
    beforeEach(async () => {
      await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("reverts when caller is not the user's approved delegate", async () => {
      await vToken.harnessFastForward(5);
      await expect(vToken.connect(trustee).redeemBehalf(redeemer.address, redeemTokens)).to.be.revertedWithCustomError(
        vToken,
        "DelegateNotApproved",
      );
    });

    it("returns success from redeemBehalf and transfers the correct amount", async () => {
      comptroller.approvedDelegates.returns(true);
      const tx = await vToken.connect(trustee).redeemBehalf(redeemer.address, redeemTokens);
      await expect(tx).to.emit(vToken, "Redeem").withArgs(redeemer.address, redeemAmount, redeemTokens, 0);
    });
  });

  describe("redeemUnderlyingBehalf", () => {
    beforeEach(async () => {
      await preRedeem(contracts, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("reverts when caller is not the user's approved delegate", async () => {
      await vToken.harnessFastForward(5);
      await expect(
        vToken.connect(trustee).redeemUnderlyingBehalf(redeemer.address, redeemAmount),
      ).to.be.revertedWithCustomError(vToken, "DelegateNotApproved");
    });

    it("returns success from redeemUnderlyingBehalf and transfers the correct amount", async () => {
      comptroller.approvedDelegates.returns(true);
      const tx = await vToken.connect(trustee).redeemUnderlyingBehalf(redeemer.address, redeemAmount);
      await expect(tx).to.emit(vToken, "Redeem").withArgs(redeemer.address, redeemAmount, redeemTokens, 0);
    });
  });
});

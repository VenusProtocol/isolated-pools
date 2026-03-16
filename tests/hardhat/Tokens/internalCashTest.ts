import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { AccessControlManager, Comptroller, VTokenHarness } from "../../../typechain";
import { preApprove, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

describe("VToken internalCash", function () {
  let root: SignerWithAddress;
  let user: SignerWithAddress;
  let vToken: VTokenHarness;
  let underlying;
  let comptroller: FakeContract<Comptroller>;
  let acm: FakeContract<AccessControlManager>;

  beforeEach(async () => {
    [root, user] = await ethers.getSigners();
    const contracts = await vTokenTestFixture();
    vToken = contracts.vToken;
    underlying = contracts.underlying;
    comptroller = contracts.comptroller;
    acm = contracts.accessControlManager;

    await comptroller.connect(root).setMarketSupplyCaps([vToken.address], [parseUnits("100000000", 18)]);
    await comptroller.connect(root).setMarketBorrowCaps([vToken.address], [parseUnits("100000000", 18)]);
  });

  describe("syncCash", () => {
    it("syncs internalCash with actual underlying balance", async () => {
      const amount = parseUnits("1000", 18);
      await underlying.harnessSetBalance(vToken.address, amount);
      expect(await vToken.internalCash()).to.equal(0);

      await expect(vToken.syncCash())
        .to.emit(vToken, "CashSynced")
        .withArgs(0, amount);

      expect(await vToken.internalCash()).to.equal(amount);
    });

    it("is idempotent", async () => {
      const amount = parseUnits("500", 18);
      await underlying.harnessSetBalance(vToken.address, amount);

      await vToken.syncCash();
      expect(await vToken.internalCash()).to.equal(amount);

      await expect(vToken.syncCash())
        .to.emit(vToken, "CashSynced")
        .withArgs(amount, amount);

      expect(await vToken.internalCash()).to.equal(amount);
    });

    it("rejects call when ACM disallows", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(vToken.connect(user).syncCash()).to.be.revertedWithCustomError(vToken, "Unauthorized");
      acm.isAllowedToCall.returns(true);
    });
  });

  describe("donation attack immunity", () => {
    it("direct transfer does not affect getCash()", async () => {
      const mintAmount = parseUnits("1000", 18);

      // Mint some tokens to set up internalCash
      await preApprove(underlying, vToken, root, mintAmount, { faucet: true });
      await vToken.connect(root).mint(mintAmount);

      const cashBefore = await vToken.getCash();
      const internalCashBefore = await vToken.internalCash();

      // Simulate a direct donation
      const donationAmount = parseUnits("5000", 18);
      await underlying.harnessSetBalance(vToken.address, (await underlying.balanceOf(vToken.address)).add(donationAmount));

      // getCash and internalCash should be unchanged
      expect(await vToken.getCash()).to.equal(cashBefore);
      expect(await vToken.internalCash()).to.equal(internalCashBefore);
    });

    it("exchange rate is not affected by direct transfers", async () => {
      const mintAmount = parseUnits("1000", 18);

      await preApprove(underlying, vToken, root, mintAmount, { faucet: true });
      await vToken.connect(root).mint(mintAmount);

      const exchangeRateBefore = await vToken.exchangeRateStored();

      // Simulate a direct donation
      const donationAmount = parseUnits("5000", 18);
      await underlying.harnessSetBalance(vToken.address, (await underlying.balanceOf(vToken.address)).add(donationAmount));

      const exchangeRateAfter = await vToken.exchangeRateStored();
      expect(exchangeRateAfter).to.equal(exchangeRateBefore);
    });
  });

  describe("internalCash tracking through operations", () => {
    it("increases on mint", async () => {
      const mintAmount = parseUnits("1000", 18);
      expect(await vToken.internalCash()).to.equal(0);

      await preApprove(underlying, vToken, root, mintAmount, { faucet: true });
      await vToken.connect(root).mint(mintAmount);

      expect(await vToken.internalCash()).to.equal(mintAmount);
    });

    it("decreases on redeem", async () => {
      const mintAmount = parseUnits("1000", 18);

      await preApprove(underlying, vToken, root, mintAmount, { faucet: true });
      await vToken.connect(root).mint(mintAmount);

      const vTokenBalance = await vToken.balanceOf(root.address);
      expect(await vToken.internalCash()).to.equal(mintAmount);

      await vToken.connect(root).redeem(vTokenBalance);

      expect(await vToken.internalCash()).to.equal(0);
    });

    it("decreases on borrow and increases on repay", async () => {
      const mintAmount = parseUnits("10000", 18);
      const borrowAmount = parseUnits("1000", 18);

      // Supply collateral
      await preApprove(underlying, vToken, root, mintAmount, { faucet: true });
      await vToken.connect(root).mint(mintAmount);

      const cashAfterMint = await vToken.internalCash();
      expect(cashAfterMint).to.equal(mintAmount);

      // Borrow
      comptroller.preBorrowHook.reset();
      await vToken.connect(root).borrow(borrowAmount);

      expect(await vToken.internalCash()).to.equal(cashAfterMint.sub(borrowAmount));

      // Repay
      await preApprove(underlying, vToken, root, borrowAmount, { faucet: true });
      await vToken.connect(root).repayBorrow(borrowAmount);

      expect(await vToken.internalCash()).to.equal(cashAfterMint);
    });
  });
});

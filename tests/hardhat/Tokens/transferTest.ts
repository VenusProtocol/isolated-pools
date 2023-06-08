import { FakeContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { Comptroller, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

describe("VToken", function () {
  let root: SignerWithAddress;
  let guy: SignerWithAddress;
  let vToken: VTokenHarness;
  let comptroller: FakeContract<Comptroller>;

  beforeEach(async () => {
    [root, guy] = await ethers.getSigners();
    ({ vToken, comptroller } = await loadFixture(vTokenTestFixture));
  });

  describe("transfer", () => {
    it("cannot transfer from a zero balance", async () => {
      expect(await vToken.balanceOf(root.address)).to.equal(0);
      await expect(vToken.transfer(guy.address, 100)).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("transfers 50 tokens", async () => {
      await vToken.harnessSetBalance(root.address, 100);
      expect(await vToken.balanceOf(root.address)).to.equal(100);
      await vToken.transfer(guy.address, 50);
      expect(await vToken.balanceOf(root.address)).to.equal(50);
      expect(await vToken.balanceOf(guy.address)).to.equal(50);
    });

    it("doesn't transfer when src == dst", async () => {
      await vToken.harnessSetBalance(root.address, 100);
      expect(await vToken.balanceOf(root.address)).to.equal(100);
      await expect(vToken.transfer(root.address, 50)).to.be.revertedWithCustomError(vToken, "TransferNotAllowed");
    });

    it("approve and transfer", async () => {
      await vToken.harnessSetBalance(root.address, 1000);
      expect(await vToken.balanceOf(root.address)).to.equal(1000);
      await vToken.approve(guy.address, 100);

      await expect(vToken.connect(guy).transferFrom(root.address, guy.address, 120)).to.be.reverted;

      await vToken.increaseAllowance(guy.address, 20);
      await expect(vToken.connect(guy).transferFrom(root.address, guy.address, 120)).to.be.not.reverted;
      expect(await vToken.balanceOf(guy.address)).to.equal(120);

      await vToken.approve(guy.address, 100);
      await vToken.decreaseAllowance(guy.address, 20);

      await expect(vToken.connect(guy).transferFrom(root.address, guy.address, 100)).to.be.reverted;
      await expect(vToken.connect(guy).transferFrom(root.address, guy.address, 80)).to.be.not.reverted;

      expect(await vToken.balanceOf(guy.address)).to.equal(200);
    });

    it("rejects transfer when not allowed", async () => {
      await vToken.harnessSetBalance(root.address, 100);
      expect(await vToken.balanceOf(root.address)).to.equal(100);

      comptroller.preTransferHook.reverts();
      await expect(vToken.transfer(root.address, 50)).to.be.reverted;
    });
  });
});

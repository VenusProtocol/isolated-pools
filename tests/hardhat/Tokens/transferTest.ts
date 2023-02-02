import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { Comptroller, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

describe("VToken", function () {
  let root: Signer;
  let guy: Signer;
  let rootAddress: string;
  let guyAddress: string;
  let vToken: MockContract<VTokenHarness>;
  let comptroller: FakeContract<Comptroller>;

  beforeEach(async () => {
    [root, guy] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ vToken, comptroller } = await loadFixture(vTokenTestFixture));
  });

  describe("transfer", () => {
    it("cannot transfer from a zero balance", async () => {
      expect(await vToken.balanceOf(rootAddress)).to.equal(0);
      await expect(vToken.transfer(guyAddress, 100)).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
    });

    it("transfers 50 tokens", async () => {
      await vToken.harnessSetBalance(rootAddress, 100);
      expect(await vToken.balanceOf(rootAddress)).to.equal(100);
      await vToken.transfer(guyAddress, 50);
      expect(await vToken.balanceOf(rootAddress)).to.equal(50);
      expect(await vToken.balanceOf(guyAddress)).to.equal(50);
    });

    it("doesn't transfer when src == dst", async () => {
      await vToken.harnessSetBalance(rootAddress, 100);
      expect(await vToken.balanceOf(rootAddress)).to.equal(100);
      await expect(vToken.transfer(rootAddress, 50)).to.be.revertedWithCustomError(vToken, "TransferNotAllowed");
    });

    it("approve and transfer", async () => {
      await vToken.harnessSetBalance(rootAddress, 1000);
      expect(await vToken.balanceOf(rootAddress)).to.equal(1000);
      await vToken.approve(guyAddress, 100);

      await expect(vToken.connect(guy).transferFrom(rootAddress, guyAddress, 120)).to.be.reverted;

      await vToken.increaseAllowance(guy.getAddress(), 20);
      await expect(vToken.connect(guy).transferFrom(rootAddress, guyAddress, 120)).to.be.not.reverted;
      expect(await vToken.balanceOf(guyAddress)).to.equal(120);

      await vToken.approve(guyAddress, 100);
      await vToken.decreaseAllowance(guy.getAddress(), 20);

      await expect(vToken.connect(guy).transferFrom(rootAddress, guyAddress, 100)).to.be.reverted;
      await expect(vToken.connect(guy).transferFrom(rootAddress, guyAddress, 80)).to.be.not.reverted;

      expect(await vToken.balanceOf(guyAddress)).to.equal(200);
    });

    it("rejects transfer when not allowed", async () => {
      await vToken.harnessSetBalance(rootAddress, 100);
      expect(await vToken.balanceOf(rootAddress)).to.equal(100);

      comptroller.preTransferHook.reverts();
      await expect(vToken.transfer(rootAddress, 50)).to.be.reverted;
    });
  });
});

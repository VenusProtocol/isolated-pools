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

    it("rejects transfer when not allowed", async () => {
      await vToken.harnessSetBalance(rootAddress, 100);
      expect(await vToken.balanceOf(rootAddress)).to.equal(100);

      comptroller.preTransferHook.reverts();
      await expect(vToken.transfer(rootAddress, 50)).to.be.reverted;
    });
  });
});

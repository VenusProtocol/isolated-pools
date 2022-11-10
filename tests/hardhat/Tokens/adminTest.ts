import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

describe("admin / setPendingAdmin / acceptAdmin", () => {
  let vToken: MockContract<VTokenHarness>;
  let root: Signer;
  let rootAddress: string;
  let guy: Signer;
  let guyAddress: string;
  let accounts: Signer[];

  beforeEach(async () => {
    [root, guy, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ vToken } = await loadFixture(vTokenTestFixture));
  });

  describe("admin()", () => {
    it("should return correct admin", async () => {
      expect(await vToken.admin()).to.equal(rootAddress);
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe("setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      await expect(vToken.connect(guy).setPendingAdmin(guyAddress)).to.be.revertedWithCustomError(
        vToken,
        "OnlyAdminAllowed",
      );

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should properly set pending admin", async () => {
      //expect(
      await vToken.setPendingAdmin(guyAddress);
      //).toSucceed();

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(guyAddress);
    });

    it("should properly set pending admin twice", async () => {
      //expect(
      await vToken.setPendingAdmin(guyAddress);
      //).toSucceed();
      //expect(
      await vToken.setPendingAdmin(await accounts[1].getAddress());
      //).toSucceed();

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(await accounts[1].getAddress());
    });

    it("should emit event", async () => {
      await expect(await vToken.setPendingAdmin(guyAddress))
        .to.emit(vToken, "NewPendingAdmin")
        .withArgs(constants.AddressZero, guyAddress);
    });
  });

  describe("acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      await expect(vToken.acceptAdmin()).to.be.revertedWithCustomError(vToken, "OnlyAdminAllowed");

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should fail when called by another account (e.g. root)", async () => {
      //expect(
      await vToken.setPendingAdmin(guyAddress);
      //).toSucceed();
      await expect(vToken.acceptAdmin()).to.be.revertedWithCustomError(vToken, "OnlyAdminAllowed");

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(guyAddress);
    });

    it("should succeed and set admin and clear pending admin", async () => {
      //expect(
      await vToken.setPendingAdmin(guyAddress);
      //).toSucceed();
      //expect(
      await vToken.connect(guy).acceptAdmin();
      //).toSucceed();

      expect(await vToken.admin()).to.equal(guyAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should emit log on success", async () => {
      //expect(
      await vToken.setPendingAdmin(guyAddress);
      //).toSucceed();
      const result = await vToken.connect(guy).acceptAdmin();
      await expect(result).to.emit(vToken, "NewAdmin").withArgs(rootAddress, guyAddress);

      await expect(result).to.emit(vToken, "NewPendingAdmin").withArgs(guyAddress, constants.AddressZero);
    });
  });
});

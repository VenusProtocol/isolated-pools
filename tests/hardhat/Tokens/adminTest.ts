import { ethers } from "hardhat";
import { MockContract, smock } from "@defi-wonderland/smock";
import { Signer, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { VBep20Harness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";


describe('admin / _setPendingAdmin / _acceptAdmin', () => {
  let vToken: MockContract<VBep20Harness>;
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

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await vToken.admin()).to.equal(rootAddress);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      await expect(vToken.connect(guy)._setPendingAdmin(guyAddress))
        .to.be.revertedWithCustomError(vToken, 'SetPendingAdminOwnerCheck');

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should properly set pending admin', async () => {
      //expect(
        await vToken._setPendingAdmin(guyAddress)
      //).toSucceed();

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(guyAddress);
    });

    it('should properly set pending admin twice', async () => {
      //expect(
        await vToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      //expect(
        await vToken._setPendingAdmin(await accounts[1].getAddress())
      //).toSucceed();

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(await accounts[1].getAddress());
    });

    it('should emit event', async () => {
      expect(await vToken._setPendingAdmin(guyAddress))
        .to.emit(vToken, "NewPendingAdmin")
        .withArgs(constants.AddressZero, guyAddress);
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      await expect(vToken._acceptAdmin())
        .to.be.revertedWithCustomError(vToken, "AcceptAdminPendingAdminCheck");

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should fail when called by another account (e.g. root)', async () => {
      //expect(
        await vToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      await expect(vToken._acceptAdmin())
        .to.be.revertedWithCustomError(vToken, "AcceptAdminPendingAdminCheck");

      // Check admin stays the same
      expect(await vToken.admin()).to.equal(rootAddress);
      expect(await vToken.pendingAdmin()).to.equal(guyAddress);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      //expect(
        await vToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      //expect(
        await vToken.connect(guy)._acceptAdmin()
      //).toSucceed();

      expect(await vToken.admin()).to.equal(guyAddress);
      expect(await vToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should emit log on success', async () => {
      //expect(
        await vToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      const result = await vToken.connect(guy)._acceptAdmin();
      expect(result)
        .to.emit(vToken, "NewAdmin")
        .withArgs(rootAddress, guyAddress);

      expect(result)
        .to.emit(vToken, "NewPendingAdmin")
        .withArgs(guyAddress, constants.AddressZero);
    });
  });
});

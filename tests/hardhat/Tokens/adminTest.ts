import { ethers } from "hardhat";
import { MockContract, smock } from "@defi-wonderland/smock";
import { Signer, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { CErc20Harness } from "../../../typechain";
import { cTokenTestFixture } from "../util/TokenTestHelpers";


describe('admin / _setPendingAdmin / _acceptAdmin', () => {
  let cToken: MockContract<CErc20Harness>;
  let root: Signer;
  let rootAddress: string;
  let guy: Signer;
  let guyAddress: string;
  let accounts: Signer[];

  beforeEach(async () => {
    [root, guy, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ cToken } = await loadFixture(cTokenTestFixture));
  });

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await cToken.admin()).to.equal(rootAddress);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await cToken.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      await expect(cToken.connect(guy)._setPendingAdmin(guyAddress))
        .to.be.revertedWithCustomError(cToken, 'SetPendingAdminOwnerCheck');

      // Check admin stays the same
      expect(await cToken.admin()).to.equal(rootAddress);
      expect(await cToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should properly set pending admin', async () => {
      //expect(
        await cToken._setPendingAdmin(guyAddress)
      //).toSucceed();

      // Check admin stays the same
      expect(await cToken.admin()).to.equal(rootAddress);
      expect(await cToken.pendingAdmin()).to.equal(guyAddress);
    });

    it('should properly set pending admin twice', async () => {
      //expect(
        await cToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      //expect(
        await cToken._setPendingAdmin(await accounts[1].getAddress())
      //).toSucceed();

      // Check admin stays the same
      expect(await cToken.admin()).to.equal(rootAddress);
      expect(await cToken.pendingAdmin()).to.equal(await accounts[1].getAddress());
    });

    it('should emit event', async () => {
      expect(await cToken._setPendingAdmin(guyAddress))
        .to.emit(cToken, "NewPendingAdmin")
        .withArgs(constants.AddressZero, guyAddress);
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      await expect(cToken._acceptAdmin())
        .to.be.revertedWithCustomError(cToken, "AcceptAdminPendingAdminCheck");

      // Check admin stays the same
      expect(await cToken.admin()).to.equal(rootAddress);
      expect(await cToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should fail when called by another account (e.g. root)', async () => {
      //expect(
        await cToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      await expect(cToken._acceptAdmin())
        .to.be.revertedWithCustomError(cToken, "AcceptAdminPendingAdminCheck");

      // Check admin stays the same
      expect(await cToken.admin()).to.equal(rootAddress);
      expect(await cToken.pendingAdmin()).to.equal(guyAddress);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      //expect(
        await cToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      //expect(
        await cToken.connect(guy)._acceptAdmin()
      //).toSucceed();

      expect(await cToken.admin()).to.equal(guyAddress);
      expect(await cToken.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it('should emit log on success', async () => {
      //expect(
        await cToken._setPendingAdmin(guyAddress)
      //).toSucceed();
      const result = await cToken.connect(guy)._acceptAdmin();
      expect(result)
        .to.emit(cToken, "NewAdmin")
        .withArgs(rootAddress, guyAddress);

      expect(result)
        .to.emit(cToken, "NewPendingAdmin")
        .withArgs(guyAddress, constants.AddressZero);
    });
  });
});

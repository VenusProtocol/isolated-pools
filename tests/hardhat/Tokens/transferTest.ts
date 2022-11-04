import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { VTokenHarness, Comptroller } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";

describe('VToken', function () {
  let root: Signer;
  let guy: Signer;
  let rootAddress: string;
  let guyAddress: string;
  let accounts: Signer[];
  let vToken: MockContract<VTokenHarness>;
  let comptroller: FakeContract<Comptroller>;

  beforeEach(async () => {
    [root, guy, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ vToken, comptroller } = await loadFixture(vTokenTestFixture));
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      expect(await vToken.balanceOf(rootAddress)).to.equal(0);
      await expect(vToken.transfer(guyAddress, 100))
        .to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW);
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
      await expect(vToken.transfer(rootAddress, 50))
        .to.be.revertedWithCustomError(vToken, 'TransferNotAllowed');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      await vToken.harnessSetBalance(rootAddress, 100);
      expect(await vToken.balanceOf(rootAddress)).to.equal(100);

      comptroller.transferAllowed.returns(11);
      await expect(vToken.transfer(rootAddress, 50))
        .to.be.revertedWithCustomError(vToken, 'TransferComptrollerRejection')
        .withArgs(11);

      //comptroller.transferAllowed.returns(Error.NO_ERROR);
      //await send(vToken.comptroller, 'setTransferVerify', [false])
      // no longer support verifyTransfer on vToken end
      // await expect(send(vToken, 'transfer', [guyAddress, 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});

import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import { AccessControlManager, CErc20Harness, Comptroller } from "../../../typechain";
import { cTokenTestFixture } from "../util/TokenTestHelpers";


async function setComptrollerTestFixture() {
  const contracts = await cTokenTestFixture();
  const newComptroller = await smock.fake<Comptroller>("Comptroller");
  return { newComptroller, ...contracts };
}

describe('CToken', function () {
  let cToken: MockContract<CErc20Harness>;
  let comptroller: FakeContract<Comptroller>;
  let newComptroller: FakeContract<Comptroller>;
  let accessControlManager: FakeContract<AccessControlManager>;
  let root: Signer;
  let rootAddress: string;
  let guy: Signer;
  let guyAddress: string;
  let accounts: Signer[];

  beforeEach(async () => {
    [root, guy, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    guyAddress = await guy.getAddress();
    ({ accessControlManager, comptroller, newComptroller, cToken } = await loadFixture(setComptrollerTestFixture));
    comptroller.isComptroller.returns(true);
    newComptroller.isComptroller.returns(true);
  });

  describe('_setComptroller', () => {
    it("should fail if called by non-admin", async () => {
      await expect(cToken.connect(guy)._setComptroller(newComptroller.address))
        .to.be.revertedWithCustomError(cToken, "SetComptrollerOwnerCheck");
      expect(await cToken.comptroller()).to.equal(comptroller.address);
    });

    it("reverts if passed a contract that doesn't implement isComptroller", async () => {
      await expect(cToken._setComptroller(accessControlManager.address))
        .to.be.reverted;
      expect(await cToken.comptroller()).to.equal(comptroller.address);
    });

    it("reverts if passed a contract that implements isComptroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badComptroller = await smock.fake<Comptroller>("Comptroller");
      badComptroller.isComptroller.returns(false);
      await expect(cToken._setComptroller(badComptroller.address))
        .to.be.revertedWith("marker method returned false");
      expect(await cToken.comptroller()).to.equal(comptroller.address);
    });

    it("updates comptroller and emits log on success", async () => {
      const result = await cToken._setComptroller(newComptroller.address);
      //expect(result).toSucceed();
      expect(result)
        .to.emit(cToken, "NewComptroller")
        .withArgs(comptroller.address, newComptroller.address);
      expect(await cToken.comptroller()).to.equal(newComptroller.address);
    });
  });
});

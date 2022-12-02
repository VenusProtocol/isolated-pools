import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { AccessControlManager, Comptroller, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

async function setComptrollerTestFixture() {
  const contracts = await vTokenTestFixture();
  const newComptroller = await smock.fake<Comptroller>("Comptroller");
  return { newComptroller, ...contracts };
}

describe("VToken", function () {
  let vToken: MockContract<VTokenHarness>;
  let comptroller: FakeContract<Comptroller>;
  let newComptroller: FakeContract<Comptroller>;
  let accessControlManager: FakeContract<AccessControlManager>;
  let _root: Signer;
  let guy: Signer;

  beforeEach(async () => {
    [_root, guy] = await ethers.getSigners();
    ({ accessControlManager, comptroller, newComptroller, vToken } = await loadFixture(setComptrollerTestFixture));
    comptroller.isComptroller.returns(true);
    newComptroller.isComptroller.returns(true);
  });

  describe("setComptroller", () => {
    it("should fail if called by non-admin", async () => {
      await expect(vToken.connect(guy).setComptroller(newComptroller.address)).to.be.revertedWithCustomError(
        vToken,
        "SetComptrollerOwnerCheck",
      );
      expect(await vToken.comptroller()).to.equal(comptroller.address);
    });

    it("reverts if passed a contract that doesn't implement isComptroller", async () => {
      await expect(vToken.setComptroller(accessControlManager.address)).to.be.revertedWithoutReason();
      expect(await vToken.comptroller()).to.equal(comptroller.address);
    });

    it("reverts if passed a contract that implements isComptroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badComptroller = await smock.fake<Comptroller>("Comptroller");
      badComptroller.isComptroller.returns(false);
      await expect(vToken.setComptroller(badComptroller.address)).to.be.revertedWith("marker method returned false");
      expect(await vToken.comptroller()).to.equal(comptroller.address);
    });

    it("updates comptroller and emits log on success", async () => {
      const result = await vToken.setComptroller(newComptroller.address);

      await expect(result).to.emit(vToken, "NewComptroller").withArgs(comptroller.address, newComptroller.address);
      expect(await vToken.comptroller()).to.equal(newComptroller.address);
    });
  });
});

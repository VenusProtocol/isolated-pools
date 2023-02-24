import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { AccessControlManager, Comptroller, VTokenHarness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

async function settersTestFixture() {
  const contracts = await vTokenTestFixture();
  const newComptroller = await smock.fake<Comptroller>("Comptroller");
  return { newComptroller, ...contracts };
}

describe("VToken", function () {
  let vToken: MockContract<VTokenHarness>;
  let comptroller: FakeContract<Comptroller>;
  let newComptroller: FakeContract<Comptroller>;
  let accessControlManager: FakeContract<AccessControlManager>;
  let root: SignerWithAddress;
  let guy: SignerWithAddress;

  beforeEach(async () => {
    [root, guy] = await ethers.getSigners();
    ({ accessControlManager, comptroller, newComptroller, vToken } = await loadFixture(settersTestFixture));
    comptroller.isComptroller.returns(true);
    newComptroller.isComptroller.returns(true);
    comptroller.liquidationIncentiveMantissa.returns(parseUnits("1.1", 18));
    accessControlManager.isAllowedToCall.reset();
    accessControlManager.isAllowedToCall.returns(true);
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

  describe("setProtocolSeizeShare", () => {
    it("reverts if access control manager does not allow the call", async () => {
      accessControlManager.isAllowedToCall
        .whenCalledWith(root.address, "setProtocolSeizeShare(uint256)")
        .returns(false);
      await expect(vToken.setProtocolSeizeShare(parseUnits("0.03", 18))).to.be.revertedWithCustomError(
        vToken,
        "Unauthorized",
      );
      expect(await vToken.protocolSeizeShareMantissa()).to.equal(parseUnits("0.05", 18));
    });

    it("reverts if the provided seize share is larger than the liquidation incentive minus one", async () => {
      await expect(vToken.setProtocolSeizeShare(parseUnits("0.1000001", 18))).to.be.revertedWithCustomError(
        vToken,
        "ProtocolSeizeShareTooBig",
      );
      expect(await vToken.protocolSeizeShareMantissa()).to.equal(parseUnits("0.05", 18));
    });

    it("reverts if passed a contract that implements isComptroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badComptroller = await smock.fake<Comptroller>("Comptroller");
      badComptroller.isComptroller.returns(false);
      await expect(vToken.setComptroller(badComptroller.address)).to.be.revertedWith("marker method returned false");
      expect(await vToken.comptroller()).to.equal(comptroller.address);
    });

    it("updates protocolSeizeShare and emits an event on success", async () => {
      const oldSeizeShare = parseUnits("0.05", 18);
      const newSeizeShare = parseUnits("0.1", 18);
      const tx = await vToken.setProtocolSeizeShare(newSeizeShare);

      await expect(tx).to.emit(vToken, "NewProtocolSeizeShare").withArgs(oldSeizeShare, newSeizeShare);
      expect(await vToken.protocolSeizeShareMantissa()).to.equal(newSeizeShare);
    });
  });
});

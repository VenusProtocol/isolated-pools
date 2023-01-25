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

  beforeEach(async () => {
    [root] = await ethers.getSigners();
    ({ accessControlManager, comptroller, newComptroller, vToken } = await loadFixture(settersTestFixture));
    comptroller.isComptroller.returns(true);
    newComptroller.isComptroller.returns(true);
    comptroller.liquidationIncentiveMantissa.returns(parseUnits("1.1", 18));
    accessControlManager.isAllowedToCall.reset();
    accessControlManager.isAllowedToCall.returns(true);
  });

  describe("setProtocolSeizeShare", () => {
    it("reverts if access control manager does not allow the call", async () => {
      accessControlManager.isAllowedToCall
        .whenCalledWith(root.address, "setProtocolSeizeShare(uint256)")
        .returns(false);
      await expect(vToken.setProtocolSeizeShare(parseUnits("0.03", 18))).to.be.revertedWithCustomError(
        vToken,
        "SetProtocolSeizeShareUnauthorized",
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

    it("updates protocolSeizeShare and emits an event on success", async () => {
      const oldSeizeShare = parseUnits("0.05", 18);
      const newSeizeShare = parseUnits("0.1", 18);
      const tx = await vToken.setProtocolSeizeShare(newSeizeShare);

      await expect(tx).to.emit(vToken, "NewProtocolSeizeShare").withArgs(oldSeizeShare, newSeizeShare);
      expect(await vToken.protocolSeizeShareMantissa()).to.equal(newSeizeShare);
    });
  });
});

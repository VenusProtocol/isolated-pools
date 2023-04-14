import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  InterestRateModel,
  ProtocolShareReserve,
  Shortfall,
  VTokenHarness,
} from "../../../typechain";
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
  let interestRateModel: FakeContract<InterestRateModel>;
  let root: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async () => {
    [root, user] = await ethers.getSigners();
    ({ accessControlManager, comptroller, newComptroller, vToken, interestRateModel } = await loadFixture(
      settersTestFixture,
    ));
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

    it("updates protocolSeizeShare and emits an event on success", async () => {
      const oldSeizeShare = parseUnits("0.05", 18);
      const newSeizeShare = parseUnits("0.1", 18);
      const tx = await vToken.setProtocolSeizeShare(newSeizeShare);

      await expect(tx).to.emit(vToken, "NewProtocolSeizeShare").withArgs(oldSeizeShare, newSeizeShare);
      expect(await vToken.protocolSeizeShareMantissa()).to.equal(newSeizeShare);
    });
  });

  describe("set access control manager", () => {
    it("reverts if not an owner set access control manager", async () => {
      await expect(vToken.connect(user).setAccessControlManager(accessControlManager.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("success by admin", async () => {
      await vToken.connect(root).setAccessControlManager(accessControlManager.address);
    });
  });

  describe("set interestRateModel", () => {
    it("reverts if rejected by access control manager", async () => {
      accessControlManager.isAllowedToCall.returns(false);
      await expect(vToken.connect(user).setInterestRateModel(interestRateModel.address)).to.be.revertedWithCustomError(
        vToken,
        "Unauthorized",
      );
    });

    it("success if allowed to set interest rate model", async () => {
      await vToken.connect(root).setInterestRateModel(interestRateModel.address);
    });
  });

  describe("set reserve factor", () => {
    it("reverts if rejected by access control manager", async () => {
      accessControlManager.isAllowedToCall.returns(false);
      await expect(vToken.connect(user).setReserveFactor(convertToUnit(1, 17))).to.be.revertedWithCustomError(
        vToken,
        "Unauthorized",
      );
    });

    it("success if allowed to set setReserveFactor", async () => {
      await vToken.connect(root).setReserveFactor(convertToUnit(1, 17));
    });
  });

  describe("setProtocolShareReserve", () => {
    let protocolShareReserve: FakeContract<ProtocolShareReserve>;

    beforeEach(async () => {
      protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(vToken.connect(user).setProtocolShareReserve(protocolShareReserve.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if zero address", async () => {
      await expect(vToken.connect(root).setProtocolShareReserve(ethers.constants.AddressZero)).revertedWithCustomError(
        vToken,
        "ZeroAddressNotAllowed",
      );
    });

    it("sets protocol share reserve if called by admin", async () => {
      await vToken.connect(root).setProtocolShareReserve(protocolShareReserve.address);
    });
  });

  describe("setShortfallContract", () => {
    let shortfall: FakeContract<Shortfall>;

    beforeEach(async () => {
      shortfall = await smock.fake<Shortfall>("Shortfall");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(vToken.connect(user).setShortfallContract(shortfall.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if zero address", async () => {
      await expect(vToken.connect(root).setShortfallContract(ethers.constants.AddressZero)).revertedWithCustomError(
        vToken,
        "ZeroAddressNotAllowed",
      );
    });

    it("sets shortfall contract if called by admin", async () => {
      await vToken.connect(root).setShortfallContract(shortfall.address);
    });
  });
});

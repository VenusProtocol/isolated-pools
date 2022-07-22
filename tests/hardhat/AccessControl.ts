import { ethers } from "hardhat";
import {
  FakeContract,
  MockContract,
  MockContractFactory,
  smock,
} from "@defi-wonderland/smock";
import {
  AccessControlManager,
  AccessControlManager__factory,
} from "../../typechain";
import chai from "chai";

import { Error } from "./util/Errors";
import { assert } from "console";

chai.should(); // if you like should syntax
const { expect } = chai;
chai.use(smock.matchers);

describe("Access Control", () => {
  let accessControlFactory: MockContractFactory<AccessControlManager__factory>;
  let accessControlManager: MockContract<AccessControlManager>;

  beforeEach(async () => {
    accessControlFactory = await smock.mock<AccessControlManager__factory>(
      "AccessControlManager"
    );
    accessControlManager = await accessControlFactory.deploy();
    await accessControlManager.deployed();
  });
  describe("Permission logic", () => {
    it("should not have permissions", async () => {
      let [owenr, addr1, addr2] = await ethers.getSigners();
      await accessControlManager.giveCallPermission(
        "ExampleContract",
        "changeInterest(uint256,uint256)",
        addr1.address
      );
      await accessControlManager.giveCallPermission(
        "ExampleContract",
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );
      let canCall: boolean = await accessControlManager
        .connect(addr1)
        .isAllowedToCall(
          "ExampleContract",
          "changeCollFactor(uint256,uint256)"
        );
      expect(canCall.should.be.false);
    });

    it("should have permissions", async () => {
      let [owenr, addr1, addr2] = await ethers.getSigners();
      await accessControlManager.giveCallPermission(
        "ExampleContract",
        "changeInterest(uint256,uint256)",
        addr1.address
      );
      await accessControlManager.giveCallPermission(
        "ExampleContract",
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );
      let canCall: boolean = await accessControlManager
        .connect(addr2)
        .isAllowedToCall(
          "ExampleContract",
          "changeCollFactor(uint256,uint256)"
        );
      expect(canCall.should.be.true);
    });
  });
});

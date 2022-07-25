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

chai.should(); // if you like should syntax
const { expect } = chai;
chai.use(smock.matchers);

describe("Access Control", () => {
  let accessControlFactory: MockContractFactory<AccessControlManager__factory>;
  let accessControlManager: MockContract<AccessControlManager>;
  let addresses: any;

  beforeEach(async () => {
    accessControlFactory = await smock.mock<AccessControlManager__factory>(
      "AccessControlManager"
    );
    accessControlManager = await accessControlFactory.deploy();
    addresses = await ethers.getSigners();

    await accessControlManager.deployed();
  });
  describe("Permission logic", () => {
    // As of now deployer is the only default role admin
    // and this is set upon dpeloyment.
    it("only default admin role can give call permissions", async () => {
      let [owner, addr1, addr2] = addresses;

      await expect(
        accessControlManager
          .connect(addr1)
          .giveCallPermission(
            "ExampleContract",
            "changeCollFactor(uint256,uint256)",
            addr2.address
          )
      ).to.be.reverted;
    });

    it("should not have permissions", async () => {
      let [owner, addr1, addr2] = addresses;
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
      expect(canCall).to.be.false;
    });

    it("should have permissions", async () => {
      let [owner, addr1, addr2] = addresses;
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
      expect(canCall).to.be.true;
    });

    it("should revoke role", async () => {
      let [owner, addr1, addr2] = addresses;

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

      expect(canCall).to.be.true;

      await accessControlManager.revokeCallPermission(
        "ExampleContract",
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );

      canCall = await accessControlManager
        .connect(addr2)
        .isAllowedToCall(
          "ExampleContract",
          "changeCollFactor(uint256,uint256)"
        );

      expect(canCall).to.be.false;
    });
  });
});

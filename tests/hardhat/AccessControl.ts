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
  Comptroller,
  Comptroller__factory,
} from "../../typechain";
import chai from "chai";

const { expect } = chai;
chai.use(smock.matchers);

describe("Access Control", () => {
  let accessControlFactory: MockContractFactory<AccessControlManager__factory>;
  let accessControlManager: MockContract<AccessControlManager>;
  let comptrollerFactory: MockContractFactory<Comptroller__factory>;
  let comptroller: MockContract<Comptroller>;
  let comptroller2: MockContract<Comptroller>;
  let addresses: any;

  beforeEach(async () => {
    addresses = await ethers.getSigners();
    accessControlFactory = await smock.mock<AccessControlManager__factory>(
      "AccessControlManager"
    );
    accessControlManager = await accessControlFactory.deploy();

    comptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    comptroller = await comptrollerFactory.deploy(addresses[0].address, accessControlManager.address);
    comptroller2 = await comptrollerFactory.deploy(addresses[0].address, accessControlManager.address);
    await accessControlManager.deployed();
  });
  describe("Access Control", () => {
    // As of now deployer is the only default role admin
    // and this is set upon dpeloyment.
    it("only default admin role can give call permissions", async () => {
      let [owner, addr1, addr2] = addresses;

      await expect(
        accessControlManager
          .connect(addr1)
          .giveCallPermission(
            addr1.address,
            "changeCollFactor(uint256,uint256)",
            addr2.address
          )
      ).to.be.reverted;

      await expect(
        accessControlManager
          .connect(addr1)
          .giveCallPermission(
            ethers.constants.AddressZero,
            "changeCollFactor(uint256,uint256)",
            addr2.address
          )
      ).to.be.reverted;
    });

    it("should not have permissions", async () => {
      let [owner, addr1, addr2] = addresses;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        addr1.address
      );
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.signer)
        .isAllowedToCall(addr1.address, "changeCollFactor(uint256,uint256)");
      expect(canCall).to.be.false;
    });

    it("should have permissions", async () => {
      let [owner, addr1, addr2] = addresses;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        addr1.address
      );
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)");
      expect(canCall).to.be.true;
    });

    it("should revoke role", async () => {
      let [owner, addr1, addr2] = addresses;

      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        addr1.address
      );

      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );

      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)");

      expect(canCall).to.be.true;

      await accessControlManager.revokeCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );

      canCall = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)");

      expect(canCall).to.be.false;
    });

    it("should be able to call the function only for the given contract", async () => {
      let [owner, addr1, addr2] = addresses;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)");

      let cannotCall: boolean = await accessControlManager
        .connect(comptroller2.address)
        .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)");

      expect(canCall).to.be.true;
      expect(cannotCall).to.be.false;
    });

    it("should be able to call the function on every contract ", async () => {
      let [owner, addr1, addr2] = addresses;
      await accessControlManager.giveCallPermission(
        ethers.constants.AddressZero,
        "changeCollFactor(uint256,uint256)",
        addr2.address
      );

      expect(
        await accessControlManager
          .connect(comptroller.address)
          .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)")
      ).to.be.true;

      expect(
        await accessControlManager
          .connect(comptroller2.address)
          .isAllowedToCall(addr2.address, "changeCollFactor(uint256,uint256)")
      ).to.be.true;
    });
  });
});

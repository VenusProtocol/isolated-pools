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
import { Signer } from "ethers";

const { expect } = chai;
chai.use(smock.matchers);

describe("Access Control", () => {
  let accessControlFactory: MockContractFactory<AccessControlManager__factory>;
  let accessControlManager: MockContract<AccessControlManager>;
  let comptrollerFactory: MockContractFactory<Comptroller__factory>;
  let comptroller: MockContract<Comptroller>;
  let comptroller2: MockContract<Comptroller>;
  let signers: Signer[];

  beforeEach(async () => {
    signers = await ethers.getSigners();
    accessControlFactory = await smock.mock<AccessControlManager__factory>(
      "AccessControlManager"
    );
    accessControlManager = await accessControlFactory.deploy();

    comptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    comptroller = await comptrollerFactory.deploy(await signers[0].getAddress(), accessControlManager.address);
    comptroller2 = await comptrollerFactory.deploy(await signers[0].getAddress(), accessControlManager.address);
    await accessControlManager.deployed();
  });
  describe("Access Control", () => {
    // As of now deployer is the only default role admin
    // and this is set upon dpeloyment.
    it("only default admin role can give call permissions", async () => {
      let [owner, addr1, addr2] = signers;

      await expect(
        accessControlManager
          .connect(addr1)
          .giveCallPermission(
            await addr1.getAddress(),
            "changeCollFactor(uint256,uint256)",
            await addr2.getAddress(),
          )
      ).to.be.reverted;

      await expect(
        accessControlManager
          .connect(addr1)
          .giveCallPermission(
            ethers.constants.AddressZero,
            "changeCollFactor(uint256,uint256)",
            await addr2.getAddress()
          )
      ).to.be.reverted;
    });

    it("should not have permissions", async () => {
      let [owner, addr1, addr2] = signers;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        await addr1.getAddress()
      );
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()

      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.signer)
        .isAllowedToCall(await addr1.getAddress()
        , "changeCollFactor(uint256,uint256)");
      expect(canCall).to.be.false;
    });

    it("should have permissions", async () => {
      let [owner, addr1, addr2] = signers;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        await addr1.getAddress()
      );
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()
      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)");
      expect(canCall).to.be.true;
    });

    it("should revoke role", async () => {
      let [owner, addr1, addr2] = signers;

      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeInterest(uint256,uint256)",
        await addr1.getAddress()
      );

      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()
      );

      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)");

      expect(canCall).to.be.true;

      await accessControlManager.revokeCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()
      );

      canCall = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)");    

      expect(canCall).to.be.false;
    });

    it("should be able to call the function only for the given contract", async () => {
      let [owner, addr1, addr2] = signers;
      await accessControlManager.giveCallPermission(
        comptroller.address,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()
      );
      let canCall: boolean = await accessControlManager
        .connect(comptroller.address)
        .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)");

      let cannotCall: boolean = await accessControlManager
        .connect(comptroller2.address)
        .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)");

      expect(canCall).to.be.true;
      expect(cannotCall).to.be.false;
    });

    it("should be able to call the function on every contract ", async () => {
      let [owner, addr1, addr2] = signers;
      await accessControlManager.giveCallPermission(
        ethers.constants.AddressZero,
        "changeCollFactor(uint256,uint256)",
        await addr2.getAddress()
      );

      expect(
        await accessControlManager
          .connect(comptroller.address)
          .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)")
      ).to.be.true;

      expect(
        await accessControlManager
          .connect(comptroller2.address)
          .isAllowedToCall(await addr2.getAddress(), "changeCollFactor(uint256,uint256)")
      ).to.be.true;
    });
  });
});

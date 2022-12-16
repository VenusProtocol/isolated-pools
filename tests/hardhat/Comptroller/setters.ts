import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  RewardsDistributor,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

type ComptrollerFixture = {
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
  poolRegistry: FakeContract<PoolRegistry>;
  oracle: FakeContract<PriceOracle>;
};

const comptrollerFixture = async (): Promise<ComptrollerFixture> => {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await upgrades.deployProxy(Comptroller, [], {
    constructorArgs: [poolRegistry.address, accessControl.address],
    initializer: "initialize()",
  });
  const oracle = await smock.fake<PriceOracle>("PriceOracle");

  accessControl.isAllowedToCall.returns(true);
  await comptroller.setPriceOracle(oracle.address);
  return { accessControl, comptroller, oracle, poolRegistry };
};

describe("setters", async () => {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let accessControl: FakeContract<AccessControlManager>;
  let comptroller: MockContract<Comptroller>;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    ({ accessControl, comptroller } = await loadFixture(comptrollerFixture));
    accessControl.isAllowedToCall.reset();
    accessControl.isAllowedToCall.returns(true);
  });

  describe("setPriceOracle", async () => {
    let newPriceOracle: FakeContract<PriceOracle>;

    before(async () => {
      newPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(comptroller.connect(user).setPriceOracle(newPriceOracle.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("setCloseFactor", async () => {
    let newPriceOracle: FakeContract<PriceOracle>;

    before(async () => {
      newPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(comptroller.connect(user).setPriceOracle(newPriceOracle.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("addRewardsDistributor", async () => {
    let newRewardsDistributor: FakeContract<RewardsDistributor>;

    before(async () => {
      newRewardsDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(comptroller.connect(user).setPriceOracle(newRewardsDistributor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("setLiquidationIncentive", async () => {
    const newLiquidationIncentive = convertToUnit("1.2", 18);
    it("reverts if access control manager does not allow the call", async () => {
      accessControl.isAllowedToCall.whenCalledWith(owner.address, "setLiquidationIncentive(uint256)").returns(false);
      await expect(comptroller.setLiquidationIncentive(newLiquidationIncentive))
        .to.be.revertedWithCustomError(comptroller, "Unauthorized")
        .withArgs(owner.address, comptroller.address, "setLiquidationIncentive(uint256)");
    });
  });

  describe("setMinLiquidatableCollateral", async () => {
    const newMinLiquidatableCollateral = convertToUnit("100", 18);
    it("reverts if access control manager does not allow the call", async () => {
      accessControl.isAllowedToCall
        .whenCalledWith(owner.address, "setMinLiquidatableCollateral(uint256)")
        .returns(false);
      await expect(comptroller.setMinLiquidatableCollateral(newMinLiquidatableCollateral))
        .to.be.revertedWithCustomError(comptroller, "Unauthorized")
        .withArgs(owner.address, comptroller.address, "setMinLiquidatableCollateral(uint256)");
    });
  });
});

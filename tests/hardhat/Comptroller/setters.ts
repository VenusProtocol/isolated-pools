import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  Comptroller__factory,
  PoolRegistry,
  PriceOracle,
  RewardsDistributor,
  VToken,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

type ComptrollerFixture = {
  accessControl: FakeContract<AccessControlManager>;
  comptroller: MockContract<Comptroller>;
  poolRegistry: FakeContract<PoolRegistry>;
  oracle: FakeContract<PriceOracle>;
};

const maxLoopsLimit = 150;

const comptrollerFixture = async (): Promise<ComptrollerFixture> => {
  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const accessControl = await smock.fake<AccessControlManager>("AccessControlManager");
  const Comptroller = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await upgrades.deployProxy(Comptroller, [maxLoopsLimit, accessControl.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
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
  let OMG: FakeContract<VToken>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let oracle: FakeContract<PriceOracle>;
  let poolRegistrySigner: Signer;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    ({ accessControl, comptroller, poolRegistry, oracle } = await loadFixture(comptrollerFixture));
    accessControl.isAllowedToCall.reset();
    accessControl.isAllowedToCall.returns(true);
    OMG = await smock.fake<VToken>("VToken");
    OMG.isVToken.returns(true);
    poolRegistrySigner = await ethers.getSigner(poolRegistry.address);

    // Sending transaction cost
    await owner.sendTransaction({ to: poolRegistry.address, value: ethers.utils.parseEther("1") });
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
    const newCloseFactor = convertToUnit("0.8", 18);
    it("reverts if access control manager does not allow the call", async () => {
      accessControl.isAllowedToCall.whenCalledWith(owner.address, "setCloseFactor(uint256)").returns(false);
      await expect(comptroller.setCloseFactor(newCloseFactor))
        .to.be.revertedWithCustomError(comptroller, "Unauthorized")
        .withArgs(owner.address, comptroller.address, "setCloseFactor(uint256)");
    });
  });

  describe("addRewardsDistributor", async () => {
    let newRewardsDistributor: FakeContract<RewardsDistributor>;

    before(async () => {
      newRewardsDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(comptroller.connect(user).addRewardsDistributor(newRewardsDistributor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if re-adding same rewardDistributor", async () => {
      await comptroller.addRewardsDistributor(newRewardsDistributor.address);
      await expect(comptroller.addRewardsDistributor(newRewardsDistributor.address)).to.be.revertedWith(
        "already exists",
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

  describe("rewardDistributor", async () => {
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

  describe("SupplyAndBorrowCaps", async () => {
    it("reverts if token data is invalid", async () => {
      await expect(comptroller.setMarketSupplyCaps([], [1, 2])).to.be.revertedWith("invalid number of markets");
    });

    it("reverts if supply and token data is invalid", async () => {
      await expect(comptroller.setMarketSupplyCaps([OMG.address], [1, 2])).to.be.revertedWith(
        "invalid number of markets",
      );
    });

    it("reverts if borrow and token data is invalid", async () => {
      await expect(comptroller.setMarketBorrowCaps([OMG.address], [1, 2])).to.be.revertedWith("invalid input");
    });
  });

  describe("setCollateralFactor", async () => {
    it("reverts if market is not listed", async () => {
      await expect(comptroller.setCollateralFactor(OMG.address, convertToUnit("0.7", 18), convertToUnit("0.8", 18)))
        .to.be.revertedWithCustomError(comptroller, "MarketNotListed")
        .withArgs(OMG.address);
    });

    it("reverts if collateral factor is greater then max collateral factor", async () => {
      await comptroller.connect(poolRegistrySigner).supportMarket(OMG.address);
      await expect(
        comptroller.setCollateralFactor(OMG.address, convertToUnit("1", 18), convertToUnit("1", 18)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidCollateralFactor");
    });

    it("reverts if liquidation threshold is lower than collateral factor", async () => {
      await comptroller.connect(poolRegistrySigner).supportMarket(OMG.address);
      await expect(
        comptroller.setCollateralFactor(OMG.address, convertToUnit("0.8", 18), convertToUnit("0.7", 18)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationThreshold");
    });

    it("reverts if liquidation threshold is bigger than mantissa 1", async () => {
      await comptroller.connect(poolRegistrySigner).supportMarket(OMG.address);
      await expect(
        comptroller.setCollateralFactor(OMG.address, convertToUnit("0.7", 18), convertToUnit("1.1", 18)),
      ).to.be.revertedWithCustomError(comptroller, "InvalidLiquidationThreshold");
    });

    it("reverts if token price is zero", async () => {
      oracle.getUnderlyingPrice.returns(0);
      await comptroller.connect(poolRegistrySigner).supportMarket(OMG.address);
      await expect(comptroller.setCollateralFactor(OMG.address, convertToUnit("0.6", 18), convertToUnit("0.7", 18)))
        .to.be.revertedWithCustomError(comptroller, "PriceError")
        .withArgs(OMG.address);
    });
  });
});

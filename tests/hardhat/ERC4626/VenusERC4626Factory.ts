import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  ERC20,
  IComptroller,
  PoolRegistryInterface,
  UpgradeableBeacon,
  VToken,
  VenusERC4626,
  VenusERC4626Factory,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626Factory", () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let factory: VenusERC4626Factory;
  let beacon: UpgradeableBeacon;
  let listedAsset: FakeContract<ERC20>;
  let vToken: FakeContract<VToken>;
  let fakeVToken: FakeContract<VToken>;
  let comptroller: FakeContract<IComptroller>;
  let poolRegistry: FakeContract<PoolRegistryInterface>;
  let accessControlManager: FakeContract<AccessControlManager>;
  let rewardRecipient: string;
  let venusERC4626Impl: VenusERC4626;

  before(async () => {
    [deployer, user] = await ethers.getSigners();

    listedAsset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake("VToken");
    fakeVToken = await smock.fake("VToken");
    comptroller = await smock.fake("contracts/ERC4626/Interfaces/IComptroller.sol:IComptroller");
    poolRegistry = await smock.fake("contracts/Pool/PoolRegistryInterface.sol:PoolRegistryInterface");
    accessControlManager = await smock.fake("AccessControlManager");
    rewardRecipient = deployer.address;

    accessControlManager.isAllowedToCall.returns(true);
    comptroller.poolRegistry.returns(poolRegistry.address);

    // Mock comptroller validation
    poolRegistry.getPoolByComptroller.whenCalledWith(comptroller.address).returns({
      name: "Test Pool",
      creator: deployer.address,
      comptroller: comptroller.address, // Must match input
      blockPosted: 123456,
      timestampPosted: Math.floor(Date.now() / 1000), // Current timestamp
    });

    poolRegistry.getPoolByComptroller.whenCalledWith(constants.AddressZero).returns({
      name: "",
      creator: constants.AddressZero,
      comptroller: constants.AddressZero, // Must match input
      blockPosted: 0,
      timestampPosted: 0, // Current timestamp
    });

    // Mock vToken underlying
    vToken.underlying.returns(listedAsset.address);
    vToken.comptroller.returns(comptroller.address);
    fakeVToken.comptroller.returns(constants.AddressZero);

    const VenusERC4626 = await ethers.getContractFactory("VenusERC4626");
    venusERC4626Impl = await VenusERC4626.deploy();
    await venusERC4626Impl.deployed();

    // Deploy the factory with a mock VenusERC4626 implementation
    const Factory = await ethers.getContractFactory("VenusERC4626Factory");
    factory = await upgrades.deployProxy(
      Factory,
      [accessControlManager.address, poolRegistry.address, rewardRecipient, venusERC4626Impl.address, 10],
      {
        initializer: "initialize",
      },
    );

    await factory.deployed();

    // Fetch beacon address
    const beaconAddress = await factory.beacon();
    beacon = await ethers.getContractAt("UpgradeableBeacon", beaconAddress);
  });

  it("should initialize correctly", async () => {
    expect(await factory.poolRegistry()).to.equal(poolRegistry.address);
    expect(await factory.rewardRecipient()).to.equal(rewardRecipient);
    expect(await factory.loopsLimit()).to.equal(10);
    expect(await beacon.implementation()).to.equal(venusERC4626Impl.address);
  });

  it("should revert when trying to createERC4626 for an incorrect VToken", async () => {
    await expect(factory.createERC4626(constants.AddressZero)).to.be.revertedWithCustomError(
      factory,
      "ZeroAddressNotAllowed",
    );
  });

  it("should revert when trying to createERC4626 for an VToken with invalid comptroller", async () => {
    await expect(factory.createERC4626(fakeVToken.address)).to.be.revertedWithCustomError(
      factory,
      "VenusERC4626Factory__InvalidComptroller",
    );
  });

  it("should create a VenusERC4626 vault successfully", async () => {
    const vaultTx = await factory.createERC4626(vToken.address);
    const receipt = await vaultTx.wait();

    const event = receipt.events?.find(e => e.event === "CreateERC4626");
    const vaultAddress = event?.args?.[1];
    expect(vaultAddress).to.not.equal(constants.AddressZero);

    const vault = await ethers.getContractAt("VenusERC4626", vaultAddress);
    expect(await vault.asset()).to.equal(listedAsset.address);
  });

  it("should emit CreateERC4626 event with correct parameters", async () => {
    const tx = await factory.createERC4626(vToken.address);
    const receipt = await tx.wait();

    const event = receipt.events?.find(e => e.event === "CreateERC4626");
    const emittedVaultAddress = event?.args?.vault;

    expect(event).to.not.be.undefined;
    expect(event?.args?.vToken).to.equal(vToken.address);
    expect(emittedVaultAddress).to.not.equal(constants.AddressZero);
  });

  it("reverts if ACM denies the access", async () => {
    const newRecipient = ethers.Wallet.createRandom().address;

    accessControlManager.isAllowedToCall.whenCalledWith(user.address, "setRewardRecipient(address)").returns(false);

    await expect(factory.connect(user).setRewardRecipient(newRecipient)).to.be.revertedWithCustomError(
      factory,
      "Unauthorized",
    );
  });

  it("should allow updating the reward recipient", async () => {
    const newRecipient = ethers.Wallet.createRandom().address;

    accessControlManager.isAllowedToCall.whenCalledWith(user.address, "setRewardRecipient(address)").returns(true);

    await expect(factory.connect(user).setRewardRecipient(newRecipient))
      .to.emit(factory, "RewardRecipientUpdated")
      .withArgs(rewardRecipient, newRecipient);

    expect(await factory.rewardRecipient()).to.equal(newRecipient);
  });
});

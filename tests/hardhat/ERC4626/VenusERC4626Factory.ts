import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { ERC20, IComptroller, PoolRegistryInterface, VToken, VenusERC4626Factory } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626Factory", function () {
  let deployer: SignerWithAddress;
  let factory: VenusERC4626Factory;
  let asset: FakeContract<ERC20>;
  let fakeAsset: FakeContract<ERC20>;
  let vToken: FakeContract<VToken>;
  let comptroller: FakeContract<IComptroller>;
  let poolRegistry: FakeContract<PoolRegistryInterface>;
  let rewardRecipient: string;

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    asset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    fakeAsset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake("VToken");
    comptroller = await smock.fake("contracts/ERC4626/Interfaces/IComptroller.sol:IComptroller");
    poolRegistry = await smock.fake("contracts/Pool/PoolRegistryInterface.sol:PoolRegistryInterface");
    rewardRecipient = deployer.address;

    comptroller.poolRegistry.returns(poolRegistry.address);

    // Return vToken for the main asset
    poolRegistry.getVTokenForAsset.whenCalledWith(comptroller.address, asset.address).returns(vToken.address);

    // Return zero address for unknown assets
    poolRegistry.getVTokenForAsset
      .whenCalledWith(comptroller.address, fakeAsset.address)
      .returns(constants.AddressZero);

    // Mock comptroller to return an array of vTokens
    comptroller.getAllMarkets.returns([vToken.address]);
    vToken.underlying.returns(asset.address);

    // Deploy factory
    const Factory = await ethers.getContractFactory("VenusERC4626Factory");
    factory = await Factory.deploy(comptroller.address, rewardRecipient);
  });

  it("should deploy correctly", async function () {
    expect(await factory.COMPTROLLER()).to.equal(comptroller.address);
    expect(await factory.REWARD_RECIPIENT()).to.equal(rewardRecipient);
  });

  it("should revert if trying to createERC4626 for an asset without a VToken", async function () {
    await expect(factory.createERC4626(fakeAsset.address)).to.be.revertedWithCustomError(
      factory,
      "VenusERC4626Factory__VTokenNonexistent",
    );
  });

  it("should create a VenusERC4626 vault successfully", async function () {
    const vaultTx = await factory.createERC4626(asset.address);
    const receipt = await vaultTx.wait();

    const event = receipt.events?.find(e => e.event === "CreateERC4626");
    const vaultAddress = event?.args?.[1];
    expect(vaultAddress).to.not.equal(constants.AddressZero);
  });

  it("should compute the correct ERC4626 vault address", async function () {
    const computedAddress = await factory.computeERC4626Address(asset.address);
    expect(computedAddress).to.not.equal(constants.AddressZero);
  });
});

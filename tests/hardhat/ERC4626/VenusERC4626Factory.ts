import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { ERC20, IComptroller, VToken, VenusERC4626Factory } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626Factory", function () {
  let deployer: SignerWithAddress;
  let factory: VenusERC4626Factory;
  let asset: FakeContract<ERC20>;
  let xvs: FakeContract<ERC20>;
  let vToken: FakeContract<VToken>;
  let comptroller: FakeContract<IComptroller>;
  let vBNBAddress: string;
  let rewardRecipient: string;

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    asset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    xvs = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake("VToken");
    comptroller = await smock.fake("contracts/ERC4626/Interfaces/IComptroller.sol:IComptroller");
    vBNBAddress = constants.AddressZero;
    rewardRecipient = deployer.address;

    // Mock comptroller to return an array of vTokens
    comptroller.getAllMarkets.returns([vToken.address]);
    vToken.underlying.returns(asset.address);

    // Deploy factory
    const Factory = await ethers.getContractFactory("VenusERC4626Factory");
    factory = await Factory.deploy(comptroller.address, vBNBAddress, rewardRecipient, xvs.address);
  });

  it("should deploy correctly", async function () {
    expect(await factory.comptroller()).to.equal(comptroller.address);
    expect(await factory.vBNBAddress()).to.equal(vBNBAddress);
    expect(await factory.rewardRecipient()).to.equal(rewardRecipient);
    expect(await factory.xvs()).to.equal(xvs.address);
  });

  it("should revert if trying to createERC4626 for an asset without a VToken", async function () {
    const fakeAsset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
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

  it("should update the underlyingToVToken mapping", async function () {
    const newVToken = await smock.fake("VToken");
    newVToken.underlying.returns(asset.address);

    // Mock comptroller returning the new vToken
    comptroller.getAllMarkets.returns([vToken.address, newVToken.address]);

    await factory.updateUnderlyingToVToken([1]);

    expect(await factory.underlyingToVToken(asset.address)).to.equal(newVToken.address);
  });
});

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { AddressOne, convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  LZEndpointMock,
  LZEndpointMock__factory,
  XVS,
  XVSBridgeAdmin,
  XVSProxyOFTDest,
  XVSProxyOFTDest__factory,
  XVS__factory,
} from "../../../typechain";

describe("Bridge Admin: ", function () {
  const localChainId = 1;
  const remoteChainId = 2;
  const singleTransactionLimit = convertToUnit(10, 18);
  const maxDailyTransactionLimit = convertToUnit(100, 18);

  let LZEndpointMock: LZEndpointMock__factory,
    ProxyOFTV2Dest: XVSProxyOFTDest__factory,
    RemoteTokenFactory: XVS__factory,
    remoteEndpoint: LZEndpointMock,
    remoteOFT: XVSProxyOFTDest,
    bridgeAdmin: XVSBridgeAdmin,
    remotePath: string,
    alice: SignerWithAddress,
    deployer: SignerWithAddress,
    accessControlManager: AccessControlManager,
    remoteToken: XVS;

  async function grantPermissions() {
    let tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "setTrustedRemote(uint16,bytes)", alice.address);
    await tx.wait();

    tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "setMaxSingleTransactionLimit(uint16,uint256)", alice.address);
    await tx.wait();

    tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "setMaxDailyLimit(uint16,uint256)", alice.address);
    await tx.wait();

    tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "setMaxSingleReceiveTransactionLimit(uint16,uint256)", alice.address);
    await tx.wait();

    tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "setMaxDailyReceiveLimit(uint16,uint256)", alice.address);
    await tx.wait();

    tx = await accessControlManager
      .connect(deployer)
      .giveCallPermission(bridgeAdmin.address, "transferBridgeOwnership(address)", alice.address);
    await tx.wait();
  }

  before(async function () {
    deployer = (await ethers.getSigners())[0];
    alice = (await ethers.getSigners())[1];

    LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    ProxyOFTV2Dest = await ethers.getContractFactory("XVSProxyOFTDest");
    const accessControlManagerFactory = await ethers.getContractFactory("AccessControlManager");
    RemoteTokenFactory = await ethers.getContractFactory("XVS");

    accessControlManager = await accessControlManagerFactory.deploy();
    remoteToken = await RemoteTokenFactory.deploy(accessControlManager.address);
    remoteEndpoint = await LZEndpointMock.deploy(remoteChainId);
    remoteOFT = await ProxyOFTV2Dest.deploy(remoteToken.address, 8, remoteEndpoint.address, AddressOne);

    const bridgeAdminFactory = await ethers.getContractFactory("XVSBridgeAdmin");
    bridgeAdmin = await upgrades.deployProxy(bridgeAdminFactory, [accessControlManager.address], {
      constructorArgs: [remoteOFT.address],
      initializer: "initialize",
    });

    await bridgeAdmin.deployed();
    await remoteOFT.transferOwnership(bridgeAdmin.address);

    remotePath = ethers.utils.solidityPack(["address", "address"], [AddressOne, remoteOFT.address]);
  });

  it("Revert if EOA called owner function of bridge", async function () {
    await expect(remoteOFT.connect(deployer).setTrustedRemote(localChainId, remotePath)).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("Revert if permisssions are not granted to call owner functions of bridge", async function () {
    let data = remoteOFT.interface.encodeFunctionData("setTrustedRemote", [localChainId, remotePath]);
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.revertedWithCustomError(bridgeAdmin, "Unauthorized");

    data = remoteOFT.interface.encodeFunctionData("setMaxSingleTransactionLimit", [
      localChainId,
      singleTransactionLimit,
    ]);
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.revertedWithCustomError(bridgeAdmin, "Unauthorized");

    data = remoteOFT.interface.encodeFunctionData("setMaxDailyLimit", [localChainId, maxDailyTransactionLimit]);
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.revertedWithCustomError(bridgeAdmin, "Unauthorized");

    data = remoteOFT.interface.encodeFunctionData("setMaxSingleReceiveTransactionLimit", [
      localChainId,
      singleTransactionLimit,
    ]);
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.revertedWithCustomError(bridgeAdmin, "Unauthorized");

    data = remoteOFT.interface.encodeFunctionData("setMaxDailyReceiveLimit", [localChainId, maxDailyTransactionLimit]);
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.revertedWithCustomError(bridgeAdmin, "Unauthorized");
  });

  it("Revert if function is not found in bridge admin registry", async function () {
    const data = remoteOFT.interface.encodeFunctionData("oracle");
    await expect(
      deployer.sendTransaction({
        to: bridgeAdmin.address,
        data: data,
      }),
    ).to.be.revertedWith("Function not found");
  });

  it("Success if permisssions are granted to call owner functions of bridge", async function () {
    await grantPermissions();
    let data = remoteOFT.interface.encodeFunctionData("setTrustedRemote", [localChainId, remotePath]);
    await alice.sendTransaction({
      to: bridgeAdmin.address,
      data: data,
    });

    data = remoteOFT.interface.encodeFunctionData("setMaxSingleTransactionLimit", [
      localChainId,
      singleTransactionLimit,
    ]);
    await alice.sendTransaction({
      to: bridgeAdmin.address,
      data: data,
    });

    data = remoteOFT.interface.encodeFunctionData("setMaxDailyLimit", [localChainId, maxDailyTransactionLimit]);
    await alice.sendTransaction({
      to: bridgeAdmin.address,
      data: data,
    });

    data = remoteOFT.interface.encodeFunctionData("setMaxSingleReceiveTransactionLimit", [
      localChainId,
      singleTransactionLimit,
    ]);
    await alice.sendTransaction({
      to: bridgeAdmin.address,
      data: data,
    });

    data = remoteOFT.interface.encodeFunctionData("setMaxDailyReceiveLimit", [localChainId, maxDailyTransactionLimit]);
    await alice.sendTransaction({
      to: bridgeAdmin.address,
      data: data,
    });
  });

  it("Success on trnafer bridge owner", async function () {
    await bridgeAdmin.connect(alice).transferBridgeOwnership(alice.address);
    expect(await remoteOFT.owner()).equals(alice.address);
  });
});

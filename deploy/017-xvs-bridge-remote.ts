import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  bridgeAdminMethods,
  bridgeConfig,
  getConfig,
  xvsBridgeMethods,
  xvsTokenPermissions,
} from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";
import { XVSBridgeAdmin, XVSProxyOFTDest } from "../typechain";

interface GovernanceCommand {
  contract: string;
  signature: string;
  argTypes: string[];
  parameters: any[];
  value: BigNumberish;
}

const configureAccessControls = async (
  methods: string[],
  accessControlManagerAddress: string,
  caller: string,
  target: string,
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand[]> => {
  const commands = await Promise.all(
    methods.map(async method => {
      const callerAddress = await toAddress(caller, hre);
      const targetAddress = await toAddress(target, hre);
      return [
        {
          contract: accessControlManagerAddress,
          signature: "giveCallPermission(address,string,address)",
          argTypes: ["address", "string", "address"],
          parameters: [targetAddress, method, callerAddress],
          value: 0,
        },
      ];
    }),
  );
  return commands.flat();
};
const configureXVSTokenMintCapCommands = async (
  xvsToken: string,
  minterAddress: string,
): Promise<GovernanceCommand[]> => {
  const command = [
    {
      contract: xvsToken,
      signature: "setMintCap(address,uint256)",
      argTypes: ["address", "uint256"],
      parameters: [minterAddress, "100000000000000000000"],
      value: 0,
    },
  ];
  return command.flat();
};

const executeBridgeCommands = async (target: XVSProxyOFTDest, hre: HardhatRuntimeEnvironment, deployer: string) => {
  const signer = await ethers.getSigner(deployer);
  console.log("Executing Bridge commands");
  const methods = bridgeConfig[hre.network.name].methods;

  for (let i = 0; i < methods.length; i++) {
    const entry = methods[i];
    const { method, args } = entry;
    const data = target.interface.encodeFunctionData(method, args);
    console.log(data);
    await signer.sendTransaction({
      to: target.address,
      data: data,
    });
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploymentConfig = await getConfig(hre.network.name);
  const { preconfiguredAddresses } = deploymentConfig;

  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock, hre);

  const XVSProxyOFTDest = await deploy("XVSProxyOFTDest", {
    from: deployer,
    contract: "XVSProxyOFTDest",
    args: [preconfiguredAddresses.XVS, 8, preconfiguredAddresses.LzEndpoint, preconfiguredAddresses.ResilientOracle],
    autoMine: true,
    log: true,
  });

  const XVSBridgeAdmin = await deploy("XVSBridgeAdmin", {
    from: deployer,
    args: [XVSProxyOFTDest.address],
    contract: "XVSBridgeAdmin",
    proxy: {
      owner: proxyOwnerAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [preconfiguredAddresses.AccessControlManager],
      },
      upgradeIndex: 0,
    },
    log: true,
    autoMine: true,
  });

  const bridge = await ethers.getContractAt<XVSProxyOFTDest>("XVSProxyOFTDest", XVSProxyOFTDest.address, deployer);
  const bridgeAdmin = await ethers.getContractAt<XVSBridgeAdmin>("XVSBridgeAdmin", XVSBridgeAdmin.address, deployer);

  await executeBridgeCommands(bridge, hre, deployer);

  const removeArray = new Array(xvsBridgeMethods.length).fill(false);
  let tx = await bridgeAdmin.upsertSignature(xvsBridgeMethods, removeArray);
  await tx.wait();

  tx = await bridge.transferOwnership(XVSBridgeAdmin.address);
  await tx.wait();

  tx = await bridgeAdmin.transferOwnership(preconfiguredAddresses.NormalTimelock);
  await tx.wait();
  console.log(
    `Bridge Admin owner ${deployer} sucessfully changed to ${preconfiguredAddresses.NormalTimelock}. Please accept the ownership.`,
  );

  const commands = [
    ...(await configureAccessControls(
      xvsBridgeMethods,
      preconfiguredAddresses.AccessControlManager,
      preconfiguredAddresses.NormalTimelock,
      XVSBridgeAdmin.address,
      hre,
    )),

    ...(await configureAccessControls(
      xvsTokenPermissions,
      preconfiguredAddresses.AccessControlManager,
      XVSProxyOFTDest.address,
      preconfiguredAddresses.XVS,
      hre,
    )),

    ...(await configureAccessControls(
      ["setMintCap(address,uint256"],
      preconfiguredAddresses.AccessControlManager,
      preconfiguredAddresses.NormalTimelock,
      preconfiguredAddresses.XVS,
      hre,
    )),

    ...(await configureAccessControls(
      bridgeAdminMethods,
      preconfiguredAddresses.AccessControlManager,
      preconfiguredAddresses.NormalTimelock,
      XVSBridgeAdmin.address,
      hre,
    )),

    {
      contract: XVSBridgeAdmin.address,
      signature: "acceptOwnership()",
      parameters: [],
      value: 0,
    },

    {
      contract: XVSBridgeAdmin.address,
      signature: "setTrustedRemoteAddress(uint16,bytes)",
      parameters: [preconfiguredAddresses.LzVirtualChainIdL, "0xDestAddress"],
      value: 0,
    },

    ...(await configureXVSTokenMintCapCommands(preconfiguredAddresses.XVS, XVSProxyOFTDest.address)),
  ];
  console.log("Please propose a Multisig tx with the following commands:");
  console.log(
    JSON.stringify(
      commands.map(c => ({ target: c.contract, signature: c.signature, params: c.parameters, value: c.value })),
    ),
  );
};
func.tags = ["XVSBridgeDest"];

func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(hre.network.name === "sepolia" || hre.network.name === "ethereum");
export default func;

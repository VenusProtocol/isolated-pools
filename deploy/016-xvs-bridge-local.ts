import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { bridgeAdminMethods, bridgeConfig, getConfig, xvsBridgeMethods } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";
import { getArgTypesFromSignature } from "../helpers/utils";
import { XVSBridgeAdmin, XVSProxyOFTSrc } from "../typechain";

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

const configureBridgeCommands = async (
  target: string,
  hre: HardhatRuntimeEnvironment,
): Promise<GovernanceCommand[]> => {
  const commands = await Promise.all(
    bridgeConfig[hre.network.name].methods.map(async (entry: { method: string; args: any[] }) => {
      const { method, args } = entry;
      return {
        contract: target,
        signature: method,
        argTypes: getArgTypesFromSignature(method),
        parameters: args,
        value: 0,
      };
    }),
  );
  return commands.flat();
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploymentConfig = await getConfig(hre.network.name);
  const { preconfiguredAddresses } = deploymentConfig;

  const proxyAdmin = await ethers.getContract("DefaultProxyAdmin");
  const owner = await proxyAdmin.owner();

  const XVSProxyOFTSrc = await deploy("XVSProxyOFTSrc", {
    from: deployer,
    contract: "XVSProxyOFTSrc",
    args: [preconfiguredAddresses.XVS, 8, preconfiguredAddresses.LzEndpoint, preconfiguredAddresses.ResilientOracle],
    autoMine: true,
    log: true,
  });

  const XVSBridgeAdmin = await deploy("XVSBridgeAdmin", {
    from: deployer,
    args: [XVSProxyOFTSrc.address],
    contract: "XVSBridgeAdmin",
    proxy: {
      owner: owner,
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

  const bridge = await ethers.getContractAt<XVSProxyOFTSrc>("XVSProxyOFTSrc", XVSProxyOFTSrc.address, deployer);
  const bridgeAdmin = await ethers.getContractAt<XVSBridgeAdmin>("XVSBridgeAdmin", XVSBridgeAdmin.address, deployer);

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

    ...(await configureBridgeCommands(XVSBridgeAdmin.address, hre)),
  ];
  console.log("Please propose a VIP with the following commands:");
  console.log(
    JSON.stringify(
      commands.map(c => ({ target: c.contract, signature: c.signature, params: c.parameters, value: c.value })),
    ),
  );
};
func.tags = ["XVSBridgeSrc"];

func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet");
export default func;

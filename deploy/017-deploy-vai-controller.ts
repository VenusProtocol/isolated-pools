import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploymentConfig = await getConfig(hre.network.name);
  const { preconfiguredAddresses } = deploymentConfig;

  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );

  // VAIController Beacon
  const vaiControllerImp: DeployResult = await deploy("VAIControllerImp", {
    contract: "VAIController",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const vaiControllerBeacon: DeployResult = await deploy("VAIControllerBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [vaiControllerImp.address],
    log: true,
    autoMine: true,
  });

  const VAIController = await ethers.getContractFactory("VAIController");
  await deploy("VAIController", {
    from: deployer,
    contract: "BeaconProxy",
    args: [
      vaiControllerBeacon.address,
      VAIController.interface.encodeFunctionData("initialize", [accessControlManagerAddress]),
    ],
    log: true,
    autoMine: true,
  });
};

func.tags = ["VAIController", "il"];

export default func;

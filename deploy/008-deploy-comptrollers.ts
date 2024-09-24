import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { getUnregisteredPools, toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploymentConfig = await getConfig(hre.getNetworkName());
  const { poolConfig, preconfiguredAddresses } = deploymentConfig;
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );
  const maxLoopsLimit = 100;

  const comptrollerImpl: DeployResult = await deploy("ComptrollerImpl", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address],
    log: true,
    autoMine: true,
  });

  // Comptroller Beacon
  const comptrollerBeacon: DeployResult = await deploy("ComptrollerBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [comptrollerImpl.address],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const unregisteredPools = await getUnregisteredPools(poolConfig, hre);
  for (const pool of unregisteredPools) {
    // Deploying a proxy for Comptroller
    console.log(`Deploying a proxy for Comptroller of the pool ${pool.name}`);
    const Comptroller = await ethers.getContractFactory("Comptroller");

    await deploy(`Comptroller_${pool.id}`, {
      from: deployer,
      contract: "BeaconProxy",
      args: [
        comptrollerBeacon.address,
        Comptroller.interface.encodeFunctionData("initialize", [maxLoopsLimit, accessControlManagerAddress]),
      ],
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });
  }
};

func.tags = ["Comptrollers", "il"];

export default func;

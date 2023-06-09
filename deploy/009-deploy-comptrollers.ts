import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";

type AcmAddresses = {
  bsctestnet: string;
  bscmainnet: string;
};

const acmAddresses: AcmAddresses = {
  bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const poolRegistry = await ethers.getContract("PoolRegistry");
  let accessControlManager;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControlManager = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  } else {
    accessControlManager = await ethers.getContract("AccessControlManager");
  }
  const maxLoopsLimit = 150;

  // Comptroller Beacon
  const comptrollerImpl: DeployResult = await deploy("ComptrollerImpl", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address],
    log: true,
    autoMine: true,
  });

  const comptrollerBeacon: DeployResult = await deploy("ComptrollerBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [comptrollerImpl.address],
    log: true,
    autoMine: true,
  });

  const { poolConfig } = await getConfig(hre.network.name);
  const pools = await poolRegistry.callStatic.getAllPools();

  // If we have some pools already, assume the new ones are appended
  for (let i = pools.length; i < poolConfig.length; i++) {
    const pool = poolConfig[i];

    // Deploying a proxy for Comptroller
    console.log(`Deploying a proxy for Comptroller of the pool ${pool.name}`);
    const Comptroller = await ethers.getContractFactory("Comptroller");

    await deploy(`Comptroller_${pool.name}`, {
      from: deployer,
      contract: "BeaconProxy",
      args: [
        comptrollerBeacon.address,
        Comptroller.interface.encodeFunctionData("initialize", [maxLoopsLimit, accessControlManager.address]),
      ],
      log: true,
      autoMine: true,
    });
  }
};

func.tags = ["Comptrollers", "il"];

export default func;

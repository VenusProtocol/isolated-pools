import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

// This deploy script deploys implementations for Comptroller and/or VToken that should be updated through a VIP afterwards
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.network.name);

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const maxBorrowRateMantissa = ethers.BigNumber.from(0.0005e16);

  // Comptroller Implementation
  await deploy("ComptrollerImpl", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address],
    log: true,
    autoMine: true,
  });

  // VToken Implementation
  await deploy("VTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: [isTimeBased, blocksPerYear, maxBorrowRateMantissa],
    log: true,
    autoMine: true,
  });
};

func.tags = ["Implementations"];

export default func;

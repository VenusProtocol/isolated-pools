import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getMaxBorrowRateMantissa } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());
  const maxBorrowRateMantissa = getMaxBorrowRateMantissa(hre.network.name);

  console.log("Deploying new VToken implementation...");
  console.log("Is Time based:", isTimeBased);

  const constructorArgs = [isTimeBased, blocksPerYear, maxBorrowRateMantissa];

  const vTokenImpl = await deploy("VTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: constructorArgs,
    log: true,
    autoMine: true,
  });

  if (vTokenImpl.newlyDeployed) {
    console.log("Verifying VToken implementation...");
    try {
      await hre.run("verify:verify", {
        address: vTokenImpl.address,
        constructorArguments: constructorArgs,
      });
      console.log("VToken implementation verified successfully");
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("VToken implementation already verified");
      } else {
        console.error("Verification failed:", error.message);
      }
    }
  }

  const vTokenBeacon = await ethers.getContract("VTokenBeacon");
  const currentImpl = await vTokenBeacon.implementation();

  if (currentImpl !== vTokenImpl.address) {
    console.log(`Current implementation: ${currentImpl}`);
    console.log(`New implementation: ${vTokenImpl.address}`);
    console.log("NOTE: Call VTokenBeacon.upgradeTo() via governance to complete the upgrade");
  } else {
    console.log("VToken implementation is already up to date");
  }
};

func.tags = ["MarketUpgrade"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  const corePoolComptroller = await deployments.get("Comptroller_Core");
  const constructorArgs = [isTimeBased, blocksPerYear, corePoolComptroller.address];

  const poolLens = await deploy("PoolLens", {
    from: deployer,
    args: constructorArgs,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  if (poolLens.newlyDeployed) {
    console.log("Verifying PoolLens...");
    try {
      await hre.run("verify:verify", {
        address: poolLens.address,
        constructorArguments: constructorArgs,
      });
      console.log("PoolLens verified successfully");
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("PoolLens already verified");
      } else {
        console.error("Verification failed:", error.message);
      }
    }
  }
};

func.tags = ["PoolLens", "il"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

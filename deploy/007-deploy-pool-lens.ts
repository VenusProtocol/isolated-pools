import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.network.name);

  await deploy("PoolLens", {
    from: deployer,
    args: [isTimeBased, blocksPerYear],
    log: true,
    autoMine: true,
    // maxFeePerGas: "200000000"  // for zksync
  });
};

func.tags = ["PoolLens", "il"];

export default func;

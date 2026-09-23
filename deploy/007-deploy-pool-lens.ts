import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  // A redeploy overwrites deployments/<network>/PoolLens.json, and that record is the only one of the revision
  // still live at the old address. Archive it as PoolLensR<n>.json first, next to the source in Lens/legacy.
  await deploy("PoolLens", {
    from: deployer,
    args: [isTimeBased, blocksPerYear],
    log: true,
    autoMine: true,
  });
};

func.tags = ["PoolLens", "il"];

export default func;

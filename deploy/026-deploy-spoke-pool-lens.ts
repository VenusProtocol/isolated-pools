import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo, verifyDeployment } from "../helpers/deploymentUtils";

// Reads a spoke pool the way `PoolLens` reads a pooled one, plus the state particular to a spoke pool. Holds no
// state and takes the registry to read as a call argument, so one deployment serves every spoke pool on the network.
//
// Deployed alongside `PoolLens` rather than replacing it: this one answers about spoke pools, that one about the
// pools in the shared registry.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  // A redeploy overwrites deployments/<network>/SpokePoolLens.json, and that record is the only one of the revision
  // still live at the old address. Archive it as SpokePoolLensR<n>.json first, next to the source in Lens/legacy.
  const args = [isTimeBased, blocksPerYear];
  const spokePoolLens: DeployResult = await deploy("SpokePoolLens", {
    from: deployer,
    args,
    log: true,
    autoMine: true,
  });

  await verifyDeployment(hre, "SpokePoolLens", spokePoolLens, args);
};

func.tags = ["SpokePoolLens", "HubSpoke"];

export default func;

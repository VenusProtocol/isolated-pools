import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, sameAddress, toAddress, verifyDeployment } from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolValidator";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const manager = await toAddress("SpokePoolManager");

  const args = [manager];
  const deployment: DeployResult = await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    args,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });
  await verifyDeployment(hre, DEPLOYMENT_NAME, deployment, args);

  const validator = await ethers.getContract(DEPLOYMENT_NAME);
  const actual = await readBackAddress(() => validator.SPOKE_POOL_MANAGER(), manager);
  if (!sameAddress(actual, manager)) {
    throw new Error(`${DEPLOYMENT_NAME} SPOKE_POOL_MANAGER is ${actual}, expected ${manager}`);
  }
  console.log(`Verified ${DEPLOYMENT_NAME} SPOKE_POOL_MANAGER: ${actual}`);
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool", "HubSpoke"];
func.dependencies = ["SpokePoolManager"];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

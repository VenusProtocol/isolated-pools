import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, sameAddress, toAddress, verifyDeployment } from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolFactory";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const manager = await toAddress("SpokePoolManager");
  const comptrollerBeacon = await toAddress("SpokeComptrollerBeacon");
  const vTokenBeacon = await toAddress("SpokeVTokenBeacon");
  const protocolShareReserve = await toAddress("ProtocolShareReserve");
  const shortfall = await toAddress("SpokePoolShortfall");

  const args = [manager, comptrollerBeacon, vTokenBeacon, protocolShareReserve, shortfall];
  const deployment: DeployResult = await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    args,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });
  await verifyDeployment(hre, DEPLOYMENT_NAME, deployment, args);

  const factory = await ethers.getContract(DEPLOYMENT_NAME);
  const checks: [string, string, string][] = [
    ["SPOKE_POOL_MANAGER", await readBackAddress(() => factory.SPOKE_POOL_MANAGER(), manager), manager],
    [
      "COMPTROLLER_BEACON",
      await readBackAddress(() => factory.COMPTROLLER_BEACON(), comptrollerBeacon),
      comptrollerBeacon,
    ],
    ["VTOKEN_BEACON", await readBackAddress(() => factory.VTOKEN_BEACON(), vTokenBeacon), vTokenBeacon],
    [
      "PROTOCOL_SHARE_RESERVE",
      await readBackAddress(() => factory.PROTOCOL_SHARE_RESERVE(), protocolShareReserve),
      protocolShareReserve,
    ],
    ["SHORTFALL", await readBackAddress(() => factory.SHORTFALL(), shortfall), shortfall],
  ];
  for (const [label, actual, expected] of checks) {
    if (!sameAddress(actual, expected)) {
      throw new Error(`${DEPLOYMENT_NAME} ${label} is ${actual}, expected ${expected}`);
    }
    console.log(`Verified ${DEPLOYMENT_NAME} ${label}: ${actual}`);
  }
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool"];
func.dependencies = ["SpokePoolManager", "SpokePoolShortfall", "HubSpokeComptroller", "HubSpokeVTokenBeacon"];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

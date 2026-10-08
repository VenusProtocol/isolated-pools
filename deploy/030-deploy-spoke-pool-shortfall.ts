import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, sameAddress, toAddress, verifyProxyDeployment } from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolShortfall";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager);
  const owner = await toAddress(preconfiguredAddresses.NormalTimelock);
  const manager = await toAddress("SpokePoolManager");
  const xvs = await toAddress("XVS");

  const args = [manager, xvs];
  const proxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );
  const deployment: DeployResult = await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    args,
    proxy: {
      owner,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: { methodName: "initialize", args: [accessControlManager] },
      viaAdminContract: { name: "DefaultProxyAdmin", artifact: proxyAdmin },
      upgradeIndex: 0,
    },
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });
  await verifyProxyDeployment(hre, DEPLOYMENT_NAME, deployment, args);

  const shortfall = await ethers.getContract(DEPLOYMENT_NAME);
  const checks: [string, string, string][] = [
    ["SPOKE_POOL_MANAGER", await readBackAddress(() => shortfall.SPOKE_POOL_MANAGER(), manager), manager],
    ["XVS", await readBackAddress(() => shortfall.XVS(), xvs), xvs],
    [
      "access control manager",
      await readBackAddress(() => shortfall.accessControlManager(), accessControlManager),
      accessControlManager,
    ],
  ];
  for (const [label, actual, expected] of checks) {
    if (!sameAddress(actual, expected)) {
      throw new Error(`Refusing to transfer ownership: ${DEPLOYMENT_NAME} ${label} is ${actual}, expected ${expected}`);
    }
    console.log(`Verified ${DEPLOYMENT_NAME} ${label}: ${actual}`);
  }

  // `Ownable2Step`: this only nominates; the Normal Timelock accepts in the setup VIP
  if (sameAddress(await shortfall.owner(), owner) || sameAddress(await shortfall.pendingOwner(), owner)) {
    console.log(`${DEPLOYMENT_NAME} is already owned by, or nominated, ${owner}`);
  } else {
    await (await shortfall.transferOwnership(owner)).wait(1);
    const nominated = await readBackAddress(() => shortfall.pendingOwner(), owner);
    if (!sameAddress(nominated, owner)) {
      throw new Error(
        `${DEPLOYMENT_NAME} ${shortfall.address} still reports pendingOwner ${nominated} after ` +
          `transferOwnership(${owner}). Re-run this script once the nomination has landed.`,
      );
    }
    console.log(`${DEPLOYMENT_NAME} nominated ${nominated}`);
  }
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool"];
func.dependencies = ["SpokePoolManager"];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

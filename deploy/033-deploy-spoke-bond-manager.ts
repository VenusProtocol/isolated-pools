import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, sameAddress, toAddress, verifyProxyDeployment } from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokeBondManager";

// The XVSVault pool that stakes XVS with XVS as its reward token; `setAssetSource` checks it on chain
const XVS_POOL_IDS: Record<string, number> = { bscmainnet: 0, bsctestnet: 1 };

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager);
  const owner = await toAddress(preconfiguredAddresses.NormalTimelock);
  const manager = await toAddress("SpokePoolManager");
  const resilientOracle = await toAddress("ResilientOracle");
  const xvsPoolId = XVS_POOL_IDS[hre.getNetworkName()];
  if (xvsPoolId === undefined) {
    throw new Error(`No XVSVault pool id for XVS on ${hre.getNetworkName()}`);
  }

  const args = [manager, resilientOracle];
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

  // Account implementations, one per source type; each fixes the bond manager its clones answer to, so they are
  // deployed after the proxy. The setup VIP registers them with `setAccountImplementation`
  const implementations: [string, unknown[]][] = [
    ["BondAccount", [deployment.address]],
    ["XVSVaultBondAccount", [deployment.address, xvsPoolId]],
    ["LiquidityHubBondAccount", [deployment.address]],
  ];
  for (const [name, implementationArgs] of implementations) {
    await deploy(name, {
      from: deployer,
      args: implementationArgs,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });
  }

  const bondManager = await ethers.getContract(DEPLOYMENT_NAME);
  const checks: [string, string, string][] = [
    ["SPOKE_POOL_MANAGER", await readBackAddress(() => bondManager.SPOKE_POOL_MANAGER(), manager), manager],
    ["RESILIENT_ORACLE", await readBackAddress(() => bondManager.RESILIENT_ORACLE(), resilientOracle), resilientOracle],
    [
      "access control manager",
      await readBackAddress(() => bondManager.accessControlManager(), accessControlManager),
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
  if (sameAddress(await bondManager.owner(), owner) || sameAddress(await bondManager.pendingOwner(), owner)) {
    console.log(`${DEPLOYMENT_NAME} is already owned by, or nominated, ${owner}`);
  } else {
    await (await bondManager.transferOwnership(owner)).wait(1);
    const nominated = await readBackAddress(() => bondManager.pendingOwner(), owner);
    if (!sameAddress(nominated, owner)) {
      throw new Error(
        `${DEPLOYMENT_NAME} ${bondManager.address} still reports pendingOwner ${nominated} after ` +
          `transferOwnership(${owner}). Re-run this script once the nomination has landed.`,
      );
    }
    console.log(`${DEPLOYMENT_NAME} nominated ${nominated}`);
  }
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool", "HubSpoke"];
func.dependencies = ["SpokePoolManager"];
// The SpokePoolManager it serves exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

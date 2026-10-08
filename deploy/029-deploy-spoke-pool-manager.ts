import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import {
  readBackAddress,
  readBackUntil,
  sameAddress,
  toAddress,
  verifyProxyDeployment,
} from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolManager";

// `SpokePoolProposer`'s constructor rejects a value whose pool-creation proposal would not fit GovernorBravo's action
// limit: 12 at most with 100 actions
const MAX_POOL_MARKETS = 10;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager);
  const owner = await toAddress(preconfiguredAddresses.NormalTimelock);
  const governorBravo = await toAddress(preconfiguredAddresses.GovernorBravo);
  const xvsVault = await toAddress("XVSVaultProxy");
  const poolRegistry = await toAddress("SpokePoolRegistry");
  const resilientOracle = await toAddress("ResilientOracle");
  const deviationBoundedOracle = await toAddress("DeviationBoundedOracle");

  const args = [xvsVault, governorBravo, poolRegistry, resilientOracle, deviationBoundedOracle, MAX_POOL_MARKETS];
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

  const manager = await ethers.getContract(DEPLOYMENT_NAME);
  const checks: [string, string, string][] = [
    ["XVS_VAULT", await readBackAddress(() => manager.XVS_VAULT(), xvsVault), xvsVault],
    ["GOVERNOR_BRAVO", await readBackAddress(() => manager.GOVERNOR_BRAVO(), governorBravo), governorBravo],
    ["POOL_REGISTRY", await readBackAddress(() => manager.POOL_REGISTRY(), poolRegistry), poolRegistry],
    ["RESILIENT_ORACLE", await readBackAddress(() => manager.RESILIENT_ORACLE(), resilientOracle), resilientOracle],
    [
      "DEVIATION_BOUNDED_ORACLE",
      await readBackAddress(() => manager.DEVIATION_BOUNDED_ORACLE(), deviationBoundedOracle),
      deviationBoundedOracle,
    ],
    [
      "access control manager",
      await readBackAddress(() => manager.accessControlManager(), accessControlManager),
      accessControlManager,
    ],
  ];
  for (const [label, actual, expected] of checks) {
    if (!sameAddress(actual, expected)) {
      throw new Error(`Refusing to transfer ownership: ${DEPLOYMENT_NAME} ${label} is ${actual}, expected ${expected}`);
    }
    console.log(`Verified ${DEPLOYMENT_NAME} ${label}: ${actual}`);
  }
  const maxPoolMarkets = await readBackUntil(
    async () => (await manager.MAX_POOL_MARKETS()).toNumber(),
    value => value === MAX_POOL_MARKETS,
  );
  if (maxPoolMarkets !== MAX_POOL_MARKETS) {
    throw new Error(
      `Refusing to transfer ownership: ${DEPLOYMENT_NAME} MAX_POOL_MARKETS is ${maxPoolMarkets}, expected ` +
        `${MAX_POOL_MARKETS}`,
    );
  }
  console.log(`Verified ${DEPLOYMENT_NAME} MAX_POOL_MARKETS: ${maxPoolMarkets}`);

  // `Ownable2Step`: this only nominates; the Normal Timelock accepts in the setup VIP
  if (sameAddress(await manager.owner(), owner) || sameAddress(await manager.pendingOwner(), owner)) {
    console.log(`${DEPLOYMENT_NAME} is already owned by, or nominated, ${owner}`);
  } else {
    await (await manager.transferOwnership(owner)).wait(1);
    const nominated = await readBackAddress(() => manager.pendingOwner(), owner);
    if (!sameAddress(nominated, owner)) {
      throw new Error(
        `${DEPLOYMENT_NAME} ${manager.address} still reports pendingOwner ${nominated} after ` +
          `transferOwnership(${owner}). Re-run this script once the nomination has landed.`,
      );
    }
    console.log(`${DEPLOYMENT_NAME} nominated ${nominated}`);
  }
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool"];
func.dependencies = ["SpokePoolRegistry"];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import {
  readBackAddress,
  sameAddress,
  toAddress,
  verifyDeployment,
  verifyProxyDeployment,
} from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolManager";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager);
  const owner = await toAddress(preconfiguredAddresses.NormalTimelock);
  const resilientOracle = await toAddress("ResilientOracle");
  const riskOracle = await toAddress(preconfiguredAddresses.RiskOracle);
  const riskStewardReceiver = await toAddress(preconfiguredAddresses.RiskStewardReceiver);
  const policyRegistry = await toAddress("SpokePoolPolicyRegistry");

  // The manager reads its RiskOracle from the receiver; the configured one is only checked against it below
  const args = [resilientOracle, riskStewardReceiver, policyRegistry];
  const proxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );
  // The manager's linked libraries: the request checks, and the VIP builds and risk updates
  const libraries: Record<string, string> = {};
  for (const name of ["SpokePoolValidationLib", "SpokePoolGovernanceLib"]) {
    const library = await deploy(name, {
      from: deployer,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });
    await verifyDeployment(hre, name, library, []);
    libraries[name] = library.address;
  }

  const deployment: DeployResult = await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    args,
    libraries,
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
    ["RESILIENT_ORACLE", await readBackAddress(() => manager.RESILIENT_ORACLE(), resilientOracle), resilientOracle],
    ["RISK_ORACLE", await readBackAddress(() => manager.RISK_ORACLE(), riskOracle), riskOracle],
    [
      "RISK_STEWARD_RECEIVER",
      await readBackAddress(() => manager.RISK_STEWARD_RECEIVER(), riskStewardReceiver),
      riskStewardReceiver,
    ],
    ["POLICY_REGISTRY", await readBackAddress(() => manager.POLICY_REGISTRY(), policyRegistry), policyRegistry],
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

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool", "HubSpoke"];
func.dependencies = ["SpokePoolPolicyRegistry"];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

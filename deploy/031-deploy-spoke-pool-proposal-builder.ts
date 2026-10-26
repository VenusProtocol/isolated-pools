import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { readBackAddress, readBackUntil, sameAddress, toAddress, verifyDeployment } from "../helpers/deploymentUtils";

const DEPLOYMENT_NAME = "SpokePoolProposalBuilder";

// The constructor rejects a value whose pool-creation VIP would not fit GovernorBravo's action limit: 12 at most with
// 100 actions
const MAX_POOL_MARKETS = 10;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  // The Hub's `AdapterSpokeV1`, deployed from venus-liquidity-hub
  if (!preconfiguredAddresses.SpokeAdapter) {
    throw new Error(
      `Set preconfiguredAddresses.SpokeAdapter for ${hre.getNetworkName()} before deploying ${DEPLOYMENT_NAME}`,
    );
  }
  const manager = await toAddress("SpokePoolManager");
  const governorBravo = await toAddress(preconfiguredAddresses.GovernorBravo);
  const poolRegistry = await toAddress("SpokePoolRegistry");
  const deviationBoundedOracle = await toAddress("DeviationBoundedOracle");
  const spokeAdapter = await toAddress(preconfiguredAddresses.SpokeAdapter);
  const comptrollerBeacon = await toAddress("SpokeComptrollerBeacon");
  const vTokenBeacon = await toAddress("SpokeVTokenBeacon");
  const protocolShareReserve = await toAddress("ProtocolShareReserve");
  const shortfall = await toAddress("SpokePoolShortfall");

  const args = [
    manager,
    governorBravo,
    poolRegistry,
    deviationBoundedOracle,
    spokeAdapter,
    comptrollerBeacon,
    vTokenBeacon,
    protocolShareReserve,
    shortfall,
    MAX_POOL_MARKETS,
  ];
  const deployment: DeployResult = await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    args,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });
  await verifyDeployment(hre, DEPLOYMENT_NAME, deployment, args);

  const builder = await ethers.getContract(DEPLOYMENT_NAME);
  const checks: [string, string, string][] = [
    ["SPOKE_POOL_MANAGER", await readBackAddress(() => builder.SPOKE_POOL_MANAGER(), manager), manager],
    ["GOVERNOR_BRAVO", await readBackAddress(() => builder.GOVERNOR_BRAVO(), governorBravo), governorBravo],
    ["POOL_REGISTRY", await readBackAddress(() => builder.POOL_REGISTRY(), poolRegistry), poolRegistry],
    [
      "DEVIATION_BOUNDED_ORACLE",
      await readBackAddress(() => builder.DEVIATION_BOUNDED_ORACLE(), deviationBoundedOracle),
      deviationBoundedOracle,
    ],
    ["SPOKE_ADAPTER", await readBackAddress(() => builder.SPOKE_ADAPTER(), spokeAdapter), spokeAdapter],
    [
      "COMPTROLLER_BEACON",
      await readBackAddress(() => builder.COMPTROLLER_BEACON(), comptrollerBeacon),
      comptrollerBeacon,
    ],
    ["VTOKEN_BEACON", await readBackAddress(() => builder.VTOKEN_BEACON(), vTokenBeacon), vTokenBeacon],
    [
      "PROTOCOL_SHARE_RESERVE",
      await readBackAddress(() => builder.PROTOCOL_SHARE_RESERVE(), protocolShareReserve),
      protocolShareReserve,
    ],
    ["SHORTFALL", await readBackAddress(() => builder.SHORTFALL(), shortfall), shortfall],
  ];
  for (const [label, actual, expected] of checks) {
    if (!sameAddress(actual, expected)) {
      throw new Error(`${DEPLOYMENT_NAME} ${label} is ${actual}, expected ${expected}`);
    }
    console.log(`Verified ${DEPLOYMENT_NAME} ${label}: ${actual}`);
  }
  const maxPoolMarkets = await readBackUntil(
    async () => (await builder.MAX_POOL_MARKETS()).toNumber(),
    value => value === MAX_POOL_MARKETS,
  );
  if (maxPoolMarkets !== MAX_POOL_MARKETS) {
    throw new Error(`${DEPLOYMENT_NAME} MAX_POOL_MARKETS is ${maxPoolMarkets}, expected ${MAX_POOL_MARKETS}`);
  }
  console.log(`Verified ${DEPLOYMENT_NAME} MAX_POOL_MARKETS: ${maxPoolMarkets}`);
};

func.tags = [DEPLOYMENT_NAME, "OpenSpokePool", "HubSpoke"];
func.dependencies = [
  "SpokePoolRegistry",
  "SpokePoolManager",
  "SpokePoolShortfall",
  "HubSpokeComptroller",
  "HubSpokeVTokenBeacon",
];
// GovernorBravo exists on the BSC networks only
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(await getConfig(hre.getNetworkName())).preconfiguredAddresses.GovernorBravo;

export default func;

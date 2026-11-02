import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import {
  deployUnlessOnlyMetadataChanged,
  getProxyBeacon,
  readBackAddress,
  readBackUntil,
  sameAddress,
  toAddress,
  verifyDeployment,
} from "../helpers/deploymentUtils";
import { getSpokeMaxLoopsLimit, getSpokePoolConfigs } from "../helpers/spokeDeploymentConfig";

// Deployed by `024-deploy-spoke-pool-registry.ts`, which explains why this pool does not share the isolated-pools one.
const POOL_REGISTRY_NAME = "SpokePoolRegistry";

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- predates the complexity gates, tracked for refactor
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = hre.getNetworkName();
  const { preconfiguredAddresses } = await getConfig(networkName);
  const expectedMaxLoopsLimit = getSpokeMaxLoopsLimit(networkName);

  // One `Comptroller_<id>` proxy per pool in `helpers/spokeDeploymentConfig.ts`, all behind the beacon below. The pools
  // stay out of `deploymentConfig.ts`'s `poolConfig`, which the standard scripts deploy behind the shared
  // `ComptrollerBeacon`.
  const poolIds = getSpokePoolConfigs(networkName).map(({ id }) => id);
  if (poolIds.length === 0) {
    console.log(`No spoke pool configured for ${networkName}, deploying the implementation and beacon only`);
  }

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager || "AccessControlManager");
  const ownerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");
  if (sameAddress(ownerAddress, deployer)) {
    console.log(
      `WARNING: no NormalTimelock configured, the spoke pools will be left owned by the deployer ${deployer}`,
    );
  }

  // The pool registry is baked into the implementation as an immutable, so a wrong value cannot be fixed by any setter,
  // only by redeploying the implementation and re-pointing the beacon. Read it back before using it, and refuse the
  // isolated-pools registry outright: these pools have to stay out of the directory every existing consumer iterates.
  const poolRegistry = await ethers.getContract(POOL_REGISTRY_NAME);
  const isolatedPoolRegistry = await deployments.getOrNull("PoolRegistry");
  if (isolatedPoolRegistry && sameAddress(poolRegistry.address, isolatedPoolRegistry.address)) {
    throw new Error(
      `${POOL_REGISTRY_NAME} resolved to the isolated-pools PoolRegistry at ${isolatedPoolRegistry.address}. The ` +
        `spoke pools need a registry of their own; run 024-deploy-spoke-pool-registry.ts first.`,
    );
  }
  console.log(`Spoke implementation will be constructed with ${POOL_REGISTRY_NAME} ${poolRegistry.address}`);

  // The implementation is the one deployment here without `skipIfAlreadyDeployed`: that flag returns the recorded
  // address without comparing anything, which would hide a source change from the checks below. The implementation is
  // redeployed when its code or constructor argument changes, and reused when only the metadata hash differs. The
  // beacon and the proxies keep the flag: their constructor arguments carry the implementation address, and comparing
  // those would build a second beacon and orphan the pools.
  const implArgs = [poolRegistry.address];
  const spokeComptrollerImpl: DeployResult = await deployUnlessOnlyMetadataChanged(hre, "SpokeComptrollerImpl", {
    contract: "SpokeComptroller",
    from: deployer,
    args: implArgs,
    log: true,
    autoMine: true,
  });
  // Submitted here rather than at the end, because the checks below can stop the run and by the next run this
  // implementation is no longer newly deployed, which is what `verifyDeployment` keys off.
  await verifyDeployment(hre, "SpokeComptrollerImpl", spokeComptrollerImpl, implArgs);

  // A beacon of its own, never the shared `ComptrollerBeacon`. Sharing it would put every other pool in this repo on
  // the spoke implementation the moment either side is upgraded.
  const beaconArgs = [spokeComptrollerImpl.address];
  const spokeComptrollerBeacon: DeployResult = await deploy("SpokeComptrollerBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: beaconArgs,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  // Read the wiring back from the chain before handing anything over. While the deployer still owns the beacon a
  // mistake here costs one `upgradeTo`; once the Timelock owns it, the same fix needs a VIP.
  const beacon = await ethers.getContractAt("UpgradeableBeacon", spokeComptrollerBeacon.address);

  // Checked on its own, because it is the one mismatch with a recovery procedure rather than a redeployment: a fresh
  // implementation from the step above leaves the beacon behind until something points it forward.
  const beaconImplementation = await readBackAddress(() => beacon.implementation(), spokeComptrollerImpl.address);
  if (!sameAddress(beaconImplementation, spokeComptrollerImpl.address)) {
    throw new Error(
      `Beacon ${spokeComptrollerBeacon.address} still points at ${beaconImplementation}, while this run produced ` +
        `implementation ${spokeComptrollerImpl.address}. Point the beacon forward with upgradeTo, through a VIP if ` +
        `governance already owns it, then re-run this script to verify.`,
    );
  }
  console.log(`Verified beacon implementation: ${beaconImplementation}`);

  const SpokeComptroller = await ethers.getContractFactory("SpokeComptroller");
  const proxyArgs = [
    spokeComptrollerBeacon.address,
    SpokeComptroller.interface.encodeFunctionData("initialize", [expectedMaxLoopsLimit, accessControlManager]),
  ];

  // Every pool is deployed and read back before anything is handed over, so a wrong proxy stops the run while the
  // deployer still owns the beacon.
  const pools: { name: string; proxy: DeployResult }[] = [];
  for (const poolId of poolIds) {
    const name = `Comptroller_${poolId}`;
    const proxy: DeployResult = await deploy(name, {
      contract: "BeaconProxy",
      from: deployer,
      args: proxyArgs,
      log: true,
      autoMine: true,
      skipIfAlreadyDeployed: true,
    });
    const comptroller = await ethers.getContractAt("SpokeComptroller", proxy.address);

    const addressChecks: [string, string, string][] = [
      // `skipIfAlreadyDeployed` hands back the recorded proxy without comparing its constructor arguments. The beacon
      // it actually follows decides which implementation the pool runs, and which beacon an upgrade VIP has to target.
      [
        "comptroller beacon (SpokeComptrollerBeacon)",
        await readBackAddress(() => getProxyBeacon(proxy.address), spokeComptrollerBeacon.address),
        spokeComptrollerBeacon.address,
      ],
      [
        `comptroller pool registry (${POOL_REGISTRY_NAME})`,
        await readBackAddress(() => comptroller.poolRegistry(), poolRegistry.address),
        poolRegistry.address,
      ],
      [
        "comptroller access control manager",
        await readBackAddress(() => comptroller.accessControlManager(), accessControlManager),
        accessControlManager,
      ],
    ];
    for (const [label, actual, expected] of addressChecks) {
      if (!sameAddress(actual, expected)) {
        throw new Error(`Refusing to transfer ownership: ${label} of ${name} is ${actual}, expected ${expected}`);
      }
      console.log(`Verified ${name} ${label}: ${actual}`);
    }

    const maxLoopsLimit = await readBackUntil(
      async () => (await comptroller.maxLoopsLimit()).toString(),
      value => value === expectedMaxLoopsLimit.toString(),
    );
    if (maxLoopsLimit !== expectedMaxLoopsLimit.toString()) {
      throw new Error(
        `Refusing to transfer ownership: comptroller max loops limit of ${name} is ${maxLoopsLimit}, expected ` +
          `${expectedMaxLoopsLimit}`,
      );
    }
    console.log(`Verified ${name} max loops limit: ${maxLoopsLimit}`);

    pools.push({ name, proxy });
  }

  // `UpgradeableBeacon` is plain `Ownable`, so this hands over within this transaction.
  if (sameAddress(await beacon.owner(), ownerAddress)) {
    console.log(`SpokeComptrollerBeacon is already owned by ${ownerAddress}`);
  } else {
    await (await beacon.transferOwnership(ownerAddress)).wait(1);
    const beaconOwner = await readBackAddress(() => beacon.owner(), ownerAddress);
    if (!sameAddress(beaconOwner, ownerAddress)) {
      throw new Error(
        `SpokeComptrollerBeacon ${spokeComptrollerBeacon.address} still reports owner ${beaconOwner} after ` +
          `transferOwnership(${ownerAddress}). Re-run this script once the transfer has landed.`,
      );
    }
    console.log(`SpokeComptrollerBeacon ownership transferred to ${beaconOwner}`);
  }

  // Each comptroller is `Ownable2Step`, so this only nominates. The deployer stays the live owner until the pool's
  // listing VIP calls `acceptOwnership`, which is why that call has to come first in the VIP, before any owner-gated
  // setter.
  for (const { name, proxy } of pools) {
    const comptroller = await ethers.getContractAt("SpokeComptroller", proxy.address);
    if (sameAddress(await comptroller.owner(), ownerAddress)) {
      console.log(`${name} is already owned by ${ownerAddress}`);
    } else if (sameAddress(await comptroller.pendingOwner(), ownerAddress)) {
      console.log(`${name} already nominated ${ownerAddress}, awaiting acceptOwnership in the VIP`);
    } else {
      await (await comptroller.transferOwnership(ownerAddress)).wait(1);
      const nominated = await readBackAddress(() => comptroller.pendingOwner(), ownerAddress);
      if (!sameAddress(nominated, ownerAddress)) {
        throw new Error(
          `${name} ${proxy.address} still reports pendingOwner ${nominated} after ` +
            `transferOwnership(${ownerAddress}). Re-run this script once the nomination has landed.`,
        );
      }
      console.log(`${name} nominated ${nominated}; ${deployer} stays the owner until the VIP calls acceptOwnership`);
    }
  }

  await verifyDeployment(hre, "SpokeComptrollerBeacon", spokeComptrollerBeacon, beaconArgs);
  for (const { name, proxy } of pools) {
    await verifyDeployment(hre, name, proxy, proxyArgs);
  }

  // Everything else a pool needs is governance-owned and belongs in its listing VIP, in this order: accept ownership of
  // the comptroller (and, for the first pool on a chain, of the spoke pool registry), grant the ACM roles both of them
  // need (listed in 024-deploy-spoke-pool-registry.ts, and they go in both directions), `setPriceOracle` and
  // `setDeviationBoundedOracle` (the latter is dereferenced without a zero check, so borrow and redeem fail closed
  // until it is set), then `SpokePoolRegistry.addPool`, which requires a nonzero oracle, and only then the markets.
};

func.tags = ["HubSpokeComptroller", "HubSpoke"];
// Tag-selected runs (`--tags HubSpokeComptroller`, and the fork suite's fixture) skip everything not tagged, so the
// registry has to be named as a dependency rather than left to the file ordering a full run relies on.
func.dependencies = [POOL_REGISTRY_NAME, "AccessControl"];

export default func;

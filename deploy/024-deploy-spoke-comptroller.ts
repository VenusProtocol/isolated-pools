import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

// Identifies the spoke pool in the artifact names below. Deliberately not read from `poolConfig`: the standard scripts
// iterate that list and would deploy this pool behind the shared `ComptrollerBeacon`, claiming these names first.
const POOL_ID = "HubSpoke";

const MAX_LOOPS_LIMIT = 100;

// Addresses reach this script in three casings: the `@venusprotocol/*-deployments` packages record some of them
// all-lowercase, hardhat-deploy records its own checksummed, and everything read back from the chain is checksummed by
// ethers. Comparing them as strings therefore rejects addresses that are equal. On bscmainnet the governance package
// records the access control manager lowercase, so the check below refused the very address the proxy had just been
// initialized with, and the run stopped before either ownership handover. Compare parsed addresses, never the strings.
const sameAddress = (a: string, b: string): boolean => ethers.utils.getAddress(a) === ethers.utils.getAddress(b);

// Verification is best effort: it reaches an external explorer API, so a failure here must not abort a deployment that
// already succeeded on chain. Re-run the script to retry.
const verify = async (
  hre: HardhatRuntimeEnvironment,
  name: string,
  deployment: DeployResult,
  constructorArguments: unknown[],
) => {
  if (!hre.network.live || !deployment.newlyDeployed) {
    return;
  }

  console.log(`Verifying ${name}...`);
  try {
    await hre.run("verify:verify", { address: deployment.address, constructorArguments });
    console.log(`${name} verified successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Already Verified")) {
      console.log(`${name} already verified`);
    } else {
      console.error(`${name} verification failed: ${message}`);
    }
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager || "AccessControlManager");
  const ownerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");
  if (sameAddress(ownerAddress, deployer)) {
    console.log(`WARNING: no NormalTimelock configured, the spoke pool will be left owned by the deployer ${deployer}`);
  }

  // The pool registry is baked into the implementation as an immutable, so a wrong value cannot be fixed by any setter,
  // only by redeploying the implementation and re-pointing the beacon. Read it back before using it.
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const registeredPoolCount = (await poolRegistry.getAllPools()).length;
  console.log(
    `Spoke implementation will be constructed with PoolRegistry ${poolRegistry.address} ` +
      `(currently holds ${registeredPoolCount} pool(s))`,
  );

  // The implementation is the one deployment here that does not set `skipIfAlreadyDeployed`. That flag makes
  // hardhat-deploy return the recorded address before it compares anything, so a re-run after a source change would
  // hand back the old implementation and the checks below would compare stale state against itself and report success.
  // Left off, hardhat-deploy compares the original creation transaction and redeploys only when the bytecode or the
  // constructor argument actually changed. The beacon and the proxy keep the flag, because their constructor arguments
  // carry the implementation address and comparing those would build a second beacon and orphan the pool.
  const implArgs = [poolRegistry.address];
  const spokeComptrollerImpl: DeployResult = await deploy("SpokeComptrollerImpl", {
    contract: "SpokeComptroller",
    from: deployer,
    args: implArgs,
    log: true,
    autoMine: true,
  });
  // Submitted here rather than at the end, because the checks below can stop the run and by the next run this
  // implementation is no longer newly deployed, which is what `verify` keys off.
  await verify(hre, "SpokeComptrollerImpl", spokeComptrollerImpl, implArgs);

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

  const SpokeComptroller = await ethers.getContractFactory("SpokeComptroller");
  const proxyArgs = [
    spokeComptrollerBeacon.address,
    SpokeComptroller.interface.encodeFunctionData("initialize", [MAX_LOOPS_LIMIT, accessControlManager]),
  ];
  const comptrollerProxy: DeployResult = await deploy(`Comptroller_${POOL_ID}`, {
    contract: "BeaconProxy",
    from: deployer,
    args: proxyArgs,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  // Read the wiring back from the chain before handing anything over. While the deployer still owns the beacon a
  // mistake here costs one `upgradeTo`; once the Timelock owns it, the same fix needs a VIP.
  const beacon = await ethers.getContractAt("UpgradeableBeacon", spokeComptrollerBeacon.address);
  const comptroller = await ethers.getContractAt("SpokeComptroller", comptrollerProxy.address);

  // Checked on its own, because it is the one mismatch with a recovery procedure rather than a redeployment: a fresh
  // implementation from the step above leaves the beacon behind until something points it forward.
  const beaconImplementation = await beacon.implementation();
  if (!sameAddress(beaconImplementation, spokeComptrollerImpl.address)) {
    throw new Error(
      `Beacon ${spokeComptrollerBeacon.address} still points at ${beaconImplementation}, while this run produced ` +
        `implementation ${spokeComptrollerImpl.address}. Point the beacon forward with upgradeTo, through a VIP if ` +
        `governance already owns it, then re-run this script to verify.`,
    );
  }
  console.log(`Verified beacon implementation: ${beaconImplementation}`);

  const addressChecks: [string, string, string][] = [
    ["comptroller pool registry", await comptroller.poolRegistry(), poolRegistry.address],
    ["comptroller access control manager", await comptroller.accessControlManager(), accessControlManager],
  ];
  for (const [label, actual, expected] of addressChecks) {
    if (!sameAddress(actual, expected)) {
      throw new Error(`Refusing to transfer ownership: ${label} is ${actual}, expected ${expected}`);
    }
    console.log(`Verified ${label}: ${actual}`);
  }

  const maxLoopsLimit = (await comptroller.maxLoopsLimit()).toString();
  if (maxLoopsLimit !== MAX_LOOPS_LIMIT.toString()) {
    throw new Error(
      `Refusing to transfer ownership: comptroller max loops limit is ${maxLoopsLimit}, expected ${MAX_LOOPS_LIMIT}`,
    );
  }
  console.log(`Verified comptroller max loops limit: ${maxLoopsLimit}`);

  // `UpgradeableBeacon` is plain `Ownable`, so this hands over within this transaction.
  if (sameAddress(await beacon.owner(), ownerAddress)) {
    console.log(`SpokeComptrollerBeacon is already owned by ${ownerAddress}`);
  } else {
    await (await beacon.transferOwnership(ownerAddress)).wait(1);
    console.log(`SpokeComptrollerBeacon ownership transferred to ${await beacon.owner()}`);
  }

  // The comptroller is `Ownable2Step`, so this only nominates. The deployer stays the live owner until the listing VIP
  // calls `acceptOwnership`, which is why that call has to come first in the VIP, before any owner-gated setter.
  if (sameAddress(await comptroller.owner(), ownerAddress)) {
    console.log(`Comptroller_${POOL_ID} is already owned by ${ownerAddress}`);
  } else if (sameAddress(await comptroller.pendingOwner(), ownerAddress)) {
    console.log(`Comptroller_${POOL_ID} already nominated ${ownerAddress}, awaiting acceptOwnership in the VIP`);
  } else {
    await (await comptroller.transferOwnership(ownerAddress)).wait(1);
    console.log(
      `Comptroller_${POOL_ID} nominated ${await comptroller.pendingOwner()}; ${deployer} stays the owner until the ` +
        `VIP calls acceptOwnership`,
    );
  }

  await verify(hre, "SpokeComptrollerBeacon", spokeComptrollerBeacon, beaconArgs);
  await verify(hre, `Comptroller_${POOL_ID}`, comptrollerProxy, proxyArgs);

  // Everything else this pool needs is governance-owned and belongs in the listing VIP, in this order: accept the
  // comptroller ownership, `setPriceOracle` and `setDeviationBoundedOracle` (the latter is dereferenced without a zero
  // check, so borrow and redeem fail closed until it is set), then `PoolRegistry.addPool`, which requires a nonzero
  // oracle, and only then the markets.
};

func.tags = ["HubSpokeComptroller", "HubSpoke"];

export default func;

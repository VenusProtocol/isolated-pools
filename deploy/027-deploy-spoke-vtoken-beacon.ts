import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getMaxBorrowRateMantissa } from "../helpers/deploymentConfig";
import {
  getBlockOrTimestampBasedDeploymentInfo,
  sameAddress,
  toAddress,
  verifyDeployment,
} from "../helpers/deploymentUtils";

// A VToken beacon of its own, never the shared `VTokenBeacon`. `UpgradeableBeacon.upgradeTo` moves every proxy behind
// the beacon in one call, so a spoke market sharing that beacon could only take a VToken change that every isolated
// market on the chain takes at the same time, and the other way round. The implementation deployed here is the same
// `VToken` with the same constructor arguments as the one the shared beacon points at, so the two behave identically
// until an upgrade deliberately separates them.
//
// The markets are not deployed here. Each is a `BeaconProxy` pointed at `SpokeVTokenBeacon`, created and registered by
// the listing VIP after `SpokePoolRegistry.addPool`.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());
  const maxBorrowRateMantissa = getMaxBorrowRateMantissa(hre.network.name);

  const ownerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");
  if (sameAddress(ownerAddress, deployer)) {
    console.log(`WARNING: no NormalTimelock configured, SpokeVTokenBeacon will be left owned by ${deployer}`);
  }

  // As in 025-deploy-spoke-comptroller.ts, the implementation is the one deployment here that does not set
  // `skipIfAlreadyDeployed`: that flag returns the recorded address before comparing anything, so a re-run after a
  // source change would hand back the old implementation and the check below would compare stale state against itself.
  // The beacon keeps the flag, because its constructor argument carries the implementation address and comparing that
  // would build a second beacon and orphan the markets already behind the first.
  const implArgs = [isTimeBased, blocksPerYear, maxBorrowRateMantissa];
  const spokeVTokenImpl: DeployResult = await deploy("SpokeVTokenImpl", {
    contract: "VToken",
    from: deployer,
    args: implArgs,
    log: true,
    autoMine: true,
  });
  // Submitted here rather than at the end, because the check below can stop the run and by the next run this
  // implementation is no longer newly deployed, which is what `verifyDeployment` keys off.
  await verifyDeployment(hre, "SpokeVTokenImpl", spokeVTokenImpl, implArgs);

  const beaconArgs = [spokeVTokenImpl.address];
  const spokeVTokenBeacon: DeployResult = await deploy("SpokeVTokenBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: beaconArgs,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  // Read the wiring back from the chain before handing the beacon over. While the deployer still owns it a mistake
  // costs one `upgradeTo`; once the Timelock owns it, the same fix needs a VIP.
  const beacon = await ethers.getContractAt("UpgradeableBeacon", spokeVTokenBeacon.address);
  const beaconImplementation = await beacon.implementation();
  if (!sameAddress(beaconImplementation, spokeVTokenImpl.address)) {
    throw new Error(
      `Beacon ${spokeVTokenBeacon.address} still points at ${beaconImplementation}, while this run produced ` +
        `implementation ${spokeVTokenImpl.address}. Point the beacon forward with upgradeTo, through a VIP if ` +
        `governance already owns it, then re-run this script to verify.`,
    );
  }
  console.log(`Verified beacon implementation: ${beaconImplementation}`);

  // `UpgradeableBeacon` is plain `Ownable`, so this hands over within this transaction.
  if (sameAddress(await beacon.owner(), ownerAddress)) {
    console.log(`SpokeVTokenBeacon is already owned by ${ownerAddress}`);
  } else {
    await (await beacon.transferOwnership(ownerAddress)).wait(1);
    console.log(`SpokeVTokenBeacon ownership transferred to ${await beacon.owner()}`);
  }

  await verifyDeployment(hre, "SpokeVTokenBeacon", spokeVTokenBeacon, beaconArgs);
};

func.tags = ["HubSpokeVTokenBeacon", "HubSpoke"];

export default func;

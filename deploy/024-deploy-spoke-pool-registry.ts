import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { sameAddress, toAddress } from "../helpers/deploymentUtils";

// A registry of its own, never the isolated-pools `PoolRegistry`. The registry is the directory every consumer reads to
// answer "which pools exist": `getAllPools` drives the indexer, the frontend pool list and the risk tooling, and
// `getVTokenForAsset` is what ProtocolShareReserve uses as a membership check. Registering a hub-funded spoke pool in
// the isolated-pools directory would hand all of them a pool whose supply, borrow and liquidation sides are restricted
// to known accounts, and every one of those consumers would then need a special case keyed on this pool's address.
// A separate registry gives them that separation for free, and keeps the two products independently upgradeable and
// independently permissioned: ACM roles are `keccak256(contractAddress, roleString)`, so a grant on this registry
// cannot reach the isolated pools, and a grant on theirs cannot reach this pool.
const DEPLOYMENT_NAME = "SpokePoolRegistry";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const accessControlManager = await toAddress(preconfiguredAddresses.AccessControlManager || "AccessControlManager");
  const ownerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");
  if (sameAddress(ownerAddress, deployer)) {
    console.log(`WARNING: no NormalTimelock configured, ${DEPLOYMENT_NAME} will be left owned by ${deployer}`);
  }

  // The reason for this is that the contracts `OptimizedTransparentUpgradeableProxy` and `DefaultProxyAdmin` that the
  // hardhat-deploy plugin fetches from the artifact is not zk compatible causing the deployments to fail. So we bought
  // it one level up to our repo, added them to compile using zksync compiler. It is compatible for all networks.
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  // `viaAdminContract` resolves the chain's existing `DefaultProxyAdmin` when there is one, and only deploys a fresh
  // admin on a chain that has none. Reusing it is deliberate: it is the admin the isolated pools already upgrade
  // through, it is owned by governance, and a second admin would be one more contract with its own ownership to track.
  await deploy(DEPLOYMENT_NAME, {
    from: deployer,
    contract: "PoolRegistry",
    proxy: {
      owner: ownerAddress,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [accessControlManager],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const registry = await ethers.getContract(DEPLOYMENT_NAME);

  // The access control manager is the only address this registry is initialized with, and `setAccessControlManager` is
  // owner-gated, so a wrong value here becomes governance's problem the moment ownership moves. Read it back first.
  const wiredAccessControlManager = await registry.accessControlManager();
  if (!sameAddress(wiredAccessControlManager, accessControlManager)) {
    throw new Error(
      `Refusing to transfer ownership: ${DEPLOYMENT_NAME} access control manager is ${wiredAccessControlManager}, ` +
        `expected ${accessControlManager}`,
    );
  }
  console.log(`Verified ${DEPLOYMENT_NAME} access control manager: ${wiredAccessControlManager}`);

  // A fresh registry must be empty. A non-empty one means this name resolved to a registry that is already in use, and
  // pointing the spoke implementation at it would defeat the separation this deployment exists for.
  const registeredPools = await registry.getAllPools();
  if (registeredPools.length !== 0) {
    throw new Error(
      `Refusing to transfer ownership: ${DEPLOYMENT_NAME} at ${registry.address} already holds ` +
        `${registeredPools.length} pool(s), so it is not the empty registry this deployment expects`,
    );
  }

  // `PoolRegistry` is `Ownable2Step`, so this only nominates. The deployer stays the live owner until the listing VIP
  // calls `acceptOwnership`.
  if (sameAddress(await registry.owner(), ownerAddress)) {
    console.log(`${DEPLOYMENT_NAME} is already owned by ${ownerAddress}`);
  } else if (sameAddress(await registry.pendingOwner(), ownerAddress)) {
    console.log(`${DEPLOYMENT_NAME} already nominated ${ownerAddress}, awaiting acceptOwnership in the VIP`);
  } else {
    await (await registry.transferOwnership(ownerAddress)).wait(1);
    console.log(
      `${DEPLOYMENT_NAME} nominated ${await registry.pendingOwner()}; ${deployer} stays the owner until the VIP ` +
        `calls acceptOwnership`,
    );
  }

  // Two things this registry needs that only governance can give it, both belonging in the listing VIP:
  //
  // 1. ACM grants, in both directions, none of which the isolated-pools registry's grants cover. Roles are
  //    `keccak256(contractAddress, roleString)` and the account is the caller, so:
  //      - on this registry, governance needs `addPool(string,address,uint256,uint256,uint256)`,
  //        `addMarket(AddMarketInput)`, `setPoolName(address,string)` and
  //        `updatePoolMetadata(address,VenusPoolMetaData)`;
  //      - on the comptroller, this registry needs the six setters `addPool` and `addMarket` drive as the caller:
  //        `setCloseFactor(uint256)`, `setLiquidationIncentive(uint256)`, `setMinLiquidatableCollateral(uint256)`,
  //        `setCollateralFactor(address,uint256,uint256)`, `setMarketSupplyCaps(address[],uint256[])` and
  //        `setMarketBorrowCaps(address[],uint256[])`. On the isolated pools those six are covered by wildcard grants
  //        keyed on `address(0)`, but the account named in them is the isolated-pools registry, not this one, so
  //        `addPool` reverts at execution without them.
  //
  // 2. ProtocolShareReserve support for more than one registry. It stores a single `poolRegistry` address and rejects
  //    any non-core pool whose vToken that one registry does not know, so pointing it here would break `reduceReserves`
  //    and, more seriously, every liquidation in the existing isolated pools. That change ships from its own repo and
  //    has to be live before this registry is wired into it.
};

func.tags = [DEPLOYMENT_NAME, "HubSpoke"];

export default func;

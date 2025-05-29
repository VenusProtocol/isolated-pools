import { ethers } from "hardhat";
import { DeployFunction, DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, artifacts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.network.name);

  // Fetch preconfigured addresses or fallback to default identifiers
  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );
  const poolRegistryAddress = await toAddress(preconfiguredAddresses.PoolRegistry || "PoolRegistry");
  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");
  const rewardRecipientAddress = await toAddress(preconfiguredAddresses.RewardRecipient || "account:deployer");

  // Fetch the zk-compatible ProxyAdmin artifact
  const defaultProxyAdmin = await artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  // ERC4626 Beacon
  const venusERC4626Implementation: DeployResult = await deploy("VenusERC4626Implementation", {
    contract: "VenusERC4626",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const loopsLimit = 10;

  await deploy("VenusERC4626Factory", {
    from: deployer,
    contract: "VenusERC4626Factory",
    proxy: {
      owner: proxyOwnerAddress,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [
          accessControlManagerAddress,
          poolRegistryAddress,
          rewardRecipientAddress,
          venusERC4626Implementation.address,
          loopsLimit,
        ],
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

  console.log("VenusERC4626Factory deployed successfully!");

  const erc4626FactoryProxy = await ethers.getContract("VenusERC4626Factory");
  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;

  if (
    (await erc4626FactoryProxy.owner()) === deployer &&
    (await erc4626FactoryProxy.pendingOwner()) === ethers.constants.AddressZero
  ) {
    console.log(`Transferring ownership of erc4626FactoryProxy to ${targetOwner}`);
    const tx = await erc4626FactoryProxy.transferOwnership(targetOwner);
    await tx.wait();
  }
};

func.tags = ["VenusERC4626Factory"];

export default func;

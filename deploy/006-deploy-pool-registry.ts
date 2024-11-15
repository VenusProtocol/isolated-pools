import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());
  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
  );
  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");

  // The reason for this is that the contracts `OptimizedTransparentUpgradeableProxy` and `DefaultProxyAdmin` that the hardhat-deploy
  // plugin fetches from the artifact is not zk compatible causing the deployments to fail. So we bought it one level up to our repo,
  // added them to compile using zksync compiler. It is compatible for all networks.
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  await deploy("PoolRegistry", {
    from: deployer,
    contract: "PoolRegistry",
    proxy: {
      owner: proxyOwnerAddress,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [accessControlManagerAddress],
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
};

func.tags = ["PoolRegistry", "il"];

export default func;

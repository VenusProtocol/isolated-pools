import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.network.name);
  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer", hre);
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );
  await catchUnknownSigner(
    deploy("PoolRegistry", {
      from: deployer,
      contract: "PoolRegistry",
      proxy: {
        owner: proxyOwnerAddress,
        proxyContract: "OptimizedTransparentUpgradeableProxy",
        viaAdminContract: {
          name: "DefaultProxyAdmin",
          artifact: defaultProxyAdmin,
        },
      },
      autoMine: true,
      log: true,
    }),
  );
};

func.tags = ["update-pool-registry"];
export default func;

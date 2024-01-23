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

  await catchUnknownSigner(
    deploy("PoolRegistry", {
      from: deployer,
      contract: "PoolRegistry",
      proxy: {
        owner: proxyOwnerAddress,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
      autoMine: true,
      log: true,
    }),
  );
};

func.tags = ["update-pool-registry"];
export default func;

import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getVWNativeToken } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const vWNativeAddress = getVWNativeToken(hre.network.name);

  await deploy("NativeTokenGateway", {
    contract: "NativeTokenGateway",
    from: deployer,
    args: [vWNativeAddress],
    log: true,
    autoMine: true,
  });
};

func.tags = ["NativeTokenGateway"];

func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

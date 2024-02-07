import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("VTokenTemp", {
    contract: "VToken",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
};

func.tags = ["vToken"];

export default func;

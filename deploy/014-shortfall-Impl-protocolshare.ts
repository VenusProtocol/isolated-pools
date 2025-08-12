import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getBlockOrTimestampBasedDeploymentInfo } from "../helpers/deploymentUtils";

const nextBidderBlockOrTimestampLimit = 100; // for block based contracts
const waitForFirstBidder = 100; // for block based contracts

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.getNetworkName());

  await deploy("Shortfall_Implementation", {
    from: deployer,
    contract: "Shortfall",
    args: [isTimeBased, blocksPerYear, nextBidderBlockOrTimestampLimit, waitForFirstBidder],
    autoMine: true,
    log: true,
  });
};
func.tags = ["Shortfall-impl", "il"];

func.skip = async hre => hre.getNetworkName() !== "bscmainnet" && hre.getNetworkName() !== "bsctestnet";

export default func;

import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin } = await getNamedAccounts();
  //=======================
  // DEPLOY MOCK TOKENS
  //========================
  await deploy("MockBNX", {
    from: deployer,
    contract: "MockToken",
    args: ["BinaryX", "BNX", 18],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  await deploy("MockBSW", {
    from: deployer,
    contract: "MockToken",
    args: ["Biswap", "BSW", 18],
    log: true,
    autoMine: true,
  });

};

func.tags = ["MockTokens"];

export default func;

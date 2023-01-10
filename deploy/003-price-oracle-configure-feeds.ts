import configureOracleFeeds from "@venusprotocol/oracle/deploy/2-configure-feeds";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  await deployments.fixture(["MockTokens", "OracleDeploy"]);
  await configureOracleFeeds(hre);
};

func.tags = ["Oracle"];
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "hardhat";

export default func;

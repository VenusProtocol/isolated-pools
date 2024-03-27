import deployTimelocks from "@venusprotocol/governance-contracts/dist/deploy/001-timelock";
import deployComptroller from "@venusprotocol/venus-protocol/dist/deploy/001-comptroller";
import deployInterestRateModels from "@venusprotocol/venus-protocol/dist/deploy/002-interest-rate-model";
import deployTokens from "@venusprotocol/venus-protocol/dist/deploy/003-deploy-VBep20";
import deploySwapRouter from "@venusprotocol/venus-protocol/dist/deploy/006-deploy-swaprouter";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Ensure swap Router and unitroller are deployed on local network
  await deployComptroller(hre);
  await deployInterestRateModels(hre);
  await deployTokens(hre);
  await deploySwapRouter(hre);
  await deployTimelocks(hre);
};
func.tags = ["RiskFund", "il", "setup"];
func.skip = async hre => hre.network.name != "hardhat";

export default func;

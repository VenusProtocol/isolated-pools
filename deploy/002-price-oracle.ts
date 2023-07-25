import deployOracle from "@venusprotocol/oracle/deploy/1-deploy-oracles";
import { HardhatRuntimeEnvironment } from "hardhat/types";

deployOracle.tags = ["OracleDeploy"];
deployOracle.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default deployOracle;

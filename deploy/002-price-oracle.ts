import deployOracle from "@venusprotocol/oracle/dist/deploy/1-deploy-oracles";
import { HardhatRuntimeEnvironment } from "hardhat/types";

deployOracle.tags = ["OracleDeploy"];
deployOracle.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default deployOracle;

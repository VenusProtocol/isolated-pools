import deployOracle from "@venusprotocol/oracle/deploy/1-deploy-oracles";
import { HardhatRuntimeEnvironment } from "hardhat/types";

deployOracle.tags = ["Oracle"];
deployOracle.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "hardhat";

export default deployOracle;

import configureOracleFeeds from "@venusprotocol/oracle/deploy/2-configure-feeds";
import { HardhatRuntimeEnvironment } from "hardhat/types";

configureOracleFeeds.tags = ["Oracle"];
configureOracleFeeds.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default configureOracleFeeds;

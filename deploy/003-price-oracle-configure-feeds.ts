import configureOracleFeeds from "@venusprotocol/oracle/dist/deploy/4-vip-based-configuration";
import { HardhatRuntimeEnvironment } from "hardhat/types";

configureOracleFeeds.tags = ["Oracle"];
configureOracleFeeds.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default configureOracleFeeds;

import deployRiskFund from "@venusprotocol/protocol-reserve/dist/deploy/006-risk-fund-v2";
import { HardhatRuntimeEnvironment } from "hardhat/types";

deployRiskFund.tags = ["RiskFund", "il"];
deployRiskFund.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default deployRiskFund;

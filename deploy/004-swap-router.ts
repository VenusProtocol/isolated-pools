import deploySwapRouter from "@venusprotocol/venus-protocol/dist/deploy/006-deploy-swaprouter";
import { HardhatRuntimeEnvironment } from "hardhat/types";

deploySwapRouter.tags = ["SwapRouter", "il"];
deploySwapRouter.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default deploySwapRouter;

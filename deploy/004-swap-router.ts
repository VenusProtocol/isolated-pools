// MAINNET DEPLOYED CONTRACTS
import Mainnet from "@venusprotocol/venus-protocol/deployments/bscmainnet.json";
// TESTNET DEPLOYED CONTRACTS
import Testnet from "@venusprotocol/venus-protocol/deployments/bsctestnet.json";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const comptrollerDeFiAddresses = (await deployments.get("Comptroller_DeFi")).address;
  const wBNBAddress = (await deployments.get("WBNB")).address;

  const vbnbAddress = (await deployments.get("vBNB")).address;
  // Pancake Factory doesn't exist on hardhat so we are using the testnet address
  const pancakeFactoryAddress =
    hre.network.name === "bscmainnet"
      ? Mainnet.contracts.pancakeFactory.address
      : Testnet.contracts.pancakeFactory.address;

  await deploy("SwapRouter_DeFi", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, comptrollerDeFiAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });

  const comptrollerGameFiAddresses = (await deployments.get("Comptroller_GameFi")).address;
  await deploy("SwapRouter_GameFi", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, comptrollerGameFiAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });

  const comptrollerLiquidStakedBNBAddresses = (await deployments.get("Comptroller_LiquidStakedBNB")).address;
  await deploy("SwapRouter_LiquidStakedBNB", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, comptrollerLiquidStakedBNBAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });

  const comptrollerStablecoinsAddresses = (await deployments.get("Comptroller_Stablecoins")).address;
  await deploy("SwapRouter_Stablecoins", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, comptrollerStablecoinsAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });

  const comptrollerTronAddresses = (await deployments.get("Comptroller_Tron")).address;
  await deploy("SwapRouter_Tron", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, comptrollerTronAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });
};

func.tags = ["SwapRouter", "il"];
// deploySwapRouter.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;
// Pancake Factory is not deployed on the local network
func.skip = async hre =>
  hre.network.name === "sepolia" ||
  hre.network.name === "hardhat" ||
  hre.network.name === "opbnbtestnet" ||
  hre.network.name === "opbnbmainnet" ||
  hre.network.name === "ethereum";

export default func;

import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contracts as ilBscMainnet } from "../deployments/bscmainnet.json";
import { contracts as ilBscTestnet } from "../deployments/bsctestnet.json";
import { contracts as ilEthereum } from "../deployments/ethereum.json";
import { contracts as ilSepolia } from "../deployments/sepolia.json";

interface NetworkConfig {
  [poolName: string]: string;
}

interface VWNativePoolType {
  hardhat: NetworkConfig;
  bsctestnet: NetworkConfig;
  bscmainnet: NetworkConfig;
  sepolia: NetworkConfig;
  ethereum: NetworkConfig;
}

const VWNativePooL: VWNativePoolType = {
  hardhat: {
    Comptroller_LiquidStakedBNB: ilBscTestnet.VToken_vWBNB_LiquidStakedBNB.address,
  },
  bsctestnet: {
    Comptroller_LiquidStakedBNB: ilBscTestnet.VToken_vWBNB_LiquidStakedBNB.address,
  },
  bscmainnet: {
    Comptroller_LiquidStakedBNB: ilBscMainnet.VToken_vWBNB_LiquidStakedBNB.address,
  },
  sepolia: {
    Comptroller_Core: ilSepolia.VToken_vWETH_Core.address,
  },
  ethereum: {
    Comptroller_Core: ilEthereum.VToken_vWETH_Core.address,
  },
};

const getVWNativeToken = (networkName: string, poolName: string): string => {
  const poolAssociatedVToken = VWNativePooL[networkName];
  if (poolAssociatedVToken === undefined) {
    throw new Error(`config for network ${networkName} is not available.`);
  }

  const vTokenAddress = poolAssociatedVToken[poolName];
  if (vTokenAddress === undefined) {
    throw new Error(`config for pool ${poolName} is not available.`);
  }

  return vTokenAddress;
};

const poolName: string = "";
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const vWNativeAddress = getVWNativeToken(hre.network.name, poolName);

  await deploy(`NativeTokenGateway_${poolName}`, {
    contract: "NativeTokenGateway",
    from: deployer,
    args: [vWNativeAddress],
    log: true,
    autoMine: true,
  });
};

func.tags = ["NativeTokenGateway"];

func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

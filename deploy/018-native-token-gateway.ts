import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contracts as ilBscMainnet } from "../deployments/bscmainnet.json";
import { contracts as ilBscTestnet } from "../deployments/bsctestnet.json";
import { contracts as ilEthereum } from "../deployments/ethereum.json";
import { contracts as ilOpbnbMainnet } from "../deployments/opbnbmainnet.json";
import { contracts as ilOpbnbTestnet } from "../deployments/opbnbtestnet.json";
import { contracts as ilSepolia } from "../deployments/sepolia.json";
import { getConfig } from "../helpers/deploymentConfig";

interface VTokenConfig {
  name: string;
  address: string;
}

const VWNativeInfo: { [key: string]: VTokenConfig[] } = {
  bsctestnet: [
    {
      name: "vWBNB_LiquidStakedBNB",
      address: ilBscTestnet.VToken_vWBNB_LiquidStakedBNB.address,
    },
  ],
  bscmainnet: [
    {
      name: "vWBNB_LiquidStakedBNB",
      address: ilBscMainnet.VToken_vWBNB_LiquidStakedBNB.address,
    },
  ],
  sepolia: [
    {
      name: "vWETH_Core",
      address: ilSepolia.VToken_vWETH_Core.address,
    },
    {
      name: "vWETH_LiquidStakedETH",
      address: ilSepolia.VToken_vWETH_LiquidStakedETH.address,
    },
  ],
  ethereum: [
    {
      name: "vWETH_Core",
      address: ilEthereum.VToken_vWETH_Core.address,
    },
    {
      name: "vWETH_LiquidStakedETH",
      address: ilEthereum.VToken_vWETH_LiquidStakedETH.address,
    },
  ],
  opbnbtestnet: [
    {
      name: "vWBNB_Core",
      address: ilOpbnbTestnet.VToken_vWBNB_Core.address,
    },
  ],
  opbnbmainnet: [
    {
      name: "vWBNB_Core",
      address: ilOpbnbMainnet.VToken_vWBNB_Core.address,
    },
  ],
  arbitrumsepolia: [
    {
      name: "vWETH_Core",
      address: "0xef6DF2bE5d6Ad0291eDb1160fEf7a4ED2528fAfb",
    },
  ],
};

const getVWNativeTokens = (networkName: string): VTokenConfig[] => {
  const vTokensInfo = VWNativeInfo[networkName];
  if (vTokensInfo === undefined) {
    throw new Error(`config for network ${networkName} is not available.`);
  }

  return vTokensInfo;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.network.name);

  const vWNativesInfo = getVWNativeTokens(hre.network.name);
  for (const vWNativeInfo of vWNativesInfo) {
    await deploy(`NativeTokenGateway_${vWNativeInfo.name}`, {
      contract: "NativeTokenGateway",
      from: deployer,
      args: [vWNativeInfo.address],
      log: true,
      autoMine: true,
    });

    const nativeTokenGateway = await ethers.getContract(`NativeTokenGateway_${vWNativeInfo.name}`);
    const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;
    if (hre.network.live) {
      const tx = await nativeTokenGateway.transferOwnership(targetOwner);
      await tx.wait();
      console.log(`Transferred ownership of NativeTokenGateway_${vWNativeInfo.name} to Timelock`);
    }
  }
};

func.tags = ["NativeTokenGateway"];

func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

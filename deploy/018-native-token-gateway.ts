import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contracts as ilArbOne } from "../deployments/arbitrumone.json";
import { contracts as ilArbSepolia } from "../deployments/arbitrumsepolia.json";
import { contracts as ilBaseSepolia } from "../deployments/basesepolia.json";
import { contracts as ilBscMainnet } from "../deployments/bscmainnet.json";
import { contracts as ilBscTestnet } from "../deployments/bsctestnet.json";
import { contracts as ilEthereum } from "../deployments/ethereum.json";
import { contracts as ilOpbnbMainnet } from "../deployments/opbnbmainnet.json";
import { contracts as ilOpbnbTestnet } from "../deployments/opbnbtestnet.json";
import { contracts as ilOpSepolia } from "../deployments/opsepolia.json";
import { contracts as ilSepolia } from "../deployments/sepolia.json";
import { contracts as ilZkMainnet } from "../deployments/zksyncmainnet.json";
import { contracts as ilZkSepolia } from "../deployments/zksyncsepolia.json";
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
      address: ilArbSepolia.VToken_vWETH_Core.address,
    },
    {
      name: "vWETH_LiquidStakedETH",
      address: ilArbSepolia.VToken_vWETH_LiquidStakedETH.address,
    },
  ],
  arbitrumone: [
    {
      name: "vWETH_Core",
      address: ilArbOne.VToken_vWETH_Core.address,
    },
    {
      name: "vWETH_LiquidStakedETH",
      address: ilArbOne.VToken_vWETH_LiquidStakedETH.address,
    },
  ],
  zksyncsepolia: [
    {
      name: "vWETH_Core",
      address: ilZkSepolia.VToken_vWETH_Core.address,
    },
  ],
  zksyncmainnet: [
    {
      name: "vWETH_Core",
      address: ilZkMainnet.VToken_vWETH_Core.address,
    },
  ],
  opsepolia: [
    {
      name: "vWETH_Core",
      address: ilOpSepolia.VToken_vWETH_Core.address,
    },
  ],
  basesepolia: [
    {
      name: "vWETH_Core",
      address: ilBaseSepolia.VToken_vWETH_Core.address,
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
      skipIfAlreadyDeployed: true,
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

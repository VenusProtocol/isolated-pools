import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contracts as ilBscMainnet } from "../deployments/bscmainnet.json";
import { contracts as ilBscTestnet } from "../deployments/bsctestnet.json";
import { contracts as ilEthereum } from "../deployments/ethereum.json";
import { contracts as ilSepolia } from "../deployments/sepolia.json";
import { getConfig } from "../helpers/deploymentConfig";

interface NetworkConfig {
  [poolName: string]: string;
}

const VWNativePooL: { [key: string]: NetworkConfig } = {
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

// Enter the desired pool name here
const poolName: string = "Comptroller_Core";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.network.name);

  const vWNativeAddress = getVWNativeToken(hre.network.name, poolName);

  await deploy(`NativeTokenGateway_${poolName}`, {
    contract: "NativeTokenGateway",
    from: deployer,
    args: [vWNativeAddress],
    log: true,
    autoMine: true,
  });

  const nativeTokenGateway = await ethers.getContract(`NativeTokenGateway_${poolName}`);
  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;
  if (hre.network.live) {
    const tx = await nativeTokenGateway.transferOwnership(targetOwner);
    await tx.wait();
    console.log(`Transferred ownership of NativeTokenGateway to Timelock`);
  }
};

func.tags = ["NativeTokenGateway"];

func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

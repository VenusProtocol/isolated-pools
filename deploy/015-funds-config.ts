import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { PoolRegistry, VToken } from "../typechain";

const getAllMarkets = async (poolRegistry: PoolRegistry): Promise<VToken[]> => {
  const pools = await poolRegistry.getAllPools();
  const markets = await Promise.all(
    pools.map(async ({ comptroller }: { comptroller: string }): Promise<VToken[]> => {
      const poolComptroller = await ethers.getContractAt("Comptroller", comptroller);
      const vTokenAddresses = await poolComptroller.getAllMarkets();
      const vTokens = await Promise.all(
        vTokenAddresses.map((vTokenAddress: string) => ethers.getContractAt("VToken", vTokenAddress)),
      );
      return vTokens;
    }),
  );
  return markets.flat();
};

const setShortfallAddress = async (vToken: VToken, shortfallAddress: string) => {
  if ((await vToken.shortfall()) !== shortfallAddress) {
    const tx = await vToken.setShortfallContract(shortfallAddress);
    await tx.wait();
  }
};

const setProtocolShareReserveAddress = async (vToken: VToken, protocolShareReserveAddress: string) => {
  if ((await vToken.protocolShareReserve()) !== protocolShareReserveAddress) {
    const tx = await vToken.setProtocolShareReserve(protocolShareReserveAddress);
    await tx.wait();
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const poolRegistry = await ethers.getContract<PoolRegistry>("PoolRegistry");
  const vTokens = await getAllMarkets(poolRegistry);
  let protocolShareReserveAddress;
  try {
    protocolShareReserveAddress = (await ethers.getContract("ProtocolShareReserve")).address;
  } catch (e) {
    if (!hre.network.live) {
      console.warn("ProtocolShareReserve contract not found. Deploying address");
      protocolShareReserveAddress = (await ethers.getContract("ProtocolShareReserve")).address;
    } else {
      throw e;
    }
  }
  const shortfall = await ethers.getContract("Shortfall");

  for (const vToken of vTokens) {
    await setShortfallAddress(vToken, shortfall.address);
    await setProtocolShareReserveAddress(vToken, protocolShareReserveAddress);
  }
};

func.tags = ["FundsConfig", "il"];
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default func;

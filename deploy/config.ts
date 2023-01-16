import { ethers } from "hardhat";

import { convertToUnit } from "../helpers/utils";

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
};

export type DeploymentConfig = {
  tokenConfig: TokenConfig[];
  poolConfig: PoolConfig[];
};

export type TokenConfig = {
  isMock: boolean;
  name?: string;
  symbol: string;
  decimals?: number;
  tokenAddress: string;
};

export type PoolConfig = {
  name: string;
  closeFactor: string;
  liquidationIncentive: string;
  minLiquidatableCollateral: string;
  vtokens: VTokenConfig[];
};

export type VTokenConfig = {
  name: string;
  symbol: string;
  asset: string; // This should match a name property from a TokenCofig
  rateModel: string;
  baseRatePerYear: number;
  multiplierPerYear: string;
  jumpMultiplierPerYear: number;
  kink_: number;
  collateralFactor: string;
  liquidationThreshold: string;
  initialSupply: string;
  supplyCap: string;
  borrowCap: string;
};

export enum InterestRateModels {
  WhitePaper,
  JumpRate,
}

export const globalConfig: NetworkConfig = {
  hardhat: {
    tokenConfig: [
      {
        isMock: true,
        name: "Biswap",
        symbol: "BSW",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "BinaryX",
        symbol: "BNX",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Binance USD",
        symbol: "BUSD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
    ],
    poolConfig: [
      {
        name: "Pool 1",
        closeFactor: convertToUnit(0.05, 18),
        liquidationIncentive: convertToUnit(1, 18),
        minLiquidatableCollateral: convertToUnit(100, 18),
        vtokens: [
          {
            name: "Venux BNX",
            asset: "BNX",
            symbol: "vBNX",
            rateModel: InterestRateModels.WhitePaper.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: 0,
            kink_: 0,
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venux BSW",
            asset: "BSW",
            symbol: "vBSW",
            rateModel: InterestRateModels.WhitePaper.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: 0,
            kink_: 0,
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
      },
    ],
  },
  bsctestnet: {
    tokenConfig: [],
    poolConfig: [],
  },
  bscmainnet: {
    tokenConfig: [],
    poolConfig: [],
  },
};

export async function getConfig(networkName: string): Promise<DeploymentConfig> {
  switch (networkName) {
    case "hardhat":
      return globalConfig.hardhat;
    case "bsctestnet":
      return globalConfig.bsctestnet;
    case "bscmainnet":
      return globalConfig.bscmainnet;
    default:
      throw new Error(`config for network ${networkName} is not available.`);
  }
}

export function getTokenConfig(tokenSymbol: string, tokens: TokenConfig[]): TokenConfig {
  const tokenCofig = tokens.find(({ symbol }) => symbol === tokenSymbol);

  if (tokenCofig) {
    return tokenCofig;
  } else {
    throw Error(`Token ${tokenSymbol} is not found in the config`);
  }
}

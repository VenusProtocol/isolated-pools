import { ethers } from "hardhat";

import { convertToUnit } from "./utils";

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
  jumpMultiplierPerYear: string;
  kink_: string;
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
      {
        isMock: true,
        name: "Wrapped BNB",
        symbol: "WBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Auto",
        symbol: "AUTO",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Pancake Swap",
        symbol: "CAKE",
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
            name: "Venus BNX",
            asset: "BNX",
            symbol: "vBNX",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.05, 18),
            jumpMultiplierPerYear: convertToUnit(1.09, 18),
            kink_: convertToUnit(0.8, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus WBTC",
            asset: "WBTC",
            symbol: "vWBTC",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
      },
      {
        name: "Pool 2",
        closeFactor: convertToUnit(0.05, 18),
        liquidationIncentive: convertToUnit(1, 18),
        minLiquidatableCollateral: convertToUnit(100, 18),
        vtokens: [
          {
            name: "Venus AUTO",
            asset: "AUTO",
            symbol: "vAUTO",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.05, 18),
            jumpMultiplierPerYear: convertToUnit(1.09, 18),
            kink_: convertToUnit(0.8, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus CAKE",
            asset: "CAKE",
            symbol: "vCAKE",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.5, 18),
            liquidationThreshold: convertToUnit(0.5, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
      },
    ],
  },
  bsctestnet: {
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
      {
        isMock: true,
        name: "Wrapped BNB",
        symbol: "WBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Auto",
        symbol: "AUTO",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Pancake Swap",
        symbol: "CAKE",
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
            name: "Venus BNX",
            asset: "BNX",
            symbol: "vBNX",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.05, 18),
            jumpMultiplierPerYear: convertToUnit(1.09, 18),
            kink_: convertToUnit(0.8, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus BSW",
            asset: "BSW",
            symbol: "vBSW",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
      },
      {
        name: "Pool 2",
        closeFactor: convertToUnit(0.05, 18),
        liquidationIncentive: convertToUnit(1, 18),
        minLiquidatableCollateral: convertToUnit(100, 18),
        vtokens: [
          {
            name: "Venus AUTO",
            asset: "AUTO",
            symbol: "vAUTO",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.05, 18),
            jumpMultiplierPerYear: convertToUnit(1.09, 18),
            kink_: convertToUnit(0.8, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus CAKE",
            asset: "CAKE",
            symbol: "vCAKE",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.5, 18),
            liquidationThreshold: convertToUnit(0.6, 18),
            initialSupply: convertToUnit(1, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
      },
    ],
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
    case "development":
      return globalConfig.bsctestnet;
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

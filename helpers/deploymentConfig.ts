import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { convertToUnit } from "./utils";

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
};

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
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
  rewards?: RewardConfig[];
};

// NOTE: markets, supplySpeeds, borrowSpeeds array sizes should match
export type RewardConfig = {
  asset: string;
  markets: string[]; // underlying asset symbol of a the e.g ["BNX","CAKE"]
  supplySpeeds: string[];
  borrowSpeeds: string[];
};

export type SpeedConfig = {
  borrowSpeed: string;
  supplySpeed: string;
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
    tokensConfig: [
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
      {
        isMock: true,
        name: "Venus",
        symbol: "XVS",
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
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus WBNB",
            asset: "WBNB",
            symbol: "vWBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["BNX", "WBNB"],
            supplySpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
            borrowSpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
          },
          {
            asset: "BNX",
            markets: ["BNX"],
            supplySpeeds: [convertToUnit(0.7, 18)],
            borrowSpeeds: [convertToUnit(0.7, 18)],
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
            name: "Venus CAKE",
            asset: "CAKE",
            symbol: "vCAKE",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(10, 18),
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
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["CAKE", "WBTC"],
            supplySpeeds: [convertToUnit(0.7, 18), convertToUnit(0.7, 18)],
            borrowSpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
          },
          {
            asset: "CAKE",
            markets: ["CAKE"],
            supplySpeeds: [convertToUnit(0.8, 18)],
            borrowSpeeds: [convertToUnit(0.8, 18)],
          },
        ],
      },
    ],
  },
  bsctestnet: {
    tokensConfig: [
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
      {
        isMock: true,
        name: "Venus",
        symbol: "XVS",
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
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
          {
            name: "Venus WBNB",
            asset: "WBNB",
            symbol: "vWBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["BNX", "WBNB"],
            supplySpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
            borrowSpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
          },
          {
            asset: "BNX",
            markets: ["BNX"],
            supplySpeeds: [convertToUnit(0.7, 18)],
            borrowSpeeds: [convertToUnit(0.7, 18)],
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
            name: "Venus CAKE",
            asset: "CAKE",
            symbol: "vCAKE",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: 0,
            multiplierPerYear: convertToUnit(0.04, 18),
            jumpMultiplierPerYear: convertToUnit(1.08, 18),
            kink_: convertToUnit(0.7, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            initialSupply: convertToUnit(10, 18),
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
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10000, 18),
            borrowCap: convertToUnit(10000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["CAKE", "WBTC"],
            supplySpeeds: [convertToUnit(0.7, 18), convertToUnit(0.7, 18)],
            borrowSpeeds: [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
          },
          {
            asset: "CAKE",
            markets: ["CAKE"],
            supplySpeeds: [convertToUnit(0.8, 18)],
            borrowSpeeds: [convertToUnit(0.8, 18)],
          },
        ],
      },
    ],
  },
  bscmainnet: {
    tokensConfig: [],
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

export async function getTokenAddress(tokenConfig: TokenConfig, deployments: DeploymentsExtension) {
  if (tokenConfig.isMock) {
    const token = await deployments.get(`Mock${tokenConfig.symbol}`);
    return token.address;
  } else {
    return tokenConfig.tokenAddress;
  }
}

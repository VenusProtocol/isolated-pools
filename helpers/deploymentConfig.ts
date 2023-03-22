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
  baseRatePerYear: string;
  multiplierPerYear: string;
  jumpMultiplierPerYear: string;
  kink_: string;
  collateralFactor: string;
  liquidationThreshold: string;
  reserveFactor: string;
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
        name: "Venus",
        symbol: "XVS",
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
        name: "Bitcoin BEP2",
        symbol: "BTCB",
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
        name: "Ankr",
        symbol: "ANKR",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Ankr Staked BNB",
        symbol: "ankrBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "MOBOX",
        symbol: "MBOX",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "NFT",
        symbol: "NFT",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "RACA",
        symbol: "RACA",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "pSTAKE Staked BNB",
        symbol: "stkBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "USDD",
        symbol: "USDD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "AUTO",
        symbol: "AUTO",
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
            baseRatePerYear: convertToUnit(1, 16), // 1%
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(932019, 18),
            borrowCap: convertToUnit(478980, 18),
          },
          {
            name: "Venus BTCB",
            asset: "BTCB",
            symbol: "vBTCB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(1000, 18),
            borrowCap: convertToUnit(1000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["BNX", "BTCB"],
            supplySpeeds: [convertToUnit(23, 8), convertToUnit(23, 8)],
            borrowSpeeds: [convertToUnit(23, 8), convertToUnit(23, 8)],
          },
          {
            asset: "BNX",
            markets: ["BNX"],
            supplySpeeds: [convertToUnit(33, 8)],
            borrowSpeeds: [convertToUnit(33, 8)],
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
            name: "Venus ANKR",
            asset: "ANKR",
            symbol: "vANKR",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(3000000, 18),
            borrowCap: convertToUnit(3000000, 18),
          },
          {
            name: "Venus ankrBNB",
            asset: "ankrBNB",
            symbol: "vankrBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(100, 18),
            borrowCap: convertToUnit(100, 18),
          },
          {
            name: "Venus MBOX",
            asset: "MBOX",
            symbol: "vMBOX",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(7000000, 18),
            borrowCap: convertToUnit(3184294, 18),
          },
          {
            name: "Venus NFT",
            asset: "NFT",
            symbol: "vNFT",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(84985800573, 18),
            borrowCap: convertToUnit(24654278679, 18),
          },
          {
            name: "Venus RACA",
            asset: "RACA",
            symbol: "vRACA",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(23758811062, 18),
            borrowCap: convertToUnit(3805812642, 18),
          },
          {
            name: "Venus stkBNB",
            asset: "stkBNB",
            symbol: "vstkBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(1963, 18),
            borrowCap: convertToUnit(324, 18),
          },
          {
            name: "Venus USDD",
            asset: "USDD",
            symbol: "vUSDD",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.1, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10601805, 18),
            borrowCap: convertToUnit(1698253, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["ANKR", "ankrBNB", "MBOX", "NFT", "RACA", "stkBNB", "USDD"],
            supplySpeeds: [
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
            ],
            borrowSpeeds: [
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
            ],
          },
          {
            asset: "ANKR",
            markets: ["ANKR", "ankrBNB"],
            supplySpeeds: [convertToUnit(20, 8), convertToUnit(20, 8)],
            borrowSpeeds: [convertToUnit(20, 8), convertToUnit(20, 8)],
          },
          {
            asset: "MBOX",
            markets: ["MBOX"],
            supplySpeeds: [convertToUnit(25, 8)],
            borrowSpeeds: [convertToUnit(25, 8)],
          },
          {
            asset: "NFT",
            markets: ["NFT"],
            supplySpeeds: [convertToUnit(22, 8)],
            borrowSpeeds: [convertToUnit(22, 8)],
          },
          {
            asset: "RACA",
            markets: ["RACA"],
            supplySpeeds: [convertToUnit(27, 8)],
            borrowSpeeds: [convertToUnit(27, 8)],
          },
        ],
      },
    ],
  },
  bsctestnet: {
    tokensConfig: [
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
      },
      {
        isMock: false,
        name: "Binance USD",
        symbol: "BUSD",
        decimals: 18,
        tokenAddress: "0x8301F2213c0eeD49a7E28Ae4c3e91722919B8B47",
      },
      {
        isMock: false,
        name: "Bitcoin BEP2",
        symbol: "BTCB",
        decimals: 18,
        tokenAddress: "0xA808e341e8e723DC6BA0Bb5204Bafc2330d7B8e4",
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
        name: "Ankr",
        symbol: "ANKR",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Ankr Staked BNB",
        symbol: "ankrBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "MOBOX",
        symbol: "MBOX",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "NFT",
        symbol: "NFT",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "RACA",
        symbol: "RACA",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "pSTAKE Staked BNB",
        symbol: "stkBNB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "USDD",
        symbol: "USDD",
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
            baseRatePerYear: convertToUnit(1, 16), // 1%
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(932019, 18),
            borrowCap: convertToUnit(478980, 18),
          },
          {
            name: "Venus BTCB",
            asset: "BTCB",
            symbol: "vBTCB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(1000, 18),
            borrowCap: convertToUnit(1000, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["BNX", "BTCB"],
            supplySpeeds: [convertToUnit(23, 8), convertToUnit(23, 8)],
            borrowSpeeds: [convertToUnit(23, 8), convertToUnit(23, 8)],
          },
          {
            asset: "BNX",
            markets: ["BNX"],
            supplySpeeds: [convertToUnit(33, 8)],
            borrowSpeeds: [convertToUnit(33, 8)],
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
            name: "Venus ANKR",
            asset: "ANKR",
            symbol: "vANKR",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(3000000, 18),
            borrowCap: convertToUnit(3000000, 18),
          },
          {
            name: "Venus ankrBNB",
            asset: "ankrBNB",
            symbol: "vankrBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(100, 18),
            borrowCap: convertToUnit(100, 18),
          },
          {
            name: "Venus MBOX",
            asset: "MBOX",
            symbol: "vMBOX",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(7000000, 18),
            borrowCap: convertToUnit(3184294, 18),
          },
          {
            name: "Venus NFT",
            asset: "NFT",
            symbol: "vNFT",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(84985800573, 18),
            borrowCap: convertToUnit(24654278679, 18),
          },
          {
            name: "Venus RACA",
            asset: "RACA",
            symbol: "vRACA",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(23758811062, 18),
            borrowCap: convertToUnit(3805812642, 18),
          },
          {
            name: "Venus stkBNB",
            asset: "stkBNB",
            symbol: "vstkBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit(1, 16),
            multiplierPerYear: convertToUnit(0.25, 18),
            jumpMultiplierPerYear: convertToUnit(4, 18),
            kink_: convertToUnit(0.5, 18),
            collateralFactor: convertToUnit(0.6, 18),
            liquidationThreshold: convertToUnit(0.7, 18),
            reserveFactor: convertToUnit(0.25, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(1963, 18),
            borrowCap: convertToUnit(324, 18),
          },
          {
            name: "Venus USDD",
            asset: "USDD",
            symbol: "vUSDD",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit(0.15, 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit(0.6, 18),
            collateralFactor: convertToUnit(0.7, 18),
            liquidationThreshold: convertToUnit(0.8, 18),
            reserveFactor: convertToUnit(0.1, 18),
            initialSupply: convertToUnit(10, 18),
            supplyCap: convertToUnit(10601805, 18),
            borrowCap: convertToUnit(1698253, 18),
          },
        ],
        rewards: [
          {
            asset: "XVS",
            markets: ["ANKR", "ankrBNB", "MBOX", "NFT", "RACA", "stkBNB", "USDD"],
            supplySpeeds: [
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
            ],
            borrowSpeeds: [
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
              convertToUnit(23, 8),
            ],
          },
          {
            asset: "ANKR",
            markets: ["ANKR", "ankrBNB"],
            supplySpeeds: [convertToUnit(20, 8), convertToUnit(20, 8)],
            borrowSpeeds: [convertToUnit(20, 8), convertToUnit(20, 8)],
          },
          {
            asset: "MBOX",
            markets: ["MBOX"],
            supplySpeeds: [convertToUnit(25, 8)],
            borrowSpeeds: [convertToUnit(25, 8)],
          },
          {
            asset: "NFT",
            markets: ["NFT"],
            supplySpeeds: [convertToUnit(22, 8)],
            borrowSpeeds: [convertToUnit(22, 8)],
          },
          {
            asset: "RACA",
            markets: ["RACA"],
            supplySpeeds: [convertToUnit(27, 8)],
            borrowSpeeds: [convertToUnit(27, 8)],
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

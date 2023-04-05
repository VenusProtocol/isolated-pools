import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { convertToUnit } from "./utils";

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
};

export type PreconfiguredAddresses = { [contract: string]: string };

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
  poolConfig: PoolConfig[];
  accessControlConfig: AccessControlEntry[];
  preconfiguredAddresses: PreconfiguredAddresses;
};

export type TokenConfig = {
  isMock: boolean;
  name?: string;
  symbol: string;
  decimals?: number;
  tokenAddress: string;
};

export type PoolConfig = {
  id: string;
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
  vTokenReceiver: string;
};

export type AccessControlEntry = {
  caller: string;
  target: string;
  method: string;
};

export enum InterestRateModels {
  WhitePaper,
  JumpRate,
}

const ANY_CONTRACT = ethers.constants.AddressZero;

const preconfiguredAddresses = {
  hardhat: {
    VTreasury: "account:deployer",
  },
  bsctestnet: {
    VTreasury: "account:deployer",
    NormalTimelock: "0xce10739590001705F7FF231611ba4A48B2820327",
    FastTrackTimelock: "0x3CFf21b7AF8390fE68799D58727d3b4C25a83cb6",
    CriticalTimelock: "0x23B893a7C45a5Eb8c8C062b9F32d0D2e43eD286D",
    GovernorBravo: "0x5573422A1a59385C247ec3a66B93B7C08eC2f8f2",
    AccessControlManager: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  },
  bscmainnet: {
    VTreasury: "0xF322942f644A996A617BD29c16bd7d231d9F35E9",
    NormalTimelock: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    FastTrackTimelock: "0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02",
    CriticalTimelock: "0x213c446ec11e45b15a6E29C1C1b402B8897f606d",
    GovernorBravo: "0x2d56dC077072B53571b8252008C60e945108c75a",
    AccessControlManager: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const poolRegistryPermissions = (): AccessControlEntry[] => {
  const methods = [
    "setCollateralFactor(address,uint256,uint256)",
    "setMarketSupplyCaps(address[],uint256[])",
    "setMarketBorrowCaps(address[],uint256[])",
    "setLiquidationIncentive(uint256)",
    "setCloseFactor(uint256)",
    "setMinLiquidatableCollateral(uint256)",
    "supportMarket(address)",
  ];
  return methods.map(method => ({
    caller: "PoolRegistry",
    target: ANY_CONTRACT,
    method,
  }));
};

const deployerPermissions = (): AccessControlEntry[] => {
  const methods = [
    "swapPoolsAssets(address[],uint256[],address[][])",
    "addPool(string,address,uint256,uint256,uint256)",
    "addMarket(AddMarketInput)",
    "setRewardTokenSpeeds(address[],uint256[],uint256[])",
  ];
  return methods.map(method => ({
    caller: "account:deployer",
    target: ANY_CONTRACT,
    method,
  }));
};

const normalTimelockPermissions = (timelock: string): AccessControlEntry[] => {
  const methods = [
    "setCloseFactor(uint256)",
    "setCollateralFactor(address,uint256,uint256)",
    "setLiquidationIncentive(uint256)",
    "setMarketBorrowCaps(address[],uint256[])",
    "setMarketSupplyCaps(address[],uint256[])",
    "setActionsPaused(address[],uint256[],bool)",
    "setMinLiquidatableCollateral(uint256)",
    "addPool(string,address,uint256,uint256,uint256)",
    "addMarket(AddMarketInput)",
    "setPoolName(address,string)",
    "updatePoolMetadata(address,VenusPoolMetaData)",
    "setProtocolSeizeShare(uint256)",
    "setReserveFactor(uint256)",
    "setInterestRateModel(address)",
    "setRewardTokenSpeeds(address[],uint256[],uint256[])",
    "updateJumpRateModel(uint256,uint256,uint256,uint256)",
  ];
  return methods.map(method => ({
    caller: timelock,
    target: ANY_CONTRACT,
    method,
  }));
};

const fastTrackTimelockPermissions = (timelock: string): AccessControlEntry[] => {
  const methods = [
    "setCollateralFactor(address,uint256,uint256)",
    "setMarketBorrowCaps(address[],uint256[])",
    "setMarketSupplyCaps(address[],uint256[])",
    "setActionsPaused(address[],uint256[],bool)",
  ];
  return methods.map(method => ({
    caller: timelock,
    target: ANY_CONTRACT,
    method,
  }));
};

const criticalTimelockPermissions = fastTrackTimelockPermissions;

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
        name: "Tether",
        symbol: "USDT",
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
        id: "Pool1",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
        id: "Pool2",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
            vTokenReceiver: "account:deployer",
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
    accessControlConfig: [...poolRegistryPermissions(), ...deployerPermissions()],
    preconfiguredAddresses: preconfiguredAddresses.hardhat,
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
        name: "Tether",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c",
      },
      {
        isMock: false,
        name: "HAY",
        symbol: "HAY",
        decimals: 18,
        tokenAddress: "0xe73774DfCD551BF75650772dC2cC56a2B6323453",
      },
      {
        isMock: false,
        name: "USDD",
        symbol: "USDD",
        decimals: 18,
        tokenAddress: "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382",
      },
    ],
    poolConfig: [
      {
        id: "StableCoins",
        name: "Stable Coins",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus HAY (Stable Coins)",
            asset: "HAY",
            symbol: "vHAY_StableCoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(500_000, 18),
            borrowCap: convertToUnit(200_000, 18),
            vTokenReceiver: preconfiguredAddresses.bsctestnet.VTreasury,
          },
          {
            name: "Venus USDT (Stable Coins)",
            asset: "USDT",
            symbol: "vUSDT_StableCoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.05", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // USDT has 6 decimals on testnet
            supplyCap: convertToUnit(1_000_000, 6), // USDT has 6 decimals on testnet
            borrowCap: convertToUnit(400_000, 6), // USDT has 6 decimals on testnet
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
          },
          {
            name: "Venus USDD (Stable Coins)",
            asset: "USDD",
            symbol: "vUSDD_StableCoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(1_000_000, 18),
            borrowCap: convertToUnit(400_000, 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
          },
        ],
        rewards: [
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1736111111111111"], // 1500 HAY over 30 days
            borrowSpeeds: ["1736111111111111"], // 1500 HAY over 30 days
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.bsctestnet.NormalTimelock),
      ...fastTrackTimelockPermissions(preconfiguredAddresses.bsctestnet.FastTrackTimelock),
      ...criticalTimelockPermissions(preconfiguredAddresses.bsctestnet.CriticalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.bsctestnet,
  },
  bscmainnet: {
    tokensConfig: [
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
      },
      {
        isMock: false,
        name: "Binance-Peg BSC-USD",
        symbol: "BUSD",
        decimals: 18,
        tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      },
      {
        isMock: false,
        name: "Hay Destablecoin",
        symbol: "HAY",
        decimals: 18,
        tokenAddress: "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5",
      },
      {
        isMock: false,
        name: "Decentralized USD",
        symbol: "USDD",
        decimals: 18,
        tokenAddress: "0xd17479997F34dd9156Deef8F95A52D81D265be9c",
      },
    ],
    poolConfig: [
      {
        id: "Stablecoins",
        name: "Stablecoins",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus HAY (Stablecoins)",
            asset: "HAY",
            symbol: "vHAY_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(25_000, 18),
            supplyCap: convertToUnit(500_000, 18),
            borrowCap: convertToUnit(200_000, 18),
            vTokenReceiver: "0x09702Ea135d9D707DD51f530864f2B9220aAD87B",
          },
          {
            name: "Venus USDT (Stablecoins)",
            asset: "USDT",
            symbol: "vUSDT_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.05", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(1_000_000, 18),
            borrowCap: convertToUnit(400_000, 18),
            vTokenReceiver: "0xF322942f644A996A617BD29c16bd7d231d9F35E9",
          },
          {
            name: "Venus USDD (Stablecoins)",
            asset: "USDD",
            symbol: "vUSDD_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(1_000_000, 18),
            borrowCap: convertToUnit(400_000, 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
          },
        ],
        rewards: [],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.bscmainnet.NormalTimelock),
      ...fastTrackTimelockPermissions(preconfiguredAddresses.bscmainnet.FastTrackTimelock),
      ...criticalTimelockPermissions(preconfiguredAddresses.bscmainnet.CriticalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.bscmainnet,
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
  const tokenCofig = tokens.find(
    ({ symbol }) => symbol.toLocaleLowerCase().trim() === tokenSymbol.toLocaleLowerCase().trim(),
  );

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

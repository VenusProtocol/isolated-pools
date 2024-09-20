import { contracts as governanceArbitrumOne } from "@venusprotocol/governance-contracts/deployments/arbitrumone.json";
import { contracts as governanceArbitrumSepolia } from "@venusprotocol/governance-contracts/deployments/arbitrumsepolia.json";
import { contracts as governanceBscMainnet } from "@venusprotocol/governance-contracts/deployments/bscmainnet.json";
import { contracts as governanceBscTestnet } from "@venusprotocol/governance-contracts/deployments/bsctestnet.json";
import { contracts as governanceEthereum } from "@venusprotocol/governance-contracts/deployments/ethereum.json";
import { contracts as governanceOpbnbMainnet } from "@venusprotocol/governance-contracts/deployments/opbnbmainnet.json";
import { contracts as governanceOpbnbTestnet } from "@venusprotocol/governance-contracts/deployments/opbnbtestnet.json";
import { contracts as governanceSepolia } from "@venusprotocol/governance-contracts/deployments/sepolia.json";
import { contracts as governanceZkSyncMainnet } from "@venusprotocol/governance-contracts/deployments/zksyncmainnet.json";
import { contracts as governanceZkSyncSepolia } from "@venusprotocol/governance-contracts/deployments/zksyncsepolia.json";
import { contracts as venusProtocolArbitrumOne } from "@venusprotocol/venus-protocol/deployments/arbitrumone.json";
import { contracts as venusProtocolArbitrumSepolia } from "@venusprotocol/venus-protocol/deployments/arbitrumsepolia.json";
import { contracts as venusProtocolBscMainnet } from "@venusprotocol/venus-protocol/deployments/bscmainnet.json";
import { contracts as venusProtocolBscTestnet } from "@venusprotocol/venus-protocol/deployments/bsctestnet.json";
import { contracts as venusProtocolEthereum } from "@venusprotocol/venus-protocol/deployments/ethereum.json";
import { contracts as venusProtocolOpbnbMainnet } from "@venusprotocol/venus-protocol/deployments/opbnbmainnet.json";
import { contracts as venusProtocolOpbnbTestnet } from "@venusprotocol/venus-protocol/deployments/opbnbtestnet.json";
import { contracts as venusProtocolSepolia } from "@venusprotocol/venus-protocol/deployments/sepolia.json";
import { contracts as venusProtocolZkSyncMainnet } from "@venusprotocol/venus-protocol/deployments/zksyncmainnet.json";
import { contracts as venusProtocolZkSyncSepolia } from "@venusprotocol/venus-protocol/deployments/zksyncsepolia.json";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { convertToUnit } from "./utils";

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
  sepolia: DeploymentConfig;
  ethereum: DeploymentConfig;
  opbnbtestnet: DeploymentConfig;
  opbnbmainnet: DeploymentConfig;
  arbitrumsepolia: DeploymentConfig;
  arbitrumone: DeploymentConfig;
  zksyncsepolia: DeploymentConfig;
  zksyncmainnet: DeploymentConfig;
  opsepolia: DeploymentConfig;
};

export type PreconfiguredAddresses = { [contract: string]: string };

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
  poolConfig: PoolConfig[];
  accessControlConfig: AccessControlEntry[];
  preconfiguredAddresses: PreconfiguredAddresses;
};

export type DeploymentInfo = {
  isTimeBased: boolean;
  blocksPerYear: number;
};

type BidderDeploymentValues = {
  waitForFirstBidder: number;
  nextBidderBlockOrTimestampLimit: number;
};

export type TokenConfig = {
  isMock: boolean;
  name?: string;
  symbol: string;
  decimals?: number;
  tokenAddress: string;
  faucetInitialLiquidity?: boolean;
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
  reduceReservesBlockDelta: string;
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

export const BSC_BLOCKS_PER_YEAR = 10_512_000; // assuming a block is mined every 3 seconds
export const ETH_BLOCKS_PER_YEAR = 2_628_000; // assuming a block is mined every 12 seconds
export const OPBNB_BLOCKS_PER_YEAR = 31_536_000; // assuming a block is mined every 1 seconds
export const SECONDS_PER_YEAR = 31_536_000; // seconds per year

export type BlocksPerYear = {
  [key: string]: number;
};

export const blocksPerYear: BlocksPerYear = {
  hardhat: BSC_BLOCKS_PER_YEAR,
  bsctestnet: BSC_BLOCKS_PER_YEAR,
  bscmainnet: BSC_BLOCKS_PER_YEAR,
  sepolia: ETH_BLOCKS_PER_YEAR,
  ethereum: ETH_BLOCKS_PER_YEAR,
  opbnbtestnet: OPBNB_BLOCKS_PER_YEAR,
  opbnbmainnet: OPBNB_BLOCKS_PER_YEAR,
  arbitrumsepolia: 0, // for time based contracts
  arbitrumone: 0, // for time based contracts
  zksyncsepolia: 0, // for time based contracts
  zksyncmainnet: 0, // for time based contracts
  opsepolia: 0, // for time based contracts
  opmainnet: 0, // for time based contracts
  isTimeBased: 0, // for time based contracts
};

export const SEPOLIA_MULTISIG = "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb";
export const ETHEREUM_MULTISIG = "0x285960C5B22fD66A736C7136967A3eB15e93CC67";
export const OPBNBTESTNET_MULTISIG = "0xb15f6EfEbC276A3b9805df81b5FB3D50C2A62BDf";
export const OPBNBMAINNET_MULTISIG = "0xC46796a21a3A9FAB6546aF3434F2eBfFd0604207";
export const ARBITRUM_SEPOLIA_MULTISIG = "0x1426A5Ae009c4443188DA8793751024E358A61C2";
export const ARBITRUM_ONE_MULTISIG = "0x14e0E151b33f9802b3e75b621c1457afc44DcAA0";
export const ZKSYNC_SEPOLIA_MULTISIG = "0xa2f83de95E9F28eD443132C331B6a9C9B7a9F866";
export const ZKSYNC_MAINNET_MULTISIG = "0x751Aa759cfBB6CE71A43b48e40e1cCcFC66Ba4aa";
export const OP_SEPOLIA_MULTISIG = "0xd57365EE4E850e881229e2F8Aa405822f289e78d";

const DEFAULT_REDUCE_RESERVES_BLOCK_DELTA = "7200";
const REDUCE_RESERVES_BLOCK_DELTA_ETHEREUM = "7200";
const REDUCE_RESERVES_BLOCK_DELTA_OPBNBTESTNET = "300";
const REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET = "86400";
const REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA = "86400";
const REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE = "86400";
const REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA = "86400";
const REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA = "86400";
const REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET = "86400";

export const preconfiguredAddresses = {
  hardhat: {
    VTreasury: "account:deployer",
  },
  bsctestnet: {
    VTreasury: venusProtocolBscTestnet.VTreasury.address,
    NormalTimelock: governanceBscTestnet.NormalTimelock.address,
    FastTrackTimelock: governanceBscTestnet.FastTrackTimelock.address,
    CriticalTimelock: governanceBscTestnet.CriticalTimelock.address,
    GovernorBravo: governanceBscTestnet.GovernorBravoDelegator.address,
    AccessControlManager: governanceBscTestnet.AccessControlManager.address,
    PancakeFactory: venusProtocolBscTestnet.pancakeFactory.address,
    WBNB: venusProtocolBscTestnet.WBNB.address,
    VBNB_CorePool: venusProtocolBscTestnet.vBNB.address,
    SwapRouter_CorePool: venusProtocolBscTestnet.SwapRouterCorePool.address,
    Unitroller: venusProtocolBscTestnet.Unitroller.address,
    Shortfall: "0x503574a82fE2A9f968d355C8AAc1Ba0481859369",
  },
  bscmainnet: {
    VTreasury: venusProtocolBscMainnet.VTreasury.address,
    NormalTimelock: governanceBscMainnet.NormalTimelock.address,
    FastTrackTimelock: governanceBscMainnet.FastTrackTimelock.address,
    CriticalTimelock: governanceBscMainnet.CriticalTimelock.address,
    GovernorBravo: governanceBscMainnet.GovernorBravoDelegator.address,
    AccessControlManager: governanceBscMainnet.AccessControlManager.address,
    PancakeFactory: venusProtocolBscMainnet.pancakeFactory.address,
    WBNB: venusProtocolBscMainnet.WBNB.address,
    VBNB_CorePool: venusProtocolBscMainnet.vBNB.address,
    SwapRouter_CorePool: venusProtocolBscMainnet.SwapRouterCorePool.address,
    Unitroller: venusProtocolBscMainnet.Unitroller.address,
    Shortfall: "0xf37530A8a810Fcb501AA0Ecd0B0699388F0F2209",
  },
  sepolia: {
    VTreasury: venusProtocolSepolia.VTreasuryV8.address,
    NormalTimelock: SEPOLIA_MULTISIG,
    FastTrackTimelock: SEPOLIA_MULTISIG,
    CriticalTimelock: SEPOLIA_MULTISIG,
    GovernorBravo: SEPOLIA_MULTISIG,
    AccessControlManager: governanceSepolia.AccessControlManager.address,
  },
  ethereum: {
    VTreasury: venusProtocolEthereum.VTreasuryV8.address,
    NormalTimelock: ETHEREUM_MULTISIG,
    FastTrackTimelock: ETHEREUM_MULTISIG,
    CriticalTimelock: ETHEREUM_MULTISIG,
    GovernorBravo: ETHEREUM_MULTISIG,
    AccessControlManager: governanceEthereum.AccessControlManager.address,
  },
  opbnbtestnet: {
    VTreasury: venusProtocolOpbnbTestnet.VTreasuryV8.address,
    NormalTimelock: OPBNBTESTNET_MULTISIG,
    FastTrackTimelock: OPBNBTESTNET_MULTISIG,
    CriticalTimelock: OPBNBTESTNET_MULTISIG,
    AccessControlManager: governanceOpbnbTestnet.AccessControlManager.address,
  },
  opbnbmainnet: {
    VTreasury: venusProtocolOpbnbMainnet.VTreasuryV8.address,
    NormalTimelock: OPBNBMAINNET_MULTISIG,
    FastTrackTimelock: OPBNBMAINNET_MULTISIG,
    CriticalTimelock: OPBNBMAINNET_MULTISIG,
    AccessControlManager: governanceOpbnbMainnet.AccessControlManager.address,
  },
  arbitrumsepolia: {
    VTreasury: venusProtocolArbitrumSepolia.VTreasuryV8.address,
    NormalTimelock: ARBITRUM_SEPOLIA_MULTISIG,
    FastTrackTimelock: ARBITRUM_SEPOLIA_MULTISIG,
    CriticalTimelock: ARBITRUM_SEPOLIA_MULTISIG,
    AccessControlManager: governanceArbitrumSepolia.AccessControlManager.address,
  },
  arbitrumone: {
    VTreasury: venusProtocolArbitrumOne.VTreasuryV8.address,
    NormalTimelock: ARBITRUM_ONE_MULTISIG,
    FastTrackTimelock: ARBITRUM_ONE_MULTISIG,
    CriticalTimelock: ARBITRUM_ONE_MULTISIG,
    AccessControlManager: governanceArbitrumOne.AccessControlManager.address,
  },
  zksyncsepolia: {
    VTreasury: venusProtocolZkSyncSepolia.VTreasuryV8.address,
    NormalTimelock: ZKSYNC_SEPOLIA_MULTISIG,
    FastTrackTimelock: ZKSYNC_SEPOLIA_MULTISIG,
    CriticalTimelock: ZKSYNC_SEPOLIA_MULTISIG,
    AccessControlManager: governanceZkSyncSepolia.AccessControlManager.address,
  },
  zksyncmainnet: {
    VTreasury: venusProtocolZkSyncMainnet.VTreasuryV8.address,
    NormalTimelock: ZKSYNC_MAINNET_MULTISIG,
    FastTrackTimelock: ZKSYNC_MAINNET_MULTISIG,
    CriticalTimelock: ZKSYNC_MAINNET_MULTISIG,
    AccessControlManager: governanceZkSyncMainnet.AccessControlManager.address,
  },
  opsepolia: {
    VTreasury: "0x5A1a12F47FA7007C9e23cf5e025F3f5d3aC7d755",
    NormalTimelock: OP_SEPOLIA_MULTISIG,
    FastTrackTimelock: OP_SEPOLIA_MULTISIG,
    CriticalTimelock: OP_SEPOLIA_MULTISIG,
    AccessControlManager: "0x1652E12C8ABE2f0D84466F0fc1fA4286491B3BC1",
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
    "setReduceReservesBlockDelta(uint256)",
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
    "setReduceReservesBlockDelta(uint256)",
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
    "setLastRewardingBlock(address[],uint32[],uint32[])",
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
        name: "Binance-Peg BSC-USD",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
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
        faucetInitialLiquidity: false,
      },
      {
        isMock: false,
        name: "HAY",
        symbol: "HAY",
        decimals: 18,
        tokenAddress: "0xe73774DfCD551BF75650772dC2cC56a2B6323453",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "USDD",
        symbol: "USDD",
        decimals: 18,
        tokenAddress: "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Biswap",
        symbol: "BSW",
        decimals: 18,
        tokenAddress: "0x7FCC76fc1F573d8Eb445c236Cc282246bC562bCE",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "AlpacaToken",
        symbol: "ALPACA",
        decimals: 18,
        tokenAddress: "0x6923189d91fdF62dBAe623a55273F1d20306D9f2",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Ankr",
        symbol: "ANKR",
        decimals: 18,
        tokenAddress: "0xe4a90EB942CF2DA7238e8F6cC9EF510c49FC8B4B",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Radio Caca V2",
        symbol: "RACA",
        decimals: 18,
        tokenAddress: "0xD60cC803d888A3e743F21D0bdE4bF2cAfdEA1F26",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "FLOKI",
        symbol: "FLOKI",
        decimals: 18,
        tokenAddress: "0xb22cF15FBc089d470f8e532aeAd2baB76bE87c88",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Ankr Staked BNB",
        symbol: "ankrBNB",
        decimals: 18,
        tokenAddress: "0x167F1F9EF531b3576201aa3146b13c57dbEda514",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Liquid Staking BNB",
        symbol: "BNBx",
        decimals: 18,
        tokenAddress: "0x327d6E6FAC0228070884e913263CFF9eFed4a2C8",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "Staked BNB",
        symbol: "stkBNB",
        decimals: 18,
        tokenAddress: "0x2999C176eBf66ecda3a646E70CeB5FF4d5fCFb8C",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "BitTorrent",
        symbol: "BTT",
        decimals: 18,
        tokenAddress: "0xE98344A7c691B200EF47c9b8829110087D832C64",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "APENFT",
        symbol: "NFT",
        decimals: 18,
        tokenAddress: "0xc440e4F21AFc2C3bDBA1Af7D0E338ED35d3e25bA",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "WINk",
        symbol: "WIN",
        decimals: 18,
        tokenAddress: "0x2E6Af3f3F059F43D764060968658c9F3c8f9479D",
        faucetInitialLiquidity: true,
      },
      {
        isMock: false,
        name: "TRON",
        symbol: "TRX",
        decimals: 6,
        tokenAddress: "0x7D21841DC10BA1C5797951EFc62fADBBDD06704B",
        faucetInitialLiquidity: false,
      },
      {
        isMock: false,
        name: "Wrapped BNB",
        symbol: "WBNB",
        decimals: 18,
        tokenAddress: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      },
      {
        isMock: true,
        name: "Stader (Wormhole)",
        symbol: "SD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Trust Wallet",
        symbol: "TWT",
        decimals: 18,
        tokenAddress: "0xb99c6b26fdf3678c6e2aff8466e3625a0e7182f8",
      },
      {
        isMock: false,
        name: "agEUR",
        symbol: "agEUR",
        decimals: 18,
        tokenAddress: "0x63061de4A25f24279AAab80400040684F92Ee319",
      },
      {
        isMock: false,
        name: "ANGLE_bsc",
        symbol: "ANGLE",
        decimals: 18,
        tokenAddress: "0xD1Bc731d188ACc3f52a6226B328a89056B0Ec71a",
      },
      {
        isMock: false,
        name: "Synclub Staked BNB",
        symbol: "SnBNB",
        decimals: 18,
        tokenAddress: "0xd2aF6A916Bc77764dc63742BC30f71AF4cF423F4",
      },
      {
        isMock: false,
        name: "PLANET",
        symbol: "PLANET",
        decimals: 18,
        tokenAddress: "0x52b4E1A2ba407813F829B4b3943A1e57768669A9",
      },
      {
        isMock: true,
        name: "Baby Doge Coin",
        symbol: "BabyDoge",
        decimals: 9,
        tokenAddress: ethers.constants.AddressZero,
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
            reduceReservesBlockDelta: "100",
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
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
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
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus agEUR (Stablecoins)",
            asset: "agEUR",
            symbol: "vagEUR_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(9000, 18),
            supplyCap: convertToUnit(100000, 18),
            borrowCap: convertToUnit(50000, 18),
            vTokenReceiver: "0xc444949e0054a23c44fc45789738bdf64aed2391",
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
          },
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
          },
          {
            asset: "ANGLE",
            markets: ["agEUR"],
            supplySpeeds: ["0"],
            borrowSpeeds: ["87549603174603174"], // 17650 ANGLE over 7 days (201600 blocks)
          },
        ],
      },
      {
        id: "DeFi",
        name: "DeFi",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BSW (DeFi)",
            asset: "BSW",
            symbol: "vBSW_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("475750", 18),
            supplyCap: convertToUnit("15000000", 18),
            borrowCap: convertToUnit("10500000", 18),
            vTokenReceiver: "0x109E8083a64c7DedE513e8b580c5b08B96f9cE73",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus ALPACA (DeFi)",
            asset: "ALPACA",
            symbol: "vALPACA_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("5189", 18),
            supplyCap: convertToUnit("2500000", 18),
            borrowCap: convertToUnit("1750000", 18),
            vTokenReceiver: "0xAD9CADe20100B8b945da48e1bCbd805C38d8bE77",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (DeFi)",
            asset: "USDT",
            symbol: "vUSDT_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 6), // USDT has 6 decimals on testnet
            supplyCap: convertToUnit("18600000", 6), // USDT has 6 decimals on testnet
            borrowCap: convertToUnit("14880000", 6), // USDT has 6 decimals on testnet
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDD (DeFi)",
            asset: "USDD",
            symbol: "vUSDD_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus ANKR (DeFi)",
            asset: "ANKR",
            symbol: "vANKR_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("500000", 18),
            supplyCap: convertToUnit("9508802", 18),
            borrowCap: convertToUnit("6656161", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus ankrBNB (DeFi)",
            asset: "ankrBNB",
            symbol: "vankrBNB_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.035", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0", 18),
            liquidationThreshold: convertToUnit("0", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("39", 18),
            supplyCap: convertToUnit("5000", 18),
            borrowCap: convertToUnit("4000", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus PLANET (DeFi)",
            asset: "PLANET",
            symbol: "vPLANET_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.2", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("174983000", 18),
            supplyCap: convertToUnit("1000000000", 18),
            borrowCap: convertToUnit("500000000", 18),
            vTokenReceiver: "0x0554d6079eBc222AD12405E52b264Bdb5B65D1cf",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus TWT (DeFi)",
            asset: "TWT",
            symbol: "vTWT_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.5", 18),
            liquidationThreshold: convertToUnit("0.6", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("1000000", 18),
            borrowCap: convertToUnit("500000", 18),
            vTokenReceiver: "0x0848dB7cB495E7b9aDA1D4dC972b9A526D014D84",
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "BSW",
            markets: ["BSW"],
            supplySpeeds: ["16753472222222222"], // 14475 BSW over 30 days (864000 blocks)
            borrowSpeeds: ["16753472222222222"], // 14475 BSW over 30 days (864000 blocks)
          },
          {
            asset: "ANKR",
            markets: ["ankrBNB"],
            supplySpeeds: ["289351851851851851"], // 250000 ANKR over 30 days (864000 blocks)
            borrowSpeeds: ["289351851851851851"], // 250000 ANKR over 30 days (864000 blocks)
          },
          {
            asset: "USDT",
            markets: ["PLANET"],
            supplySpeeds: ["1860"], // 1500 USDT over 28 days (806400 blocks)
            borrowSpeeds: ["1860"], // 1500 USDT over 28 days (806400 blocks)
          },
        ],
      },
      {
        id: "GameFi",
        name: "GameFi",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus RACA (GameFi)",
            asset: "RACA",
            symbol: "vRACA_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("175000000", 18),
            supplyCap: convertToUnit("4000000000", 18),
            borrowCap: convertToUnit("2800000000", 18),
            vTokenReceiver: "0x6Ee74536B3Ff10Ff639aa781B7220121287F6Fa5",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus FLOKI (GameFi)",
            asset: "FLOKI",
            symbol: "vFLOKI_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("1512860000", 18), // FLOKI has 18 decimals on testnet
            supplyCap: convertToUnit("40000000000", 18), // FLOKI has 18 decimals on testnet
            borrowCap: convertToUnit("28000000000", 18), // FLOKI has 18 decimals on testnet
            vTokenReceiver: "0x17e98a24f992BB7bcd62d6722d714A3C74814B94",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (GameFi)",
            asset: "USDT",
            symbol: "vUSDT_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 6), // USDT has 6 decimals on testnet
            supplyCap: convertToUnit("18600000", 6), // USDT has 6 decimals on testnet
            borrowCap: convertToUnit("14880000", 6), // USDT has 6 decimals on testnet
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDD (GameFi)",
            asset: "USDD",
            symbol: "vUSDD_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "FLOKI",
            markets: ["FLOKI"],
            supplySpeeds: ["230305570295138888888"], // 198984012.735 FLOKI over 30 days (864000 blocks), 18 decimals on testnet
            borrowSpeeds: ["230305570295138888888"], // 198984012.735 FLOKI over 30 days (864000 blocks), 18 decimals on testnet
          },
          {
            asset: "RACA",
            markets: ["RACA"],
            supplySpeeds: ["6076388888888888888"], // 5250000 RACA over 30 days (864000 blocks)
            borrowSpeeds: ["6076388888888888888"], // 5250000 RACA over 30 days (864000 blocks)
          },
        ],
      },
      {
        id: "LiquidStakedBNB",
        name: "Liquid Staked BNB",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus ankrBNB (Liquid Staked BNB)",
            asset: "ankrBNB",
            symbol: "vankrBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("40", 18),
            supplyCap: convertToUnit("8000", 18),
            borrowCap: convertToUnit("5600", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus BNBx (Liquid Staked BNB)",
            asset: "BNBx",
            symbol: "vBNBx_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("39.36", 18),
            supplyCap: convertToUnit("1818", 18),
            borrowCap: convertToUnit("1272", 18),
            vTokenReceiver: "0xF0348E1748FCD45020151C097D234DbbD5730BE7",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus stkBNB (Liquid Staked BNB)",
            asset: "stkBNB",
            symbol: "vstkBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("40", 18),
            supplyCap: convertToUnit("540", 18),
            borrowCap: convertToUnit("378", 18),
            vTokenReceiver: "0xccc022502d6c65e1166fd34147040f05880f7972",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus WBNB (Liquid Staked BNB)",
            asset: "WBNB",
            symbol: "vWBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.45", 18),
            liquidationThreshold: convertToUnit("0.5", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("35", 18),
            supplyCap: convertToUnit("80000", 18),
            borrowCap: convertToUnit("56000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (Liquid Staked BNB)",
            asset: "USDT",
            symbol: "vUSDT_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 6), // USDT has 6 decimals on testnet
            supplyCap: convertToUnit("18600000", 6), // USDT has 6 decimals on testnet
            borrowCap: convertToUnit("14880000", 6), // USDT has 6 decimals on testnet
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDD (Liquid Staked BNB)",
            asset: "USDD",
            symbol: "vUSDD_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus SnBNB (Liquid Staked BNB)",
            asset: "SnBNB",
            symbol: "vSnBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.87", 18),
            liquidationThreshold: convertToUnit("0.9", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("47", 18),
            supplyCap: convertToUnit("1000", 18),
            borrowCap: convertToUnit("100", 18),
            vTokenReceiver: "0xDC2D855A95Ee70d7282BebD35c96f905CDE31f55",
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "ankrBNB",
            markets: ["ankrBNB"],
            supplySpeeds: ["26620370370370"], // 23 ankrBNB over 30 days (864000 blocks)
            borrowSpeeds: ["26620370370370"], // 23 ankrBNB over 30 days (864000 blocks)
          },
          {
            asset: "stkBNB",
            markets: ["stkBNB"],
            supplySpeeds: ["4629629629629"], // 4 stkBNB over 30 days (864000 blocks)
            borrowSpeeds: ["1504629629629"], // 1.3 stkBNB over 30 days (864000 blocks)
          },
          {
            asset: "SD",
            markets: ["BNBx"],
            supplySpeeds: ["3703703703703703"], // 3200 SD over 30 days (864000 blocks)
            borrowSpeeds: ["3703703703703703"], // 3200 SD over 30 days (864000 blocks)
          },
          {
            asset: "SD",
            markets: ["BNBx"],
            supplySpeeds: ["1157407407407407"], // 1000 SD over 30 days (864000 blocks)
            borrowSpeeds: ["1157407407407407"], // 1000 SD over 30 days (864000 blocks)
          },
          {
            asset: "HAY",
            markets: ["SnBNB"],
            supplySpeeds: ["930059523809523"], // 1500 HAY over 56 days (1612800 blocks)
            borrowSpeeds: ["930059523809523"], // 1500 HAY over 56 days (1612800 blocks)
          },
        ],
      },
      {
        id: "Tron",
        name: "Tron",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BTT (Tron)",
            asset: "BTT",
            symbol: "vBTT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("16753000000", 18),
            supplyCap: convertToUnit("1500000000000", 18),
            borrowCap: convertToUnit("1050000000000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus NFT (Tron)",
            asset: "NFT",
            symbol: "vNFT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("27153000000", 18), // NFT has 18 decimals on testnet
            supplyCap: convertToUnit("4000000000", 18), // NFT has 18 decimals on testnet
            borrowCap: convertToUnit("2800000000", 18), // NFT has 18 decimals on testnet
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus WIN (Tron)",
            asset: "WIN",
            symbol: "vWIN_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("134000000", 18),
            supplyCap: convertToUnit("3000000000", 18),
            borrowCap: convertToUnit("2100000000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus TRX (Tron)",
            asset: "TRX",
            symbol: "vTRX_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("129000", 6), // Note 6 decimals
            supplyCap: convertToUnit("11000000", 6), // Note 6 decimals
            borrowCap: convertToUnit("7700000", 6), // Note 6 decimals
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (Tron)",
            asset: "USDT",
            symbol: "vUSDT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 6), // USDT has 6 decimals on testnet
            supplyCap: convertToUnit("18600000", 6), // USDT has 6 decimals on testnet
            borrowCap: convertToUnit("14880000", 6), // USDT has 6 decimals on testnet
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDD (Tron)",
            asset: "USDD",
            symbol: "vUSDD_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "BTT",
            markets: ["BTT"],
            supplySpeeds: ["19969071901620370370370"], // 17253278123 BTT over 30 days (864000 blocks)
            borrowSpeeds: ["19969071901620370370370"], // 17253278123 BTT over 30 days (864000 blocks)
          },
          {
            asset: "WIN",
            markets: ["WIN"],
            supplySpeeds: ["24805131365740740740"], // 21431633.5 WIN over 30 days (864000 blocks)
            borrowSpeeds: ["24805131365740740740"], // 21431633.5 WIN over 30 days (864000 blocks)
          },
          {
            asset: "TRX",
            markets: ["TRX"],
            supplySpeeds: ["45461"], // 39278.5 TRX over 30 days (864000 blocks)
            borrowSpeeds: ["45461"], // 39278.5 TRX over 30 days (864000 blocks)
          },
          {
            asset: "USDD",
            markets: ["USDD"],
            supplySpeeds: ["14467592592592592"], // 12500 USDD over 30 days (864000 blocks)
            borrowSpeeds: ["14467592592592592"], // 12500 USDD over 30 days (864000 blocks)
          },
        ],
      },
      {
        id: "Meme",
        name: "Meme",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BabyDoge (Meme)",
            asset: "BabyDoge",
            symbol: "vBabyDoge_Meme",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.3", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("27917365987868.178893572", 9),
            supplyCap: convertToUnit("1600000000000000", 9),
            borrowCap: convertToUnit("800000000000000", 9),
            vTokenReceiver: preconfiguredAddresses.bsctestnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (Meme)",
            asset: "USDT",
            symbol: "vUSDT_Meme",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0", 18),
            multiplierPerYear: convertToUnit("0.175", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6),
            supplyCap: convertToUnit("1000000", 6),
            borrowCap: convertToUnit("900000", 6),
            vTokenReceiver: preconfiguredAddresses.bsctestnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "BabyDoge",
            markets: ["BabyDoge"],
            supplySpeeds: ["12134623477230768"], // 7,863,236,013,245.53792216 BabyDoge over 90 days (648000 blocks)
            borrowSpeeds: ["12134623477230768"], // 7,863,236,013,245.53792216 BabyDoge over 90 days (648000 blocks)
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
        symbol: "USDT",
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
      {
        isMock: false,
        name: "Biswap",
        symbol: "BSW",
        decimals: 18,
        tokenAddress: "0x965f527d9159dce6288a2219db51fc6eef120dd1",
      },
      {
        isMock: false,
        name: "AlpacaToken",
        symbol: "ALPACA",
        decimals: 18,
        tokenAddress: "0x8f0528ce5ef7b51152a59745befdd91d97091d2f",
      },
      {
        isMock: false,
        name: "Ankr",
        symbol: "ANKR",
        decimals: 18,
        tokenAddress: "0xf307910A4c7bbc79691fD374889b36d8531B08e3",
      },
      {
        isMock: false,
        name: "Radio Caca V2",
        symbol: "RACA",
        decimals: 18,
        tokenAddress: "0x12BB890508c125661E03b09EC06E404bc9289040",
      },
      {
        isMock: false,
        name: "FLOKI",
        symbol: "FLOKI",
        decimals: 9,
        tokenAddress: "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E",
      },
      {
        isMock: false,
        name: "Ankr Staked BNB",
        symbol: "ankrBNB",
        decimals: 18,
        tokenAddress: "0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827",
      },
      {
        isMock: false,
        name: "Liquid Staking BNB",
        symbol: "BNBx",
        decimals: 18,
        tokenAddress: "0x1bdd3cf7f79cfb8edbb955f20ad99211551ba275",
      },
      {
        isMock: false,
        name: "Staked BNB",
        symbol: "stkBNB",
        decimals: 18,
        tokenAddress: "0xc2E9d07F66A89c44062459A47a0D2Dc038E4fb16",
      },
      {
        isMock: false,
        name: "BitTorrent",
        symbol: "BTT",
        decimals: 18,
        tokenAddress: "0x352Cb5E19b12FC216548a2677bD0fce83BaE434B",
      },
      {
        isMock: false,
        name: "APENFT",
        symbol: "NFT",
        decimals: 6,
        tokenAddress: "0x20eE7B720f4E4c4FFcB00C4065cdae55271aECCa",
      },
      {
        isMock: false,
        name: "WINk",
        symbol: "WIN",
        decimals: 18,
        tokenAddress: "0xaeF0d72a118ce24feE3cD1d43d383897D05B4e99",
      },
      {
        isMock: false,
        name: "TRON",
        symbol: "TRX",
        decimals: 6,
        tokenAddress: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3",
      },
      {
        isMock: false,
        name: "Wrapped BNB",
        symbol: "WBNB",
        decimals: 18,
        tokenAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      },
      {
        isMock: false,
        name: "Stader (Wormhole)",
        symbol: "SD",
        decimals: 18,
        tokenAddress: "0x3BC5AC0dFdC871B365d159f728dd1B9A0B5481E8",
      },
      {
        isMock: false,
        name: "Trust Wallet",
        symbol: "TWT",
        decimals: 18,
        tokenAddress: "0x4b0f1812e5df2a09796481ff14017e6005508003",
      },
      {
        isMock: false,
        name: "agEUR",
        symbol: "agEUR",
        decimals: 18,
        tokenAddress: "0x12f31b73d812c6bb0d735a218c086d44d5fe5f89",
      },
      {
        isMock: false,
        name: "ANGLE_bsc",
        symbol: "ANGLE",
        decimals: 18,
        tokenAddress: "0x97B6897AAd7aBa3861c04C0e6388Fc02AF1F227f",
      },
      {
        isMock: false,
        name: "Synclub Staked BNB",
        symbol: "SnBNB",
        decimals: 18,
        tokenAddress: "0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B",
      },
      {
        isMock: false,
        name: "PLANET",
        symbol: "PLANET",
        decimals: 18,
        tokenAddress: "0xca6d678e74f553f0e59cccc03ae644a3c2c5ee7d",
      },
      {
        isMock: false,
        name: "Baby Doge Coin",
        symbol: "BabyDoge",
        decimals: 9,
        tokenAddress: "0xc748673057861a797275CD8A068AbB95A902e8de",
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
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDT (Stablecoins)",
            asset: "USDT",
            symbol: "vUSDT_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0375", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(1_000_000, 18),
            borrowCap: convertToUnit(400_000, 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
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
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus agEUR (Stablecoins)",
            asset: "agEUR",
            symbol: "vagEUR_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(9000, 18),
            supplyCap: convertToUnit(100000, 18),
            borrowCap: convertToUnit(50000, 18),
            vTokenReceiver: "0xc444949e0054a23c44fc45789738bdf64aed2391", // community wallet
            reduceReservesBlockDelta: "28800",
          },
        ],
        rewards: [
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
          },
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
          },
          {
            asset: "ANGLE",
            markets: ["agEUR"],
            supplySpeeds: ["0"],
            borrowSpeeds: ["87549603174603174"], // 17650 ANGLE over 7 days (201600 blocks)
          },
        ],
      },
      {
        id: "DeFi",
        name: "DeFi",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BSW (DeFi)",
            asset: "BSW",
            symbol: "vBSW_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("475750", 18),
            supplyCap: convertToUnit("15000000", 18),
            borrowCap: convertToUnit("10500000", 18),
            vTokenReceiver: "0x109E8083a64c7DedE513e8b580c5b08B96f9cE73", // biswap team treasury
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus ALPACA (DeFi)",
            asset: "ALPACA",
            symbol: "vALPACA_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("5189", 18),
            supplyCap: convertToUnit("2500000", 18),
            borrowCap: convertToUnit("1750000", 18),
            vTokenReceiver: "0xAD9CADe20100B8b945da48e1bCbd805C38d8bE77", // alpaca team treasury
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDT (DeFi)",
            asset: "USDT",
            symbol: "vUSDT_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.135", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDD (DeFi)",
            asset: "USDD",
            symbol: "vUSDD_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", // tron ecosystem treasury
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus ANKR (DeFi)",
            asset: "ANKR",
            symbol: "vANKR_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("500000", 18),
            supplyCap: convertToUnit("9508802", 18),
            borrowCap: convertToUnit("6656161", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508", // ankr team treasury
            reduceReservesBlockDelta: "28800",
          },

          {
            name: "Venus ankrBNB (DeFi)",
            asset: "ankrBNB",
            symbol: "vankrBNB_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.035", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0", 18),
            liquidationThreshold: convertToUnit("0", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("39", 18),
            supplyCap: convertToUnit("5000", 18),
            borrowCap: convertToUnit("4000", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508", // ankr team treasury
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus PLANET (DeFi)",
            asset: "PLANET",
            symbol: "vPLANET_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.2", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("174983000", 18),
            supplyCap: convertToUnit("1000000000", 18),
            borrowCap: convertToUnit("500000000", 18),
            vTokenReceiver: "0x0554d6079eBc222AD12405E52b264Bdb5B65D1cf",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus TWT (DeFi)",
            asset: "TWT",
            symbol: "vTWT_DeFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.5", 18),
            liquidationThreshold: convertToUnit("0.6", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("1000000", 18),
            borrowCap: convertToUnit("500000", 18),
            vTokenReceiver: "0x0848dB7cB495E7b9aDA1D4dC972b9A526D014D84",
            reduceReservesBlockDelta: "28800",
          },
        ],
        rewards: [
          {
            asset: "BSW",
            markets: ["BSW"],
            supplySpeeds: ["16753472222222222"], // 14475 BSW over 30 days (864000 blocks)
            borrowSpeeds: ["16753472222222222"], // 14475 BSW over 30 days (864000 blocks)
          },

          {
            asset: "ANKR",
            markets: ["ankrBNB"],
            supplySpeeds: ["289351851851851851"], // 250000 ANKR over 30 days (864000 blocks)
            borrowSpeeds: ["289351851851851851"], // 250000 ANKR over 30 days (864000 blocks)
          },
          {
            asset: "USDT",
            markets: ["PLANET"],
            supplySpeeds: ["1860119047619047"], // 1500 USDT over 28 days (806400 blocks)
            borrowSpeeds: ["1860119047619047"], // 1500 USDT over 28 days (806400 blocks)
          },
        ],
      },
      {
        id: "GameFi",
        name: "GameFi",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus RACA (GameFi)",
            asset: "RACA",
            symbol: "vRACA_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("175000000", 18),
            supplyCap: convertToUnit("4000000000", 18),
            borrowCap: convertToUnit("2800000000", 18),
            vTokenReceiver: "0x6Ee74536B3Ff10Ff639aa781B7220121287F6Fa5",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus FLOKI (GameFi)",
            asset: "FLOKI",
            symbol: "vFLOKI_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("1512860000", 9), // Note 9 decimals
            supplyCap: convertToUnit("40000000000", 9), // Note 9 decimals
            borrowCap: convertToUnit("28000000000", 9), // Note 9 decimals
            vTokenReceiver: "0x17e98a24f992BB7bcd62d6722d714A3C74814B94",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDT (GameFi)",
            asset: "USDT",
            symbol: "vUSDT_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.135", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDD (GameFi)",
            asset: "USDD",
            symbol: "vUSDD_GameFi",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
        ],
        rewards: [
          {
            asset: "FLOKI",
            markets: ["FLOKI"],
            supplySpeeds: ["230305570295"], // 198984012.735 FLOKI over 30 days (864000 blocks)
            borrowSpeeds: ["230305570295"], // 198984012.735 FLOKI over 30 days (864000 blocks)
          },
          {
            asset: "RACA",
            markets: ["RACA"],
            supplySpeeds: ["6076388888888888888"], // 5250000 RACA over 30 days (864000 blocks)
            borrowSpeeds: ["6076388888888888888"], // 5250000 RACA over 30 days (864000 blocks)
          },
        ],
      },
      {
        id: "LiquidStakedBNB",
        name: "Liquid Staked BNB",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus ankrBNB (Liquid Staked BNB)",
            asset: "ankrBNB",
            symbol: "vankrBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("40", 18),
            supplyCap: convertToUnit("8000", 18),
            borrowCap: convertToUnit("5600", 18),
            vTokenReceiver: "0xAE1c38847Fb90A13a2a1D7E5552cCD80c62C6508",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus BNBx (Liquid Staked BNB)",
            asset: "BNBx",
            symbol: "vBNBx_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("39.36", 18),
            supplyCap: convertToUnit("1818", 18),
            borrowCap: convertToUnit("1272", 18),
            vTokenReceiver: "0xF0348E1748FCD45020151C097D234DbbD5730BE7",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus stkBNB (Liquid Staked BNB)",
            asset: "stkBNB",
            symbol: "vstkBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("40", 18),
            supplyCap: convertToUnit("540", 18),
            borrowCap: convertToUnit("378", 18),
            vTokenReceiver: "0xccc022502d6c65e1166fd34147040f05880f7972",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus WBNB (Liquid Staked BNB)",
            asset: "WBNB",
            symbol: "vWBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.009", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.9", 18),
            collateralFactor: convertToUnit("0.45", 18),
            liquidationThreshold: convertToUnit("0.5", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("35", 18),
            supplyCap: convertToUnit("80000", 18),
            borrowCap: convertToUnit("56000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDT (Liquid Staked BNB)",
            asset: "USDT",
            symbol: "vUSDT_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDD (Liquid Staked BNB)",
            asset: "USDD",
            symbol: "vUSDD_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus SnBNB (Liquid Staked BNB)",
            asset: "SnBNB",
            symbol: "vSnBNB_LiquidStakedBNB",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.87", 18),
            liquidationThreshold: convertToUnit("0.9", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("47", 18),
            supplyCap: convertToUnit("1000", 18),
            borrowCap: convertToUnit("100", 18),
            vTokenReceiver: "0xDC2D855A95Ee70d7282BebD35c96f905CDE31f55",
            reduceReservesBlockDelta: "28800",
          },
        ],
        rewards: [
          {
            asset: "ankrBNB",
            markets: ["ankrBNB"],
            supplySpeeds: ["26620370370370"], // 23 ankrBNB over 30 days (864000 blocks)
            borrowSpeeds: ["26620370370370"], // 23 ankrBNB over 30 days (864000 blocks)
          },
          {
            asset: "stkBNB",
            markets: ["stkBNB"],
            supplySpeeds: ["4629629629629"], // 4 stkBNB over 30 days (864000 blocks)
            borrowSpeeds: ["1504629629629"], // 1.3 stkBNB over 30 days (864000 blocks)
          },
          {
            asset: "SD",
            markets: ["BNBx"],
            supplySpeeds: ["3703703703703703"], // 3200 SD over 30 days (864000 blocks)
            borrowSpeeds: ["3703703703703703"], // 3200 SD over 30 days (864000 blocks)
          },
          {
            asset: "SD",
            markets: ["BNBx"],
            supplySpeeds: ["1157407407407407"], // 1000 SD over 30 days (864000 blocks)
            borrowSpeeds: ["1157407407407407"], // 1000 SD over 30 days (864000 blocks)
          },
          {
            asset: "HAY",
            markets: ["SnBNB"],
            supplySpeeds: ["930059523809523"], // 1500 HAY over 56 days (1612800 blocks)
            borrowSpeeds: ["930059523809523"], // 1500 HAY over 56 days (1612800 blocks)
          },
        ],
      },
      {
        id: "Tron",
        name: "Tron",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BTT (Tron)",
            asset: "BTT",
            symbol: "vBTT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("16753000000", 18),
            supplyCap: convertToUnit("1500000000000", 18),
            borrowCap: convertToUnit("1050000000000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus NFT (Tron)",
            asset: "NFT",
            symbol: "vNFT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("27153000000", 6), // Note 6 decimals
            supplyCap: convertToUnit("4000000000", 6), // Note 6 decimals
            borrowCap: convertToUnit("2800000000", 6), // Note 6 decimals
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus WIN (Tron)",
            asset: "WIN",
            symbol: "vWIN_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("134000000", 18),
            supplyCap: convertToUnit("3000000000", 18),
            borrowCap: convertToUnit("2100000000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus TRX (Tron)",
            asset: "TRX",
            symbol: "vTRX_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.25", 18),
            liquidationThreshold: convertToUnit("0.3", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("129000", 6), // Note 6 decimals
            supplyCap: convertToUnit("11000000", 6), // Note 6 decimals
            borrowCap: convertToUnit("7700000", 6), // Note 6 decimals
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDT (Tron)",
            asset: "USDT",
            symbol: "vUSDT_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.88", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "28800",
          },
          {
            name: "Venus USDD (Tron)",
            asset: "USDD",
            symbol: "vUSDD_Tron",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.03", 18),
            multiplierPerYear: convertToUnit("0.1", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.65", 18),
            liquidationThreshold: convertToUnit("0.7", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("2000000", 18),
            borrowCap: convertToUnit("1600000", 18),
            vTokenReceiver: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
            reduceReservesBlockDelta: "28800",
          },
        ],
        rewards: [
          {
            asset: "BTT",
            markets: ["BTT"],
            supplySpeeds: ["19969071901620370370370"], // 17253278123 BTT over 30 days (864000 blocks)
            borrowSpeeds: ["19969071901620370370370"], // 17253278123 BTT over 30 days (864000 blocks)
          },
          {
            asset: "WIN",
            markets: ["WIN"],
            supplySpeeds: ["24805131365740740740"], // 21431633.5 WIN over 30 days (864000 blocks)
            borrowSpeeds: ["24805131365740740740"], // 21431633.5 WIN over 30 days (864000 blocks)
          },
          {
            asset: "TRX",
            markets: ["TRX"],
            supplySpeeds: ["45461"], // 39278.5 TRX over 30 days (864000 blocks)
            borrowSpeeds: ["45461"], // 39278.5 TRX over 30 days (864000 blocks)
          },
          {
            asset: "USDD",
            markets: ["USDD"],
            supplySpeeds: ["14467592592592592"], // 12500 USDD over 30 days (864000 blocks)
            borrowSpeeds: ["14467592592592592"], // 12500 USDD over 30 days (864000 blocks)
          },
        ],
      },
      {
        id: "Meme",
        name: "Meme",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BabyDoge (Meme)",
            asset: "BabyDoge",
            symbol: "vBabyDoge_Meme",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.3", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("27917365987868.178893572", 9),
            supplyCap: convertToUnit("1600000000000000", 9),
            borrowCap: convertToUnit("800000000000000", 9),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
          {
            name: "Venus USDT (Meme)",
            asset: "USDT",
            symbol: "vUSDT_Meme",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0", 18),
            multiplierPerYear: convertToUnit("0.175", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 18),
            supplyCap: convertToUnit("1000000", 18),
            borrowCap: convertToUnit("900000", 18),
            vTokenReceiver: preconfiguredAddresses.bscmainnet.VTreasury,
            reduceReservesBlockDelta: "100",
          },
        ],
        rewards: [
          {
            asset: "BabyDoge",
            markets: ["BabyDoge"],
            supplySpeeds: ["12134623477230768"], // 7,863,236,013,245.53792216 BabyDoge over 90 days (648000 blocks)
            borrowSpeeds: ["12134623477230768"], // 7,863,236,013,245.53792216 BabyDoge over 90 days (648000 blocks)
          },
        ],
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
  sepolia: {
    tokensConfig: [
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
      },
      {
        isMock: true,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0x66ebd019E86e0af5f228a0439EBB33f045CBe63E",
      },
      {
        isMock: true,
        name: "Curve DAO Token",
        symbol: "CRV",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Curve.Fi USD Stablecoin",
        symbol: "crvUSD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped liquid staked Ether 2.0",
        symbol: "wstETH",
        decimals: 18,
        tokenAddress: "0x9b87ea90fdb55e1a0f17fbeddcf7eb0ac4d50493",
      },
      {
        isMock: true,
        name: "Wrapped eETH",
        symbol: "weETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "ether.fi ETH",
        symbol: "eETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Dai Stablecoin",
        symbol: "DAI",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "PT ether.fi weETH 26DEC2024",
        symbol: "PT-weETH-26DEC2024",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "TrueUSD",
        symbol: "TUSD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Frax",
        symbol: "FRAX",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Staked FRAX",
        symbol: "sFRAX",
        decimals: 18,
        tokenAddress: "0xd85FfECdB4287587BC53c1934D548bF7480F11C4",
      },
      {
        isMock: true,
        name: "Staked Frax Ether",
        symbol: "sfrxETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "rsETH",
        symbol: "rsETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Renzo Restaked ETH",
        symbol: "ezETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Super Symbiotic LRT",
        symbol: "weETHs",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.05", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.75", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.3", 8), // 0.3 WBTC
            supplyCap: convertToUnit(300, 8),
            borrowCap: convertToUnit(250, 8),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.045", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(5, 18), // 5 WETH
            supplyCap: convertToUnit(5500, 18),
            borrowCap: convertToUnit(4600, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus USDC (Core)",
            asset: "USDC",
            symbol: "vUSDC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.82", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDC
            supplyCap: convertToUnit(10_000_000, 6),
            borrowCap: convertToUnit(9_000_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.82", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDT
            supplyCap: convertToUnit(10_000_000, 6),
            borrowCap: convertToUnit(9_000_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus crvUSD (Core)",
            asset: "crvUSD",
            symbol: "vcrvUSD_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.82", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(9_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus CRV (Core)",
            asset: "CRV",
            symbol: "vCRV_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(20_000, 18),
            supplyCap: convertToUnit(5_000_000, 18),
            borrowCap: convertToUnit(2_500_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus DAI (Core)",
            asset: "DAI",
            symbol: "vDAI_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 18), // 5000 DAI
            supplyCap: convertToUnit(50_000_000, 18),
            borrowCap: convertToUnit(45_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus TUSD (Core)",
            asset: "TUSD",
            symbol: "vTUSD_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(5000, 18), // 5000 TUSD
            supplyCap: convertToUnit(2_000_000, 18),
            borrowCap: convertToUnit(1_800_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury, // TBD
          },
          {
            name: "Venus Frax (Core)",
            asset: "FRAX",
            symbol: "vFRAX_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(5000, 18), // 5000 FRAX
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(8_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury, // TBD
          },
          {
            name: "Venus Staked FRAX (Core)",
            asset: "sFRAX",
            symbol: "vsFRAX_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(4800, 18), // 4800 sFRAX
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(1_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury, // TBD
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // WETH:    18 XVS for Suppliers
          //          27 XVS for Borrowers
          // WBTC:    54 XVS for Suppliers
          //          81 XVS for Borrowers
          // USDT:    54 XVS for Suppliers
          //          81 XVS for Borrowers
          // USDC:    54 XVS for Suppliers
          //          81 XVS for Borrowers
          // crvUSD:  24 XVS for Suppliers
          //          36 XVS for Borrowers
          // FRAX:    960 XVS for Suppliers
          //          1440 XVS for Borrowers
          // sFRAX:   1440 XVS for Suppliers
          //          960 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC", "crvUSD", "FRAX", "sFRAX"],
            supplySpeeds: [
              "27777777777777",
              "83333333333333",
              "83333333333333",
              "83333333333333",
              "37037037037036",
              "1481481481481481",
              "2222222222222222",
            ],
            borrowSpeeds: [
              "41666666666666",
              "125000000000000",
              "125000000000000",
              "125000000000000",
              "55555555555555",
              "2222222222222222",
              "1481481481481481",
            ],
          },
          {
            asset: "CRV",
            markets: ["crvUSD"],
            supplySpeeds: ["771604938271604"], // 500 CRV over 90 days (648000 blocks)
            borrowSpeeds: ["1157407407407407"], // 750 CRV over 90 days (648000 blocks)
          },
        ],
      },
      {
        id: "Stablecoins",
        name: "Stablecoins",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus USDC (Stablecoins)",
            asset: "USDC",
            symbol: "vUSDC_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.85", 18),
            liquidationThreshold: convertToUnit("0.9", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDC
            supplyCap: convertToUnit(5_000_000, 6),
            borrowCap: convertToUnit(4_500_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus USDT (Stablecoins)",
            asset: "USDT",
            symbol: "vUSDT_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.85", 18),
            liquidationThreshold: convertToUnit("0.9", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDT
            supplyCap: convertToUnit(5_000_000, 6),
            borrowCap: convertToUnit(4_500_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus crvUSD (Stablecoins)",
            asset: "crvUSD",
            symbol: "vcrvUSD_Stablecoins",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.85", 18),
            liquidationThreshold: convertToUnit("0.9", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18), // 10,000 crvUSD
            supplyCap: convertToUnit(5_000_000, 18),
            borrowCap: convertToUnit(4_500_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
        ],
        rewards: [],
      },
      {
        id: "Curve",
        name: "Curve",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus crvUSD (Curve)",
            asset: "crvUSD",
            symbol: "vcrvUSD_Curve",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(2_500_000, 18),
            borrowCap: convertToUnit(2_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus CRV (Curve)",
            asset: "CRV",
            symbol: "vCRV_Curve",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.6", 18),
            liquidationThreshold: convertToUnit("0.65", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(20_000, 18),
            supplyCap: convertToUnit(5_000_000, 18),
            borrowCap: convertToUnit(2_500_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // CRV:     6 XVS for Suppliers
          //          9 XVS for Borrowers
          // crvUSD:  24 XVS for Suppliers
          //          36 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["CRV", "crvUSD"],
            supplySpeeds: ["9259259259259", "37037037037037"],
            borrowSpeeds: ["13888888888888", "55555555555555"],
          },
          {
            asset: "CRV",
            markets: ["crvUSD"],
            supplySpeeds: ["771604938271604"], // 500 CRV over 90 days (648000 blocks)
            borrowSpeeds: ["1157407407407407"], // 750 CRV over 90 days (648000 blocks)
          },
        ],
      },
      {
        id: "Liquid Staked ETH",
        name: "Liquid Staked ETH",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.02", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus wstETH (Liquid Staked ETH)",
            asset: "wstETH",
            symbol: "vwstETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("4.333157504239697044", 18),
            supplyCap: convertToUnit(20_000, 18),
            borrowCap: convertToUnit(2_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus WETH (Liquid Staked ETH)",
            asset: "WETH",
            symbol: "vWETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.15", 18),
            initialSupply: convertToUnit(5, 18),
            supplyCap: convertToUnit(20_000, 18),
            borrowCap: convertToUnit(18_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus weETH (Liquid Staked ETH)",
            asset: "weETH",
            symbol: "vweETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.20", 18),
            initialSupply: convertToUnit(5, 18),
            supplyCap: convertToUnit(7_500, 18),
            borrowCap: convertToUnit(750, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus PT-wETH-26DEC2024 (Liquid Staked ETH)",
            asset: "PT-weETH-26DEC2024",
            symbol: "vPT-weETH-26DEC2024_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.20", 18),
            initialSupply: convertToUnit("1.799618792392372642", 18),
            supplyCap: convertToUnit(3750, 18),
            borrowCap: convertToUnit(375, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus rsETH (Liquid Staked ETH)",
            asset: "rsETH",
            symbol: "vrsETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(2, 18),
            supplyCap: convertToUnit(8_000, 18),
            borrowCap: convertToUnit(3_600, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus sfrxETH (Liquid Staked ETH)",
            asset: "sfrxETH",
            symbol: "vsfrxETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.40", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.2", 18),
            supplyCap: convertToUnit(10_000, 18),
            borrowCap: convertToUnit(1_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus ezETH (Liquid Staked ETH)",
            asset: "ezETH",
            symbol: "vezETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(2, 18),
            supplyCap: convertToUnit(14_000, 18),
            borrowCap: convertToUnit(1_400, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus weETHs (Liquid Staked ETH)",
            asset: "weETHs",
            symbol: "vweETHs_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("10.009201470952191487", 18),
            supplyCap: convertToUnit(180, 18),
            borrowCap: convertToUnit(0, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // WSTETH:  144 XVS for Suppliers
          //          0 XVS for Borrowers
          // WETH:    165 XVS for Suppliers
          //          385 XVS for Borrowers
          // sfrxETH: 24 XVS for Suppliers
          //          0 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["wstETH", "WETH", "sfrxETH"],
            supplySpeeds: ["222222222222222", "254629629629629", "3703703703703"],
            borrowSpeeds: ["0", "594135802469135", "0"],
          },
          {
            asset: "wstETH",
            markets: ["wstETH"],
            supplySpeeds: ["712962962962"], // 0.154 WSTETH over 30 days (216000 blocks)
            borrowSpeeds: ["0"],
          },
          {
            asset: "USDC",
            markets: ["weETH"],
            supplySpeeds: ["23148"], // 5,000 USDC for 30 days (216000 blocks)
            borrowSpeeds: ["0"],
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.sepolia.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.sepolia,
  },
  ethereum: {
    tokensConfig: [
      {
        isMock: false,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      },
      {
        isMock: false,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      },
      {
        isMock: false,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      {
        isMock: false,
        name: "Venus XVS",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0xd3CC9d8f3689B83c91b7B59cAB4946B063EB894A",
      },
      {
        isMock: false,
        name: "Curve DAO Token",
        symbol: "CRV",
        decimals: 18,
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
      },
      {
        isMock: false,
        name: "Curve.Fi USD Stablecoin",
        symbol: "crvUSD",
        decimals: 18,
        tokenAddress: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
      },
      {
        isMock: false,
        name: "Wrapped liquid staked Ether 2.0",
        symbol: "wstETH",
        decimals: 18,
        tokenAddress: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
      },
      {
        isMock: false,
        name: "Wrapped eETH",
        symbol: "weETH",
        decimals: 18,
        tokenAddress: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
      },
      {
        isMock: false,
        name: "ether.fi ETH",
        symbol: "eETH",
        decimals: 18,
        tokenAddress: "0x35fA164735182de50811E8e2E824cFb9B6118ac2",
      },
      {
        isMock: false,
        name: "Dai Stablecoin",
        symbol: "DAI",
        decimals: 18,
        tokenAddress: "0x6b175474e89094c44da98b954eedeac495271d0f",
      },
      {
        isMock: false,
        name: "TrueUSD",
        symbol: "TUSD",
        decimals: 18,
        tokenAddress: "0x0000000000085d4780B73119b644AE5ecd22b376",
      },
      {
        isMock: false,
        name: "Frax",
        symbol: "FRAX",
        decimals: 18,
        tokenAddress: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
      },
      {
        isMock: false,
        name: "Staked FRAX",
        symbol: "sFRAX",
        decimals: 18,
        tokenAddress: "0xA663B02CF0a4b149d2aD41910CB81e23e1c41c32",
      },
      {
        isMock: false,
        name: "PT ether.fi weETH 26DEC2024",
        symbol: "PT-weETH-26DEC2024",
        decimals: 18,
        tokenAddress: "0x6ee2b5E19ECBa773a352E5B21415Dc419A700d1d",
      },
      {
        isMock: false,
        name: "Staked Frax Ether",
        symbol: "sfrxETH",
        decimals: 18,
        tokenAddress: "0xac3E018457B222d93114458476f3E3416Abbe38F",
      },
      {
        isMock: false,
        name: "rsETH",
        symbol: "rsETH",
        decimals: 18,
        tokenAddress: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7",
      },
      {
        isMock: false,
        name: "Renzo Restaked ETH",
        symbol: "ezETH",
        decimals: 18,
        tokenAddress: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
      },
      {
        isMock: false,
        name: "Super Symbiotic LRT",
        symbol: "weETHs",
        decimals: 18,
        tokenAddress: "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.75", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.3", 8), // 0.3 WBTC
            supplyCap: convertToUnit(1000, 8),
            borrowCap: convertToUnit(850, 8),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(5, 18), // 5 WETH
            supplyCap: convertToUnit(20_000, 18),
            borrowCap: convertToUnit(18_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus USDC (Core)",
            asset: "USDC",
            symbol: "vUSDC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDC
            supplyCap: convertToUnit(50_000_000, 6),
            borrowCap: convertToUnit(45_000_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 6), // 10,000 USDT
            supplyCap: convertToUnit(50_000_000, 6),
            borrowCap: convertToUnit(45_000_000, 6),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus crvUSD (Core)",
            asset: "crvUSD",
            symbol: "vcrvUSD_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(50_000_000, 18),
            borrowCap: convertToUnit(45_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
          },
          {
            name: "Venus DAI (Core)",
            asset: "DAI",
            symbol: "vDAI_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 18), // 5000 DAI
            supplyCap: convertToUnit(50_000_000, 18),
            borrowCap: convertToUnit(45_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus TUSD (Core)",
            asset: "TUSD",
            symbol: "vTUSD_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(5000, 18), // 5000 TUSD
            supplyCap: convertToUnit(2_000_000, 18),
            borrowCap: convertToUnit(1_800_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus Frax (Core)",
            asset: "FRAX",
            symbol: "vFRAX_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(5000, 18), // 5000 FRAX
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(8_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x6e74053a3798e0fC9a9775F7995316b27f21c4D2",
          },
          {
            name: "Venus Staked FRAX (Core)",
            asset: "sFRAX",
            symbol: "vsFRAX_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(4800, 18), // 4800 sFRAX
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(1_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x6e74053a3798e0fC9a9775F7995316b27f21c4D2",
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // WETH:    1800 XVS for Suppliers
          //          2700 XVS for Borrowers
          // WBTC:    5400 XVS for Suppliers
          //          8100 XVS for Borrowers
          // USDT:    5400 XVS for Suppliers
          //          8100 XVS for Borrowers
          // USDC:    5400 XVS for Suppliers
          //          8100 XVS for Borrowers
          // crvUSD:  2400 XVS for Suppliers
          //          3600 XVS for Borrowers
          // FRAX:    960 XVS for Suppliers
          //          1440 XVS for Borrowers
          // sFRAX:   1440 XVS for Suppliers
          //          960 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC", "crvUSD", "FRAX", "sFRAX"],
            supplySpeeds: [
              "2777777777777777",
              "8333333333333333",
              "8333333333333333",
              "8333333333333333",
              "3703703703703703",
              "1481481481481481",
              "2222222222222222",
            ],
            borrowSpeeds: [
              "4166666666666666",
              "12500000000000000",
              "12500000000000000",
              "12500000000000000",
              "5555555555555555",
              "2222222222222222",
              "1481481481481481",
            ],
          },
          {
            asset: "CRV",
            markets: ["crvUSD"],
            supplySpeeds: ["77160493827160493"], // 50000 CRV over 90 days (648000 blocks)
            borrowSpeeds: ["115740740740740740"], // 75000 CRV over 90 days (648000 blocks)
          },
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC", "crvUSD"],
            supplySpeeds: [
              "2083333333333333",
              "6250000000000000",
              "6250000000000000",
              "6250000000000000",
              "2777777777777777",
            ],
            borrowSpeeds: [
              "3125000000000000",
              "9375000000000000",
              "9375000000000000",
              "9375000000000000",
              "4166666666666666",
            ],
          },
        ],
      },
      {
        id: "Curve",
        name: "Curve",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus crvUSD (Curve)",
            asset: "crvUSD",
            symbol: "vcrvUSD_Curve",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.125", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.45", 18),
            liquidationThreshold: convertToUnit("0.5", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18),
            supplyCap: convertToUnit(2_500_000, 18),
            borrowCap: convertToUnit(2_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
          },
          {
            name: "Venus CRV (Curve)",
            asset: "CRV",
            symbol: "vCRV_Curve",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.45", 18),
            liquidationThreshold: convertToUnit("0.5", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(40_000, 18),
            supplyCap: convertToUnit(6_000_000, 18),
            borrowCap: convertToUnit(3_000_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // CRV:     600 XVS for Suppliers
          //          900 XVS for Borrowers
          // crvUSD:  2400 XVS for Suppliers
          //          3600 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["vCRV", "crvUSD"],
            supplySpeeds: ["925925925925925", "3703703703703703"],
            borrowSpeeds: ["1388888888888888", "5555555555555555"],
          },
          {
            asset: "CRV",
            markets: ["crvUSD"],
            supplySpeeds: ["77160493827160493"], // 50000 CRV over 90 days (648000 blocks)
            borrowSpeeds: ["115740740740740740"], // 75000 CRV over 90 days (648000 blocks)
          },
          {
            asset: "XVS",
            markets: ["vCRV", "crvUSD"],
            supplySpeeds: ["694444444444444", "694444444444444"],
            borrowSpeeds: ["1041666666666666", "1041666666666666"],
          },
        ],
      },
      {
        id: "Liquid Staked ETH",
        name: "Liquid Staked ETH",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.02", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus wstETH (Liquid Staked ETH)",
            asset: "wstETH",
            symbol: "vwstETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("4.333157504239697044", 18),
            supplyCap: convertToUnit(20_000, 18),
            borrowCap: convertToUnit(2_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus WETH (Liquid Staked ETH)",
            asset: "WETH",
            symbol: "vWETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.045", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.9", 18),
            collateralFactor: convertToUnit("0", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(5, 18),
            supplyCap: convertToUnit(20_000, 18),
            borrowCap: convertToUnit(18_000, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
          {
            name: "Venus weETH (Liquid Staked ETH)",
            asset: "weETH",
            symbol: "vweETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.20", 18),
            initialSupply: convertToUnit("2.761910220333160209", 18),
            supplyCap: convertToUnit(7_500, 18),
            borrowCap: convertToUnit(750, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: `0xF6C612c745Ba4546075DB62902c1Eb3255CdAe28`,
          },
          {
            name: "Venus PT-wETH-26DEC2024 (Liquid Staked ETH)",
            asset: "PT-weETH-26DEC2024",
            symbol: "vPT-weETH-26DEC2024_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.20", 18),
            initialSupply: convertToUnit("1.799618792392372642", 18),
            supplyCap: convertToUnit(1200, 18),
            borrowCap: convertToUnit(0, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.ethereum.VTreasury,
          },
          {
            name: "Venus rsETH (Liquid Staked ETH)",
            asset: "rsETH",
            symbol: "vrsETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("2", 18),
            supplyCap: convertToUnit(8_000, 18),
            borrowCap: convertToUnit(3_600, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: "0x7AAd74b7f0d60D5867B59dbD377a71783425af47",
          },
          {
            name: "Venus sfrxETH (Liquid Staked ETH)",
            asset: "sfrxETH",
            symbol: "vsfrxETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.40", 18),
            collateralFactor: convertToUnit("0.9", 18),
            liquidationThreshold: convertToUnit("0.93", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.2", 18),
            supplyCap: convertToUnit(10_000, 18),
            borrowCap: convertToUnit(1_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ETHEREUM,
            vTokenReceiver: "0x6e74053a3798e0fC9a9775F7995316b27f21c4D2",
          },
          {
            name: "Venus ezETH (Liquid Staked ETH)",
            asset: "ezETH",
            symbol: "vezETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.41", 18),
            supplyCap: convertToUnit(14_000, 18),
            borrowCap: convertToUnit(1_400, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ETHEREUM,
            vTokenReceiver: "0x1E3233E8d972cfFc7D0f83aFAE4354a0Db74e34E",
          },
          {
            name: "Venus weETHs (Liquid Staked ETH)",
            asset: "weETHs",
            symbol: "vweETHs_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("0.75", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.85", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("10.009201470952191487", 18),
            supplyCap: convertToUnit(180, 18),
            borrowCap: convertToUnit(0, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ETHEREUM,
            vTokenReceiver: "0x86fBaEB3D6b5247F420590D303a6ffC9cd523790",
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (648000 blocks)
          // WSTETH:  14400 XVS for Suppliers
          //          0 XVS for Borrowers
          // WETH:    16500 XVS for Suppliers
          //          38500 XVS for Borrowers
          // sfrxETH: 2400 XVS for Suppliers
          //          0 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["wstETH", "WETH", "sfrxETH"],
            supplySpeeds: ["22222222222222222", "25462962962962962", "3703703703703703"],
            borrowSpeeds: ["0", "59413580246913580", "0"],
          },
          {
            asset: "wstETH",
            markets: ["wstETH"],
            supplySpeeds: ["71296296296296"], // 15.4 WSTETH over 30 days (216000 blocks)
            borrowSpeeds: ["0"],
          },
          {
            asset: "USDC",
            markets: ["weETH"],
            supplySpeeds: ["23148"], // 5,000 USDC for 30 days (216000 blocks)
            borrowSpeeds: ["0"],
          },
          {
            asset: "XVS",
            markets: ["wstETH", "WETH"],
            supplySpeeds: ["22222222222222222", "25462962962962962"],
            borrowSpeeds: ["0", "59413580246913580"],
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.ethereum.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.ethereum,
  },
  opbnbtestnet: {
    tokensConfig: [
      {
        isMock: true,
        name: "BTCB Token",
        symbol: "BTCB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Ethereum Token",
        symbol: "ETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Tether USD",
        symbol: "USDT",
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
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BTCB (Core)",
            asset: "BTCB",
            symbol: "vBTCB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.05", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.75", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.3", 18), // 0.3 BTCB
            supplyCap: convertToUnit(300, 18),
            borrowCap: convertToUnit(250, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBTESTNET,
            vTokenReceiver: preconfiguredAddresses.opbnbtestnet.VTreasury,
          },
          {
            name: "Venus ETH (Core)",
            asset: "ETH",
            symbol: "vETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.045", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(5, 18), // 5 ETH
            supplyCap: convertToUnit(5500, 18),
            borrowCap: convertToUnit(4600, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBTESTNET,
            vTokenReceiver: preconfiguredAddresses.opbnbtestnet.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.07", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.8", 18),
            liquidationThreshold: convertToUnit("0.82", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit(10_000, 18), // 10,000 USDT
            supplyCap: convertToUnit(10_000_000, 18),
            borrowCap: convertToUnit(9_000_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBTESTNET,
            vTokenReceiver: preconfiguredAddresses.opbnbtestnet.VTreasury,
          },
          {
            name: "Venus WBNB (Core)",
            asset: "WBNB",
            symbol: "vWBNB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.5", 18),
            collateralFactor: convertToUnit("0.45", 18),
            liquidationThreshold: convertToUnit("0.5", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(45, 18), // 45 WBNB
            supplyCap: convertToUnit(80_000, 18),
            borrowCap: convertToUnit(56_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBTESTNET,
            vTokenReceiver: preconfiguredAddresses.opbnbtestnet.VTreasury,
          },
        ],
        rewards: [],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.opbnbtestnet.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.opbnbtestnet,
  },
  opbnbmainnet: {
    tokensConfig: [
      {
        isMock: false,
        name: "BTCB Token",
        symbol: "BTCB",
        decimals: 18,
        tokenAddress: "0x7c6b91d9be155a6db01f749217d76ff02a7227f2",
      },
      {
        isMock: false,
        name: "Ethereum Token",
        symbol: "ETH",
        decimals: 18,
        tokenAddress: "0xe7798f023fc62146e8aa1b36da45fb70855a77ea",
      },
      {
        isMock: false,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        tokenAddress: "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3",
      },
      {
        isMock: false,
        name: "Wrapped BNB",
        symbol: "WBNB",
        decimals: 18,
        tokenAddress: "0x4200000000000000000000000000000000000006",
      },
      {
        isMock: false,
        name: "Venus XVS",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0x3E2e61F1c075881F3fB8dd568043d8c221fd5c61",
      },
      {
        isMock: false,
        name: "First Digital USD",
        symbol: "FDUSD",
        decimals: 18,
        tokenAddress: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus BTCB (Core)",
            asset: "BTCB",
            symbol: "vBTCB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.03553143", 18), // 0.03553143 BTCB
            supplyCap: convertToUnit(1, 18),
            borrowCap: convertToUnit("0.55", 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET,
            vTokenReceiver: preconfiguredAddresses.opbnbmainnet.VTreasury,
          },
          {
            name: "Venus ETH (Core)",
            asset: "ETH",
            symbol: "vETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.610978879332136515", 18), // 0.610978879332136515 ETH
            supplyCap: convertToUnit(25, 18),
            borrowCap: convertToUnit(16, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET,
            vTokenReceiver: preconfiguredAddresses.opbnbmainnet.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.125", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800.00000001", 18), // 1,800.00000001 USDT
            supplyCap: convertToUnit(150_000, 18),
            borrowCap: convertToUnit(130_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET,
            vTokenReceiver: preconfiguredAddresses.opbnbmainnet.VTreasury,
          },
          {
            name: "Venus WBNB (Core)",
            asset: "WBNB",
            symbol: "vWBNB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.6", 18),
            collateralFactor: convertToUnit("0.6", 18),
            liquidationThreshold: convertToUnit("0.65", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("4.881499602605344833", 18), // 4,881499602605344833 WBNB
            supplyCap: convertToUnit(100, 18),
            borrowCap: convertToUnit(75, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET,
            vTokenReceiver: preconfiguredAddresses.opbnbmainnet.VTreasury,
          },
          {
            name: "Venus FDUSD (Core)",
            asset: "FDUSD",
            symbol: "vFDUSD_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.125", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800.00000001", 18), // 1,800.00000001 FUSDT
            supplyCap: convertToUnit(150_000, 18),
            borrowCap: convertToUnit(130_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OPBNBMAINNET,
            vTokenReceiver: preconfiguredAddresses.opbnbmainnet.VTreasury,
          },
        ],
        rewards: [],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.opbnbmainnet.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.opbnbmainnet,
  },
  arbitrumsepolia: {
    tokensConfig: [
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      },
      {
        isMock: true,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Arbitrum",
        symbol: "ARB",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Wrapped liquid staked Ether 2.0.",
        symbol: "wstETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Wrapped eETH",
        symbol: "weETH",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x980b62da83eff3d4576c647993b0c1d7faf17c73",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.03553143", 8), // 0.03553143 WBTC
            supplyCap: convertToUnit(1, 8),
            borrowCap: convertToUnit("0.55", 8),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.610978879332136515", 18), // 0.610978879332136515 WETH
            supplyCap: convertToUnit(25, 18),
            borrowCap: convertToUnit(16, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus USDC (Core)",
            asset: "USDC",
            symbol: "vUSDC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.075", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800", 6), // 1,800 USDC
            supplyCap: convertToUnit(150_000, 6),
            borrowCap: convertToUnit(130_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.075", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800", 6), // 1,800 USDT
            supplyCap: convertToUnit(150_000, 6),
            borrowCap: convertToUnit(130_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus ARB (Core)",
            asset: "ARB",
            symbol: "vARB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.610978879332136515", 18), // 0.610978879332136515 ARB
            supplyCap: convertToUnit(25, 18),
            borrowCap: convertToUnit(16, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
        ],
        rewards: [
          {
            asset: "USDT",
            markets: ["USDT"],
            supplySpeeds: ["2893"], // 250 USDT per day
            borrowSpeeds: ["2893"], // 250 USDT per day
          },
        ],
      },
      {
        id: "Liquid Staked ETH",
        name: "Liquid Staked ETH",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.02", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus wstETH (Liquid Staked ETH)",
            asset: "wstETH",
            symbol: "vwstETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.93", 18),
            liquidationThreshold: convertToUnit("0.95", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(2, 18),
            supplyCap: convertToUnit(8_000, 18),
            borrowCap: convertToUnit(800, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus weETH (Liquid Staked ETH)",
            asset: "weETH",
            symbol: "vweETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.93", 18),
            liquidationThreshold: convertToUnit("0.95", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(2, 18),
            supplyCap: convertToUnit(4_600, 18),
            borrowCap: convertToUnit(2_300, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.arbitrumsepolia.VTreasury,
          },
          {
            name: "Venus WETH (Liquid Staked ETH)",
            asset: "WETH",
            symbol: "vWETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.77", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(2, 18),
            supplyCap: convertToUnit(14_000, 18),
            borrowCap: convertToUnit(12_500, 18),
            reduceReservesBlockDelta: DEFAULT_REDUCE_RESERVES_BLOCK_DELTA,
            vTokenReceiver: preconfiguredAddresses.sepolia.VTreasury,
          },
        ],
        rewards: [],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.arbitrumsepolia.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.arbitrumsepolia,
  },
  arbitrumone: {
    tokensConfig: [
      {
        isMock: false,
        name: "Venus XVS",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0xc1Eb7689147C81aC840d4FF0D298489fc7986d52",
      },
      {
        isMock: false,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      },
      {
        isMock: false,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        tokenAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      },
      {
        isMock: false,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      },
      {
        isMock: false,
        name: "Arbitrum",
        symbol: "ARB",
        decimals: 18,
        tokenAddress: "0x912ce59144191c1204e64559fe8253a0e49e6548",
      },
      {
        isMock: false,
        name: "Wrapped liquid staked Ether 2.0.",
        symbol: "wstETH",
        decimals: 18,
        tokenAddress: "0x5979D7b546E38E414F7E9822514be443A4800529",
      },
      {
        isMock: false,
        name: "Wrapped eETH",
        symbol: "weETH",
        decimals: 18,
        tokenAddress: "0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.0731263", 8), // 0.0731263 WBTC
            supplyCap: convertToUnit("900", 8),
            borrowCap: convertToUnit("500", 8),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.317651", 18), // 1.317651 WETH
            supplyCap: convertToUnit("26000", 18),
            borrowCap: convertToUnit("23500", 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
          {
            name: "Venus USDC (Core)",
            asset: "USDC",
            symbol: "vUSDC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.08", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6), // 5,000 USDC
            supplyCap: convertToUnit("54000000", 6),
            borrowCap: convertToUnit("49000000", 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.08", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.80", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("4999.994418", 6), // 4,999.994418 USDT
            supplyCap: convertToUnit("20000000", 6),
            borrowCap: convertToUnit("18000000", 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
          {
            name: "Venus ARB (Core)",
            asset: "ARB",
            symbol: "vARB_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.55", 18),
            liquidationThreshold: convertToUnit("0.60", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("4453.694805", 18), // 4,453.694805 ARB
            supplyCap: convertToUnit("16000000", 18),
            borrowCap: convertToUnit("9000000", 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (7776000 seconds)
          // WETH:    510 XVS for Suppliers
          //          765 XVS for Borrowers
          // WBTC:    1020 XVS for Suppliers
          //          1530 XVS for Borrowers
          // USDT:    1020 XVS for Suppliers
          //          1530 XVS for Borrowers
          // USDC:    1020 XVS for Suppliers
          //          1530 XVS for Borrowers
          // ARB:     510 XVS for Suppliers
          //          765 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC", "ARB"],
            supplySpeeds: ["65586419753086", "131172839506172", "131172839506172", "131172839506172", "65586419753086"],
            borrowSpeeds: ["98379629629629", "196759259259258", "196759259259258", "196759259259258", "98379629629629"],
          },
        ],
      },
      {
        id: "Liquid Staked ETH",
        name: "Liquid Staked ETH",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.02", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus wstETH (Liquid Staked ETH)",
            asset: "wstETH",
            symbol: "vwstETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.93", 18),
            liquidationThreshold: convertToUnit("0.95", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(3.55, 18),
            supplyCap: convertToUnit(8_000, 18),
            borrowCap: convertToUnit(800, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: "0x5A9d695c518e95CD6Ea101f2f25fC2AE18486A61",
          },
          {
            name: "Venus weETH (Liquid Staked ETH)",
            asset: "weETH",
            symbol: "vweETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit(3, 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.93", 18),
            liquidationThreshold: convertToUnit("0.95", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit(4, 18),
            supplyCap: convertToUnit(4_600, 18),
            borrowCap: convertToUnit(2_300, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: "0x46cba1e9b1e5db32da28428f2fb85587bcb785e7",
          },
          {
            name: "Venus WETH (Liquid Staked ETH)",
            asset: "WETH",
            symbol: "vWETH_LiquidStakedETH",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0", 18),
            liquidationThreshold: convertToUnit("0", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit(1.9678, 18),
            supplyCap: convertToUnit(14_000, 18),
            borrowCap: convertToUnit(12_500, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ARBITRUM_ONE,
            vTokenReceiver: preconfiguredAddresses.arbitrumone.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 90 days (7776000 seconds)
          // wstETH:  2550 XVS for Suppliers
          //          0 XVS for Borrowers
          // weETH:   2550 XVS for Suppliers
          //          0 XVS for Borrowers
          // WETH:    3060 XVS for Suppliers
          //          7140 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["wstETH", "weETH", "WETH"],
            supplySpeeds: ["327932098765432", "327932098765432", "393518518518518"],
            borrowSpeeds: ["0", "0", "918209876543209"],
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.arbitrumone.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.arbitrumone,
  },
  zksyncsepolia: {
    tokensConfig: [
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x53F7e72C7ac55b44c7cd73cC13D4EF4b121678e6",
      },
      {
        isMock: true,
        name: "Bridged USDC (zkSync)",
        symbol: "USDC.e",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "ZKsync",
        symbol: "ZK",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0x3AeCac43A2ebe5D8184e650403bf9F656F9D1cfA",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.5", 18), // 1.5 WETH
            supplyCap: convertToUnit(26_0000, 18),
            borrowCap: convertToUnit(23_500, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.zksyncsepolia.VTreasury,
          },
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.15", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.075", 8), // 0.075 WBTC
            supplyCap: convertToUnit(900, 8),
            borrowCap: convertToUnit(500, 8),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.zksyncsepolia.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6), // 5,000 USDT
            supplyCap: convertToUnit(20_000_000, 6),
            borrowCap: convertToUnit(18_000_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.zksyncsepolia.VTreasury,
          },
          {
            name: "Venus USDC.e (Core)",
            asset: "USDC.e",
            symbol: "vUSDC.e_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.78", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6), // 5,000 USDC
            supplyCap: convertToUnit(54_000_000, 6),
            borrowCap: convertToUnit(49_000_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.zksyncsepolia.VTreasury,
          },

          {
            name: "Venus ZK (Core)",
            asset: "ZK",
            symbol: "vZK_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.035", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("25000", 18), // 25,000 ZK
            supplyCap: convertToUnit(2_500_000, 18),
            borrowCap: convertToUnit(2_350_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.zksyncsepolia.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 3600 days (311040000 seconds)
          // WETH:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // WBTC:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // USDT:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // USDC:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // ZK:      360 XVS for Suppliers
          //          360 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC.e", "ZK"],
            supplySpeeds: ["1157407407407", "1157407407407", "1157407407407", "1157407407407", "1157407407407"],
            borrowSpeeds: ["1157407407407", "1157407407407", "1157407407407", "1157407407407", "1157407407407"],
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.zksyncsepolia.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.zksyncsepolia,
  },
  zksyncmainnet: {
    tokensConfig: [
      {
        isMock: false,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: "0xbbeb516fb02a01611cbbe0453fe3c580d7281011",
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
      },
      {
        isMock: false,
        name: "Bridged USDC (zkSync)",
        symbol: "USDC.e",
        decimals: 6,
        tokenAddress: "0x3355df6d4c9c3035724fd0e3914de96a5a83aaf4",
      },
      {
        isMock: false,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: "0x493257fd37edb34451f62edf8d2a0c418852ba4c",
      },
      {
        isMock: false,
        name: "ZKsync",
        symbol: "ZK",
        decimals: 18,
        tokenAddress: "0x5a7d6b2f92c77fad6ccabd7ee0624e64907eaf3e",
      },
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0xD78ABD81a3D57712a3af080dc4185b698Fe9ac5A",
      },
    ],
    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0425", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.77", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("1.5", 18), // 1.5 WETH
            supplyCap: convertToUnit(2_000, 18),
            borrowCap: convertToUnit(1_700, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET,
            vTokenReceiver: preconfiguredAddresses.zksyncmainnet.VTreasury,
          },
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("2", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.77", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.075", 8), // 0.075 WBTC
            supplyCap: convertToUnit(40, 8),
            borrowCap: convertToUnit(20, 8),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET,
            vTokenReceiver: preconfiguredAddresses.zksyncmainnet.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.77", 18),
            liquidationThreshold: convertToUnit("0.8", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6), // 5,000 USDT
            supplyCap: convertToUnit(4_000_000, 6),
            borrowCap: convertToUnit(3_300_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET,
            vTokenReceiver: preconfiguredAddresses.zksyncmainnet.VTreasury,
          },
          {
            name: "Venus USDC.e (Core)",
            asset: "USDC.e",
            symbol: "vUSDC.e_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.0875", 18),
            jumpMultiplierPerYear: convertToUnit("0.8", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.72", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("5000", 6), // 5,000 USDC
            supplyCap: convertToUnit(5_000_000, 6),
            borrowCap: convertToUnit(4_200_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET,
            vTokenReceiver: preconfiguredAddresses.zksyncmainnet.VTreasury,
          },

          {
            name: "Venus ZK (Core)",
            asset: "ZK",
            symbol: "vZK_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: convertToUnit("0.02", 18),
            multiplierPerYear: convertToUnit("0.2", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.35", 18),
            liquidationThreshold: convertToUnit("0.4", 18),
            reserveFactor: convertToUnit("0.25", 18),
            initialSupply: convertToUnit("25000", 18), // 25,000 ZK
            supplyCap: convertToUnit(25_000_000, 18),
            borrowCap: convertToUnit(12_500_000, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_ZKSYNC_MAINNET,
            vTokenReceiver: preconfiguredAddresses.zksyncmainnet.VTreasury,
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.zksyncmainnet.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.zksyncmainnet,
  },
  opsepolia: {
    tokensConfig: [
      {
        isMock: true,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
        tokenAddress: "0x4200000000000000000000000000000000000006",
      },
      {
        isMock: true,
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: true,
        name: "Optimism",
        symbol: "OP",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
      },
      {
        isMock: false,
        name: "Venus",
        symbol: "XVS",
        decimals: 18,
        tokenAddress: "0x789482e37218f9b26d8D9115E356462fA9A37116",
      },
    ],

    poolConfig: [
      {
        id: "Core",
        name: "Core",
        closeFactor: convertToUnit("0.5", 18),
        liquidationIncentive: convertToUnit("1.1", 18),
        minLiquidatableCollateral: convertToUnit("100", 18),
        vtokens: [
          {
            name: "Venus WBTC (Core)",
            asset: "WBTC",
            symbol: "vWBTC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.03553143", 8), // 0.03553143 WBTC
            supplyCap: convertToUnit(1, 8),
            borrowCap: convertToUnit("0.55", 8),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.opsepolia.VTreasury,
          },
          {
            name: "Venus WETH (Core)",
            asset: "WETH",
            symbol: "vWETH_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.610978879332136515", 18), // 0.610978879332136515 WETH
            supplyCap: convertToUnit(25, 18),
            borrowCap: convertToUnit(16, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.opsepolia.VTreasury,
          },
          {
            name: "Venus USDC (Core)",
            asset: "USDC",
            symbol: "vUSDC_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.075", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800", 6), // 1,800 USDC
            supplyCap: convertToUnit(150_000, 6),
            borrowCap: convertToUnit(130_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.opsepolia.VTreasury,
          },
          {
            name: "Venus USDT (Core)",
            asset: "USDT",
            symbol: "vUSDT_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.075", 18),
            jumpMultiplierPerYear: convertToUnit("2.5", 18),
            kink_: convertToUnit("0.8", 18),
            collateralFactor: convertToUnit("0.75", 18),
            liquidationThreshold: convertToUnit("0.77", 18),
            reserveFactor: convertToUnit("0.1", 18),
            initialSupply: convertToUnit("1800", 6), // 1,800 USDT
            supplyCap: convertToUnit(150_000, 6),
            borrowCap: convertToUnit(130_000, 6),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.opsepolia.VTreasury,
          },
          {
            name: "Venus OP (Core)",
            asset: "OP",
            symbol: "vOP_Core",
            rateModel: InterestRateModels.JumpRate.toString(),
            baseRatePerYear: "0",
            multiplierPerYear: convertToUnit("0.09", 18),
            jumpMultiplierPerYear: convertToUnit("3", 18),
            kink_: convertToUnit("0.45", 18),
            collateralFactor: convertToUnit("0.7", 18),
            liquidationThreshold: convertToUnit("0.75", 18),
            reserveFactor: convertToUnit("0.2", 18),
            initialSupply: convertToUnit("0.610978879332136515", 18), // 0.610978879332136515 OP
            supplyCap: convertToUnit(25, 18),
            borrowCap: convertToUnit(16, 18),
            reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA_OP_SEPOLIA,
            vTokenReceiver: preconfiguredAddresses.opsepolia.VTreasury,
          },
        ],
        rewards: [
          // XVS Rewards Over 120 months (311040000 seconds)
          // WETH:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // WBTC:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // USDT:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // USDC:    360 XVS for Suppliers
          //          360 XVS for Borrowers
          // OP:      360 XVS for Suppliers
          //          360 XVS for Borrowers
          {
            asset: "XVS",
            markets: ["WETH", "WBTC", "USDT", "USDC", "OP"],
            supplySpeeds: ["1157407407407", "1157407407407", "1157407407407", "1157407407407", "1157407407407"],
            borrowSpeeds: ["1157407407407", "1157407407407", "1157407407407", "1157407407407", "1157407407407"],
          },
        ],
      },
    ],
    accessControlConfig: [
      ...poolRegistryPermissions(),
      ...normalTimelockPermissions(preconfiguredAddresses.opsepolia.NormalTimelock),
    ],
    preconfiguredAddresses: preconfiguredAddresses.opsepolia,
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
    case "sepolia":
      return globalConfig.sepolia;
    case "ethereum":
      return globalConfig.ethereum;
    case "opbnbtestnet":
      return globalConfig.opbnbtestnet;
    case "opbnbmainnet":
      return globalConfig.opbnbmainnet;
    case "arbitrumsepolia":
      return globalConfig.arbitrumsepolia;
    case "arbitrumone":
      return globalConfig.arbitrumone;
    case "zksyncsepolia":
      return globalConfig.zksyncsepolia;
    case "zksyncmainnet":
      return globalConfig.zksyncmainnet;
    case "opsepolia":
      return globalConfig.opsepolia;
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

export function getBidderDeploymentValues(networkName: string): BidderDeploymentValues {
  const isTimeBased = process.env.IS_TIME_BASED_DEPLOYMENT === "true";

  if (isTimeBased) {
    return {
      waitForFirstBidder: 300,
      nextBidderBlockOrTimestampLimit: 300,
    };
  }

  switch (networkName) {
    case "hardhat":
      return {
        waitForFirstBidder: 100,
        nextBidderBlockOrTimestampLimit: 100,
      };
    case "bsctestnet":
      return {
        waitForFirstBidder: 100,
        nextBidderBlockOrTimestampLimit: 100,
      };
    case "bscmainnet":
      return {
        waitForFirstBidder: 100,
        nextBidderBlockOrTimestampLimit: 100,
      };
    case "sepolia":
      return {
        waitForFirstBidder: 25,
        nextBidderBlockOrTimestampLimit: 25,
      };
    case "ethereum":
      return {
        waitForFirstBidder: 25,
        nextBidderBlockOrTimestampLimit: 25,
      };
    case "opbnbtestnet":
      return {
        waitForFirstBidder: 300,
        nextBidderBlockOrTimestampLimit: 300,
      };
    case "opbnbmainnet":
      return {
        waitForFirstBidder: 300,
        nextBidderBlockOrTimestampLimit: 300,
      };
    case "development":
      return {
        waitForFirstBidder: 100,
        nextBidderBlockOrTimestampLimit: 100,
      };
    default:
      throw new Error(`bidder limits for network ${networkName} is not available.`);
  }
}

export function getMaxBorrowRateMantissa(networkName: string): BigNumber {
  const isTimeBased = process.env.IS_TIME_BASED_DEPLOYMENT === "true";

  if (isTimeBased) {
    return BigNumber.from(0.00016667e16); // (0.0005e16 / 3) for per second
  }

  switch (networkName) {
    case "hardhat":
      return BigNumber.from(0.0005e16);
    case "bsctestnet":
      return BigNumber.from(0.0005e16);
    case "bscmainnet":
      return BigNumber.from(0.0005e16);
    case "sepolia":
      return BigNumber.from(0.0005e16);
    case "ethereum":
      return BigNumber.from(0.0005e16);
    case "opbnbtestnet":
      return BigNumber.from(0.0005e16);
    case "opbnbmainnet":
      return BigNumber.from(0.0005e16);
    case "development":
      return BigNumber.from(0.0005e16);
    default:
      throw new Error(`max borrow rate for network ${networkName} is not available.`);
  }
}

import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { convertToUnit } from "./utils";

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
  sepolia: RemoteDeploymentConfig;
};

export type PreconfiguredAddresses = { [contract: string]: string };

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
  poolConfig: PoolConfig[];
  accessControlConfig: AccessControlEntry[];
  preconfiguredAddresses: PreconfiguredAddresses;
};

export type RemoteDeploymentConfig = {
  preconfiguredAddresses: PreconfiguredAddresses;
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

interface BridgeConfig {
  [networkName: string]: {
    methods: { method: string; args: any[] }[];
  };
}

const ANY_CONTRACT = ethers.constants.AddressZero;
const SEPOLIA_MULTISIG = "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb";

const preconfiguredAddresses = {
  hardhat: {
    VTreasury: "account:deployer",
  },
  bsctestnet: {
    VTreasury: "0x8b293600C50D6fbdc6Ed4251cc75ECe29880276f",
    NormalTimelock: "0xce10739590001705F7FF231611ba4A48B2820327",
    FastTrackTimelock: "0x3CFf21b7AF8390fE68799D58727d3b4C25a83cb6",
    CriticalTimelock: "0x23B893a7C45a5Eb8c8C062b9F32d0D2e43eD286D",
    GovernorBravo: "0x5573422A1a59385C247ec3a66B93B7C08eC2f8f2",
    AccessControlManager: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
    PancakeFactory: "0x182859893230dC89b114d6e2D547BFFE30474a21",
    WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    VBNB_CorePool: "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c",
    SwapRouter_CorePool: "0x83edf1deE1B730b7e8e13C00ba76027D63a51ac0",
    XVS: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
    ResilientOracle: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
    LzEndpoint: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
    LzVirtualChainId: "10102",
  },
  bscmainnet: {
    VTreasury: "0xF322942f644A996A617BD29c16bd7d231d9F35E9",
    NormalTimelock: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    FastTrackTimelock: "0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02",
    CriticalTimelock: "0x213c446ec11e45b15a6E29C1C1b402B8897f606d",
    GovernorBravo: "0x2d56dC077072B53571b8252008C60e945108c75a",
    AccessControlManager: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    PancakeFactory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    VBNB_CorePool: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    SwapRouter_CorePool: "0x8938E6dA30b59c1E27d5f70a94688A89F7c815a4",
    XVS: "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
    ResilientOracle: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
    LzEndpoint: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
    LzVirtualChainId: "102",
  },
  sepolia: {
    VTreasury: "0xFc43c055B9be2Ec3BEe6f8C291Af862d764016a0",
    NormalTimelock: SEPOLIA_MULTISIG,
    FastTrackTimelock: SEPOLIA_MULTISIG,
    CriticalTimelock: SEPOLIA_MULTISIG,
    GovernorBravo: SEPOLIA_MULTISIG,
    AccessControlManager: "0x799700ea540f002134C371fB955e2392FD94DbCD",
    XVS: "0xD657eB80daA42c334B1c70Cb274E83E4163A3dDc",
    ResilientOracle: "0x1B85FAbE5c0846662F5FB0E3598fC48eF587e9f0",
    LzEndpoint: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1",
    LzVirtualChainId: "10161",
  },
  ethereum: {
    // TODO
  },
};

export const xvsBridgeAdminMethods = [
  "setSendVersion(uint16)",
  "setReceiveVersion(uint16)",
  "forceResumeReceive(uint16,bytes)",
  "setOracle(address)",
  "setMaxSingleTransactionLimit(uint16,uint256)",
  "setMaxDailyLimit(uint16,uint256)",
  "setMaxSingleReceiveTransactionLimit(uint16,uint256)",
  "setMaxDailyReceiveLimit(uint16,uint256)",
  "pause()",
  "unpause()",
  "setTrustedRemoteAddress(uint16,bytes)",
  "setPrecrime(address)",
  "setMinDstGas(uint16,uint16,uint256)",
  "setPayloadSizeLimit(uint16,uint256)",
  "setWhitelist(address,bool)",
  "setConfig(uint16,uint16,uint256,bytes)",
];

export const xvsTokenPermissions = ["mint(address,uint256)", "burn(address,uint256)"];

export const bridgeConfig: BridgeConfig = {
  bsctestnet: {
    methods: [
      { method: "setTrustedRemoteAddress(uint16,bytes)", args: [10161, ANY_CONTRACT] },
      { method: "setMinDstGas(uint16,uint16,uint256)", args: [10161, 0, "200000"] },
      { method: "setMaxSingleTransactionLimit(uint16,uint256)", args: [10161, "10000000000000000000"] },
      { method: "setMaxDailyLimit(uint16,uint256)", args: [10161, "500000000000000000000"] },
      { method: "setMaxSingleReceiveTransactionLimit(uint16,uint256)", args: [10161, "10000000000000000000"] },
      { method: "setMaxDailyReceiveLimit(uint16,uint256)", args: [10161, "50000000000000000000"] },
    ],
  },
  bscmainnet: {
    methods: [
      { method: "setTrustedRemoteAddress(uint16,bytes)", args: [101, ANY_CONTRACT] },
      { method: "setMinDstGas(uint16,uint16,uint256)", args: [101, 0, "200000"] },
      { method: "setMaxSingleTransactionLimit(uint16,uint256)", args: [101, "10000000000000000000"] },
      { method: "setMaxDailyLimit(uint16,uint256)", args: [101, "500000000000000000000"] },
      { method: "setMaxSingleReceiveTransactionLimit(uint16,uint256)", args: [101, "10000000000000000000"] },
      { method: "setMaxDailyReceiveLimit(uint16,uint256)", args: [101, "50000000000000000000"] },
    ],
  },
  sepolia: {
    methods: [
      { method: "setTrustedRemoteAddress(uint16,bytes)", args: [10102, ANY_CONTRACT] },
      { method: "setMinDstGas(uint16,uint16,uint256)", args: [10102, 0, "200000"] },
      { method: "setMaxSingleTransactionLimit(uint16,uint256)", args: [10102, "10000000000000000000"] },
      { method: "setMaxDailyLimit(uint16,uint256)", args: [10102, "500000000000000000000"] },
      { method: "setMaxSingleReceiveTransactionLimit(uint16,uint256)", args: [10102, "10000000000000000000"] },
      { method: "setMaxDailyReceiveLimit(uint16,uint256)", args: [10102, "50000000000000000000"] },
    ],
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
            supplySpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1860119047619047"], // 1500 HAY over 28 days (806400 blocks)
          },
          {
            asset: "HAY",
            markets: ["HAY"],
            supplySpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
            borrowSpeeds: ["1240079365079365"], // 1000 HAY over 28 days (806400 blocks)
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            initialSupply: convertToUnit("10000", 18),
            supplyCap: convertToUnit("18600000", 18),
            borrowCap: convertToUnit("14880000", 18),
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
            vTokenReceiver: "0xf322942f644a996a617bd29c16bd7d231d9f35e9",
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
    preconfiguredAddresses: preconfiguredAddresses.sepolia,
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

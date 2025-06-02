import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Comptroller, ERC20, MockToken } from "../typechain";
import {
  DeploymentInfo,
  PoolConfig,
  RewardConfig,
  TokenConfig,
  VTokenConfig,
  blocksPerYear,
  getTokenConfig,
} from "./deploymentConfig";

export const toAddress = async (addressOrAlias: string): Promise<string> => {
  if (addressOrAlias.startsWith("0x")) {
    return addressOrAlias;
  }
  if (addressOrAlias.startsWith("account:")) {
    const namedAccounts = await getNamedAccounts();
    return namedAccounts[addressOrAlias.slice("account:".length)];
  }
  const deployment = await deployments.get(addressOrAlias);
  return deployment.address;
};

export const getUnderlyingMock = async (assetSymbol: string): Promise<MockToken> => {
  return ethers.getContract<MockToken>(`Mock${assetSymbol}`);
};

export const getUnderlyingToken = async (assetSymbol: string, tokensConfig: TokenConfig[]): Promise<ERC20> => {
  const token = getTokenConfig(assetSymbol, tokensConfig);
  let underlyingAddress = token.tokenAddress;
  if (token.isMock) {
    underlyingAddress = (await getUnderlyingMock(assetSymbol)).address;
  }
  return ethers.getContractAt<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", underlyingAddress);
};

export const getUnregisteredPools = async (poolConfig: PoolConfig[]): Promise<PoolConfig[]> => {
  const registry = await ethers.getContract("PoolRegistry");
  const registeredPools = (await registry.getAllPools()).map((p: { comptroller: string }) => p.comptroller);
  const isRegistered = await Promise.all(
    poolConfig.map(async pool => {
      const comptroller = await deployments.getOrNull(`Comptroller_${pool.name}`);
      if (!comptroller) {
        // If the Comptroller deployment doesn't exist, it's not registered
        return false;
      }
      return registeredPools.includes(comptroller.address);
    }),
  );
  return poolConfig.filter((_, idx: number) => !isRegistered[idx]);
};

export const getUnregisteredVTokens = async (poolConfig: PoolConfig[]): Promise<PoolConfig[]> => {
  const registry = await ethers.getContract("PoolRegistry");
  const registeredPools = await registry.getAllPools();
  const comptrollers = await Promise.all(
    registeredPools.map(async (p: { comptroller: string }) => {
      return ethers.getContractAt<Comptroller>("Comptroller", p.comptroller);
    }),
  );
  const registeredVTokens = (
    await Promise.all(
      comptrollers.map(async (comptroller: Comptroller) => {
        return comptroller.getAllMarkets();
      }),
    )
  ).flat();

  return Promise.all(
    poolConfig.map(async (pool: PoolConfig) => {
      const isRegistered = await Promise.all(
        pool.vtokens.map(async (vTokenConfig: VTokenConfig) => {
          const vToken = await deployments.getOrNull(`VToken_${vTokenConfig.name}`);
          if (!vToken) {
            // If the VToken deployment doesn't exist, it's not registered
            return false;
          }
          return registeredVTokens.includes(vToken.address);
        }),
      );
      return { ...pool, vtokens: pool.vtokens.filter((_, idx: number) => !isRegistered[idx]) };
    }),
  );
};

export const getUnregisteredRewardsDistributors = async (poolConfig: PoolConfig[]): Promise<PoolConfig[]> => {
  const registry = await ethers.getContract("PoolRegistry");
  const registeredPools = await registry.getAllPools();
  const comptrollers = await Promise.all(
    registeredPools.map(async (p: { comptroller: string }) => {
      return ethers.getContractAt<Comptroller>("Comptroller", p.comptroller);
    }),
  );

  const registeredRewardDistributors = (
    await Promise.all(
      comptrollers.map(async (comptroller: Comptroller) => {
        return comptroller.getRewardDistributors();
      }),
    )
  ).flat();

  return Promise.all(
    poolConfig.map(async (pool: PoolConfig) => {
      const rewards = pool.rewards || [];
      const isRegistered = await Promise.all(
        rewards.map(async (reward: RewardConfig) => {
          const rewardsDistributor = await deployments.getOrNull(`RewardsDistributor_${reward.asset}_${pool.name}`);
          if (!rewardsDistributor) {
            // If the RewardsDistributor deployment doesn't exist, it's not registered
            return false;
          }
          return registeredRewardDistributors.includes(rewardsDistributor.address);
        }),
      );
      return { ...pool, rewards: rewards.filter((_, idx: number) => !isRegistered[idx]) };
    }),
  );
};

export const getBlockOrTimestampBasedDeploymentInfo = (network: string): DeploymentInfo => {
  const blocksPerYear_ = blocksPerYear[network];
  if (blocksPerYear_ === "time-based") {
    return { isTimeBased: true, blocksPerYear: 0 };
  }
  return { isTimeBased: false, blocksPerYear: blocksPerYear_ };
};

export const skipMainnets = () => async (hre: HardhatRuntimeEnvironment) => {
  const isMainnet = hre.network.live && !hre.network.tags["testnet"];
  return isMainnet;
};

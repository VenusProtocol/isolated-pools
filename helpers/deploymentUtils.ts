import { deployments, ethers, getNamedAccounts } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
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

// Addresses reach the deploy scripts in three casings: the `@venusprotocol/*-deployments` packages record some of them
// all-lowercase, hardhat-deploy records its own checksummed, and everything read back from the chain is checksummed by
// ethers. Comparing them as strings therefore rejects addresses that are equal. On bscmainnet the governance package
// records the access control manager lowercase, so a pre-handover check refused the very address the proxy had just
// been initialized with, and the run stopped before either ownership transfer. Compare parsed addresses, never strings.
export const sameAddress = (a: string, b: string): boolean => ethers.utils.getAddress(a) === ethers.utils.getAddress(b);

// Verification reaches an external explorer API, so a failure here must not abort a deployment that already succeeded on
// chain. Re-run the script to retry.
export const verifyDeployment = async (
  hre: HardhatRuntimeEnvironment,
  name: string,
  deployment: DeployResult,
  constructorArguments: unknown[],
): Promise<void> => {
  if (!hre.network.live || !deployment.newlyDeployed) {
    return;
  }

  console.log(`Verifying ${name}...`);
  try {
    await hre.run("verify:verify", { address: deployment.address, constructorArguments });
    console.log(`${name} verified successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The plugin words this several ways depending on which explorer answered, "Already Verified" from one and
    // "has already been verified on the block explorer" from another, so match on the part they share.
    if (message.toLowerCase().includes("already verified")) {
      console.log(`${name} already verified`);
    } else {
      console.error(`${name} verification failed: ${message}`);
    }
  }
};

// A proxy deployment is two contracts on the explorer: the implementation, which carries the source every reader wants,
// and the proxy, whose constructor arguments name that implementation and the admin. Verifying one leaves the other
// unreadable, so verify both off the single `DeployResult` hardhat-deploy returns for the pair.
export const verifyProxyDeployment = async (
  hre: HardhatRuntimeEnvironment,
  name: string,
  deployment: DeployResult,
): Promise<void> => {
  if (deployment.implementation) {
    await verifyDeployment(hre, `${name} implementation`, { ...deployment, address: deployment.implementation }, []);
  }
  await verifyDeployment(hre, `${name} proxy`, deployment, deployment.args ?? []);
};

// A live RPC behind a load balancer can answer a read from a node that has not yet applied the transaction that was
// just mined, so a value read straight after a write can be the pre-write one. Both shapes of that showed up on a BSC
// testnet run: an `Ownable` beacon still naming the deployer after a successful `transferOwnership`, and an
// `Ownable2Step` registry reporting a zero pending owner after a successful nomination. Reading once and believing it
// is what turns that into a misleading log line, or worse aborts a correct deployment on a check that throws.
//
// Retry until the read matches what the transaction should have produced. A genuine misconfiguration reads the same
// wrong value on every attempt and still fails, only later; a stale read catches up within a block or two.
export const readBackUntil = async <T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  attempts = 5,
  delayMs = 3000,
): Promise<T> => {
  let value = await read();
  for (let attempt = 1; attempt < attempts && !matches(value); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    value = await read();
  }
  return value;
};

// `readBackUntil` for the common case, an address the caller already knows the expected value of.
export const readBackAddress = (read: () => Promise<string>, expected: string): Promise<string> =>
  readBackUntil(read, value => sameAddress(value, expected));

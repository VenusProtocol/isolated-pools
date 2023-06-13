import { ethers, getNamedAccounts } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { PoolConfig, RewardConfig, getConfig } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { poolConfig, preconfiguredAddresses } = await getConfig(hre.network.name);
  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;

  const rewardsDistributors = poolConfig
    .map((pool: PoolConfig) => {
      const rewards = pool.rewards || [];
      return rewards.map((reward: RewardConfig) => `RewardsDistributor_${reward.asset}_${pool.id}`);
    })
    .flat();

  const contracts = {
    singleStepOwnership: ["ComptrollerBeacon", "VTokenBeacon", "DefaultProxyAdmin"],
    twoStepOwnership: ["PoolRegistry", ...rewardsDistributors],
  };

  await transferSingleStepOwnerships(contracts.singleStepOwnership, targetOwner);
  await transfer2StepOwnerships(contracts.twoStepOwnership, targetOwner);

  // Transfer ownership to the already added pools
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const pools = await poolRegistry.callStatic.getAllPools();
  for (const pool of pools) {
    const comptrollerProxy = await ethers.getContractAt("Comptroller", pool.comptroller);
    const owner = await comptrollerProxy.owner();
    if (owner !== targetOwner) {
      const tx = await comptrollerProxy.transferOwnership(targetOwner);
      await tx.wait(1);
      const pendingOwner = await comptrollerProxy.pendingOwner();
      console.log(
        `Comptroller ${comptrollerProxy.address} owner ${owner} sucessfully changed to ${pendingOwner}. Please accept the ownership.`,
      );
    } else {
      console.error(
        `Comptroller ${comptrollerProxy} owner ${owner} is equal to target ownership address ${targetOwner}`,
      );
    }
  }
};

const transfer2StepOwnerships = async (contractNames: string[], targetOwner: string) => {
  for (const contractName of contractNames) {
    const contract = await ethers.getContract(contractName);
    const owner = await contract.owner();

    let tx;
    if (owner !== targetOwner) {
      tx = await contract.transferOwnership(targetOwner);
      await tx.wait(1);
      const pendingOwner = await contract.pendingOwner();
      console.log(
        `${contractName} owner ${owner} sucessfully changed to ${pendingOwner}. Please accept the ownership.`,
      );
    } else {
      console.error(`${contractName} owner ${owner} is equal to target ownership address ${targetOwner}`);
    }
  }
};

const transferSingleStepOwnerships = async (contractNames: string[], targetOwner: string) => {
  for (const contractName of contractNames) {
    const contract = await ethers.getContract(contractName);
    const owner = await contract.owner();

    let tx;
    if (owner !== targetOwner) {
      tx = await contract.transferOwnership(targetOwner);
      await tx.wait(1);
      const newOwner = await contract.owner();
      console.log(`${contractName} owner ${owner} sucessfully changed to ${newOwner}.`);
    } else {
      console.error(`${contractName} owner ${owner} is equal to target ownership address ${targetOwner}`);
    }
  }
};

func.tags = ["TransferPoolsOwnership"];
export default func;

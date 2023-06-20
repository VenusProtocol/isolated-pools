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

  const comptrollers = poolConfig.map((pool: PoolConfig) => `Comptroller_${pool.id}`);

  const contracts = {
    singleStepOwnership: ["ComptrollerBeacon", "VTokenBeacon", "DefaultProxyAdmin"],
    twoStepOwnership: ["PoolRegistry", ...comptrollers, ...rewardsDistributors],
  };

  await transferSingleStepOwnerships(contracts.singleStepOwnership, targetOwner);
  await transfer2StepOwnerships(contracts.twoStepOwnership, targetOwner);
};

const transfer2StepOwnerships = async (contractNames: string[], targetOwner: string) => {
  const abi = [
    "function owner() view returns (address)",
    "function pendingOwner() view returns (address)",
    "function transferOwnership(address newOwner)",
  ];
  for (const contractName of contractNames) {
    const contractAddress = (await ethers.getContract(contractName)).address;
    const contract = await ethers.getContractAt(abi, contractAddress);
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

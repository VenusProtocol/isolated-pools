import { ethers, getNamedAccounts } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { PoolConfig, getConfig } from "../helpers/deploymentConfig";

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
    const pendingOwner = await contract.pendingOwner();

    let tx;
    if (owner.toLowerCase() !== targetOwner.toLowerCase() && pendingOwner.toLowerCase() !== targetOwner.toLowerCase()) {
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
    if (owner.toLowerCase() !== targetOwner.toLowerCase()) {
      tx = await contract.transferOwnership(targetOwner);
      await tx.wait(1);
      const newOwner = await contract.owner();
      console.log(`${contractName} owner ${owner} sucessfully changed to ${newOwner}.`);
    } else {
      console.error(`${contractName} owner ${owner} is equal to target ownership address ${targetOwner}`);
    }
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { poolConfig, preconfiguredAddresses } = await getConfig(hre.getNetworkName());
  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;

  const rewardsDistributors = poolConfig
    .map((pool: PoolConfig) => {
      const rewards = pool.rewards || [];
      return rewards.map((_, idx: number) => `RewardsDistributor_${pool.id}_${idx}`);
    })
    .flat();

  const comptrollers = poolConfig.map((pool: PoolConfig) => `Comptroller_${pool.id}`);

  const contracts = {
    singleStepOwnership: ["ComptrollerBeacon", "VTokenBeacon"],
    twoStepOwnership: ["PoolRegistry", ...comptrollers, ...rewardsDistributors],
  };

  await transferSingleStepOwnerships(contracts.singleStepOwnership, targetOwner);
  await transfer2StepOwnerships(contracts.twoStepOwnership, targetOwner);
};

func.tags = ["TransferPoolsOwnership", "il"];
func.id = "transfer_pools_ownership"; // id required to prevent re-execution
export default func;

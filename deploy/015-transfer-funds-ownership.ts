import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const contracts = ["RiskFund", "Shortfall"];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { preconfiguredAddresses } = await getConfig(hre.network.name);
  const targetOwner = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer", hre);
  await transfer2StepOwnerships(contracts, targetOwner);
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

func.tags = ["TransferFundsOwnership"];
export default func;

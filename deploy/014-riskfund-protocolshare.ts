import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { getUnderlyingToken, toAddress } from "../helpers/deploymentUtils";
import { convertToUnit } from "../helpers/utils";

const MIN_AMOUNT_TO_CONVERT = convertToUnit(10, 18);
const MIN_POOL_BAD_DEBT = convertToUnit(1000, 18);
const maxLoopsLimit = 100;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokensConfig } = await getConfig(hre.network.name);
  const usdt = await getUnderlyingToken("USDT", tokensConfig);

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = ethers.provider.getSigner(deployer);

  const swapRouterAddress = await toAddress("SwapRouterCorePool", hre);
  const accessControlManagerAddress = await toAddress("AccessControlManager", hre);
  const proxyAdmin = await ethers.getContract("DefaultProxyAdmin");
  const owner = await proxyAdmin.owner();

  const corePoolComptrollerAddress = await toAddress("Unitroller", hre);

  await deploy("RiskFund", {
    from: deployer,
    contract: "RiskFund",
    proxy: {
      owner: owner,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [swapRouterAddress, MIN_AMOUNT_TO_CONVERT, usdt.address, accessControlManagerAddress, maxLoopsLimit],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
    args: [corePoolComptrollerAddress, await toAddress("vBNB", hre), await toAddress("WBNB", hre)],
  });

  const riskFund = await ethers.getContract("RiskFund");

  const shortfallDeployment = await deploy("Shortfall", {
    from: deployer,
    contract: "Shortfall",
    proxy: {
      owner: owner,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [riskFund.address, MIN_POOL_BAD_DEBT, accessControlManagerAddress],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  const shortfall = await ethers.getContract("Shortfall");
  if ((await shortfall.poolRegistry()) !== poolRegistry.address) {
    console.log("Setting PoolRegistry address in Shortfall contract");
    const tx = await shortfall.connect(deployerSigner).updatePoolRegistry(poolRegistry.address);
    await tx.wait();
  }

  if ((await riskFund.shortfall()) !== shortfall.address) {
    console.log("Setting Shortfall contract address in RiskFund");
    const tx = await riskFund.setShortfallContractAddress(shortfallDeployment.address);
    await tx.wait(1);
  }

  const contract = await ethers.getContract("RiskFund");
  if ((await contract.poolRegistry()) !== poolRegistry.address) {
    console.log(`Setting PoolRegistry address in RiskFund contract`);
    const tx = await contract.setPoolRegistry(poolRegistry.address);
    await tx.wait();
  }

  const targetOwner = await toAddress("NormalTimelock", hre);
  for (const contractName of ["RiskFund", "Shortfall"]) {
    const contract = await ethers.getContract(contractName);
    if ((await contract.owner()) !== targetOwner && (await contract.pendingOwner()) !== targetOwner) {
      console.log(`Transferring ownership of ${contractName} to ${targetOwner}`);
      const tx = await contract.transferOwnership(targetOwner);
      await tx.wait();
    }
  }
};
func.tags = ["RiskFund", "il"];

export default func;

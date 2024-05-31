import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { getBlockOrTimestampBasedDeploymentInfo, toAddress } from "../helpers/deploymentUtils";
import { convertToUnit } from "../helpers/utils";

const MIN_POOL_BAD_DEBT = convertToUnit(1000, 18);

const nextBidderBlockOrTimestampLimit = 100; // for block based contracts
const waitForFirstBidder = 100; // for block based contracts

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.network.name);

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = ethers.provider.getSigner(deployer);
  const accessControlManagerAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );
  const proxyAdmin = await ethers.getContract("DefaultProxyAdmin");
  const owner = await proxyAdmin.owner();

  const { isTimeBased, blocksPerYear } = getBlockOrTimestampBasedDeploymentInfo(hre.network.name);

  const riskFund = await ethers.getContract("RiskFundV2");

  await deploy("Shortfall", {
    from: deployer,
    contract: "Shortfall",
    args: [isTimeBased, blocksPerYear, nextBidderBlockOrTimestampLimit, waitForFirstBidder],
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

  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;
  if ((await shortfall.owner()) !== targetOwner && (await shortfall.pendingOwner()) !== targetOwner) {
    console.log(`Transferring ownership of Shortfall to ${targetOwner}`);
    const tx = await shortfall.transferOwnership(targetOwner);
    await tx.wait();
  }
};
func.tags = ["Shortfall", "il"];

export default func;

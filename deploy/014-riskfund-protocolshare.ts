import { smock } from "@defi-wonderland/smock";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { getUnderlyingToken, toAddress } from "../helpers/deploymentUtils";
import { convertToUnit } from "../helpers/utils";
import { Comptroller } from "../typechain";

const MIN_AMOUNT_TO_CONVERT = convertToUnit(10, 18);
const MIN_POOL_BAD_DEBT = convertToUnit(1000, 18);
const maxLoopsLimit = 100;

const getAllMarkets = async (poolRegistry: Contract): Promise<Contract[]> => {
  const pools = await poolRegistry.getAllPools();
  const markets = await Promise.all(
    pools.map(async ({ comptroller }: { comptroller: string }): Promise<Contract[]> => {
      const poolComptroller = await ethers.getContractAt("Comptroller", comptroller);
      const vTokenAddresses = await poolComptroller.getAllMarkets();
      const vTokens = await Promise.all(
        vTokenAddresses.map((vTokenAddress: string) => ethers.getContractAt("VToken", vTokenAddress)),
      );
      return vTokens;
    }),
  );
  return markets.flat();
};

const configureVToken = async (vToken: Contract, shortfallAddress: string, protocolShareReserveAddress: string) => {
  console.log("Setting shortfall contract for vToken: ", vToken.address);
  const tx1 = await vToken.setShortfallContract(shortfallAddress);
  await tx1.wait();
  console.log("Setting protocol share reserve for vToken: ", vToken.address);
  const tx2 = await vToken.setProtocolShareReserve(protocolShareReserveAddress);
  await tx2.wait();
  console.log("Finished configuring vToken: ", vToken.address);
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokensConfig, preconfiguredAddresses } = await getConfig(hre.network.name);
  const usdt = await getUnderlyingToken("USDT", tokensConfig);

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = ethers.provider.getSigner(deployer);
  const swapRouter = await ethers.getContract("SwapRouter");
  let accessControl;
  if (hre.network.live) {
    accessControl = await ethers.getContractAt("AccessControlManager", preconfiguredAddresses.AccessControlManager);
  } else {
    accessControl = await ethers.getContract("AccessControlManager");
  }
  const proxyAdmin = await ethers.getContract("DefaultProxyAdmin");
  const owner = await proxyAdmin.owner();

  let corePoolComptrollerAddress = preconfiguredAddresses.Unitroller;
  if (!hre.network.live) {
    corePoolComptrollerAddress = (await smock.fake<Comptroller>("Comptroller")).address;
  }

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
    args: [
      corePoolComptrollerAddress,
      preconfiguredAddresses.VBNB_CorePool || "0x0000000000000000000000000000000000000001",
      preconfiguredAddresses.WBNB || "0x0000000000000000000000000000000000000002",
    ],
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

  await deploy("ProtocolShareReserve", {
    from: deployer,
    contract: "ProtocolShareReserve",
    proxy: {
      owner: owner,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [accessControlManagerAddress, 10],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
    args: [
      corePoolComptrollerAddress,
      preconfiguredAddresses.VBNB_CorePool || "0x0000000000000000000000000000000000000001",
      preconfiguredAddresses.WBNB || "0x0000000000000000000000000000000000000002",
    ],
  });

  for (const contractName of ["ProtocolShareReserve", "RiskFund"]) {
    const contract = await ethers.getContract(contractName);
    if ((await contract.poolRegistry()) !== poolRegistry.address) {
      console.log(`Setting PoolRegistry address in ${contractName} contract`);
      const tx = await contract.setPoolRegistry(poolRegistry.address);
      await tx.wait();
    }
  }

  const targetOwner = preconfiguredAddresses.NormalTimelock || deployer;
  for (const contractName of ["RiskFund", "Shortfall", "ProtocolShareReserve"]) {
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

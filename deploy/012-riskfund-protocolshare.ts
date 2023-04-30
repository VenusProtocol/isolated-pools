import * as ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { convertToUnit } from "../helpers/utils";
import { PoolRegistry, VToken } from "../typechain";

const MIN_AMOUNT_TO_CONVERT = convertToUnit(10, 18);
const MIN_POOL_BAD_DEBT = convertToUnit(1000, 18);
const maxLoopsLimit = 150;

const getAllMarkets = async (poolRegistry: PoolRegistry): Promise<VToken[]> => {
  const pools = await poolRegistry.getAllPools();
  const markets = await Promise.all(
    pools.map(async ({ comptroller }: { comptroller: string }): Promise<VToken[]> => {
      const poolComptroller = await ethers.getContractAt("Comptroller", comptroller);
      const vTokenAddresses = await poolComptroller.getAllMarkets();
      const vTokens = await Promise.all(
        vTokenAddresses.map((vTokenAddress: string) => ethers.getContractAt<VToken>("VToken", vTokenAddress)),
      );
      return vTokens;
    }),
  );
  return markets.flat();
};

const configureVToken = async (vToken: VToken, shortfallAddress: string, protocolShareReserveAddress: string) => {
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
  const { tokensConfig } = await getConfig(hre.network.name);
  const busdConfig = getTokenConfig("BUSD", tokensConfig);

  let BUSD;
  if (busdConfig.isMock) {
    BUSD = await ethers.getContract("MockBUSD");
  } else {
    BUSD = await ethers.getContractAt(ERC20.abi, busdConfig.tokenAddress);
  }

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = ethers.provider.getSigner(deployer);
  const swapRouter = await ethers.getContract("SwapRouter");
  const accessControl = await ethers.getContract("AccessControlManager");
  const proxyAdmin = await ethers.getContract("DefaultProxyAdmin");
  const owner = await proxyAdmin.owner();

  await deploy("RiskFund", {
    from: deployer,
    contract: "RiskFund",
    proxy: {
      owner: owner,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [swapRouter.address, MIN_AMOUNT_TO_CONVERT, BUSD.address, accessControl.address, maxLoopsLimit],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
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
        args: [BUSD.address, riskFund.address, MIN_POOL_BAD_DEBT, accessControl.address],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  const shortfall = await ethers.getContract("Shortfall");
  const tx1 = await shortfall.connect(deployerSigner).updatePoolRegistry(poolRegistry.address);
  await tx1.wait();

  const tx2 = await riskFund.setShortfallContractAddress(shortfallDeployment.address);
  await tx2.wait(1);

  const protocolShareReserveDeployment = await deploy("ProtocolShareReserve", {
    from: deployer,
    contract: "ProtocolShareReserve",
    proxy: {
      owner: owner,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [deployer, riskFund.address],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  const allMarkets = await getAllMarkets(poolRegistry);
  for (const market of allMarkets) {
    await configureVToken(market, shortfallDeployment.address, protocolShareReserveDeployment.address);
  }
};
func.tags = ["RiskFund", "il"];

export default func;

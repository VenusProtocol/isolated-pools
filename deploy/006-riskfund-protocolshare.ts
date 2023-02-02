import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { convertToUnit } from "../helpers/utils";
import { ERC20__factory } from "../typechain/factories/ERC20__factory";

const MIN_AMOUNT_TO_CONVERT = convertToUnit(10, 18);
const MIN_POOL_BAD_DEBT = convertToUnit(1000, 18);

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokenConfig } = await getConfig(hre.network.name);
  const busdConfig = getTokenConfig("BUSD", tokenConfig);

  let BUSD;
  if (busdConfig.isMock) {
    BUSD = await ethers.getContract("MockBUSD");
  } else {
    BUSD = await ethers.getContractAt(ERC20__factory.abi, busdConfig.tokenAddress);
  }

  const swapRouter = await ethers.getContract("SwapRouter");
  const accessControl = await ethers.getContract("AccessControlManager");

  await deploy("RiskFund", {
    from: deployer,
    contract: "RiskFund",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [swapRouter.address, MIN_AMOUNT_TO_CONVERT, BUSD.address, accessControl.address],
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
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [BUSD.address, riskFund.address, MIN_POOL_BAD_DEBT],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  await riskFund.setShortfallContractAddress(shortfallDeployment.address);

  await deploy("ProtocolShareReserve", {
    from: deployer,
    contract: "ProtocolShareReserve",
    proxy: {
      owner: deployer,
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
};
func.tags = ["RiskFund"];

export default func;

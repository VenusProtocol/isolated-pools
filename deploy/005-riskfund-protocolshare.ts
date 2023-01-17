import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { convertToUnit } from "../helpers/utils";
import { ERC20__factory } from "../typechain/factories/ERC20__factory";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("RiskFund", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const riskFund = await ethers.getContract("RiskFund");

  await deploy("ProtocolShareReserve", {
    from: deployer,
    log: true,
    autoMine: true,
  });


  const { tokenConfig } = await getConfig(hre.network.name);
  const busdConfig = getTokenConfig("BUSD", tokenConfig);

  let BUSD;
  if (busdConfig.isMock) {
    BUSD = await ethers.getContract("MockBUSD");
  } else {
    BUSD = await ethers.getContractAt(ERC20__factory.abi, busdConfig.tokenAddress);
  }
  console.log(1);

  await deploy("Shortfall", {
    from: deployer,
    contract: "Shortfall",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [BUSD.address, riskFund.address, convertToUnit(1000, 18)],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  // Deploy Shortfall Impl
  // Deploy Shortfall Proxy (OpenZeppelinTransparentProxy)

  // Deploy RiskFund Impl
  // Deploy Risk Fund Proxy

  // Call Initialize of Shortfall Proxy with args
  // Call Initialize of Shortfall Proxy with args



  console.log(2);
};
func.tags = ["PoolLens"];

export default func;

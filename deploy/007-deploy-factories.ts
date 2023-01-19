import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const vBep20Factory: DeployResult = await deploy("VTokenProxyFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  const jumpRateModelFactory: DeployResult = await deploy("JumpRateModelFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const whitePaperRateFactory: DeployResult = await deploy("WhitePaperInterestRateModelFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const shortFall = await ethers.getContract("Shortfall");
  const protocolShareReserve = await ethers.getContract("ProtocolShareReserve");
  const riskFund = await ethers.getContract("RiskFund");

  await deploy("PoolRegistry", {
    from: deployer,
    contract: "PoolRegistry",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          vBep20Factory.address,
          jumpRateModelFactory.address,
          whitePaperRateFactory.address,
          shortFall.address,
          riskFund.address,
          protocolShareReserve.address,
        ],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = ethers.provider.getSigner(deployer);

  const tx = await shortFall.connect(deployerSigner).setPoolRegistry(poolRegistry.address);
  await tx.wait();
};

func.tags = ["Factories"];

export default func;

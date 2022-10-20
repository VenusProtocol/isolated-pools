import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { ethers } from "hardhat";
import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const vBep20Factory: DeployResult = await deploy(
    "VBep20ImmutableProxyFactory",
    {
      from: deployer,
      args: [],
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    }
  );

  const jumpRateModelFactory: DeployResult = await deploy(
    "JumpRateModelFactory",
    {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    }
  );

  const whitePaperRateFactory: DeployResult = await deploy(
    "WhitePaperInterestRateModelFactory",
    {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    }
  );

  await deploy("AccessControlManager", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const accessControlManager = await ethers.getContract("AccessControlManager");

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

  const protocolShareReserve = await ethers.getContract("ProtocolShareReserve");

  await deploy("MockBUSD", {
    from: deployer,
    contract: "MockToken",
    args: ["Binance USD", "BUSD", 18],
    log: true,
    autoMine: true,
  });
  
  
  const BUSD = await ethers.getContract("MockBUSD");

  await deploy('Shortfall', {
    from: deployer,
    contract: 'Shortfall',
    proxy: {
      owner: deployer,
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        methodName: 'initialize',
        args: [BUSD.address,
          riskFund.address,
          convertToUnit(1000, 18)],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });
  
  const shortFall = await ethers.getContract("Shortfall");

  await deploy('PoolRegistry', {
    from: deployer,
    contract: 'PoolRegistry',
    proxy: {
      owner: deployer,
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        methodName: 'initialize',
        args: [vBep20Factory.address,
          jumpRateModelFactory.address,
          whitePaperRateFactory.address,
          shortFall.address,
          riskFund.address,
          protocolShareReserve.address],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = await ethers.provider.getSigner(deployer);

  let tx = await shortFall.connect(deployerSigner).setPoolRegistry(poolRegistry.address);
  await tx.wait();

  await deploy("MockPriceOracle", {
    from: deployer,
    log: true,
    autoMine: true,
    args: [],
  });
    
  await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_setCollateralFactor(VToken,uint256,uint256)",
    poolRegistry.address
  );


  await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_setLiquidationIncentive(uint)",
    poolRegistry.address
  );

  await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_supportMarket(VToken)",
    poolRegistry.address
  );

  await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_setInterestRateModelFresh(InterestRateModel)",
    vBep20Factory.address
  );
};

func.tags = ["PoolsRegistry"];

export default func;

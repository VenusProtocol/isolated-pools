import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const vBep20Factory: DeployResult = await deploy("VBep20ImmutableFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

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

  const accessControlManager = await ethers.getContract(
    "AccessControlManager"
  );

  await deploy("PoolRegistry", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const poolRegistry = await ethers.getContract("PoolRegistry");

  let tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "changeCollFactor(uint256,uint256)",
    poolRegistry.address
  );

  await tx.wait(1);

  await deploy("RiskFund", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const riskFund = await ethers.getContract("RiskFund");

  await deploy("LiquidatedShareReserve", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const liquidatedShareReserve = await ethers.getContract("LiquidatedShareReserve");

  tx = await poolRegistry.initialize(
    vBep20Factory.address,
    jumpRateModelFactory.address,
    whitePaperRateFactory.address,
    riskFund.address,
    liquidatedShareReserve.address,
  );

  await tx.wait(1);
};

func.tags = ["Pool Registry"];

export default func;


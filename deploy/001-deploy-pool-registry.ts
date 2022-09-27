import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { ethers } from "hardhat";
import { convertToUnit } from "../helpers/utils";
import { MockToken } from "../typechain";

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

  await deploy("Shortfall", {
    from: deployer,
    log: true,
    autoMine: true,
  });

  await deploy("MockBUSD", {
    from: deployer,
    contract: "MockToken",
    args: ["Binance USD", "BUSD", 18],
    log: true,
    autoMine: true,
  });
  const shortFall = await ethers.getContract("Shortfall");

  const BUSD: MockToken = await ethers.getContract("MockBUSD");

  await shortFall.initialize(
    BUSD.address,
    riskFund.address,
    convertToUnit(1000, 18)
  );

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    autoMine: true,
    args: [],
  });

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const deployerSigner = await ethers.provider.getSigner(deployer);

  await shortFall.connect(deployerSigner).setPoolRegistry(poolRegistry.address);

  await poolRegistry.initialize(
    vBep20Factory.address,
    jumpRateModelFactory.address,
    whitePaperRateFactory.address,
    shortFall.address,
    riskFund.address,
    protocolShareReserve.address
  );

  await deploy("MockPriceOracle", {
    from: deployer,
    log: true,
    autoMine: true,
    args: [],
  });

  let tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "changeCollFactor(uint256,uint256)",
    poolRegistry.address
  );

  await tx.wait(1);

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_setLiquidationIncentive(uint)",
    poolRegistry.address
  );

  await tx.wait(1);

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "_setInterestRateModelFresh(InterestRateModel)",
    vBep20Factory.address
  );

  await tx.wait(1);
};

func.tags = ["Pool Registry"];

export default func;

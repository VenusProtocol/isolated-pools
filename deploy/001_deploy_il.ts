import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { convertToUnit } from "../helpers/utils";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  //TODO: should deploy tokens or get token addresses
  const wBTCAddress = ethers.constants.AddressZero;
  const daiAddress = ethers.constants.AddressZero;
  //TODO: deploy price oracle or get its address
  const priceOracleAddress = ethers.constants.AddressZero;

  const VBep20Factory: DeployResult = await deploy("VBep20ImmutableFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  const JumpRateModelFactory: DeployResult = await deploy(
    "JumpRateModelFactory",
    {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    }
  );

  const WhitePaperRateFactory: DeployResult = await deploy(
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

  const accessControlManager = await hre.ethers.getContract(
    "AccessControlManager"
  );

  await deploy("PoolRegistry", {
    from: deployer,
    proxy: "initialize",
    args: [
      VBep20Factory.address,
      JumpRateModelFactory.address,
      WhitePaperRateFactory.address,
    ],
    log: true,
    autoMine: true,
  });

  const poolRegistry = await hre.ethers.getContract("PoolRegistry");

  let tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "changeCollFactor(uint256,uint256)",
    poolRegistry.address
  );

  await tx.wait(1);

  tx = await poolRegistry.initialize(
    VBep20Factory.address,
    JumpRateModelFactory.address,
    WhitePaperRateFactory.address
  );

  await tx.wait(1);

  const Comptroller: DeployResult = await deploy("Comptroller", {
    from: deployer,
    args: [poolRegistry.address],
    log: true,
    autoMine: true,
  });

  const closeFactor = convertToUnit(0.05, 18);
  const liquidationIncentive = convertToUnit(1, 18);

  tx = await poolRegistry.createRegistryPool(
    "Pool 1",
    Comptroller.address,
    closeFactor,
    liquidationIncentive,
    priceOracleAddress
  );

  await tx.wait(1);

  const pools = await poolRegistry.callStatic.getAllPools();
  const comptrollerProxy = await ethers.getContractAt(
    "Comptroller",
    pools[0].comptroller
  );

  const unitroller = await ethers.getContractAt(
    "Unitroller",
    pools[0].comptroller
  );

  tx = await unitroller._acceptAdmin();
  await tx.wait(1);

  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: wBTCAddress,
    decimals: 8,
    name: "Compound WBTC",
    symbol: "cWBTC",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
  });

  await tx.wait(1);

  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: daiAddress,
    decimals: 18,
    name: "Compound DAI",
    symbol: "cDAI",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
  });
  await tx.wait(1);
};
export default func;
func.tags = ["Isolated Pools"];

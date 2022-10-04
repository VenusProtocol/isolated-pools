import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { ethers } from "hardhat";
import { convertToUnit } from "../helpers/utils";
import { MockToken } from "../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  //=======================
  // DEPLOY MOCK TOKENS
  //========================
  await deploy("MockBTC", {
    from: deployer,
    contract: "MockToken",
    args: ["Bitcoin", "BTC", 8],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
  });

  const wBTC: MockToken = await ethers.getContract("MockBTC");

  await deploy("MockDAI", {
    from: deployer,
    contract: "MockToken",
    args: ["MakerDAO", "DAI", 18],
    log: true,
    autoMine: true,
  });

  const DAI: MockToken = await ethers.getContract("MockDAI");

  let priceOracle;

  try {
    priceOracle = await ethers.getContract("PriceOracle");
    console.log("Price Oracle Obtained")
  } catch (e) {
    console.log("Mock Oracle Obtained")
    priceOracle = await ethers.getContract("MockPriceOracle");
    await priceOracle.setPrice(wBTC.address, convertToUnit(1, 18));
    await priceOracle.setPrice(DAI.address, convertToUnit(1, 18));
  }

  const closeFactor = convertToUnit(0.05, 18);
  const liquidationIncentive = convertToUnit(1, 18);

  const poolRegistry = await ethers.getContract("PoolRegistry");

  const accessControlManager = await ethers.getContract("AccessControlManager");
  console.log("ACL2: " + accessControlManager.address);

  const Pool1Comptroller: DeployResult = await deploy("Pool 1", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address, accessControlManager.address],
    log: true,
    autoMine: true,
  });

  let tx = await poolRegistry.createRegistryPool(
    "Pool 1",
    Pool1Comptroller.address,
    closeFactor,
    liquidationIncentive,
    priceOracle.address
  );

  await tx.wait(1);

  const pools = await poolRegistry.callStatic.getAllPools();
  await ethers.getContractAt("Comptroller", pools[0].comptroller);

  const unitroller = await ethers.getContractAt(
    "Unitroller",
    pools[0].comptroller
  );
  tx = await unitroller._acceptAdmin();
  await tx.wait(1);

  const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
  const tokenImplementation = await VBep20Immutable.deploy();
  await tokenImplementation.deployed();

  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: wBTC.address,
    decimals: 8,
    name: "Compound WBTC",
    symbol: "cWBTC",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    tokenImplementation_: tokenImplementation.address,
  });

  await tx.wait(1);

  tx = await poolRegistry.addMarket({
    poolId: 1,
    asset: DAI.address,
    decimals: 18,
    name: "Compound DAI",
    symbol: "cDAI",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    tokenImplementation_: tokenImplementation.address,
  });
  await tx.wait(1);
};

func.tags = ["Pools"];
func.dependencies = ["PoolsRegistry"];

export default func;

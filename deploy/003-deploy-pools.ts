import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin } = await getNamedAccounts();
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

  const wBTC = await ethers.getContract("MockBTC");

  await deploy("MockDAI", {
    from: deployer,
    contract: "MockToken",
    args: ["MakerDAO", "DAI", 18],
    log: true,
    autoMine: true,
  });

  const DAI = await ethers.getContract("MockDAI");

  let priceOracle;
  let tx;

  try {
    priceOracle = await ethers.getContract("PriceOracle");
    console.log("Price Oracle Obtained");
  } catch (e) {
    priceOracle = await ethers.getContract("MockPriceOracle");
    console.log("Mock Oracle Obtained");
    tx = await priceOracle.setPrice(wBTC.address, convertToUnit(10, 18));
    await tx.wait();
    tx = await priceOracle.setPrice(DAI.address, convertToUnit(1, 18));
    await tx.wait();
  }

  const closeFactor = convertToUnit(0.05, 18);
  const liquidationIncentive = convertToUnit(1, 18);
  const minLiquidatableCollateral = convertToUnit(100, 18);

  const poolRegistry = await ethers.getContract("PoolRegistry");

  const accessControlManager = await ethers.getContract("AccessControlManager");

  const Pool1Comptroller: DeployResult = await deploy("Pool 1", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address, accessControlManager.address],
    log: true,
    autoMine: true,
  });

  tx = await poolRegistry.createRegistryPool(
    "Pool 1",
    proxyAdmin,
    Pool1Comptroller.address,
    closeFactor,
    liquidationIncentive,
    minLiquidatableCollateral,
    priceOracle.address,
  );

  await tx.wait();

  const pools = await poolRegistry.callStatic.getAllPools();
  const comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
  tx = await comptroller1Proxy.acceptAdmin();
  await tx.wait();

  const VToken = await ethers.getContractFactory("VToken");
  const tokenImplementation = await VToken.deploy();
  await tokenImplementation.deployed();

  tx = await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: wBTC.address,
    decimals: 8,
    name: "Venus WBTC",
    symbol: "vWBTC",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
    liquidationThreshold: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    vTokenProxyAdmin: deployer,
    tokenImplementation_: tokenImplementation.address,
  });
  await tx.wait();

  tx = await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
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
    liquidationThreshold: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    vTokenProxyAdmin: deployer,
    tokenImplementation_: tokenImplementation.address,
  });
  await tx.wait();

  comptroller1Proxy._setMarketBorrowCaps(
    [tokenImplementation.address],
    ["0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  );
};

func.tags = ["Pools"];
func.dependencies = ["PoolsRegistry"];

export default func;

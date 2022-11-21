import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin} = await getNamedAccounts();

  const BNX = await ethers.getContract("MockBNX");
  const BSW = await ethers.getContract("MockBSW");

  let priceOracle;
  let tx;

  try {
    priceOracle = await ethers.getContract("PriceOracle");
    console.log("Price Oracle Obtained");
  } catch (e) {
    //TODO: remove hardcoded address and use the external deployment instead
    priceOracle = await ethers.getContractAt("ResilientOracle","0x2CF834C9f0e5A39EFAC32b80Bef385e2D4385047");
    tx = await priceOracle.setPrice(BNX.address, convertToUnit(1, 18));
    await tx.wait();
    tx = await priceOracle.setPrice(BSW.address, convertToUnit(1, 18));
    await tx.wait();
  }
  console.log("Price Oracle Obtained with address: " + priceOracle.address);


  const closeFactor = convertToUnit(0.05, 18);
  const liquidationIncentive = convertToUnit(1, 18);
  const minLiquidatableCollateral = convertToUnit(100, 18);

  const poolRegistry = await ethers.getContract("PoolRegistry");

  const accessControlManager = await ethers.getContract("AccessControlManager");

  const Pool1Comptroller: DeployResult = await deploy("Pool 2", {
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
  const comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
  tx = await comptroller1Proxy.acceptAdmin();
  await tx.wait();
  
  const VToken = await ethers.getContractFactory("VToken");
  const vBNXImplementation = await VToken.deploy();
  await vBNXImplementation.deployed();

  tx = await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: BNX.address,
    decimals: 18,
    name: "Venus BNX",
    symbol: "vBNX",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
    liquidationThreshold: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    vTokenProxyAdmin: proxyAdmin,
    tokenImplementation_: vBNXImplementation.address,
  });
  await tx.wait();

  const vBSWImplementation = await VToken.deploy();
  await vBSWImplementation.deployed();

  tx = await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: BSW.address,
    decimals: 18,
    name: "Venus BSW",
    symbol: "vBSW",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: convertToUnit(0.7, 18),
    liquidationThreshold: convertToUnit(0.7, 18),
    accessControlManager: accessControlManager.address,
    vTokenProxyAdmin: proxyAdmin,
    tokenImplementation_: vBSWImplementation.address,
  });
  await tx.wait();

  comptroller1Proxy._setMarketBorrowCaps(
    [tokenImplementation.address],
    ["0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  );

  comptroller1Proxy._setMarketSupplyCaps(
    [tokenImplementation.address],
    ["0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  );
  console.log(6);
  console.log("Pools added to pool: " + comptroller1Proxy.address);
};

func.tags = ["Pools"];

export default func;

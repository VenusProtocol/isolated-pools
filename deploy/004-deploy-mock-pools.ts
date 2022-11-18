import { ethers } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin } = await getNamedAccounts();

  const BNX = await ethers.getContract("MockBNX");
  const BSW = await ethers.getContract("MockBSW");

  let tx;

  let priceOracle = await ethers.getContractAt("ResilientOracle","0x42DE63c6895120FAC208a98b20705fb1F2917e0d");
  console.log("Price Oracle Obtained with address: " + priceOracle.address);


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
  console.log(1);
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
  console.log(2);
  const pools = await poolRegistry.callStatic.getAllPools();
  const comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
  console.log(3);
  tx = await comptroller1Proxy.acceptAdmin();
  console.log(4);
  await tx.wait();
  

  const VToken = await ethers.getContractFactory("VToken");
  const vBNXImplementation = await VToken.deploy();
  await vBNXImplementation.deployed();

  tx = await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: BNX.address,
    decimals: 8,
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

  console.log(5);


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

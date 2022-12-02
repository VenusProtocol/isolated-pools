import { ethers, network } from "hardhat";
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

  let tx;

  let priceOracle = await ethers.getContract("ResilientOracle");

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

  const PoolLens = await ethers.getContract("PoolLens");

  const vBSWAddress = await PoolLens.getVTokenForAsset(
    poolRegistry.address,comptroller1Proxy.address,BSW.address
  );

  const vBNXAddress = await PoolLens.getVTokenForAsset(
    poolRegistry.address,comptroller1Proxy.address,BNX.address
  );

  const INT_MAX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  comptroller1Proxy._setMarketBorrowCaps(
    [vBNXAddress,vBSWAddress],
    [INT_MAX,INT_MAX],
  );

  comptroller1Proxy._setMarketSupplyCaps(
    [vBNXAddress,vBSWAddress],
    [INT_MAX,INT_MAX],
  );
  

  console.log("Pools added to pool: " + comptroller1Proxy.address);
};

func.tags = ["Pools"];
func.skip = async () => network.live == true;

export default func;

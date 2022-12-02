import { ethers, network } from "hardhat";
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

  const priceOracle = await ethers.getContract("ResilientOracle");

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

  console.log("Pools added to pool: " + comptroller1Proxy.address);
  comptroller1Proxy.setMarketBorrowCaps(
    [vBNXImplementation.address],
    ["0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  );

  comptroller1Proxy.setMarketSupplyCaps(
    [vBSWImplementation.address],
    ["0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  );
};

func.tags = ["Pools"];
func.skip = async () => network.live == true;

export default func;

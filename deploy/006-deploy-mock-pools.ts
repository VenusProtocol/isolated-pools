import { ethers, network } from "hardhat";
import { DeployResult } from "hardhat-deploy/dist/types";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, proxyAdmin } = await getNamedAccounts();
  const deployerSigner = await hre.ethers.getNamedSigner("deployer");

  const BNX = await ethers.getContract("MockBNX");
  const BSW = await ethers.getContract("MockBSW");

  let tx;

  const priceOracle = await ethers.getContract("ResilientOracle");

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

  const ComptrollerBeacon: DeployResult = await deploy("ComptrollerBeacon", {
    contract: "Beacon",
    from: deployer,
    args: [Pool1Comptroller.address],
    log: true,
    autoMine: true,
  });

  tx = await poolRegistry.createRegistryPool(
    "Pool 1",
    ComptrollerBeacon.address,
    closeFactor,
    liquidationIncentive,
    minLiquidatableCollateral,
    priceOracle.address,
  );

  await tx.wait();

  const pools = await poolRegistry.callStatic.getAllPools();
  const comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
  tx = await comptroller1Proxy.acceptOwnership();
  await tx.wait();

  const VToken = await ethers.getContractFactory("VToken");
  const vToken = await VToken.deploy();
  await vToken.deployed();

  const vTokenBeacon: DeployResult = await deploy("VTokenBeacon", {
    contract: "Beacon",
    from: deployer,
    args: [vToken.address],
    log: true,
    autoMine: true,
  });

  const initialSupply = convertToUnit(1, 18);
  const supplyCap = convertToUnit(10000, 18);
  await BNX.faucet(initialSupply);
  await BNX.approve(poolRegistry.address, initialSupply);

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
    beaconAddress: vTokenBeacon.address,
    initialSupply,
    supplyCap,
  });
  await tx.wait();

  const vBSWImplementation = await VToken.deploy();
  await vBSWImplementation.deployed();

  await BSW.faucet(initialSupply);
  await BSW.approve(poolRegistry.address, initialSupply);

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
    beaconAddress: vTokenBeacon.address,
    initialSupply,
    supplyCap,
  });

  const PoolLens = await ethers.getContract("PoolLens");

  const vBSWAddress = await PoolLens.getVTokenForAsset(poolRegistry.address, comptroller1Proxy.address, BSW.address);

  const vBNXAddress = await PoolLens.getVTokenForAsset(poolRegistry.address, comptroller1Proxy.address, BNX.address);

  const INT_MAX = ethers.constants.MaxUint256;

  comptroller1Proxy.connect(deployerSigner).setMarketBorrowCaps([vBNXAddress, vBSWAddress], [INT_MAX, INT_MAX]);

  comptroller1Proxy.connect(deployerSigner).setMarketSupplyCaps([vBNXAddress, vBSWAddress], [INT_MAX, INT_MAX]);

  console.log("Pools added to pool: " + comptroller1Proxy.address);
};

func.tags = ["Pools"];
func.skip = async () => network.live == true;

export default func;

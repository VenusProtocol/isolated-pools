import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeployResult } from "hardhat-deploy/dist/types";
import { ethers } from "hardhat";
import { convertToUnit } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  //TODO: should deploy tokens or get token addresses
  const wBTCAddress = ethers.constants.AddressZero;
  const daiAddress = ethers.constants.AddressZero;
  //TODO: deploy price oracle or get its address
  const priceOracleAddress = ethers.constants.AddressZero;

  const { deployer } = await getNamedAccounts();

  const closeFactor = convertToUnit(0.05, 18);
  const liquidationIncentive = convertToUnit(1, 18);

  const poolRegistry = await ethers.getContract(
    "PoolRegistry"
  );

  const accessControlManager = await ethers.getContract(
    "AccessControlManager"
  );


  const Pool1Comptroller: DeployResult = await deploy("Pool 1", {
    contract: 'Comptroller',
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
    priceOracleAddress
  );

  await tx.wait(1);

  const pools = await poolRegistry.callStatic.getAllPools();
  await ethers.getContractAt(
    "Pool 1",
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
}

func.tags = ["Pools"];

export default func;

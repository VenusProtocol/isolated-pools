import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const poolRegistry = await ethers.getContract("PoolRegistry");
  const vBep20Factory = await ethers.getContract("VTokenProxyFactory");
  const riskFund = await ethers.getContract("RiskFund");

  await deploy("AccessControlManager", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const accessControlManager = await ethers.getContract("AccessControlManager");
  console.log("==================================================");
  console.log("Access Control Initial Configuration: ");
  console.log("==================================================");
  console.log("     Role     |      Contract      | Function Sig");
  console.log("--------------------------------------------------");
  let tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setCollateralFactor(address,uint256,uint256)",
    poolRegistry.address,
  );
  await tx.wait();

  console.log("DEFAULT_ADMIN | PoolRegistry       | setCollateralFactor(address,uint256,uint256)");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketSupplyCaps(address[],uint256[])",
    poolRegistry.address,
  );
  await tx.wait();

  console.log("DEFAULT_ADMIN | PoolRegistry       | setMarketSupplyCaps(address[],uint256[])");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketBorrowCaps(address[],uint256[])",
    poolRegistry.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | PoolRegistry       | setMarketBorrowCaps(address[],uint256[])");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setLiquidationIncentive(uint256)",
    poolRegistry.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | PoolRegistry       | setLiquidationIncentive(uint256)");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMinLiquidatableCollateral(uint256)",
    poolRegistry.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | PoolRegistry       | setMinLiquidatableCollateral(uint256)");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "supportMarket(address)",
    poolRegistry.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | PoolRegistry       | supportMarket(address)");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setInterestRateModel(address)",
    vBep20Factory.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | VTokenProxyFactory | setInterestRateModel(address)");
  tx = await accessControlManager.giveCallPermission(
    riskFund.address,
    "swapPoolsAssets(address[],uint256[])",
    deployer,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | Deployer           | swapPoolsAssets(address[],uint256[])");
  console.log("--------------------------------------------------");
  console.log("Access Control setup ended successfully");
};

func.tags = ["AccessControlConfig"];

export default func;

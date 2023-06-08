import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

type AcmAddresses = {
  bsctestnet: string;
  bscmainnet: string;
};

const ADDRESSES: AcmAddresses = {
  bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const vBep20Factory = await ethers.getContract("VTokenProxyFactory");
  let accessControlManager;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControlManager = await ethers.getContractAt("AccessControlManager", ADDRESSES[networkName]);
  } else {
    await deploy("AccessControlManager", {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    });
    accessControlManager = await ethers.getContract("AccessControlManager");
  }

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
    "setCloseFactor(uint256)",
    poolRegistry.address,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | PoolRegistry       | setCloseFactor(uint256)");

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
    ethers.constants.AddressZero,
    "swapPoolsAssets(address[],uint256[],address[][])",
    deployer,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | Deployer           | swapPoolsAssets(address[],uint256[])");

  tx = await accessControlManager.giveCallPermission(
    poolRegistry.address,
    "addPool(string,address,uint256,uint256,uint256)",
    deployer,
  );
  await tx.wait();
  console.log("PoolRegistry  | Deployer           | addPool(string,address,uint256,uint256,uint256)");

  tx = await accessControlManager.giveCallPermission(poolRegistry.address, "addMarket(AddMarketInput)", deployer);
  await tx.wait();
  console.log("PoolRegistry  | Deployer           | addMarket(AddMarketInput)");

  tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setRewardTokenSpeeds(address[],uint256[],uint256[])",
    deployer,
  );
  await tx.wait();
  console.log("DEFAULT_ADMIN | Deployer           | setRewardTokenSpeeds(address[],uint256[],uint256[])");

  console.log("--------------------------------------------------");
  console.log("Access Control setup ended successfully");
};

func.tags = ["AccessControlConfig", "il"];

export default func;

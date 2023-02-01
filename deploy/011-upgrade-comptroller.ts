import { ethers } from "hardhat";
import { DeployFunction, DeployResult, Deployment } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const accessControlManager: Deployment = await deployments.get("AccessControlManager");
  const poolRegistry: Deployment = await deployments.get("PoolRegistry");

  // Comptroller Beacon
  const comptrollerImpl: DeployResult = await deploy("ComptrollerImpl2", {
    contract: "Comptroller",
    from: deployer,
    args: [poolRegistry.address, accessControlManager.address],
    log: true,
    autoMine: true,
  });

  const comptrollerBeacon = await ethers.getContract("ComptrollerBeacon");

  if (comptrollerImpl.newlyDeployed) {
    console.log(`Upgrading comptroller beacon new implementation to: ${comptrollerImpl.address}`);
    await comptrollerBeacon.upgradeTo(comptrollerImpl.address);
    console.log("Implementation Upgraded");
  }
};

func.tags = ["UpgradeComptroller"];

export default func;

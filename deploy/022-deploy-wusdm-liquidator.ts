import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";
import { toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { preconfiguredAddresses } = await getConfig(hre.getNetworkName());

  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer");

  // The reason for this is that the contracts `OptimizedTransparentUpgradeableProxy` and `DefaultProxyAdmin` that the hardhat-deploy
  // plugin fetches from the artifact is not zk compatible causing the deployments to fail. So we bought it one level up to our repo,
  // added them to compile using zksync compiler. It is compatible for all networks.
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  await deploy("WUSDMLiquidator", {
    from: deployer,
    contract: "WUSDMLiquidator",
    proxy: {
      owner: proxyOwnerAddress,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });
  const wusdmLiquidator = await ethers.getContract("WUSDMLiquidator");

  console.log("Transferring ownership to Normal Timelock ....");
  const tx = await wusdmLiquidator.transferOwnership(preconfiguredAddresses.NormalTimelock);
  await tx.wait();
  console.log("Ownership transferred to Normal Timelock");
};

func.tags = ["wusdm-liquidator"];

func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "zksyncmainnet";

export default func;

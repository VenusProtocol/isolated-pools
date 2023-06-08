import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

type AcmAddresses = {
  bsctestnet: string;
  bscmainnet: string;
};

const acmAddresses: AcmAddresses = {
  bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  let accessControlManager;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControlManager = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  } else {
    accessControlManager = await ethers.getContract("AccessControlManager");
  }

  await deploy("PoolRegistry", {
    from: deployer,
    contract: "PoolRegistry",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [accessControlManager.address],
      },
      upgradeIndex: 0,
    },
    autoMine: true,
    log: true,
  });
};

func.tags = ["Factories", "il"];

export default func;

import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenAddress, getTokenConfig } from "../helpers/deploymentConfig";

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
  const maxLoopsLimit = 150;
  let accessControl;
  if (hre.network.live) {
    const networkName = hre.network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
    accessControl = await ethers.getContractAt("AccessControlManager", acmAddresses[networkName]);
  } else {
    accessControl = await ethers.getContract("AccessControlManager");
  }

  const { tokensConfig, poolConfig } = await getConfig(hre.network.name);
  for (let i = 0; i < poolConfig.length; i++) {
    const rewards = poolConfig[i].rewards;
    if (!rewards) continue;
    const comptrollerProxy = await ethers.getContract(`Comptroller_${poolConfig[i].name}`);
    for (const reward of rewards) {
      // Get reward token address
      const tokenConfig = getTokenConfig(reward.asset, tokensConfig);
      const rewardTokenAddress = await getTokenAddress(tokenConfig, deployments);
      // Custom contract name so we can obtain the proxy after that easily
      const contractName = "Rewards" + reward.asset + poolConfig[i].name;
      await deploy(contractName, {
        from: deployer,
        contract: "RewardsDistributor",
        proxy: {
          owner: deployer,
          proxyContract: "OpenZeppelinTransparentProxy",
          execute: {
            methodName: "initialize",
            args: [comptrollerProxy.address, rewardTokenAddress, maxLoopsLimit, accessControl.address],
          },
          upgradeIndex: 0,
        },
        autoMine: true,
        log: true,
      });
    }
  }
};

func.tags = ["Rewards", "il"];
export default func;

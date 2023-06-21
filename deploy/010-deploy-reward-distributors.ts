import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenAddress, getTokenConfig } from "../helpers/deploymentConfig";
import { getUnregisteredRewardsDistributors, toAddress } from "../helpers/deploymentUtils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const maxLoopsLimit = 100;

  const { tokensConfig, poolConfig, preconfiguredAddresses } = await getConfig(hre.network.name);

  const accessControlAddress = await toAddress(
    preconfiguredAddresses.AccessControlManager || "AccessControlManager",
    hre,
  );
  const proxyOwnerAddress = await toAddress(preconfiguredAddresses.NormalTimelock || "account:deployer", hre);

  const pools = await getUnregisteredRewardsDistributors(poolConfig, hre);
  for (const pool of pools) {
    const rewards = pool.rewards;
    if (!rewards) continue;
    const comptrollerProxy = await ethers.getContract(`Comptroller_${pool.id}`);
    for (const reward of rewards) {
      // Get reward token address
      const tokenConfig = getTokenConfig(reward.asset, tokensConfig);
      const rewardTokenAddress = await getTokenAddress(tokenConfig, deployments);
      // Custom contract name so we can obtain the proxy after that easily
      const contractName = `RewardsDistributor_${reward.asset}_${pool.id}`;
      await deploy(contractName, {
        from: deployer,
        contract: "RewardsDistributor",
        proxy: {
          owner: proxyOwnerAddress,
          proxyContract: "OpenZeppelinTransparentProxy",
          execute: {
            methodName: "initialize",
            args: [comptrollerProxy.address, rewardTokenAddress, maxLoopsLimit, accessControlAddress],
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

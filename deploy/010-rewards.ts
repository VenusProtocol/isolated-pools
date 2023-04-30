import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenAddress, getTokenConfig } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const maxLoopsLimit = 150;
  const poolRegistry = await ethers.getContract("PoolRegistry");
  const accessControl = await ethers.getContract("AccessControlManager");

  const { tokensConfig, poolConfig } = await getConfig(hre.network.name);
  const pools = await poolRegistry.callStatic.getAllPools();
  for (let i = 0; i < poolConfig.length; i++) {
    const rewards = poolConfig[i].rewards;
    if (!rewards) continue;
    for (const reward of rewards) {
      const comptrollerAddress = pools[i].comptroller;
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
            args: [comptrollerAddress, rewardTokenAddress, maxLoopsLimit, accessControl.address],
          },
          upgradeIndex: 0,
        },
        autoMine: true,
        log: true,
      });

      const rewardsDistributor = await ethers.getContract(contractName);
      const vTokens: string[] = [];
      for (const marketUnderlying of reward.markets) {
        const assetConfig = getTokenConfig(marketUnderlying, tokensConfig);
        const tokenAddress = await getTokenAddress(assetConfig, deployments);
        const marketAddress = await poolRegistry.getVTokenForAsset(comptrollerAddress, tokenAddress);
        vTokens.push(marketAddress);
      }
      let tx = await rewardsDistributor.setRewardTokenSpeeds(vTokens, reward.supplySpeeds, reward.borrowSpeeds);
      await tx.wait(1);
      const comptrollerProxy = await ethers.getContractAt("Comptroller", pools[i].comptroller);
      try {
        console.log("Adding reward distributor to comptroller " + comptrollerAddress);
        tx = await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);
        await tx.wait(1);
        console.log("Added rewards distributor sucessfully");
      } catch (e) {
        console.log("Rewards distributor already added.");
        continue;
      }
    }
  }
};

func.tags = ["Rewards", "il"];
export default func;

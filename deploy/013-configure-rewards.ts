import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig, getTokenAddress, getTokenConfig } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const poolRegistry = await ethers.getContract("PoolRegistry");

  const { tokensConfig, poolConfig } = await getConfig(hre.network.name);
  for (let i = 0; i < poolConfig.length; i++) {
    const rewards = poolConfig[i].rewards;
    if (!rewards) continue;
    const comptrollerProxy = await ethers.getContract(`Comptroller_${poolConfig[i].name}`);
    const comptroller = await ethers.getContractAt("Comptroller", comptrollerProxy.address);
    for (const reward of rewards) {
      // Custom contract name so we can obtain the proxy after that easily
      const contractName = "Rewards" + reward.asset + poolConfig[i].name;
      const rewardsDistributor = await ethers.getContract(contractName);
      const vTokens: string[] = [];
      for (const marketUnderlying of reward.markets) {
        const assetConfig = getTokenConfig(marketUnderlying, tokensConfig);
        const tokenAddress = await getTokenAddress(assetConfig, deployments);
        const marketAddress = await poolRegistry.getVTokenForAsset(comptroller.address, tokenAddress);
        vTokens.push(marketAddress);
      }
      let tx = await rewardsDistributor.setRewardTokenSpeeds(vTokens, reward.supplySpeeds, reward.borrowSpeeds);
      await tx.wait(1);
      try {
        console.log("Adding reward distributor to comptroller " + comptroller.address);
        tx = await comptroller.addRewardsDistributor(rewardsDistributor.address);
        await tx.wait(1);
        console.log("Added rewards distributor sucessfully");
      } catch (e) {
        console.log("Rewards distributor already added.");
        continue;
      }
    }
  }
};

func.tags = ["RewardsConfig", "il"];
export default func;

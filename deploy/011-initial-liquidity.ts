import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { DeploymentConfig, PoolConfig, getConfig, getTokenConfig } from "../helpers/deploymentConfig";
import { getUnderlyingMock, getUnderlyingToken, getUnregisteredVTokens } from "../helpers/deploymentUtils";

const faucetTokens = async (deploymentConfig: DeploymentConfig, hre: HardhatRuntimeEnvironment) => {
  const { poolConfig, tokensConfig } = deploymentConfig;
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig, hre);
  const vTokenConfigs = unregisteredVTokens.map((p: PoolConfig) => p.vtokens).flat();

  for (const vTokenConfig of vTokenConfigs) {
    const token = getTokenConfig(vTokenConfig.asset, tokensConfig);
    if (!token.isMock && !token.faucetInitialLiquidity) {
      continue;
    }
    const tokenContract = await getUnderlyingMock(token.symbol);
    console.log(`Minting ${vTokenConfig.initialSupply} mock ${token.symbol} to owner`);
    const tx = await tokenContract.faucet(vTokenConfig.initialSupply);
    await tx.wait(1);
  }
};

const approveTimelock = async (deploymentConfig: DeploymentConfig, hre: HardhatRuntimeEnvironment) => {
  if (hre.network.name !== "bsctestnet") {
    return;
  }
  const { poolConfig, tokensConfig, preconfiguredAddresses } = deploymentConfig;
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig, hre);
  const vTokenConfigs = unregisteredVTokens.map((p: PoolConfig) => p.vtokens).flat();

  for (const vTokenConfig of vTokenConfigs) {
    const { asset, initialSupply } = vTokenConfig;
    const token = getTokenConfig(asset, tokensConfig);

    const tokenContract = await getUnderlyingToken(token.symbol, tokensConfig);
    console.log(`Approving ${initialSupply} ${token.symbol} to Timelock`);
    const tx = await tokenContract.approve(preconfiguredAddresses.NormalTimelock, initialSupply);
    await tx.wait(1);
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deploymentConfig = await getConfig(hre.network.name);
  await faucetTokens(deploymentConfig, hre);
  await approveTimelock(deploymentConfig, hre);
};

func.tags = ["InitialLiquidity", "il"];

export default func;

import { BigNumber } from "ethers";
import { ethers, getNamedAccounts } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  DeploymentConfig,
  PoolConfig,
  TokenConfig,
  VTokenConfig,
  getConfig,
  getTokenConfig,
} from "../helpers/deploymentConfig";
import { getUnderlyingMock, getUnderlyingToken, getUnregisteredVTokens } from "../helpers/deploymentUtils";

const sumAmounts = async (tokens: { symbol: string; amount: BigNumber }[]) => {
  const amounts: { [symbol: string]: BigNumber } = {};
  for (const { symbol, amount } of tokens) {
    amounts[symbol] = amount.add(amounts[symbol] || 0);
  }
  return amounts;
};

const faucetTokens = async (deploymentConfig: DeploymentConfig, hre: HardhatRuntimeEnvironment) => {
  const { poolConfig, tokensConfig } = deploymentConfig;
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig, hre);
  const vTokenConfigs = unregisteredVTokens.map((p: PoolConfig) => p.vtokens).flat();
  const assetsToFaucet = vTokenConfigs
    .map((v: { asset: string }) => getTokenConfig(v.asset, tokensConfig))
    .filter((token: TokenConfig) => token.isMock || token.faucetInitialLiquidity)
    .map((token: TokenConfig) => token.symbol);

  const vTokensToFaucet = vTokenConfigs.filter((v: { asset: string }) => assetsToFaucet.includes(v.asset));

  const amounts = vTokensToFaucet.map((token: VTokenConfig) => ({
    symbol: token.asset,
    amount: BigNumber.from(token.initialSupply),
  }));
  const totalAmounts = await sumAmounts(amounts);
  const [, deployer] = await ethers.getSigners();
  for (const [symbol, amount] of Object.entries(totalAmounts)) {
    const tokenContract = await getUnderlyingMock(symbol);
    console.log(`Minting ${amount} mock ${symbol} to owner`);

    const tx = await tokenContract.faucet(amount, { gasLimit: 20000000000 });
    await tx.wait();
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deploymentConfig = await getConfig(hre.network.name);
  await faucetTokens(deploymentConfig, hre);
};

func.tags = ["InitialLiquidity", "il"];
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default func;

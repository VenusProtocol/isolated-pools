import { BigNumber } from "ethers";
import { getNetworkName } from "hardhat";
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
import { getUnderlyingMock, getUnderlyingToken, getUnregisteredVTokens, toAddress } from "../helpers/deploymentUtils";

const sumAmounts = async (tokens: { symbol: string; amount: BigNumber }[]) => {
  const amounts: { [symbol: string]: BigNumber } = {};
  for (const { symbol, amount } of tokens) {
    amounts[symbol] = amount.add(amounts[symbol] || 0);
  }
  return amounts;
};

const faucetTokens = async (deploymentConfig: DeploymentConfig) => {
  const { poolConfig, tokensConfig } = deploymentConfig;
  const unregisteredVTokens = await getUnregisteredVTokens(poolConfig);
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
  for (const [symbol, amount] of Object.entries(totalAmounts)) {
    const tokenContract = await getUnderlyingMock(symbol);
    console.log(`Minting ${amount} mock ${symbol} to owner`);
    const tx = await tokenContract.faucet(amount, { gasLimit: 5000000 });
    await tx.wait(1);
  }
  return vTokensToFaucet;
};

const sendInitialLiquidityToTreasury = async (deploymentConfig: DeploymentConfig, tokensToFaucet: VTokenConfig[]) => {
  if (getNetworkName() == "bscmainnet" || getNetworkName() == "ethereum") {
    return;
  }

  const { tokensConfig, preconfiguredAddresses } = deploymentConfig;

  const amounts = tokensToFaucet.map((token: VTokenConfig) => ({
    symbol: token.asset,
    amount: BigNumber.from(token.initialSupply),
  }));
  const totalAmounts = await sumAmounts(amounts);
  for (const [symbol, amount] of Object.entries(totalAmounts)) {
    const tokenContract = await getUnderlyingToken(symbol, tokensConfig);
    console.log(`Sending ${amount} ${symbol} to VTreasury`);
    const treasuryAddress = await toAddress(preconfiguredAddresses.VTreasury || "VTreasury");

    const tx = await tokenContract.transfer(treasuryAddress, amount, { gasLimit: 5000000 });
    await tx.wait(1);
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deploymentConfig = await getConfig(hre.getNetworkName());
  const assetsToFaucet = await faucetTokens(deploymentConfig);
  await sendInitialLiquidityToTreasury(deploymentConfig, assetsToFaucet);
};

func.tags = ["InitialLiquidity", "il"];

export default func;

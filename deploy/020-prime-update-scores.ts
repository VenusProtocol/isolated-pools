import { Prime, VToken, VToken__factory } from "../typechain";

import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface ScoreUpdate {
  [key: string]: string[];
}

const fetchPrimeHolders = async (prime: Prime, fromBlock: number, toBlock: number): Promise<string[]> => {
  const events = await prime.queryFilter(prime.filters.Mint(), fromBlock, toBlock);
  const users = [];

  for (const event of events) {
    const user = event.args[0];
    users.push(user);
  }

  return users;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const prime: Prime = await ethers.getContract(`Prime`);
  const primeHolders: string[] = [];
  const scoreUpdates: ScoreUpdate = {}

  const fromBlock = 20157699;
  const toBlock = 20325425; //await ethers.provider.getBlockNumber();
  const chunkSize = 1000;

  let startBlock = fromBlock;

  while (startBlock <= toBlock) {
    const endBlock = Math.min(startBlock + chunkSize - 1, toBlock);
    const users = await fetchPrimeHolders(prime, startBlock, endBlock);
    primeHolders.push(...users);

    console.log(`Fetched events from block ${startBlock} to ${endBlock}`);
    startBlock = endBlock + 1;
  }

  const markets = await prime.getAllMarkets();

  for (const market of markets) {
    // Ignore WETH market 
    if (market == markets[markets.length - 1]) { 
      continue
    }

    // if user has balance for the market then update score
    const vTokenFactory: VToken__factory = await ethers.getContractFactory("VToken");
    const marketContract: VToken = await vTokenFactory.attach(market).connect(ethers.provider);

    for (const user of primeHolders) {
      const balance = await marketContract.balanceOf(user);
      if (balance.gt(0)) {
        scoreUpdates[user] = scoreUpdates[user] ? [...scoreUpdates[user], market] : [market]; 
      }
    }
  }

  console.log("********** Score Updates **********");
  console.log(scoreUpdates)
};

func.tags = ["prime-score-updates"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;

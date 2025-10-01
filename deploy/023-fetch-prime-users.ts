import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import { Prime } from "../typechain";

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
};

const func: DeployFunction = async function () {
    const prime: Prime = await ethers.getContract(`Prime`);
    const primeHolders: string[] = [];
    const scoreUpdates: ScoreUpdate = {};

    const fromBlock = 20157699;
    const toBlock = await ethers.provider.getBlockNumber();
    const chunkSize = 50_000; // nodereal support up to 50k block at 1 time 

    let startBlock = fromBlock;

    // step 1: fetch all user who have minted prime token before 
    while (startBlock <= toBlock) {
        const endBlock = Math.min(startBlock + chunkSize - 1, toBlock);
        const users = await fetchPrimeHolders(prime, startBlock, endBlock);
        primeHolders.push(...users);

        console.log(`Fetched events from block ${startBlock} to ${endBlock}`);
        startBlock = endBlock + 1;
    }
    console.log("Step 1: no. of prime holders with mint event", primeHolders.length);

    // step 2: iterate through the list to filter if user is still prime 
    const finalPrimeHolders: string[] = [];
    for (const user of primeHolders) {
        const isPrme = await prime.isUserPrimeHolder(user);
        console.log(`is ${user} still prime? ${isPrme}`);
        if (isPrme) {
            finalPrimeHolders.push(user);
        }
    }
    console.log("Step 2: no. of prime holders", finalPrimeHolders.length);

    // step 3: write to file 
    fs.writeFileSync("prime-users.json", JSON.stringify(finalPrimeHolders, null, 2));
};

func.tags = ["fetch-prime-users"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;
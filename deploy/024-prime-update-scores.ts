import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";

import { Prime } from "../typechain";


const func: DeployFunction = async function () {
    const prime: Prime = await ethers.getContract(`Prime`);

    const ScoreUpdate = JSON.parse(fs.readFileSync("prime-users.json", "utf8"));
    const primeUsers = Object.keys(ScoreUpdate);


    // update every batchSize users
    const batchSize = 50;
    for (let i = 0; i < primeUsers.length; i += batchSize) {
        const batch = primeUsers.slice(i, i + batchSize);

        console.log(`Updating ${batch} users`);
        const tx = await prime.updateScores(batch);
        await tx.wait();
        console.log(`Updated ${batch.length} users`);
        console.log(`TX: ${tx.hash}`);
    }
};

func.tags = ["prime-update-scores"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;
import fs from "fs";
import { ethers } from "hardhat";
import path from "path";

import { Comptroller__factory, IERC20__factory, VToken__factory } from "../typechain";

const ACTIONS = ["MINT", "REDEEM", "BORROW", "REPAY", "SEIZE", "LIQUIDATE", "TRANSFER", "ENTER_MARKET", "EXIT_MARKET"];

/** Discovers all Comptroller deployments for a given network. */
function discoverPools(network: string): { name: string; address: string }[] {
  const deploymentsDir = path.resolve(process.cwd(), `deployments/${network}`);
  if (!fs.existsSync(deploymentsDir)) {
    throw new Error(`No deployments found for network: ${network} (expected ${deploymentsDir})`);
  }

  const files = fs.readdirSync(deploymentsDir).filter(f => f.startsWith("Comptroller_") && f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No Comptroller_*.json files found in ${deploymentsDir}`);
  }

  return files.map(file => {
    const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, file), "utf-8"));
    const name = file.replace("Comptroller_", "").replace(".json", "");
    return { name, address: deployment.address };
  });
}

async function main() {
  const network = process.env.FORKED_NETWORK;
  if (!network) {
    console.error("Usage: FORKED_NETWORK=<network> npx hardhat run scripts/check_markets.ts");
    console.error("Example: FORKED_NETWORK=arbitrumone npx hardhat run scripts/check_markets.ts");
    process.exit(1);
  }

  const rpcUrl = process.env[`ARCHIVE_NODE_${network}`];
  if (!rpcUrl) {
    console.error(`Missing RPC URL: set ARCHIVE_NODE_${network} environment variable`);
    process.exit(1);
  }

  await ethers.provider.send("hardhat_reset", [{ forking: { jsonRpcUrl: rpcUrl } }]);
  const blockNumber = await ethers.provider.getBlockNumber();

  // Discover and log all available pools
  const pools = discoverPools(network);
  console.log(`\nNetwork: ${network} | Block: ${blockNumber}`);
  console.log(`Available pools: ${pools.map(p => `${p.name} (${p.address})`).join(", ")}`);

  // Find Core pool
  const corePool = pools.find(p => p.name === "Core");
  if (!corePool) {
    console.error(`\nNo Core pool found for ${network}. Available: ${pools.map(p => p.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Core Pool | Comptroller: ${corePool.address}`);
  console.log("=".repeat(80));

  const comptroller = Comptroller__factory.connect(corePool.address, ethers.provider);
  const marketAddresses = await comptroller.getAllMarkets();
  console.log(`Markets: ${marketAddresses.length}\n`);

  let fullyActive = 0;
  let partiallyPaused = 0;
  let fullyPaused = 0;

  for (const marketAddr of marketAddresses) {
    const vToken = VToken__factory.connect(marketAddr, ethers.provider);

    const [symbol, underlying, totalSupply, totalBorrows] = await Promise.all([
      vToken.symbol(),
      vToken.underlying(),
      vToken.totalSupply(),
      vToken.totalBorrows(),
    ]);

    const underlyingToken = IERC20__factory.connect(underlying, ethers.provider);
    const [underlyingBalance, underlyingDecimals] = await Promise.all([
      underlyingToken.balanceOf(marketAddr),
      underlyingToken.decimals(),
    ]);

    const pausedActions: string[] = [];
    const activeActions: string[] = [];

    const pauseResults = await Promise.all(
      ACTIONS.map(async (action, i) => {
        try {
          const isPaused = await comptroller.actionPaused(marketAddr, i);
          return { action, isPaused };
        } catch {
          return null;
        }
      }),
    );

    for (const result of pauseResults) {
      if (!result) continue;
      if (result.isPaused) pausedActions.push(result.action);
      else activeActions.push(result.action);
    }

    const status =
      activeActions.length === 0 ? "FULLY PAUSED" : pausedActions.length > 0 ? "PARTIALLY PAUSED" : "ACTIVE";

    console.log(`  ${symbol} (${marketAddr})`);
    console.log(`    Underlying: ${underlying} (${underlyingDecimals} decimals)`);
    console.log(`    Total Supply: ${totalSupply.toString()} | Total Borrows: ${totalBorrows.toString()}`);
    console.log(`    Cash (balanceOf): ${underlyingBalance.toString()}`);
    console.log(`    Active:  ${activeActions.length > 0 ? activeActions.join(", ") : "NONE"}`);
    console.log(`    Paused:  ${pausedActions.length > 0 ? pausedActions.join(", ") : "NONE"}`);
    console.log(`    Status:  ${status}`);
    console.log();

    if (status === "ACTIVE") fullyActive++;
    else if (status === "FULLY PAUSED") fullyPaused++;
    else partiallyPaused++;
  }

  console.log("=".repeat(80));
  console.log(
    `Summary: ${marketAddresses.length} markets | ${fullyActive} active | ${partiallyPaused} partially paused | ${fullyPaused} fully paused`,
  );
}

main().catch(console.error);

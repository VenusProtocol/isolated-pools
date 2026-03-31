import chai from "chai";
import { ethers } from "hardhat";

import {
  Comptroller,
  Comptroller__factory,
  PoolLens,
  PoolLens__factory,
  PoolRegistry__factory,
} from "../../../typechain";
import { getContractAddresses, setForkBlock } from "./utils";

const { expect } = chai;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { POOL_REGISTRY, COMPTROLLER, CORE_COMPTROLLER, ACC1, BLOCK_NUMBER } = getContractAddresses(
  FORKED_NETWORK as string,
);

// BSC uses block-based, Arbitrum/Optimism/Base/zkSync use time-based
const TIME_BASED_NETWORKS = [
  "arbitrumone",
  "arbitrumsepolia",
  "zksyncmainnet",
  "zksyncsepolia",
  "opmainnet",
  "opsepolia",
  "basemainnet",
  "basesepolia",
];

const isTimeBased = TIME_BASED_NETWORKS.includes(FORKED_NETWORK);
const BSC_BLOCKS_PER_YEAR = 70_080_000;
const ETH_BLOCKS_PER_YEAR = 2_628_000;
const OPBNB_BLOCKS_PER_YEAR = 126_144_000;

// Action enum values matching ComptrollerInterface.sol
const ACTION_MINT = 0;
const ACTION_BORROW = 2;

function getBlocksPerYear(network: string): number {
  if (TIME_BASED_NETWORKS.includes(network)) return 0;
  if (network.includes("opbnb")) return OPBNB_BLOCKS_PER_YEAR;
  if (network === "ethereum" || network === "sepolia") return ETH_BLOCKS_PER_YEAR;
  return BSC_BLOCKS_PER_YEAR;
}

/**
 * Checks if a market is active (listed and not both MINT+BORROW paused).
 * Mirrors the _isActiveMarket logic in PoolLens.sol.
 */
async function isActiveMarket(comptroller: Comptroller, market: string): Promise<boolean> {
  const [isListed] = await comptroller.markets(market);
  if (!isListed) return false;

  const mintPaused = await comptroller.actionPaused(market, ACTION_MINT);
  const borrowPaused = await comptroller.actionPaused(market, ACTION_BORROW);
  if (mintPaused && borrowPaused) return false;

  return true;
}

if (FORK) {
  describe(`PoolLens Fork Test (${FORKED_NETWORK})`, () => {
    let poolLens: PoolLens;
    let comptroller: Comptroller;

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);

      const poolLensFactory = (await ethers.getContractFactory("PoolLens")) as PoolLens__factory;
      poolLens = await poolLensFactory.deploy(
        isTimeBased,
        getBlocksPerYear(FORKED_NETWORK),
        CORE_COMPTROLLER || ethers.constants.AddressZero,
      );
      await poolLens.deployed();

      comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
    });

    describe("getAllPools", () => {
      it("should not revert and only return active markets", async () => {
        const pools = await poolLens.getAllPools(POOL_REGISTRY);
        expect(pools.length).to.be.greaterThan(0);

        for (const pool of pools) {
          expect(pool.comptroller).to.not.equal(ethers.constants.AddressZero);
          for (const vToken of pool.vTokens) {
            expect(vToken.isListed).to.equal(true);
          }
        }
      });
    });

    describe("getPoolByComptroller", () => {
      it("should not revert and only return active markets", async () => {
        const pool = await poolLens.getPoolByComptroller(POOL_REGISTRY, COMPTROLLER);
        expect(pool.comptroller).to.equal(COMPTROLLER);
        for (const vToken of pool.vTokens) {
          expect(vToken.isListed).to.equal(true);
        }
      });
    });

    describe("getPendingRewards", () => {
      it("should not revert", async () => {
        const account = ACC1 || ethers.constants.AddressZero;
        const rewards = await poolLens.getPendingRewards(account, COMPTROLLER);
        expect(rewards).to.be.an("array");
      });
    });

    describe("getPoolBadDebt", () => {
      it("should not revert", async () => {
        const badDebtSummary = await poolLens.getPoolBadDebt(COMPTROLLER);
        expect(badDebtSummary.comptroller).to.equal(COMPTROLLER);
        expect(badDebtSummary.badDebts).to.be.an("array");
        for (const badDebt of badDebtSummary.badDebts) {
          expect(badDebt.vTokenAddress).to.not.equal(ethers.constants.AddressZero);
        }
      });
    });

    describe("vTokenMetadataAll", () => {
      it("should not revert for active markets in pool", async () => {
        const allMarkets = await comptroller.getAllMarkets();

        const activeMarkets: string[] = [];
        for (const market of allMarkets) {
          if (await isActiveMarket(comptroller, market)) {
            activeMarkets.push(market);
          }
        }

        if (activeMarkets.length > 0) {
          const metadata = await poolLens.vTokenMetadataAll(activeMarkets);
          expect(metadata.length).to.equal(activeMarkets.length);
        }
      });
    });

    describe("getPoolDataFromVenusPool", () => {
      it("should not revert and only return active markets", async () => {
        const poolRegistry = PoolRegistry__factory.connect(POOL_REGISTRY, ethers.provider);
        const venusPool = await poolRegistry.getPoolByComptroller(COMPTROLLER);
        const poolData = await poolLens.getPoolDataFromVenusPool(POOL_REGISTRY, venusPool);
        expect(poolData.comptroller).to.equal(COMPTROLLER);

        for (const vToken of poolData.vTokens) {
          expect(vToken.isListed).to.equal(true);
        }
      });
    });

    describe("deprecated markets filtering", () => {
      it("should not include unlisted or MINT+BORROW paused markets for non-core pools", async () => {
        // Skip this test if the tested comptroller is the core pool (core pool returns all markets)
        if (COMPTROLLER === CORE_COMPTROLLER) {
          return;
        }

        const allMarkets = await comptroller.getAllMarkets();
        const pool = await poolLens.getPoolByComptroller(POOL_REGISTRY, COMPTROLLER);
        const returnedAddresses = pool.vTokens.map(v => v.vToken.toLowerCase());

        for (const market of allMarkets) {
          const active = await isActiveMarket(comptroller, market);
          if (!active) {
            expect(returnedAddresses).to.not.include(
              market.toLowerCase(),
              `Deprecated market ${market} should not be in PoolLens results`,
            );
          }
        }
      });

      it("should include all markets for core pool", async () => {
        if (!CORE_COMPTROLLER || CORE_COMPTROLLER === ethers.constants.AddressZero) {
          return;
        }

        const coreComptroller = Comptroller__factory.connect(CORE_COMPTROLLER, ethers.provider);
        const allMarkets = await coreComptroller.getAllMarkets();
        const pool = await poolLens.getPoolByComptroller(POOL_REGISTRY, CORE_COMPTROLLER);
        const returnedAddresses = pool.vTokens.map(v => v.vToken.toLowerCase());

        expect(returnedAddresses.length).to.equal(allMarkets.length);
        for (const market of allMarkets) {
          expect(returnedAddresses).to.include(market.toLowerCase());
        }
      });
    });
  });
}

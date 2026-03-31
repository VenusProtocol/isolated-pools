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
  "unichainmainnet",
  "unichainsepolia",
];

const isTimeBased = TIME_BASED_NETWORKS.includes(FORKED_NETWORK);
const BSC_BLOCKS_PER_YEAR = 70_080_000;
const ETH_BLOCKS_PER_YEAR = 2_628_000;
const OPBNB_BLOCKS_PER_YEAR = 126_144_000;

function getBlocksPerYear(network: string): number {
  if (TIME_BASED_NETWORKS.includes(network)) return 0;
  if (network.includes("opbnb")) return OPBNB_BLOCKS_PER_YEAR;
  if (network === "ethereum" || network === "sepolia") return ETH_BLOCKS_PER_YEAR;
  return BSC_BLOCKS_PER_YEAR;
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
      it("should not revert", async () => {
        const pools = await poolLens.getAllPools(POOL_REGISTRY);
        expect(pools.length).to.be.greaterThan(0);

        for (const pool of pools) {
          expect(pool.comptroller).to.not.equal(ethers.constants.AddressZero);
        }
      });
    });

    describe("getPoolByComptroller", () => {
      it("should not revert and return markets for core pool or empty list for non-core pool", async () => {
        const pool = await poolLens.getPoolByComptroller(POOL_REGISTRY, COMPTROLLER);
        expect(pool.comptroller).to.equal(COMPTROLLER);

        if (COMPTROLLER === CORE_COMPTROLLER) {
          expect(pool.vTokens.length).to.be.greaterThan(0);
          for (const vToken of pool.vTokens) {
            expect(vToken.isListed).to.equal(true);
          }
        } else {
          expect(pool.vTokens.length).to.equal(0);
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
      it("should not revert for markets in pool", async () => {
        const allMarkets = await comptroller.getAllMarkets();

        if (allMarkets.length > 0) {
          const metadata = await poolLens.vTokenMetadataAll(allMarkets);
          expect(metadata.length).to.equal(allMarkets.length);
        }
      });
    });

    describe("getPoolDataFromVenusPool", () => {
      it("should not revert", async () => {
        const poolRegistry = PoolRegistry__factory.connect(POOL_REGISTRY, ethers.provider);
        const venusPool = await poolRegistry.getPoolByComptroller(COMPTROLLER);
        const poolData = await poolLens.getPoolDataFromVenusPool(POOL_REGISTRY, venusPool);
        expect(poolData.comptroller).to.equal(COMPTROLLER);
      });
    });

    describe("non-core pool returns empty list", () => {
      it("should return empty vTokens for non-core pool comptrollers", async () => {
        if (COMPTROLLER === CORE_COMPTROLLER) {
          return;
        }

        const pool = await poolLens.getPoolByComptroller(POOL_REGISTRY, COMPTROLLER);
        expect(pool.vTokens.length).to.equal(0);
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

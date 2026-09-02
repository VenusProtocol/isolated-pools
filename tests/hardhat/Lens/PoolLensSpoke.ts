import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { DEFAULT_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
import {
  AccessControlManager,
  Comptroller,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolLens,
  PoolLens__factory,
  PoolRegistry,
  SpokeComptroller,
  VToken,
  WhitePaperInterestRateModel__factory,
} from "../../../typechain";
import { makeVToken } from "../util/TokenTestHelpers";

upgrades.silenceWarnings();

const MAX_LOOPS_LIMIT = 150;
const CLOSE_FACTOR = parseUnits("0.05", 18);
const MIN_LIQUIDATABLE_COLLATERAL = parseUnits("100", 18);

/// Both above the 1.05e18 floor a market's default 5% protocol seize share imposes.
const POOL_INCENTIVE = parseUnits("1.1", 18);
const MARKET_INCENTIVE = parseUnits("1.2", 18);

/// The setter only rejects the zero address and the lens only reports the address back, so this need
/// not be a real oracle.
const BOUNDED_ORACLE = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

/**
 * One `PoolLens` describes every isolated pool, and a spoke pool carries state the shared `Comptroller`
 * has no equivalent of.
 *
 * Both kinds of pool live in the same registry here and are read through the same lens instance,
 * because the failure worth guarding against is the lens answering for one kind by breaking the other.
 */
describe("PoolLens: spoke pool state", () => {
  interface LensFixture {
    poolLens: PoolLens;
    poolRegistry: PoolRegistry;
    spoke: SpokeComptroller;
    unconfigured: SpokeComptroller;
    control: Comptroller;
    spokeMarkets: VToken[];
    controlMarket: VToken;
  }

  async function lensFixture(): Promise<LensFixture> {
    const [owner] = await ethers.getSigners();

    const acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);

    const PoolRegistryFactory = await ethers.getContractFactory("PoolRegistry");
    const poolRegistry = (await upgrades.deployProxy(PoolRegistryFactory, [acm.address])) as PoolRegistry;

    const MockPriceOracleFactory = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
    const priceOracle: MockPriceOracle = await MockPriceOracleFactory.deploy();

    const deployPool = async (name: string, contractName: "SpokeComptroller" | "Comptroller") => {
      const factory = await ethers.getContractFactory(contractName);
      const beacon = await upgrades.deployBeacon(factory, { constructorArgs: [poolRegistry.address] });
      const comptroller = await upgrades.deployBeaconProxy(beacon, factory, [MAX_LOOPS_LIMIT, acm.address]);
      await comptroller.setPriceOracle(priceOracle.address);
      await poolRegistry.addPool(name, comptroller.address, CLOSE_FACTOR, POOL_INCENTIVE, MIN_LIQUIDATABLE_COLLATERAL);
      return comptroller;
    };

    const spoke = (await deployPool("Spoke pool", "SpokeComptroller")) as SpokeComptroller;
    // Registered but otherwise untouched, i.e. the state the deploy script leaves a spoke pool in.
    const unconfigured = (await deployPool("Unconfigured spoke pool", "SpokeComptroller")) as SpokeComptroller;
    const control = (await deployPool("Control pool", "Comptroller")) as Comptroller;

    const MockTokenFactory = await ethers.getContractFactory<MockToken__factory>("MockToken");
    const RateModelFactory = await ethers.getContractFactory<WhitePaperInterestRateModel__factory>(
      "WhitePaperInterestRateModel",
    );
    const rateModel = await RateModelFactory.deploy(0, parseUnits("0.04", 18), false, DEFAULT_BLOCKS_PER_YEAR);

    const initialSupply = parseUnits("1000", 18);
    const listMarket = async (comptroller: Comptroller | SpokeComptroller, symbol: string): Promise<VToken> => {
      const underlying: MockToken = await MockTokenFactory.deploy(symbol, symbol, 18);
      await priceOracle.setPrice(underlying.address, parseUnits("1", 18));

      const vToken = await makeVToken({
        underlying,
        comptroller,
        accessControlManager: acm,
        decimals: 8,
        initialExchangeRateMantissa: parseUnits("1", 18),
        admin: owner,
        interestRateModel: rateModel,
        isTimeBased: false,
        blocksPerYear: DEFAULT_BLOCKS_PER_YEAR,
      });

      await underlying.faucet(initialSupply);
      await underlying.approve(poolRegistry.address, initialSupply);
      await poolRegistry.addMarket({
        vToken: vToken.address,
        collateralFactor: parseUnits("0.7", 18),
        liquidationThreshold: parseUnits("0.7", 18),
        initialSupply,
        vTokenReceiver: owner.address,
        supplyCap: parseUnits("4000", 18),
        borrowCap: parseUnits("2000", 18),
      });
      return vToken as VToken;
    };

    // Two markets on the spoke pool: the first carries an incentive and an allowlist of its own, the
    // second inherits the pool.
    const spokeMarkets = [await listMarket(spoke, "SPK1"), await listMarket(spoke, "SPK2")];
    const controlMarket = await listMarket(control, "CTL1");

    await spoke.setDeviationBoundedOracle(BOUNDED_ORACLE);
    await spoke.setMarketLiquidationIncentive(spokeMarkets[0].address, MARKET_INCENTIVE);
    await spoke.setSupplyAllowlistEnabled(spokeMarkets[0].address, true);

    const PoolLensFactory = await ethers.getContractFactory<PoolLens__factory>("PoolLens");
    const poolLens = await PoolLensFactory.deploy(false, DEFAULT_BLOCKS_PER_YEAR);

    return { poolLens, poolRegistry, spoke, unconfigured, control, spokeMarkets, controlMarket };
  }

  let f: LensFixture;

  beforeEach(async () => {
    f = await loadFixture(lensFixture);
  });

  const poolData = (comptroller: { address: string }) =>
    f.poolLens.getPoolByComptroller(f.poolRegistry.address, comptroller.address);

  describe("deviationBoundedOracle", () => {
    it("reports the oracle a spoke pool bounds collateral prices with", async () => {
      expect((await poolData(f.spoke)).deviationBoundedOracle).to.equal(BOUNDED_ORACLE);
    });

    it("reports zero for a pool that has no such oracle", async () => {
      // The control pool has no `deviationBoundedOracle()`, so the probe reports zero instead of
      // reverting the whole read.
      expect((await poolData(f.control)).deviationBoundedOracle).to.equal(ethers.constants.AddressZero);
    });

    it("reports zero for a spoke pool whose listing VIP has not set one yet", async () => {
      // Distinguishable from the control pool only by the fact that this one would answer the probe.
      const pool = await poolData(f.unconfigured);
      expect(pool.deviationBoundedOracle).to.equal(ethers.constants.AddressZero);
      expect(pool.vTokens).to.have.lengthOf(0);
    });
  });

  describe("liquidationAllowlistEnabled", () => {
    it("follows the pool's own flag", async () => {
      expect((await poolData(f.spoke)).liquidationAllowlistEnabled).to.equal(false);

      await f.spoke.setLiquidationAllowlistEnabled(true);
      expect((await poolData(f.spoke)).liquidationAllowlistEnabled).to.equal(true);
    });

    it("is false for a pool with no such allowlist, which is the open behaviour", async () => {
      expect((await poolData(f.control)).liquidationAllowlistEnabled).to.equal(false);
    });
  });

  describe("liquidationIncentiveMantissa, per market", () => {
    it("reports a market's own incentive, and the pool-wide one for a market without", async () => {
      const markets = (await poolData(f.spoke)).vTokens;

      expect(markets[0].liquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
      expect(markets[1].liquidationIncentiveMantissa).to.equal(POOL_INCENTIVE);
    });

    it("leaves PoolData.liquidationIncentive meaning the pool-wide value", async () => {
      // Consumers read this field as the pool's value, so a market carrying its own must not change it.
      expect((await poolData(f.spoke)).liquidationIncentive).to.equal(POOL_INCENTIVE);
    });

    it("reports the pool-wide value for a pool that has no per-market incentives", async () => {
      // Not a stand-in for a missing number: on that pool the pool-wide incentive is the one that applies
      // to each of its markets.
      const markets = (await poolData(f.control)).vTokens;
      expect(markets[0].liquidationIncentiveMantissa).to.equal(POOL_INCENTIVE);
      expect((await poolData(f.control)).liquidationIncentive).to.equal(POOL_INCENTIVE);
    });

    it("answers the same through vTokenMetadata, which takes no registry", async () => {
      const direct = await f.poolLens.vTokenMetadata(f.spokeMarkets[0].address);
      expect(direct.liquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
    });
  });

  describe("supplyAllowlistEnabled, per market", () => {
    it("is per market, so an armed market does not arm its siblings", async () => {
      const markets = (await poolData(f.spoke)).vTokens;

      expect(markets[0].supplyAllowlistEnabled).to.equal(true);
      expect(markets[1].supplyAllowlistEnabled).to.equal(false);
    });

    it("follows the setter", async () => {
      await f.spoke.setSupplyAllowlistEnabled(f.spokeMarkets[0].address, false);
      expect((await f.poolLens.vTokenMetadata(f.spokeMarkets[0].address)).supplyAllowlistEnabled).to.equal(false);
    });

    it("is false for a market with no such allowlist", async () => {
      expect((await f.poolLens.vTokenMetadata(f.controlMarket.address)).supplyAllowlistEnabled).to.equal(false);
    });
  });

  describe("one lens over a registry holding both kinds of pool", () => {
    it("describes each pool without the other's answers leaking in", async () => {
      const pools = await f.poolLens.getAllPools(f.poolRegistry.address);
      expect(pools).to.have.lengthOf(3);

      const find = (comptroller: string) => {
        const pool = pools.find(p => p.comptroller === comptroller);
        if (pool === undefined) throw new Error(`the registry does not hold a pool at ${comptroller}`);
        return pool;
      };
      const spokePool = find(f.spoke.address);
      const controlPool = find(f.control.address);

      expect(spokePool.deviationBoundedOracle).to.equal(BOUNDED_ORACLE);
      expect(controlPool.deviationBoundedOracle).to.equal(ethers.constants.AddressZero);
      expect(spokePool.vTokens[0].liquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
      expect(controlPool.vTokens[0].liquidationIncentiveMantissa).to.equal(POOL_INCENTIVE);
    });
  });
});

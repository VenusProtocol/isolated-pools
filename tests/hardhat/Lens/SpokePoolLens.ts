import { smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, mine, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { DEFAULT_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
import {
  AccessControlManager,
  Comptroller,
  IDeviationBoundedOracle,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolLens,
  PoolLens__factory,
  PoolRegistry,
  RewardsDistributor,
  SpokeComptroller,
  SpokePoolLens,
  SpokePoolLens__factory,
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

/// Deliberately unequal, so a test that reads the threshold cannot pass by echoing the collateral factor.
const COLLATERAL_FACTOR = parseUnits("0.7", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);

/// Every fixture market is priced at $1, so a usd amount the lens reports is the underlying amount.
const PRICE = parseUnits("1", 18);

/// Enough to leave the borrower solvent at a 0.7 collateral factor after both borrows below.
const BORROWER_SUPPLY = parseUnits("200", 18);
const HEALED_BORROW = parseUnits("40", 18);
const LIVE_BORROW = parseUnits("20", 18);

const REWARD_SPEED = parseUnits("0.5", 18);

/**
 * `SpokePoolLens` reports the pool and market state a spoke pool has and `PoolLens` has no field for.
 *
 * A pooled comptroller is deployed alongside as a control, for the one assertion that matters about it:
 * this lens answers about spoke pools only, and pointing it at a pool that is not one fails loudly
 * rather than reporting a plausible zero.
 */
describe("SpokePoolLens", function () {
  // Two registries, four pools and a rewards distributor put the fixture over mocha's default budget.
  this.timeout(120000);
  interface LensFixture {
    spokeLens: SpokePoolLens;
    poolLens: PoolLens;
    spokeRegistry: PoolRegistry;
    pooledRegistry: PoolRegistry;
    spoke: SpokeComptroller;
    unconfigured: SpokeComptroller;
    control: Comptroller;
    spokeMarkets: VToken[];
    boundedOracle: IDeviationBoundedOracle;
    rewardsDistributor: RewardsDistributor;
    rewardToken: MockToken;
    borrower: SignerWithAddress;
  }

  async function lensFixture(): Promise<LensFixture> {
    const [owner, , borrower] = await ethers.getSigners();

    const acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);

    const PoolRegistryFactory = await ethers.getContractFactory("PoolRegistry");
    const deployRegistry = async () => (await upgrades.deployProxy(PoolRegistryFactory, [acm.address])) as PoolRegistry;

    // Two registries, as a deployment has: a spoke pool is listed in one of its own rather than the
    // shared directory, so the spoke lens never meets a pool it has no shape for.
    const spokeRegistry = await deployRegistry();
    const pooledRegistry = await deployRegistry();

    const MockPriceOracleFactory = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
    const priceOracle: MockPriceOracle = await MockPriceOracleFactory.deploy();

    const deployPool = async (
      name: string,
      contractName: "SpokeComptroller" | "Comptroller",
      registry: PoolRegistry,
    ) => {
      const factory = await ethers.getContractFactory(contractName);
      const beacon = await upgrades.deployBeacon(factory, { constructorArgs: [registry.address] });
      const comptroller = await upgrades.deployBeaconProxy(beacon, factory, [MAX_LOOPS_LIMIT, acm.address]);
      await comptroller.setPriceOracle(priceOracle.address);
      await registry.addPool(name, comptroller.address, CLOSE_FACTOR, POOL_INCENTIVE, MIN_LIQUIDATABLE_COLLATERAL);
      return comptroller;
    };

    const spoke = (await deployPool("Spoke pool", "SpokeComptroller", spokeRegistry)) as SpokeComptroller;
    // Registered but otherwise untouched, i.e. the state the deploy script leaves a spoke pool in.
    const unconfigured = (await deployPool(
      "Unconfigured spoke pool",
      "SpokeComptroller",
      spokeRegistry,
    )) as SpokeComptroller;
    const control = (await deployPool("Control pool", "Comptroller", pooledRegistry)) as Comptroller;

    const MockTokenFactory = await ethers.getContractFactory<MockToken__factory>("MockToken");
    const RateModelFactory = await ethers.getContractFactory<WhitePaperInterestRateModel__factory>(
      "WhitePaperInterestRateModel",
    );
    const rateModel = await RateModelFactory.deploy(0, parseUnits("0.04", 18), false, DEFAULT_BLOCKS_PER_YEAR);

    const initialSupply = parseUnits("1000", 18);
    const listMarket = async (
      comptroller: Comptroller | SpokeComptroller,
      symbol: string,
      registry: PoolRegistry,
    ): Promise<VToken> => {
      const underlying: MockToken = await MockTokenFactory.deploy(symbol, symbol, 18);
      await priceOracle.setPrice(underlying.address, PRICE);

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
      await underlying.approve(registry.address, initialSupply);
      await registry.addMarket({
        vToken: vToken.address,
        collateralFactor: COLLATERAL_FACTOR,
        liquidationThreshold: LIQUIDATION_THRESHOLD,
        initialSupply,
        vTokenReceiver: owner.address,
        supplyCap: parseUnits("4000", 18),
        borrowCap: parseUnits("2000", 18),
      });
      return vToken as VToken;
    };

    // Two markets on the spoke pool: the first carries an incentive and an allowlist of its own, the
    // second inherits the pool.
    const spokeMarkets = [
      await listMarket(spoke, "SPK1", spokeRegistry),
      await listMarket(spoke, "SPK2", spokeRegistry),
    ];
    await listMarket(control, "CTL1", pooledRegistry);

    // A borrow reads this, so it has to be a live contract rather than a bare address. Returning spot on
    // both legs is what the real one does for an asset it holds no window for.
    const boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    boundedOracle.getBoundedPricesView.returns([PRICE, PRICE]);
    await spoke.setDeviationBoundedOracle(boundedOracle.address);

    await spoke.setMarketLiquidationIncentive(spokeMarkets[0].address, MARKET_INCENTIVE);
    await spoke.setSupplyAllowlistEnabled(spokeMarkets[0].address, true);

    // An idle pool carries no bad debt and accrues no rewards, which would leave the parity check below
    // comparing zero against zero. Borrow against the second market, which has no supply allowlist, then
    // heal the first borrow so one market holds bad debt and the other keeps a live borrow.
    const collateral = MockTokenFactory.attach(await spokeMarkets[1].underlying());
    await collateral.connect(borrower).faucet(BORROWER_SUPPLY);
    await collateral.connect(borrower).approve(spokeMarkets[1].address, BORROWER_SUPPLY);
    await spokeMarkets[1].connect(borrower).mint(BORROWER_SUPPLY);
    await spoke.connect(borrower).enterMarkets([spokeMarkets[1].address]);
    await spokeMarkets[0].connect(borrower).borrow(HEALED_BORROW);
    await spokeMarkets[1].connect(borrower).borrow(LIVE_BORROW);

    // `healBorrow` is the only path that writes `badDebt`, and only the comptroller may call it.
    await impersonateAccount(spoke.address);
    await setBalance(spoke.address, parseUnits("1", 18));
    const asComptroller = await ethers.getSigner(spoke.address);
    await spokeMarkets[0].connect(asComptroller).healBorrow(borrower.address, borrower.address, 0);

    const rewardToken = await MockTokenFactory.deploy("REW", "REW", 18);
    const RewardsDistributorFactory = await ethers.getContractFactory("RewardsDistributor");
    const rewardsDistributor = (await upgrades.deployProxy(
      RewardsDistributorFactory,
      [spoke.address, rewardToken.address, MAX_LOOPS_LIMIT, acm.address],
      { constructorArgs: [false, DEFAULT_BLOCKS_PER_YEAR], unsafeAllow: ["internal-function-storage"] },
    )) as RewardsDistributor;
    await spoke.addRewardsDistributor(rewardsDistributor.address);
    await rewardsDistributor.setRewardTokenSpeeds(
      spokeMarkets.map(market => market.address),
      [REWARD_SPEED, REWARD_SPEED],
      [REWARD_SPEED, REWARD_SPEED],
    );
    // The reward indices only move once blocks pass, so every account reads zero until some do.
    await mine(1000);

    const SpokePoolLensFactory = await ethers.getContractFactory<SpokePoolLens__factory>("SpokePoolLens");
    const spokeLens = await SpokePoolLensFactory.deploy(false, DEFAULT_BLOCKS_PER_YEAR);

    const PoolLensFactory = await ethers.getContractFactory<PoolLens__factory>("PoolLens");
    const poolLens = await PoolLensFactory.deploy(false, DEFAULT_BLOCKS_PER_YEAR);

    return {
      spokeLens,
      poolLens,
      spokeRegistry,
      pooledRegistry,
      spoke,
      unconfigured,
      control,
      spokeMarkets,
      boundedOracle,
      rewardsDistributor,
      rewardToken,
      borrower,
    };
  }

  let f: LensFixture;

  beforeEach(async () => {
    f = await loadFixture(lensFixture);
  });

  const poolData = (comptroller: { address: string }) =>
    f.spokeLens.getSpokePoolByComptroller(f.spokeRegistry.address, comptroller.address);

  describe("pool state a spoke pool alone has", () => {
    it("reports the oracle the pool bounds collateral prices with", async () => {
      expect((await poolData(f.spoke)).deviationBoundedOracle).to.equal(f.boundedOracle.address);
    });

    it("reports zero for a pool whose listing VIP has not set one yet", async () => {
      const pool = await poolData(f.unconfigured);
      expect(pool.deviationBoundedOracle).to.equal(ethers.constants.AddressZero);
      expect(pool.vTokens).to.have.lengthOf(0);
    });

    it("follows the pool's liquidation allowlist flag", async () => {
      expect((await poolData(f.spoke)).liquidationAllowlistEnabled).to.equal(false);

      await f.spoke.setLiquidationAllowlistEnabled(true);
      expect((await poolData(f.spoke)).liquidationAllowlistEnabled).to.equal(true);
    });

    it("reports the pool-wide incentive, not the one a market set for itself", async () => {
      // The getter behind this field resolves against its caller, and a lens is not one of the pool's
      // markets, so what comes back is the pool-wide fallback. A market carrying its own must not move it.
      expect((await poolData(f.spoke)).poolLiquidationIncentiveMantissa).to.equal(POOL_INCENTIVE);
    });
  });

  describe("market state a spoke pool alone has", () => {
    it("reports a market's own incentive, and the pool's for a market without one", async () => {
      const markets = (await poolData(f.spoke)).vTokens;

      expect(markets[0].effectiveLiquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
      expect(markets[1].effectiveLiquidationIncentiveMantissa).to.equal(POOL_INCENTIVE);
    });

    it("distinguishes a market that set an incentive from one that inherits", async () => {
      // Zero is the "unset" sentinel here, not a discount of zero, which is why both fields are reported.
      const markets = (await poolData(f.spoke)).vTokens;

      expect(markets[0].ownLiquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
      expect(markets[1].ownLiquidationIncentiveMantissa).to.equal(0);
    });

    it("reports the supply allowlist per market, so an armed market does not arm its siblings", async () => {
      const markets = (await poolData(f.spoke)).vTokens;

      expect(markets[0].supplyAllowlistEnabled).to.equal(true);
      expect(markets[1].supplyAllowlistEnabled).to.equal(false);
    });

    it("follows the forced liquidation flag", async () => {
      expect((await f.spokeLens.spokeVTokenMetadata(f.spokeMarkets[0].address)).forcedLiquidationEnabled).to.equal(
        false,
      );

      await f.spoke.setForcedLiquidation(f.spokeMarkets[0].address, true);
      expect((await f.spokeLens.spokeVTokenMetadata(f.spokeMarkets[0].address)).forcedLiquidationEnabled).to.equal(
        true,
      );
    });

    it("reports the liquidation threshold, which no other lens field carries", async () => {
      const metadata = await f.spokeLens.spokeVTokenMetadata(f.spokeMarkets[0].address);

      expect(metadata.liquidationThresholdMantissa).to.equal(LIQUIDATION_THRESHOLD);
      // Not the collateral factor under another name.
      expect(metadata.collateralFactorMantissa).to.equal(COLLATERAL_FACTOR);
    });
  });

  describe("the fields shared with PoolLens", () => {
    it("reports the same market metadata PoolLens does", async () => {
      const [spokeSide, pooledSide] = await Promise.all([
        f.spokeLens.spokeVTokenMetadata(f.spokeMarkets[0].address),
        f.poolLens.vTokenMetadata(f.spokeMarkets[0].address),
      ]);

      expect(spokeSide.vToken).to.equal(pooledSide.vToken);
      expect(spokeSide.exchangeRateCurrent).to.equal(pooledSide.exchangeRateCurrent);
      expect(spokeSide.supplyRatePerBlockOrTimestamp).to.equal(pooledSide.supplyRatePerBlockOrTimestamp);
      expect(spokeSide.borrowRatePerBlockOrTimestamp).to.equal(pooledSide.borrowRatePerBlockOrTimestamp);
      expect(spokeSide.reserveFactorMantissa).to.equal(pooledSide.reserveFactorMantissa);
      expect(spokeSide.supplyCaps).to.equal(pooledSide.supplyCaps);
      expect(spokeSide.borrowCaps).to.equal(pooledSide.borrowCaps);
      expect(spokeSide.totalBorrows).to.equal(pooledSide.totalBorrows);
      expect(spokeSide.totalReserves).to.equal(pooledSide.totalReserves);
      expect(spokeSide.totalSupply).to.equal(pooledSide.totalSupply);
      expect(spokeSide.totalCash).to.equal(pooledSide.totalCash);
      expect(spokeSide.isListed).to.equal(pooledSide.isListed);
      expect(spokeSide.collateralFactorMantissa).to.equal(pooledSide.collateralFactorMantissa);
      expect(spokeSide.underlyingAssetAddress).to.equal(pooledSide.underlyingAssetAddress);
      expect(spokeSide.vTokenDecimals).to.equal(pooledSide.vTokenDecimals);
      expect(spokeSide.underlyingDecimals).to.equal(pooledSide.underlyingDecimals);
    });

    it("encodes paused actions the same way, so a consumer decodes both alike", async () => {
      const MINT = 0;
      await f.spoke.setActionsPaused([f.spokeMarkets[0].address], [MINT], true);

      const [spokeSide, pooledSide] = await Promise.all([
        f.spokeLens.spokeVTokenMetadata(f.spokeMarkets[0].address),
        f.poolLens.vTokenMetadata(f.spokeMarkets[0].address),
      ]);

      expect(spokeSide.pausedActions).to.equal(1);
      expect(spokeSide.pausedActions).to.equal(pooledSide.pausedActions);
    });

    it("reports the same pool-level fields PoolLens does", async () => {
      const [spokeSide, pooledSide] = await Promise.all([
        poolData(f.spoke),
        f.poolLens.getPoolByComptroller(f.spokeRegistry.address, f.spoke.address),
      ]);

      expect(spokeSide.name).to.equal(pooledSide.name);
      expect(spokeSide.creator).to.equal(pooledSide.creator);
      expect(spokeSide.comptroller).to.equal(pooledSide.comptroller);
      expect(spokeSide.blockPosted).to.equal(pooledSide.blockPosted);
      expect(spokeSide.timestampPosted).to.equal(pooledSide.timestampPosted);
      expect(spokeSide.category).to.equal(pooledSide.category);
      expect(spokeSide.logoURL).to.equal(pooledSide.logoURL);
      expect(spokeSide.description).to.equal(pooledSide.description);
      expect(spokeSide.priceOracle).to.equal(pooledSide.priceOracle);
      expect(spokeSide.closeFactor).to.equal(pooledSide.closeFactor);
      expect(spokeSide.minLiquidatableCollateral).to.equal(pooledSide.minLiquidatableCollateral);
      expect(spokeSide.vTokens).to.have.lengthOf(pooledSide.vTokens.length);
    });
  });

  describe("supply permissions", () => {
    it("reports both halves, because either one alone is misleading", async () => {
      const [, other] = await ethers.getSigners();
      const markets = f.spokeMarkets.map(market => market.address);

      const before = await f.spokeLens.spokeSupplyPermissions(f.spoke.address, markets, other.address);
      // Armed and the account is not on the list: it may not supply.
      expect(before[0].allowlistEnabled).to.equal(true);
      expect(before[0].accountAllowlisted).to.equal(false);
      // Not armed, so the account may supply despite not being on the list. Reading only the second
      // field here would report the inverse of the truth.
      expect(before[1].allowlistEnabled).to.equal(false);
      expect(before[1].accountAllowlisted).to.equal(false);

      await f.spoke.setAllowedSupplier(markets[0], other.address, true);

      const after = await f.spokeLens.spokeSupplyPermissions(f.spoke.address, markets, other.address);
      expect(after[0].accountAllowlisted).to.equal(true);
    });

    it("answers per market, in the order asked", async () => {
      const [, other] = await ethers.getSigners();
      const reversed = [f.spokeMarkets[1].address, f.spokeMarkets[0].address];

      const permissions = await f.spokeLens.spokeSupplyPermissions(f.spoke.address, reversed, other.address);

      expect(permissions.map(p => p.vToken)).to.deep.equal(reversed);
      expect(permissions[0].allowlistEnabled).to.equal(false);
      expect(permissions[1].allowlistEnabled).to.equal(true);
    });
  });

  describe("liquidation permission", () => {
    it("reports both halves of the pool-wide allowlist", async () => {
      const [, other] = await ethers.getSigners();

      let permission = await f.spokeLens.spokeLiquidationPermission(f.spoke.address, other.address);
      expect(permission.allowlistEnabled).to.equal(false);
      expect(permission.accountAllowlisted).to.equal(false);

      await f.spoke.setLiquidationAllowlistEnabled(true);
      await f.spoke.setAllowedLiquidator(other.address, true);

      permission = await f.spokeLens.spokeLiquidationPermission(f.spoke.address, other.address);
      expect(permission.allowlistEnabled).to.equal(true);
      expect(permission.accountAllowlisted).to.equal(true);
    });
  });

  /**
   * The half of the surface that mirrors `PoolLens` under the same names and shapes, so that a consumer reads a
   * spoke pool from one address. These were ported by copy, so each is also checked against the same call on
   * `PoolLens` for the same spoke pool: the two must not drift.
   */
  describe("the reads that mirror PoolLens", () => {
    it("answers identically to PoolLens for every mirrored read", async () => {
      const account = f.borrower.address;
      const markets = f.spokeMarkets.map(market => market.address);
      const underlying = await f.spokeMarkets[0].underlying();
      const strip = (value: unknown) => JSON.parse(JSON.stringify(value));

      const badDebt = await f.spokeLens.getPoolBadDebt(f.spoke.address);
      const rewards = await f.spokeLens.getPendingRewards(account, f.spoke.address);

      // Without these two the comparisons below read zero on both sides whatever the ported math does,
      // and the bad debt and reward reads would be guarded in name only.
      expect(badDebt.totalBadDebtUsd).to.be.gt(0);
      expect(rewards[0].pendingRewards[1].amount).to.be.gt(0);

      expect(strip(await f.spokeLens.callStatic.vTokenBalancesAll(markets, account))).to.deep.equal(
        strip(await f.poolLens.callStatic.vTokenBalancesAll(markets, account)),
      );
      expect(strip(await f.spokeLens.vTokenUnderlyingPriceAll(markets))).to.deep.equal(
        strip(await f.poolLens.vTokenUnderlyingPriceAll(markets)),
      );
      expect(strip(badDebt)).to.deep.equal(strip(await f.poolLens.getPoolBadDebt(f.spoke.address)));
      expect(strip(rewards)).to.deep.equal(strip(await f.poolLens.getPendingRewards(account, f.spoke.address)));
      expect(await f.spokeLens.getVTokenForAsset(f.spokeRegistry.address, f.spoke.address, underlying)).to.equal(
        await f.poolLens.getVTokenForAsset(f.spokeRegistry.address, f.spoke.address, underlying),
      );
      expect(strip(await f.spokeLens.getPoolsSupportedByAsset(f.spokeRegistry.address, underlying))).to.deep.equal(
        strip(await f.poolLens.getPoolsSupportedByAsset(f.spokeRegistry.address, underlying)),
      );
    });

    it("reports balances", async () => {
      const [owner] = await ethers.getSigners();
      const market = f.spokeMarkets[0];

      const [balances] = await f.spokeLens.callStatic.vTokenBalancesAll([market.address], owner.address);

      expect(balances.vToken).to.equal(market.address);
      expect(balances.balanceOf).to.equal(await market.balanceOf(owner.address));
    });

    it("reports underlying prices", async () => {
      const market = f.spokeMarkets[0];

      const [price] = await f.spokeLens.vTokenUnderlyingPriceAll([market.address]);

      expect(price.vToken).to.equal(market.address);
      expect(price.underlyingPrice).to.equal(PRICE);
    });

    it("reports bad debt per market", async () => {
      const summary = await f.spokeLens.getPoolBadDebt(f.spoke.address);
      const healed = await f.spokeMarkets[0].badDebt();

      expect(summary.comptroller).to.equal(f.spoke.address);
      expect(summary.badDebts.map(entry => entry.vTokenAddress)).to.deep.equal(
        f.spokeMarkets.map(market => market.address),
      );
      // Priced at $1, so the usd figure is the underlying amount. Only the healed market carries any.
      expect(healed).to.equal(HEALED_BORROW);
      expect(summary.badDebts[0].badDebtUsd).to.equal(healed);
      expect(summary.badDebts[1].badDebtUsd).to.equal(0);
      expect(summary.totalBadDebtUsd).to.equal(healed);
    });

    it("reports pending rewards", async () => {
      const [summary] = await f.spokeLens.getPendingRewards(f.borrower.address, f.spoke.address);

      expect(summary.distributorAddress).to.equal(f.rewardsDistributor.address);
      expect(summary.rewardTokenAddress).to.equal(f.rewardToken.address);
      expect(summary.pendingRewards.map(entry => entry.vTokenAddress)).to.deep.equal(
        f.spokeMarkets.map(market => market.address),
      );
      // The account supplies and borrows in the second market only, so the first accrues it nothing.
      expect(summary.pendingRewards[0].amount).to.equal(0);
      expect(summary.pendingRewards[1].amount).to.be.gt(0);
    });

    it("resolves markets through the registry", async () => {
      const market = f.spokeMarkets[0];
      const underlying = await market.underlying();

      expect(await f.spokeLens.getVTokenForAsset(f.spokeRegistry.address, f.spoke.address, underlying)).to.equal(
        market.address,
      );
      expect(await f.spokeLens.getPoolsSupportedByAsset(f.spokeRegistry.address, underlying)).to.deep.equal([
        f.spoke.address,
      ]);
    });
  });

  describe("reading a whole registry", () => {
    it("describes every pool the spoke registry holds", async () => {
      const pools = await f.spokeLens.getAllSpokePools(f.spokeRegistry.address);

      expect(pools.map(pool => pool.comptroller)).to.deep.equal([f.spoke.address, f.unconfigured.address]);
      expect(pools[0].deviationBoundedOracle).to.equal(f.boundedOracle.address);
      expect(pools[0].vTokens[0].effectiveLiquidationIncentiveMantissa).to.equal(MARKET_INCENTIVE);
    });
  });

  describe("pointed at a pool that is not a spoke pool", () => {
    it("reverts rather than reporting a plausible zero", async () => {
      // The pooled comptroller has none of the getters this lens reads, so the call finds no function to
      // run. Failing here is the point: the alternative is a consumer taking an absent field for a
      // configured one, and reading "no bounded oracle" off a pool that simply cannot answer.
      await expect(f.spokeLens.getSpokePoolByComptroller(f.pooledRegistry.address, f.control.address)).to.be.reverted;
    });

    it("reverts on a registry holding one, rather than describing the rest", async () => {
      // Enumeration is all or nothing. A deployed spoke registry holds spoke pools only, so this is
      // unreachable there, but it is the behaviour to rely on if that ever stops being true.
      await expect(f.spokeLens.getAllSpokePools(f.pooledRegistry.address)).to.be.reverted;
    });
  });
});

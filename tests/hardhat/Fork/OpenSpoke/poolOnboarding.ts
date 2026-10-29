import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { ethers } from "hardhat";

import { IERC20, IERC20__factory, VToken } from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import {
  HUB_ABI,
  HUB_ADMIN_ROLES,
  HUB_ROLES,
  MAX_UINT128,
  deployYieldGroup,
  fundFrom,
  grant,
} from "../HubSpoke/fixture";
import {
  MAX_STALE_PERIOD,
  OpenSpokeFixture,
  POOL_PARAMS,
  TIER_ONE,
  TIER_ONE_LIMITS,
  TIER_ONE_LOAN_CAP,
  TIER_TWO,
  TIER_TWO_BOND_USD,
  TIER_TWO_LOAN_CAP,
  UpdateType,
  WIND_DOWN_PERIOD,
  XVS,
  deployMockFeed,
  e18,
  fundUsdt,
  fundXvs,
  loadOpenSpokeFixture,
  pinLivePrice,
  setPrice,
  snapshotFixture,
} from "./util/fixture";
import {
  CollateralMarketParams,
  EXIT_LIQUIDATION_THRESHOLDS,
  EXP_SCALE,
  LoanMarketParams,
  NO_FEED,
  OracleFeed,
  PoolRequest,
  PoolStatus,
  RequestStatus,
  TIER_ONE_XVS_BOND,
  ZERO,
  advanceTime,
  applyLatestUpdate,
  approveSeeds,
  assertInvariants,
  buildRequest,
  collateralMarket,
  depositToHub,
  executeVip,
  fundDeployer,
  newCollateralToken,
  openDefaultPool,
  openPool,
  priceMantissa,
  proposeAndQueue,
  requestPool,
  seedFor,
  updateTier,
  usdValue,
  usdtLoanMarket,
  useLiquidityHubBonds,
  vipActions,
  vipFailure,
  wireHubQueues,
  xvsBondFor,
} from "./util/helpers";

const FORK = process.env.FORK === "true";

const POOL_REQUEST_TYPE = 0;
const NEW_MARKETS_REQUEST_TYPE = 1;
const TIER_UPGRADE_REQUEST_TYPE = 2;

const USDC = ethers.utils.getAddress("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
const USDC_HOLDER = ethers.utils.getAddress("0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8"); // core vUSDC
const USDC_LOAN_FACTOR = e18("0.5");
const USDC_TIER_ONE_CAP = e18("500000");
const USDC_TIER_TWO_CAP = e18("1500000");

if (FORK) {
  describe("Open Spoke Pool: onboarding and requests", function () {
    this.timeout(0);

    /// Requests new markets for the deployer's pool after approving their seeds; returns the request id
    async function requestMarkets(
      f: OpenSpokeFixture,
      comptroller: string,
      collateralMarkets: CollateralMarketParams[],
      loanMarkets: LoanMarketParams[] = [],
    ) {
      await approveSeeds(f, f.deployer, { collateralMarkets, loanMarkets });
      await f.manager.connect(f.deployer).requestNewMarkets(comptroller, collateralMarkets, loanMarkets);
      return (await f.manager.requestCount()).toNumber();
    }

    /// Tops the bond up from tier one's XVS amount to tier two's
    async function topUpToTierTwo(f: OpenSpokeFixture, comptroller: string) {
      const topUp = xvsBondFor(TIER_TWO_BOND_USD).sub(TIER_ONE_XVS_BOND);
      await fundXvs(f.xvs, f.deployer.address, topUp);
      await f.manager.connect(f.deployer).topUpBond(comptroller, topUp);
    }

    /// Tops the bond up, then requests and builds the pool's upgrade to tier two
    async function buildTierUpgrade(f: OpenSpokeFixture, comptroller: string) {
      await topUpToTierTwo(f, comptroller);
      await f.manager.connect(f.deployer).requestTierUpgrade(comptroller, TIER_TWO);
      const requestId = (await f.manager.requestCount()).toNumber();
      return { requestId, ...(await buildRequest(f, requestId)) };
    }

    /// The manager holds no XVS, USDT or `tokens`
    async function expectManagerHoldsNothing(f: OpenSpokeFixture, tokens: string[]) {
      for (const token of [XVS, bscmainnet.USDT, ...tokens]) {
        const erc20 = await ethers.getContractAt("MockToken", token);
        expect(await erc20.balanceOf(f.manager.address)).to.equal(0);
      }
    }

    /// A stored VIP's actions as (target, signature) pairs
    function actionList(payload: string) {
      return vipActions(payload).map(action => [action.target, action.signature]);
    }

    describe("onboarding", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };

      before(async () => {
        f = await loadOpenSpokeFixture();
        snapshot = await snapshotFixture(f);
      });

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      /// A new collateral asset's oracle config with only a main feed: Chainlink feed, ResilientOracle and DBO configs
      function oracleConfigActions() {
        return [
          [bscmainnet.CHAINLINK_ORACLE, "setTokenConfigs((address,address,uint256)[])"],
          [bscmainnet.RESILIENT_ORACLE, "setTokenConfigs((address,address[3],bool[3],bool)[])"],
          [bscmainnet.DEVIATION_BOUNDED_ORACLE, "setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])"],
        ];
      }

      /// One market's listing: approve and supply its seed through the registry, burn the seed vTokens, set its reserve delta
      function listingActions(registry: string, asset: string, vToken: string) {
        return [
          [asset, "approve(address,uint256)"],
          [registry, "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))"],
          [vToken, "transfer(address,uint256)"],
          [vToken, "setReduceReservesBlockDelta(uint256)"],
        ];
      }

      async function marketState(vToken: VToken) {
        return {
          exchangeRate: await vToken.exchangeRateStored(),
          internalCash: await vToken.internalCash(),
          cash: await vToken.getCash(),
          totalSupply: await vToken.totalSupply(),
        };
      }

      it("1. lists a new pool through its VIP", async () => {
        const pool = await openDefaultPool(f);
        const { comptroller, collateralVToken, loanVToken, collateral, requestId } = pool;

        const registered = await f.poolRegistry.getPoolByComptroller(comptroller.address);
        expect(registered.name).to.equal(`Spoke Pool ${requestId}`);
        expect(await comptroller.owner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
        expect(await comptroller.closeFactorMantissa()).to.equal(POOL_PARAMS.closeFactor);
        expect(await comptroller.liquidationIncentiveMantissa()).to.equal(POOL_PARAMS.liquidationIncentive);
        expect(await comptroller.minLiquidatableCollateral()).to.equal(POOL_PARAMS.minLiquidatableCollateral);

        const collateralMarketState = await comptroller.markets(collateralVToken.address);
        expect(collateralMarketState.collateralFactorMantissa).to.equal(e18("0.5"));
        expect(collateralMarketState.liquidationThresholdMantissa).to.equal(e18("0.6"));
        expect(await comptroller.supplyCaps(collateralVToken.address)).to.equal(e18("100000"));
        expect(await comptroller.borrowCaps(collateralVToken.address)).to.equal(0);
        expect(await comptroller.isSupplyAllowlistEnabled(collateralVToken.address)).to.equal(false);

        const loanMarketState = await comptroller.markets(loanVToken.address);
        expect(loanMarketState.collateralFactorMantissa).to.equal(0);
        expect(loanMarketState.liquidationThresholdMantissa).to.equal(0);
        expect(await comptroller.supplyCaps(loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);
        expect(await comptroller.borrowCaps(loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);
        expect(await comptroller.isSupplyAllowlistEnabled(loanVToken.address)).to.equal(true);
        expect(await comptroller.isAllowedSupplier(loanVToken.address, f.yieldGroup.address)).to.equal(true);
        expect(await f.yieldGroup.resourceCap(loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);

        expect((await f.chainlinkOracle.tokenConfigs(collateral.token.address)).feed).to.equal(collateral.feed.address);
        const resilientConfig = await f.chainlinkOracle
          .attach(bscmainnet.RESILIENT_ORACLE)
          .getTokenConfig(collateral.token.address);
        expect(resilientConfig.oracles[0]).to.equal(bscmainnet.CHAINLINK_ORACLE);
        expect(resilientConfig.enableFlagsForOracles).to.deep.equal([true, false, false]);
        const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
        expect((await dbo.assetProtectionConfig(collateral.token.address)).assetAddr).to.equal(
          collateral.token.address,
        );

        const managerPool = await f.manager.getPool(comptroller.address);
        expect(managerPool.status).to.equal(PoolStatus.Live);
        expect(managerPool.deployer).to.equal(f.deployer.address);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(comptroller.address);

        expect(await pool.bondAccount.bondHolder()).to.equal(f.deployer.address);
        expect(await pool.bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(0);
        expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);

        for (const token of [f.xvs, f.usdt, collateral.token]) {
          expect(await token.balanceOf(f.manager.address)).to.equal(0);
        }
      });

      it("2. configures main, pivot and fallback feeds, each with its own stale period", async () => {
        const collateral = await newCollateralToken(f, "TRI", "2");
        const pivot = await newCollateralToken(f, "PIV", "2");
        const fallback = await newCollateralToken(f, "FBK", "2");
        const feeds: [OracleFeed, OracleFeed, OracleFeed] = [
          { oracle: bscmainnet.CHAINLINK_ORACLE, feed: collateral.feed.address, maxStalePeriod: MAX_STALE_PERIOD },
          { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivot.feed.address, maxStalePeriod: 7200 },
          { oracle: f.thirdOracle.address, feed: fallback.feed.address, maxStalePeriod: 1800 },
        ];
        const { comptroller, collateralVTokens } = await openPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral, { feeds })],
          loanMarkets: [usdtLoanMarket(f)],
        });

        const asset = collateral.token.address;
        for (const [oracle, feed] of [
          [f.chainlinkOracle, feeds[0]],
          [f.redStoneOracle, feeds[1]],
          [f.thirdOracle, feeds[2]],
        ] as [Contract, OracleFeed][]) {
          const config = await oracle.tokenConfigs(asset);
          expect([config.feed, config.maxStalePeriod]).to.deep.equal([feed.feed, BigNumber.from(feed.maxStalePeriod)]);
        }
        const resilientConfig = await f.chainlinkOracle.attach(bscmainnet.RESILIENT_ORACLE).getTokenConfig(asset);
        expect(resilientConfig.oracles).to.deep.equal([
          bscmainnet.CHAINLINK_ORACLE,
          bscmainnet.REDSTONE_ORACLE,
          f.thirdOracle.address,
        ]);
        expect(resilientConfig.enableFlagsForOracles).to.deep.equal([true, true, true]);
        const boundValidator = await ethers.getContractAt(
          [
            "function validateConfigs(address) view returns (address asset, uint256 upperBoundRatio, uint256 lowerBoundRatio)",
          ],
          await f.chainlinkOracle.attach(bscmainnet.RESILIENT_ORACLE).boundValidator(),
        );
        const bounds = await boundValidator.validateConfigs(asset);
        expect(bounds.upperBoundRatio).to.equal(e18("1.05"));
        expect(bounds.lowerBoundRatio).to.equal(e18("0.95"));

        const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
        expect(await oracle.getUnderlyingPrice(collateralVTokens[0].address)).to.equal(priceMantissa("2"));
        expect((await comptroller.markets(collateralVTokens[0].address)).isListed).to.equal(true);
      });

      it("3. skips oracle config for an asset already priced", async () => {
        await pinLivePrice(f, bscmainnet.BTCB, "60000");
        const btcbSeedFunding = e18("1");
        const btcb = await ethers.getContractAt("MockToken", bscmainnet.BTCB);
        await fundFrom(btcb as never, bscmainnet.BTCB_HOLDER, f.deployer.address, btcbSeedFunding);
        const unusedFeed = await newCollateralToken(f, "UNUSED", "1");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [
            {
              asset: bscmainnet.BTCB,
              collateralFactor: e18("0.5"),
              liquidationThreshold: e18("0.6"),
              supplyCap: e18("10"),
              feeds: [
                {
                  oracle: bscmainnet.CHAINLINK_ORACLE,
                  feed: unusedFeed.feed.address,
                  maxStalePeriod: MAX_STALE_PERIOD,
                },
                NO_FEED,
                NO_FEED,
              ],
            },
          ],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const btcbFeedBefore = (await f.chainlinkOracle.tokenConfigs(bscmainnet.BTCB)).feed;
        const { payload } = await buildRequest(f, requestId);

        const oracleTargets = [
          bscmainnet.CHAINLINK_ORACLE,
          bscmainnet.REDSTONE_ORACLE,
          f.thirdOracle.address,
          bscmainnet.RESILIENT_ORACLE,
          bscmainnet.DEVIATION_BOUNDED_ORACLE,
        ];
        expect(vipActions(payload).filter(action => oracleTargets.includes(action.target))).to.deep.equal([]);

        await executeVip(f, payload);
        expect((await f.chainlinkOracle.tokenConfigs(bscmainnet.BTCB)).feed).to.equal(btcbFeedBefore);
      });

      for (const [index, decimals] of [6, 8, 18].entries()) {
        it(`${4 + index}. pulls a $10 seed of a ${decimals}-decimal asset and burns its vTokens`, async () => {
          const collateral = await newCollateralToken(f, `D${decimals}`, "3", decimals);
          const request = {
            collateralMarkets: [
              collateralMarket(collateral, { supplyCap: ethers.utils.parseUnits("100000", decimals) }),
            ],
            loanMarkets: [usdtLoanMarket(f)],
          };
          const requestId = await requestPool(f, f.deployer, request);
          const collateralBefore = await collateral.token.balanceOf(f.deployer.address);
          const usdtBefore = await f.usdt.balanceOf(f.deployer.address);
          const { payload, vTokens } = await buildRequest(f, requestId);

          const collateralSeed = seedFor(priceMantissa("3", decimals));
          const usdtSeed = seedFor(priceMantissa("1"));
          expect(await f.manager.requestSeeds(requestId, collateral.token.address)).to.equal(collateralSeed);
          expect(await f.manager.requestSeeds(requestId, bscmainnet.USDT)).to.equal(usdtSeed);
          expect(collateralBefore.sub(await collateral.token.balanceOf(f.deployer.address))).to.equal(collateralSeed);
          expect(usdtBefore.sub(await f.usdt.balanceOf(f.deployer.address))).to.equal(usdtSeed);
          expect(usdValue(collateralSeed, priceMantissa("3", decimals))).to.be.gte(e18("10"));
          expect(usdValue(collateralSeed.sub(1), priceMantissa("3", decimals))).to.be.lt(e18("10"));

          const timelockCollateralBefore = await collateral.token.balanceOf(bscmainnet.NORMAL_TIMELOCK);
          await executeVip(f, payload);

          for (const [vTokenAddress, seed] of [
            [vTokens[0], collateralSeed],
            [vTokens[1], usdtSeed],
          ] as [string, BigNumber][]) {
            const vToken = await ethers.getContractAt("VToken", vTokenAddress);
            const minted = seed.mul(e18("1")).div(await vToken.exchangeRateStored());
            expect(await vToken.totalSupply()).to.equal(minted);
            expect(await vToken.balanceOf(ethers.constants.AddressZero)).to.equal(minted);
            expect(await vToken.balanceOf(bscmainnet.NORMAL_TIMELOCK)).to.equal(0);
            expect(await vToken.getCash()).to.equal(seed);
          }
          expect(await collateral.token.balanceOf(bscmainnet.NORMAL_TIMELOCK)).to.equal(timelockCollateralBefore);
          expect(await collateral.token.balanceOf(f.manager.address)).to.equal(0);
          expect(await f.usdt.balanceOf(f.manager.address)).to.equal(0);
        });

        it(`${7 + index}. prices a ${decimals}-decimal collateral at its feed`, async () => {
          const collateral = await newCollateralToken(f, `P${decimals}`, "7.25", decimals);
          const { collateralVTokens } = await openPool(f, f.deployer, {
            collateralMarkets: [
              collateralMarket(collateral, { supplyCap: ethers.utils.parseUnits("100000", decimals) }),
            ],
            loanMarkets: [usdtLoanMarket(f)],
          });
          const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
          expect(await oracle.getUnderlyingPrice(collateralVTokens[0].address)).to.equal(
            priceMantissa("7.25", decimals),
          );
        });
      }

      it("10. adds a collateral market to a live pool", async () => {
        const pool = await openDefaultPool(f);
        const second = await newCollateralToken(f, "SEC", "4");
        const request = { collateralMarkets: [collateralMarket(second)], loanMarkets: [] };
        await second.token.connect(f.deployer).faucet(e18("1000"));
        await second.token.connect(f.deployer).approve(f.manager.address, ethers.constants.MaxUint256);
        await f.manager.connect(f.deployer).requestNewMarkets(pool.comptroller.address, request.collateralMarkets, []);
        const requestId = (await f.manager.requestCount()).toNumber();
        const { payload, vTokens } = await buildRequest(f, requestId);
        const seed = seedFor(priceMantissa("4"));
        expect(await f.manager.requestSeeds(requestId, second.token.address)).to.equal(seed);
        await executeVip(f, payload);

        const vToken = await ethers.getContractAt("VToken", vTokens[0]);
        expect(await vToken.name()).to.equal(`Venus SEC (Spoke Pool ${pool.requestId})`);
        expect(await vToken.symbol()).to.equal(`vSEC_SpokePool${pool.requestId}`);
        expect((await pool.comptroller.markets(vToken.address)).collateralFactorMantissa).to.equal(e18("0.5"));
        expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(3);

        const minted = seed.mul(EXP_SCALE).div(await vToken.exchangeRateStored());
        expect(await vToken.totalSupply()).to.equal(minted);
        expect(await vToken.balanceOf(ZERO)).to.equal(minted);
        expect(await vToken.balanceOf(bscmainnet.NORMAL_TIMELOCK)).to.equal(0);
        expect(await vToken.getCash()).to.equal(seed);

        const asset = second.token.address;
        expect((await f.chainlinkOracle.tokenConfigs(asset)).feed).to.equal(second.feed.address);
        const resilientConfig = await f.chainlinkOracle.attach(bscmainnet.RESILIENT_ORACLE).getTokenConfig(asset);
        expect(resilientConfig.oracles).to.deep.equal([bscmainnet.CHAINLINK_ORACLE, ZERO, ZERO]);
        expect(resilientConfig.enableFlagsForOracles).to.deep.equal([true, false, false]);
        const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
        expect((await dbo.assetProtectionConfig(asset)).assetAddr).to.equal(asset);
        const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
        expect(await oracle.getUnderlyingPrice(vToken.address)).to.equal(priceMantissa("4"));

        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
        await expectManagerHoldsNothing(f, [asset]);
      });

      it("11. upgrades a pool's tier and raises its loan caps", async () => {
        const pool = await openDefaultPool(f);
        const topUp = xvsBondFor(TIER_TWO_BOND_USD).sub(TIER_ONE_XVS_BOND);
        await fundXvs(f.xvs, f.deployer.address, topUp);
        await f.manager.connect(f.deployer).topUpBond(pool.comptroller.address, topUp);
        await f.manager.connect(f.deployer).requestTierUpgrade(pool.comptroller.address, TIER_TWO);
        const { payload } = await buildRequest(f, (await f.manager.requestCount()).toNumber());
        await executeVip(f, payload);

        expect((await f.manager.getPool(pool.comptroller.address)).tierId).to.equal(TIER_TWO);
        expect(await pool.comptroller.supplyCaps(pool.loanVToken.address)).to.equal(TIER_TWO_LOAN_CAP);
        expect(await pool.comptroller.borrowCaps(pool.loanVToken.address)).to.equal(TIER_TWO_LOAN_CAP);
        expect(await f.yieldGroup.resourceCap(pool.loanVToken.address)).to.equal(TIER_TWO_LOAN_CAP);

        // 0.65 is over tier one's 0.6 collateral factor limit and within tier two's
        await f.manager
          .connect(f.deployer)
          .setCollateralFactor(pool.comptroller.address, pool.collateralVToken.address, e18("0.65"), e18("0.75"));
        await applyLatestUpdate(f, UpdateType.collateralFactors, pool.collateralVToken.address);
        const market = await pool.comptroller.markets(pool.collateralVToken.address);
        expect(market.collateralFactorMantissa).to.equal(e18("0.65"));
        expect(market.liquidationThresholdMantissa).to.equal(e18("0.75"));
      });

      it("12. keeps the largest pool's VIPs within the governor's action limit", async () => {
        const largeTierId = 9;
        const maxPoolMarkets = (await f.builder.MAX_POOL_MARKETS()).toNumber();
        const tier = await f.policyRegistry.getTier(TIER_TWO);
        await f.policyRegistry.connect(f.timelock).setTier(largeTierId, {
          enabled: true,
          minTierBondUsd: tier.minTierBondUsd,
          limits: { ...tier.limits, maxCollateralMarkets: maxPoolMarkets },
        });

        const collateralMarkets = [];
        for (let i = 0; i < maxPoolMarkets - 1; ++i) {
          const main = await newCollateralToken(f, `M${i}`, "2");
          const pivot = await newCollateralToken(f, `V${i}`, "2");
          const fallback = await newCollateralToken(f, `F${i}`, "2");
          collateralMarkets.push(
            collateralMarket(main, {
              feeds: [
                { oracle: bscmainnet.CHAINLINK_ORACLE, feed: main.feed.address, maxStalePeriod: MAX_STALE_PERIOD },
                { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivot.feed.address, maxStalePeriod: MAX_STALE_PERIOD },
                { oracle: f.thirdOracle.address, feed: fallback.feed.address, maxStalePeriod: MAX_STALE_PERIOD },
              ],
            }),
          );
        }
        const maxOperations = (await f.governor.proposalMaxOperations()).toNumber();
        const requestId = await requestPool(f, f.deployer, {
          tierId: largeTierId,
          bondAmount: xvsBondFor(TIER_TWO_BOND_USD),
          collateralMarkets,
          loanMarkets: [usdtLoanMarket(f)],
        });
        const { payload, comptroller } = await buildRequest(f, requestId);
        expect(vipActions(payload).length).to.be.lte(maxOperations);
        await executeVip(f, payload);
        const pool = await ethers.getContractAt("SpokeComptroller", comptroller);
        expect(await pool.getAllMarkets()).to.have.lengthOf(maxPoolMarkets);

        const liquidationThresholds = new Array(maxPoolMarkets).fill(e18("0.5"));
        await f.manager.connect(f.team).buildExitProposal(comptroller, liquidationThresholds, "Exit");
        const exitPayload = await f.manager.exitProposals(comptroller);
        expect(vipActions(exitPayload).length).to.be.lte(maxOperations);
        await executeVip(f, exitPayload);
        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);

        await advanceTime(f, WIND_DOWN_PERIOD);
        await f.manager.connect(f.team).buildForceCloseProposal(comptroller, "Force close");
        const forceClosePayload = await f.manager.exitProposals(comptroller);
        expect(vipActions(forceClosePayload).length).to.be.lte(maxOperations);
        await executeVip(f, forceClosePayload);
      });

      it("13. keeps an XVS bond idle in its account", async () => {
        const pool = await openDefaultPool(f);
        expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await pool.bondAccount.source()).to.equal(ethers.constants.AddressZero);
      });

      it("14. keeps an idle USDT bond in its account", async () => {
        const collateral = await newCollateralToken(f, "IDL", "2");
        const bondAmount = e18("100000");
        const pool = await openPool(f, f.deployer, {
          bondAsset: bscmainnet.USDT,
          bondAmount,
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        expect(await f.usdt.balanceOf(pool.bondAccount.address)).to.equal(bondAmount);
        expect(await pool.bondAccount.currentBondAmount()).to.equal(bondAmount);
        expect(await pool.bondAccount.source()).to.equal(ethers.constants.AddressZero);
      });

      it("15. deposits a LiquidityHub USDT bond in the Hub", async () => {
        await useLiquidityHubBonds(f);
        const collateral = await newCollateralToken(f, "LHB", "2");
        const bondAmount = e18("100000");
        const pool = await openPool(f, f.deployer, {
          bondAsset: bscmainnet.USDT,
          bondAmount,
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const shares = await f.hub.balanceOf(pool.bondAccount.address);
        expect(shares).to.be.gt(0);
        expect(await f.usdt.balanceOf(pool.bondAccount.address)).to.equal(0);
        const hubPreview = await ethers.getContractAt(
          ["function previewRedeem(uint256) view returns (uint256)"],
          f.hub.address,
        );
        expect(await pool.bondAccount.currentBondAmount()).to.equal(await hubPreview.previewRedeem(shares));
      });

      it("16. routes Hub deposits to a loan market once it is queued", async () => {
        const pool = await openDefaultPool(f);
        const cashBefore = await pool.loanVToken.getCash();
        const deposit = e18("100000");
        await depositToHub(f, deposit);
        expect(await pool.loanVToken.getCash()).to.equal(cashBefore);

        await wireHubQueues(f, [pool.loanVToken.address]);
        await depositToHub(f, deposit);
        expect((await pool.loanVToken.getCash()).sub(cashBefore)).to.equal(deposit);
      });

      it("17. builds a pool VIP with only the expected actions", async () => {
        const collateral = await newCollateralToken(f, "PIN", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const { payload, comptroller, vTokens } = await buildRequest(f, requestId);
        const registry = f.poolRegistry.address;

        expect(actionList(payload)).to.deep.equal([
          [comptroller, "acceptOwnership()"],
          [registry, "addPool(string,address,uint256,uint256,uint256)"],
          [f.manager.address, "settleRequest(uint256)"],
          ...oracleConfigActions(),
          ...listingActions(registry, collateral.token.address, vTokens[0]),
          ...listingActions(registry, bscmainnet.USDT, vTokens[1]),
          [comptroller, "setSupplyAllowlistEnabled(address,bool)"],
          [comptroller, "setAllowedSupplier(address,address,bool)"],
          [f.yieldGroup.address, "addResource(address,address)"],
          [f.yieldGroup.address, "lowerResourceCap(address,uint256)"],
        ]);
      });

      it("18. builds a markets VIP with only the expected actions", async () => {
        const pool = await openDefaultPool(f);
        const second = await newCollateralToken(f, "PNM", "2");
        const requestId = await requestMarkets(f, pool.comptroller.address, [collateralMarket(second)]);
        const { payload, vTokens } = await buildRequest(f, requestId);

        expect(actionList(payload)).to.deep.equal([
          [f.manager.address, "settleRequest(uint256)"],
          ...oracleConfigActions(),
          ...listingActions(f.poolRegistry.address, second.token.address, vTokens[0]),
        ]);
      });

      it("19. builds a tier VIP with only the expected actions", async () => {
        const pool = await openDefaultPool(f);
        const comptroller = pool.comptroller.address;
        const { payload } = await buildTierUpgrade(f, comptroller);

        expect(actionList(payload)).to.deep.equal([
          [f.manager.address, "settleRequest(uint256)"],
          [f.yieldGroup.address, "raiseResourceCap(address,uint256)"],
          [comptroller, "setMarketSupplyCaps(address[],uint256[])"],
          [comptroller, "setMarketBorrowCaps(address[],uint256[])"],
        ]);
        const raise = vipActions(payload)[1];
        expect(raise.calldata).to.equal(
          ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [pool.loanVToken.address, TIER_TWO_LOAN_CAP]),
        );
      });

      it("20. lets only the Hub's YieldGroup supply the loan market", async () => {
        const { comptroller, loanVToken } = await openDefaultPool(f);
        const amount = e18("1000");

        for (const user of [f.supplier, f.deployer]) {
          await fundUsdt(f.usdt, user.address, amount);
          await f.usdt.connect(user).approve(loanVToken.address, amount);
          await expect(loanVToken.connect(user).mint(amount))
            .to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed")
            .withArgs(loanVToken.address, user.address);
        }
        expect(await comptroller.isAllowedSupplier(loanVToken.address, f.yieldGroup.address)).to.equal(true);
      });

      it("21. ignores a direct donation to a new market", async () => {
        const { collateral, collateralVToken, loanVToken } = await openDefaultPool(f);
        const donation = e18("1000");
        const before = await Promise.all([collateralVToken, loanVToken].map(marketState));

        await collateral.token.connect(f.attacker).faucet(donation);
        await collateral.token.connect(f.attacker).transfer(collateralVToken.address, donation);
        await fundUsdt(f.usdt, f.attacker.address, donation);
        await f.usdt.connect(f.attacker).transfer(loanVToken.address, donation);

        expect(await Promise.all([collateralVToken, loanVToken].map(marketState))).to.deep.equal(before);
        const [collateralRate, loanRate] = before.map(state => state.exchangeRate);
        expect(await collateralVToken.callStatic.exchangeRateCurrent()).to.equal(collateralRate);
        expect(await loanVToken.callStatic.exchangeRateCurrent()).to.equal(loanRate);

        const mintAmount = e18("500");
        await collateral.token.connect(f.supplier).faucet(mintAmount);
        await collateral.token.connect(f.supplier).approve(collateralVToken.address, mintAmount);
        await collateralVToken.connect(f.supplier).mint(mintAmount);
        expect(await collateralVToken.balanceOf(f.supplier.address)).to.equal(
          mintAmount.mul(EXP_SCALE).div(collateralRate),
        );

        const deposit = e18("100000");
        await wireHubQueues(f, [loanVToken.address]);
        await depositToHub(f, deposit);
        expect(await loanVToken.balanceOf(f.yieldGroup.address)).to.equal(deposit.mul(EXP_SCALE).div(loanRate));
      });
    });

    describe("request lifecycle", () => {
      let f: OpenSpokeFixture;
      // The nested suite reassigns it, so afterEach restores each test to its own suite's setup
      let snapshot: { restore: () => Promise<void> };

      before(async () => {
        f = await loadOpenSpokeFixture();
        snapshot = await snapshotFixture(f);
      });

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      const mainFeed = (oracle: string, feed: string): [OracleFeed, OracleFeed, OracleFeed] => [
        { oracle, feed, maxStalePeriod: MAX_STALE_PERIOD },
        NO_FEED,
        NO_FEED,
      ];

      /// Submits a pool request with no funding, for requests refused before the bond moves
      function submitPoolRequest(request: PoolRequest) {
        return f.manager
          .connect(f.deployer)
          .requestPool(
            request.tierId ?? TIER_ONE,
            request.bondAsset ?? XVS,
            request.bondAmount ?? TIER_ONE_XVS_BOND,
            request.collateralMarkets,
            request.loanMarkets,
          );
      }

      /// No pool in the registry, manager or bond manager, and no oracle config for its collateral asset
      async function expectNoPartialPool(comptroller: string, collateral: string) {
        expect((await f.poolRegistry.getPoolByComptroller(comptroller)).comptroller).to.equal(ZERO);
        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.None);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(ZERO);
        expect(await f.bondManager.bondAccounts(comptroller)).to.equal(ZERO);
        expect((await f.chainlinkOracle.tokenConfigs(collateral)).feed).to.equal(ZERO);
        const resilientOracle = f.chainlinkOracle.attach(bscmainnet.RESILIENT_ORACLE);
        expect((await resilientOracle.getTokenConfig(collateral)).asset).to.equal(ZERO);
        const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
        expect((await dbo.assetProtectionConfig(collateral)).assetAddr).to.equal(ZERO);
      }

      /// A proposal builder with the same config as the fixture's
      async function deployProposalBuilder() {
        const { builder } = f;
        const factory = await ethers.getContractFactory("SpokePoolProposalBuilder", f.admin);
        return factory.deploy(
          f.manager.address,
          await builder.GOVERNOR_BRAVO(),
          await builder.POOL_REGISTRY(),
          await builder.DEVIATION_BOUNDED_ORACLE(),
          await builder.SPOKE_ADAPTER(),
          await builder.COMPTROLLER_BEACON(),
          await builder.VTOKEN_BEACON(),
          await builder.PROTOCOL_SHARE_RESERVE(),
          await builder.SHORTFALL(),
          await builder.MAX_POOL_MARKETS(),
        );
      }

      /// Feeds the manager refuses for an unpriced asset, each with the error and argument it reverts with: a fallback
      /// without a pivot, two feeds on one oracle, an unsupported oracle, no main feed, or a set feed with no stale period
      async function invalidFeedCases(asset: string, feed: string) {
        const pivot = (await deployMockFeed(f, "2")).address;
        const main = { oracle: bscmainnet.CHAINLINK_ORACLE, feed, maxStalePeriod: MAX_STALE_PERIOD };
        const cases: { feeds: [OracleFeed, OracleFeed, OracleFeed]; error: string; arg: string }[] = [
          {
            feeds: [main, NO_FEED, { oracle: f.thirdOracle.address, feed: pivot, maxStalePeriod: MAX_STALE_PERIOD }],
            error: "InvalidOracleFeed",
            arg: asset,
          },
          {
            feeds: [
              main,
              { oracle: bscmainnet.CHAINLINK_ORACLE, feed: pivot, maxStalePeriod: MAX_STALE_PERIOD },
              NO_FEED,
            ],
            error: "InvalidOracleFeed",
            arg: asset,
          },
          { feeds: mainFeed(ZERO, feed), error: "UnsupportedOracle", arg: ZERO },
          {
            feeds: [main, { oracle: f.outsider.address, feed: pivot, maxStalePeriod: MAX_STALE_PERIOD }, NO_FEED],
            error: "UnsupportedOracle",
            arg: f.outsider.address,
          },
          {
            feeds: [
              NO_FEED,
              { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivot, maxStalePeriod: MAX_STALE_PERIOD },
              NO_FEED,
            ],
            error: "InvalidOracleFeed",
            arg: asset,
          },
          { feeds: [{ ...main, maxStalePeriod: 0 }, NO_FEED, NO_FEED], error: "InvalidOracleFeed", arg: asset },
          {
            feeds: [main, { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivot, maxStalePeriod: 0 }, NO_FEED],
            error: "InvalidOracleFeed",
            arg: asset,
          },
        ];
        return cases;
      }

      /// The VIP reverts in GovernorBravo (proposed and queued unless `proposalId` is given), and replayed by the
      /// timelock its first failing action is `signature` on `target`, reverting with `error`
      async function expectVipToFail(
        payload: string,
        expected: { target: string; signature: string; error: string },
        proposalId?: BigNumber,
      ) {
        await expect(f.governor.execute(proposalId ?? (await proposeAndQueue(f, payload)))).to.be.reverted;
        const failure = await vipFailure(f, payload);
        expect([failure?.target, failure?.signature]).to.deep.equal([expected.target, expected.signature]);
        expect(failure?.reason.replace(/"/g, "").toLowerCase()).to.include(expected.error.toLowerCase());
      }

      it("22. refunds a canceled request and allows a new one", async () => {
        const collateral = await newCollateralToken(f, "CAN", "2");
        const request = { collateralMarkets: [collateralMarket(collateral)], loanMarkets: [usdtLoanMarket(f)] };
        const requestId = await requestPool(f, f.deployer, request);
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);
        const collateralBefore = await collateral.token.balanceOf(f.deployer.address);

        await expect(f.manager.connect(f.deployer).cancelRequest(requestId))
          .to.emit(f.manager, "RequestCanceled")
          .withArgs(requestId);

        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect(await collateral.token.balanceOf(f.deployer.address)).to.equal(collateralBefore);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Canceled);
        await expectManagerHoldsNothing(f, [collateral.token.address]);

        const nextRequestId = await requestPool(f, f.deployer, request);
        expect(nextRequestId).to.equal(requestId + 1);
        expect((await f.manager.getRequest(nextRequestId)).status).to.equal(RequestStatus.Pending);
      });

      it("23. refunds a rejected pending request", async () => {
        const collateral = await newCollateralToken(f, "REJ", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);

        await expect(f.manager.connect(f.team).rejectRequest(requestId))
          .to.emit(f.manager, "RequestRejected")
          .withArgs(requestId);

        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Rejected);
        await expectManagerHoldsNothing(f, [collateral.token.address]);
      });

      it("24. refunds a rejected built request and fails its VIP", async () => {
        const collateral = await newCollateralToken(f, "RJB", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);
        const collateralBefore = await collateral.token.balanceOf(f.deployer.address);
        const usdtBefore = await f.usdt.balanceOf(f.deployer.address);
        const { payload, comptroller } = await buildRequest(f, requestId);
        expect(await f.manager.requestSeeds(requestId, collateral.token.address)).to.be.gt(0);

        await expect(f.manager.connect(f.team).rejectRequest(requestId))
          .to.emit(f.manager, "RequestRejected")
          .withArgs(requestId);

        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect(await collateral.token.balanceOf(f.deployer.address)).to.equal(collateralBefore);
        expect(await f.usdt.balanceOf(f.deployer.address)).to.equal(usdtBefore);
        await expectManagerHoldsNothing(f, [collateral.token.address]);

        await expectVipToFail(payload, {
          target: f.manager.address,
          signature: "settleRequest(uint256)",
          error: `InvalidRequestStatus(${requestId})`,
        });
        await expectNoPartialPool(comptroller, collateral.token.address);
      });

      it("25. lets only the team reject a built request", async () => {
        const collateral = await newCollateralToken(f, "CNB", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        await buildRequest(f, requestId);

        await expect(f.manager.connect(f.deployer).cancelRequest(requestId))
          .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
          .withArgs(requestId);
        for (const caller of [f.deployer, f.outsider]) {
          await expect(f.manager.connect(caller).rejectRequest(requestId))
            .to.be.revertedWithCustomError(f.manager, "Unauthorized")
            .withArgs(caller.address, f.manager.address, "rejectRequest(uint256)");
        }
        await expect(f.manager.connect(f.team).rejectRequest(requestId))
          .to.emit(f.manager, "RequestRejected")
          .withArgs(requestId);
      });

      it("26. refuses a second pool request while one is open", async () => {
        const request = {
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "ONE", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        };
        const requestId = await requestPool(f, f.deployer, request);
        await fundDeployer(f, f.deployer, request);

        await expect(submitPoolRequest(request))
          .to.be.revertedWithCustomError(f.manager, "OpenRequestExists")
          .withArgs(requestId);
        await buildRequest(f, requestId);
        await expect(submitPoolRequest(request))
          .to.be.revertedWithCustomError(f.manager, "OpenRequestExists")
          .withArgs(requestId);
      });

      it("27. refuses to build once the collateral cap exceeds the tier limit", async () => {
        const collateral = await newCollateralToken(f, "PMP", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);
        const collateralBefore = await collateral.token.balanceOf(f.deployer.address);
        const usdtBefore = await f.usdt.balanceOf(f.deployer.address);

        // 100,000 tokens at $11 is $1.1M, over tier one's $1M
        await setPrice(collateral.feed, "11");
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Pumped"))
          .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
          .withArgs(collateral.token.address);
        await f.manager.connect(f.team).rejectRequest(requestId);

        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect(await collateral.token.balanceOf(f.deployer.address)).to.equal(collateralBefore);
        expect(await f.usdt.balanceOf(f.deployer.address)).to.equal(usdtBefore);
        await expectManagerHoldsNothing(f, [collateral.token.address]);
      });

      it("28. values the bond only at request time", async () => {
        const collateral = await newCollateralToken(f, "BND", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });

        await setPrice(f.xvsFeed, "2.5");
        const { payload, comptroller } = await buildRequest(f, requestId);
        await executeVip(f, payload);

        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
        const bondAccount = await ethers.getContractAt("IBondAccount", await f.bondManager.bondAccounts(comptroller));
        expect(await bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
        expect(usdValue(TIER_ONE_XVS_BOND, e18("2.5"))).to.be.lt(
          await f.policyRegistry.getRequiredBondUsd(TIER_ONE, XVS),
        );
      });

      it("29. lets the team fix a pending request's feed", async () => {
        const collateral = await newCollateralToken(f, "FIX", "2");
        const asset = collateral.token.address;
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });

        await setPrice(collateral.feed, "0");
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Broken feed"))
          .to.be.revertedWithCustomError(f.manager, "InvalidOracleFeed")
          .withArgs(asset);

        const replacement = await deployMockFeed(f, "2");
        const feeds = mainFeed(bscmainnet.CHAINLINK_ORACLE, replacement.address);
        await expect(f.manager.connect(f.team).setOracleFeeds(requestId, asset, feeds, 0)).to.emit(
          f.manager,
          "OracleFeedsUpdated",
        );
        const storedFeeds = (await f.manager.getRequest(requestId)).collateralMarkets[0].feeds;
        expect(storedFeeds.map(feed => [feed.oracle, feed.feed])).to.deep.equal(
          feeds.map(feed => [feed.oracle, feed.feed]),
        );
        const { payload } = await buildRequest(f, requestId);

        await expect(f.manager.connect(f.team).setOracleFeeds(requestId, asset, feeds, 0))
          .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
          .withArgs(requestId);
        await executeVip(f, payload);
        expect((await f.chainlinkOracle.tokenConfigs(asset)).feed).to.equal(replacement.address);
      });

      it("30. uses the team's oracle overrides over the registry's", async () => {
        const registry = f.policyRegistry.connect(f.timelock);
        await registry.setOracleParams({
          ...(await f.policyRegistry.oracleParams()),
          deviationBoundedOracleEnabled: false,
        });
        const [overridden, plain] = [await newCollateralToken(f, "OVR", "2"), await newCollateralToken(f, "PLN", "2")];
        const pivot = await deployMockFeed(f, "2");
        const withPivot = (main: string): [OracleFeed, OracleFeed, OracleFeed] => [
          { oracle: bscmainnet.CHAINLINK_ORACLE, feed: main, maxStalePeriod: MAX_STALE_PERIOD },
          { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivot.address, maxStalePeriod: MAX_STALE_PERIOD },
          NO_FEED,
        ];
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [
            collateralMarket(overridden, { feeds: withPivot(overridden.feed.address) }),
            collateralMarket(plain, { feeds: withPivot(plain.feed.address) }),
          ],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const asset = overridden.token.address;
        const team = f.manager.connect(f.team);

        await expect(team.setOracleFeeds(requestId, asset, withPivot(overridden.feed.address), e18("0.1")))
          .to.emit(f.manager, "OracleFeedsUpdated")
          .withArgs(requestId, asset, anyValue, e18("0.1"));
        await expect(team.setDeviationBoundedOracleParams(requestId, asset, 7200, e18("0.2"), e18("0.08")))
          .to.emit(f.manager, "DeviationBoundedOracleParamsUpdated")
          .withArgs(requestId, asset, 7200, e18("0.2"), e18("0.08"));
        await expect(team.setDeviationBoundedOracleParams(requestId, bscmainnet.USDT, 7200, e18("0.2"), e18("0.08")))
          .to.be.revertedWithCustomError(f.manager, "InvalidMarketParams")
          .withArgs(bscmainnet.USDT);
        const { payload } = await buildRequest(f, requestId);
        await expect(team.setDeviationBoundedOracleParams(requestId, asset, 7200, e18("0.2"), e18("0.08")))
          .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
          .withArgs(requestId);
        await executeVip(f, payload);

        const boundValidator = await ethers.getContractAt(
          [
            "function validateConfigs(address) view returns (address, uint256 upperBoundRatio, uint256 lowerBoundRatio)",
          ],
          await f.chainlinkOracle.attach(bscmainnet.RESILIENT_ORACLE).boundValidator(),
        );
        const bounds = async (token: string) => {
          const config = await boundValidator.validateConfigs(token);
          return [config.upperBoundRatio, config.lowerBoundRatio];
        };
        expect(await bounds(asset)).to.deep.equal([e18("1.1"), e18("0.9")]);
        // Registry's 0.05 deviation
        expect(await bounds(plain.token.address)).to.deep.equal([e18("1.05"), e18("0.95")]);

        // The registry's DBO config is disabled, so only the overridden asset gets one
        const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
        const config = await dbo.assetProtectionConfig(asset);
        expect([config.assetAddr, config.cooldownPeriod, config.triggerThreshold, config.resetThreshold]).to.deep.equal(
          [asset, BigNumber.from(7200), e18("0.2"), e18("0.08")],
        );
        expect(config.isBoundedPricingEnabled).to.equal(true);
        expect((await dbo.assetProtectionConfig(plain.token.address)).assetAddr).to.equal(ZERO);
      });

      it("31. refuses to build on a dropped oracle until the feed moves", async () => {
        const collateral = await newCollateralToken(f, "ORC", "2");
        const asset = collateral.token.address;
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [
            collateralMarket(collateral, { feeds: mainFeed(f.thirdOracle.address, collateral.feed.address) }),
          ],
          loanMarkets: [usdtLoanMarket(f)],
        });

        await f.manager
          .connect(f.timelock)
          .setSupportedOracles([bscmainnet.CHAINLINK_ORACLE, bscmainnet.REDSTONE_ORACLE, ZERO]);
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Dropped oracle"))
          .to.be.revertedWithCustomError(f.manager, "UnsupportedOracle")
          .withArgs(f.thirdOracle.address);

        await f.manager
          .connect(f.team)
          .setOracleFeeds(requestId, asset, mainFeed(bscmainnet.CHAINLINK_ORACLE, collateral.feed.address), 0);
        const { payload } = await buildRequest(f, requestId);
        await executeVip(f, payload);

        expect((await f.chainlinkOracle.tokenConfigs(asset)).feed).to.equal(collateral.feed.address);
        expect((await f.thirdOracle.tokenConfigs(asset)).feed).to.equal(ZERO);
      });

      it("32. refuses to build on a zero, negative or stale feed", async () => {
        const collateral = await newCollateralToken(f, "STL", "2");
        const asset = collateral.token.address;
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const build = () => f.manager.connect(f.team).buildRequestProposal(requestId, "Bad feed");

        await setPrice(collateral.feed, "0");
        await expect(build()).to.be.revertedWithCustomError(f.manager, "InvalidOracleFeed").withArgs(asset);
        await setPrice(collateral.feed, "-1");
        await expect(build()).to.be.revertedWithCustomError(f.manager, "InvalidOracleFeed").withArgs(asset);
        await setPrice(collateral.feed, "2");
        await time.increase(MAX_STALE_PERIOD + 1);
        await expect(build()).to.be.revertedWithCustomError(f.manager, "InvalidOracleFeed").withArgs(asset);
      });

      it("33. refuses to build once the seed allowance is revoked", async () => {
        const collateral = await newCollateralToken(f, "RVK", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);

        await collateral.token.connect(f.deployer).approve(f.manager.address, 0);
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "No allowance")).to.be.revertedWith(
          "ERC20: insufficient allowance",
        );
        await f.manager.connect(f.team).rejectRequest(requestId);

        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        await expectManagerHoldsNothing(f, [collateral.token.address]);
      });

      it("34. builds a pending request with a replaced builder", async () => {
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "NBP", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const newBuilder = await deployProposalBuilder();

        await expect(f.manager.connect(f.timelock).setProposalBuilder(newBuilder.address))
          .to.emit(f.manager, "ProposalBuilderUpdated")
          .withArgs(f.builder.address, newBuilder.address);
        const expectedComptroller = ethers.utils.getContractAddress({
          from: newBuilder.address,
          nonce: await ethers.provider.getTransactionCount(newBuilder.address),
        });
        const { comptroller, payload } = await buildRequest(f, requestId);
        expect(comptroller).to.equal(expectedComptroller);

        await executeVip(f, payload);
        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
        expect((await f.poolRegistry.getPoolByComptroller(comptroller)).comptroller).to.equal(comptroller);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(comptroller);
      });

      it("35. executes a built VIP after the builder is replaced", async () => {
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "NBB", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const { payload, comptroller } = await buildRequest(f, requestId);

        await f.manager.connect(f.timelock).setProposalBuilder((await deployProposalBuilder()).address);
        await executeVip(f, payload);
        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
      });

      it("36. fails a VIP atomically while the loan asset has no YieldGroup", async () => {
        await f.manager.connect(f.timelock).setHubYieldGroup(bscmainnet.USDT, ZERO);
        const collateral = await newCollateralToken(f, "NYG", "2");
        const request = { collateralMarkets: [collateralMarket(collateral)], loanMarkets: [usdtLoanMarket(f)] };
        const requestId = await requestPool(f, f.deployer, request);
        const xvsBefore = await f.xvs.balanceOf(f.deployer.address);
        const collateralBefore = await collateral.token.balanceOf(f.deployer.address);
        const usdtBefore = await f.usdt.balanceOf(f.deployer.address);
        const { payload, comptroller } = await buildRequest(f, requestId);
        const collateralSeed = await f.manager.requestSeeds(requestId, collateral.token.address);
        const usdtSeed = await f.manager.requestSeeds(requestId, bscmainnet.USDT);

        await expectVipToFail(payload, {
          target: comptroller,
          signature: "setAllowedSupplier(address,address,bool)",
          error: "ZeroAddressNotAllowed()",
        });
        await expectNoPartialPool(comptroller, collateral.token.address);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Built);
        expect(await f.xvs.balanceOf(f.manager.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await collateral.token.balanceOf(f.manager.address)).to.equal(collateralSeed);
        expect(await f.usdt.balanceOf(f.manager.address)).to.equal(usdtSeed);

        await f.manager.connect(f.team).rejectRequest(requestId);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect(await collateral.token.balanceOf(f.deployer.address)).to.equal(collateralBefore);
        expect(await f.usdt.balanceOf(f.deployer.address)).to.equal(usdtBefore);
        await expectManagerHoldsNothing(f, [collateral.token.address]);

        await f.manager.connect(f.timelock).setHubYieldGroup(bscmainnet.USDT, f.yieldGroup.address);
        const pool = await openPool(f, f.deployer, request);
        const loanVToken = pool.loanVTokens[0].address;
        expect((await f.manager.getPool(pool.comptroller.address)).status).to.equal(PoolStatus.Live);
        expect(await pool.comptroller.isAllowedSupplier(loanVToken, f.yieldGroup.address)).to.equal(true);
        expect(await f.yieldGroup.resourceCap(loanVToken)).to.equal(TIER_ONE_LOAN_CAP);
      });

      it("37. refuses a request with a repeated asset", async () => {
        const collateral = await newCollateralToken(f, "DUP", "2");
        const cases: [CollateralMarketParams[], LoanMarketParams[], string][] = [
          [[collateralMarket(collateral), collateralMarket(collateral)], [usdtLoanMarket(f)], collateral.token.address],
          [
            [collateralMarket(collateral), collateralMarket(collateral, { asset: bscmainnet.USDT })],
            [usdtLoanMarket(f)],
            bscmainnet.USDT,
          ],
          [[collateralMarket(collateral)], [usdtLoanMarket(f), usdtLoanMarket(f)], bscmainnet.USDT],
        ];
        for (const [collateralMarkets, loanMarkets, repeated] of cases) {
          await expect(submitPoolRequest({ collateralMarkets, loanMarkets }))
            .to.be.revertedWithCustomError(f.manager, "DuplicateAsset")
            .withArgs(repeated);
        }
      });

      it("38. caps a request's market count", async () => {
        const maxPoolMarkets = (await f.builder.MAX_POOL_MARKETS()).toNumber();
        const collateralMarkets = [];
        for (const symbol of ["CA", "CB", "CC", "CD"]) {
          collateralMarkets.push(collateralMarket(await newCollateralToken(f, symbol, "2")));
        }

        const overPoolLimit = new Array(maxPoolMarkets + 1 - collateralMarkets.length).fill(usdtLoanMarket(f));
        await expect(submitPoolRequest({ collateralMarkets, loanMarkets: overPoolLimit }))
          .to.be.revertedWithCustomError(f.manager, "TooManyMarkets")
          .withArgs(maxPoolMarkets + 1, maxPoolMarkets);
        await expect(submitPoolRequest({ collateralMarkets, loanMarkets: [usdtLoanMarket(f)] }))
          .to.be.revertedWithCustomError(f.manager, "TooManyMarkets")
          .withArgs(4, 3);

        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: collateralMarkets.slice(0, 3),
          loanMarkets: [usdtLoanMarket(f)],
        });
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Pending);
      });

      it("39. refuses invalid or over-limit collateral params", async () => {
        const collateral = await newCollateralToken(f, "LIM", "2");
        const asset = collateral.token.address;
        const cases: [Partial<CollateralMarketParams>, string][] = [
          [{ collateralFactor: e18("0.6"), liquidationThreshold: e18("0.55") }, "InvalidMarketParams"],
          [{ collateralFactor: e18("0.65"), liquidationThreshold: e18("0.7") }, "ExceedsTierLimit"],
          [{ collateralFactor: e18("0.5"), liquidationThreshold: e18("0.75") }, "ExceedsTierLimit"],
          // $1.2M at $2, over tier one's $1M
          [{ supplyCap: e18("600000") }, "ExceedsTierLimit"],
        ];
        for (const [overrides, error] of cases) {
          await expect(
            submitPoolRequest({
              collateralMarkets: [collateralMarket(collateral, overrides)],
              loanMarkets: [usdtLoanMarket(f)],
            }),
          )
            .to.be.revertedWithCustomError(f.manager, error)
            .withArgs(asset);
        }
      });

      it("40. refuses a market whose seed exceeds its supply cap", async () => {
        const collateral = await newCollateralToken(f, "SED", "2");
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral, { supplyCap: e18("1") })],
          loanMarkets: [usdtLoanMarket(f)],
        });
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Seed over cap"))
          .to.be.revertedWithCustomError(f.manager, "InvalidMarketParams")
          .withArgs(collateral.token.address);
      });

      it("41. refuses an unlisted loan asset or rate model", async () => {
        const collateralMarkets = [collateralMarket(await newCollateralToken(f, "LON", "2"))];
        await expect(
          submitPoolRequest({
            collateralMarkets,
            loanMarkets: [{ asset: XVS, interestRateModel: f.loanInterestRateModel.address }],
          }),
        )
          .to.be.revertedWithCustomError(f.manager, "LoanAssetNotAllowed")
          .withArgs(XVS);
        const otherModel = f.collateralInterestRateModel.address;
        await expect(
          submitPoolRequest({
            collateralMarkets,
            loanMarkets: [{ asset: bscmainnet.USDT, interestRateModel: otherModel }],
          }),
        )
          .to.be.revertedWithCustomError(f.manager, "InterestRateModelNotAllowed")
          .withArgs(otherModel);
      });

      it("42. refuses a request with no market", async () => {
        await expect(submitPoolRequest({ collateralMarkets: [], loanMarkets: [] })).to.be.revertedWithCustomError(
          f.manager,
          "InvalidArrayLength",
        );
      });

      it("43. refuses a pool request on a disabled tier", async () => {
        const request = {
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "TDS", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        };
        await updateTier(f, TIER_ONE, { enabled: false });

        for (const tierId of [TIER_ONE, 7]) {
          await expect(submitPoolRequest({ ...request, tierId }))
            .to.be.revertedWithCustomError(f.manager, "TierDisabled")
            .withArgs(tierId);
        }
      });

      it("44. refuses a pool request with too small a bond", async () => {
        const request = {
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "SHB", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        };
        await fundDeployer(f, f.deployer, request);

        // Tier one needs $150,000 ($100,000 at the 1.5 XVS factor): 30,000 XVS at $5, so a wei less is 5 wei short
        await expect(submitPoolRequest({ ...request, bondAmount: TIER_ONE_XVS_BOND.sub(1) }))
          .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
          .withArgs(e18("150000").sub(5), e18("150000"));
        await setPrice(f.xvsFeed, "4.99");
        await expect(submitPoolRequest(request))
          .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
          .withArgs(e18("149700"), e18("150000"));
        expect(await f.manager.requestCount()).to.equal(0);
      });

      it("45. refuses malformed or unsupported feeds", async () => {
        const collateral = await newCollateralToken(f, "FED", "2");
        const cases = await invalidFeedCases(collateral.token.address, collateral.feed.address);

        for (const { feeds, error, arg } of cases) {
          await expect(
            submitPoolRequest({
              collateralMarkets: [collateralMarket(collateral, { feeds })],
              loanMarkets: [usdtLoanMarket(f)],
            }),
          )
            .to.be.revertedWithCustomError(f.manager, error)
            .withArgs(arg);
        }
      });

      it("46. refuses invalid feed updates from the team", async () => {
        const collateral = await newCollateralToken(f, "SOF", "2");
        const asset = collateral.token.address;
        const requestId = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const setFeeds = (
          feedAsset: string,
          feeds: [OracleFeed, OracleFeed, OracleFeed],
          boundDeviation: BigNumberish = 0,
        ) => f.manager.connect(f.team).setOracleFeeds(requestId, feedAsset, feeds, boundDeviation);

        for (const { feeds, error, arg } of await invalidFeedCases(asset, collateral.feed.address)) {
          await expect(setFeeds(asset, feeds)).to.be.revertedWithCustomError(f.manager, error).withArgs(arg);
        }
        const other = await newCollateralToken(f, "OTH", "2");
        for (const [feedAsset, feed] of [
          [other.token.address, other.feed.address],
          [bscmainnet.USDT, f.usdtFeed.address],
        ]) {
          await expect(setFeeds(feedAsset, mainFeed(bscmainnet.CHAINLINK_ORACLE, feed)))
            .to.be.revertedWithCustomError(f.manager, "InvalidMarketParams")
            .withArgs(feedAsset);
        }
        await expect(setFeeds(asset, mainFeed(bscmainnet.CHAINLINK_ORACLE, collateral.feed.address), EXP_SCALE))
          .to.be.revertedWithCustomError(f.manager, "InvalidOracleFeed")
          .withArgs(asset);
        // 100,000 tokens at $11 is $1.1M, over tier one's $1M
        const pumped = await deployMockFeed(f, "11");
        await expect(setFeeds(asset, mainFeed(bscmainnet.CHAINLINK_ORACLE, pumped.address)))
          .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
          .withArgs(asset);

        const storedFeeds = (await f.manager.getRequest(requestId)).collateralMarkets[0].feeds;
        expect(storedFeeds.map(feed => [feed.oracle, feed.feed])).to.deep.equal([
          [bscmainnet.CHAINLINK_ORACLE, collateral.feed.address],
          [ZERO, ZERO],
          [ZERO, ZERO],
        ]);
      });

      describe("with a live pool", () => {
        let pool: Awaited<ReturnType<typeof openDefaultPool>>;
        let comptroller: string;

        before(async () => {
          pool = await openDefaultPool(f);
          comptroller = pool.comptroller.address;
          snapshot = await snapshotFixture(f);
        });

        it("47. refuses other requests while a markets request is open", async () => {
          const second = await newCollateralToken(f, "SND", "2");
          const third = await newCollateralToken(f, "THD", "2");
          const marketsRequestId = await requestMarkets(f, comptroller, [collateralMarket(second)]);
          await topUpToTierTwo(f, comptroller);
          const fresh = {
            collateralMarkets: [collateralMarket(await newCollateralToken(f, "FRS", "2"))],
            loanMarkets: [usdtLoanMarket(f)],
          };
          await fundDeployer(f, f.deployer, fresh);
          const deployer = f.manager.connect(f.deployer);

          for (const status of [RequestStatus.Pending, RequestStatus.Built]) {
            if (status === RequestStatus.Built) await buildRequest(f, marketsRequestId);
            expect((await f.manager.getRequest(marketsRequestId)).status).to.equal(status);
            for (const request of [
              () => deployer.requestNewMarkets(comptroller, [collateralMarket(third)], []),
              () => deployer.requestTierUpgrade(comptroller, TIER_TWO),
              () => deployer.requestExit(comptroller),
            ]) {
              await expect(request())
                .to.be.revertedWithCustomError(f.manager, "OpenRequestExists")
                .withArgs(marketsRequestId);
            }
            await expect(submitPoolRequest(fresh))
              .to.be.revertedWithCustomError(f.manager, "ActivePoolExists")
              .withArgs(f.deployer.address);
          }
        });

        it("48. allows a new pool only once the old one closes", async () => {
          const fresh = {
            collateralMarkets: [collateralMarket(await newCollateralToken(f, "NXT", "2"))],
            loanMarkets: [usdtLoanMarket(f)],
          };
          await fundDeployer(f, f.deployer, fresh);
          const expectRefusedIn = async (status: number) => {
            expect((await f.manager.getPool(comptroller)).status).to.equal(status);
            await expect(submitPoolRequest(fresh))
              .to.be.revertedWithCustomError(f.manager, "ActivePoolExists")
              .withArgs(f.deployer.address);
          };

          await expectRefusedIn(PoolStatus.Live);
          await f.manager.connect(f.deployer).requestExit(comptroller);
          await expectRefusedIn(PoolStatus.ExitRequested);
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await expectRefusedIn(PoolStatus.ExitProposed);
          await executeVip(f, await f.manager.exitProposals(comptroller));
          await expectRefusedIn(PoolStatus.WindingDown);
          await f.manager.connect(f.team).closePool(comptroller);

          const nextRequestId = (await f.manager.requestCount()).add(1);
          await expect(submitPoolRequest(fresh))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(nextRequestId, POOL_REQUEST_TYPE, f.deployer.address, ZERO);
          expect(await f.bondManager.bondAccounts(comptroller)).to.equal(pool.bondAccount.address);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("49. allows a new pool after a governance handover", async () => {
          const fresh = {
            collateralMarkets: [collateralMarket(await newCollateralToken(f, "HND", "2"))],
            loanMarkets: [usdtLoanMarket(f)],
          };
          await fundDeployer(f, f.deployer, fresh);
          await f.manager.connect(f.deployer).requestExit(comptroller);
          await expect(f.manager.connect(f.timelock).handoverPoolToGovernance(comptroller))
            .to.emit(f.manager, "PoolHandedOver")
            .withArgs(comptroller);

          const nextRequestId = (await f.manager.requestCount()).add(1);
          await expect(submitPoolRequest(fresh))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(nextRequestId, POOL_REQUEST_TYPE, f.deployer.address, ZERO);
          expect(await f.bondManager.bondAccounts(comptroller)).to.equal(pool.bondAccount.address);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("50. refuses to build, settle or execute a request twice", async () => {
          const marketsRequestId = await requestMarkets(f, comptroller, [
            collateralMarket(await newCollateralToken(f, "TWC", "2")),
          ]);
          const { payload } = await buildRequest(f, marketsRequestId);
          await expect(f.manager.connect(f.team).buildRequestProposal(marketsRequestId, "Again"))
            .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
            .withArgs(marketsRequestId);

          await expect(f.manager.connect(f.timelock).settleRequest(pool.requestId))
            .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
            .withArgs(pool.requestId);

          await expectVipToFail(await f.manager.requestProposals(pool.requestId), {
            target: comptroller,
            signature: "acceptOwnership()",
            error: "Ownable2Step: caller is not the new owner",
          });
          expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(2);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
          expect(await pool.bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);

          await executeVip(f, payload);
          expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(3);
          await expectVipToFail(payload, {
            target: f.manager.address,
            signature: "settleRequest(uint256)",
            error: `InvalidRequestStatus(${marketsRequestId})`,
          });
          expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(3);
          expect((await f.manager.getRequest(marketsRequestId)).status).to.equal(RequestStatus.Settled);
        });

        it("51. fails a markets VIP once the exit is built", async () => {
          const late = await newCollateralToken(f, "LTE", "2");
          const marketsRequestId = await requestMarkets(f, comptroller, [collateralMarket(late)]);
          const lateBefore = await late.token.balanceOf(f.deployer.address);
          const { payload } = await buildRequest(f, marketsRequestId);
          expect(await late.token.balanceOf(f.manager.address)).to.be.gt(0);

          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await expectVipToFail(payload, {
            target: f.manager.address,
            signature: "settleRequest(uint256)",
            error: `InvalidPoolStatus(${comptroller})`,
          });
          expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(2);
          expect((await f.manager.getRequest(marketsRequestId)).status).to.equal(RequestStatus.Built);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.ExitProposed);

          await expect(f.manager.connect(f.team).rejectRequest(marketsRequestId))
            .to.emit(f.manager, "RequestRejected")
            .withArgs(marketsRequestId);
          expect(await late.token.balanceOf(f.deployer.address)).to.equal(lateBefore);
          await expectManagerHoldsNothing(f, [late.token.address]);
        });

        // Known gap: closePool leaves the built markets request open, so requestPool reverts OpenRequestExists
        it("52. clears a closed pool's open request", async () => {
          const late = await newCollateralToken(f, "STA", "2");
          const marketsRequestId = await requestMarkets(f, comptroller, [collateralMarket(late)]);
          await buildRequest(f, marketsRequestId);
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await executeVip(f, await f.manager.exitProposals(comptroller));
          await f.manager.connect(f.team).closePool(comptroller);
          const fresh = {
            collateralMarkets: [collateralMarket(await newCollateralToken(f, "AFT", "2"))],
            loanMarkets: [usdtLoanMarket(f)],
          };
          await fundDeployer(f, f.deployer, fresh);

          const nextRequestId = (await f.manager.requestCount()).add(1);
          await expect(submitPoolRequest(fresh))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(nextRequestId, POOL_REQUEST_TYPE, f.deployer.address, ZERO);
          expect(await late.token.balanceOf(f.manager.address)).to.equal(0);
        });

        it("53. fails a tier VIP after the exit executes", async () => {
          const tier = await buildTierUpgrade(f, comptroller);
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await executeVip(f, await f.manager.exitProposals(comptroller));
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);

          const hubCapBefore = await f.yieldGroup.resourceCap(pool.loanVToken.address);
          await expectVipToFail(tier.payload, {
            target: f.manager.address,
            signature: "settleRequest(uint256)",
            error: `InvalidPoolStatus(${comptroller})`,
          });
          expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_ONE);
          expect((await f.manager.getRequest(tier.requestId)).status).to.equal(RequestStatus.Built);
          expect(await pool.comptroller.supplyCaps(pool.loanVToken.address)).to.equal(0);
          expect(await pool.comptroller.borrowCaps(pool.loanVToken.address)).to.equal(0);
          expect(await f.yieldGroup.resourceCap(pool.loanVToken.address)).to.equal(hubCapBefore);
        });

        it("54. fails a queued tier VIP once the exit is built", async () => {
          const tier = await buildTierUpgrade(f, comptroller);
          const tierProposalId = await proposeAndQueue(f, tier.payload);
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          const exitProposalId = await proposeAndQueue(f, await f.manager.exitProposals(comptroller));

          await expectVipToFail(
            tier.payload,
            {
              target: f.manager.address,
              signature: "settleRequest(uint256)",
              error: `InvalidPoolStatus(${comptroller})`,
            },
            tierProposalId,
          );
          expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_ONE);
          expect(await pool.comptroller.supplyCaps(pool.loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);
          expect(await f.yieldGroup.resourceCap(pool.loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);

          await f.governor.execute(exitProposalId);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);
          expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_ONE);
        });

        it("55. allows new markets on a disabled tier", async () => {
          await updateTier(f, TIER_ONE, { enabled: false });
          const markets = [collateralMarket(await newCollateralToken(f, "DIS", "2"))];
          await approveSeeds(f, f.deployer, { collateralMarkets: markets, loanMarkets: [] });

          const requestId = (await f.manager.requestCount()).add(1);
          await expect(f.manager.connect(f.deployer).requestNewMarkets(comptroller, markets, []))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(requestId, NEW_MARKETS_REQUEST_TYPE, f.deployer.address, comptroller);
          expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Pending);

          const { payload, vTokens } = await buildRequest(f, requestId.toNumber());
          await executeVip(f, payload);
          expect((await pool.comptroller.markets(vTokens[0])).isListed).to.equal(true);
          expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(3);
        });

        it("56. refuses new markets for an asset already in the pool", async () => {
          const deployer = f.manager.connect(f.deployer);
          await expect(deployer.requestNewMarkets(comptroller, [collateralMarket(pool.collateral)], []))
            .to.be.revertedWithCustomError(f.manager, "DuplicateAsset")
            .withArgs(pool.collateral.token.address);
          await expect(deployer.requestNewMarkets(comptroller, [], [usdtLoanMarket(f)]))
            .to.be.revertedWithCustomError(f.manager, "DuplicateAsset")
            .withArgs(bscmainnet.USDT);
        });

        it("57. counts only collateral markets toward the tier limit", async () => {
          const markets = [];
          for (const symbol of ["XA", "XB", "XC"]) {
            markets.push(collateralMarket(await newCollateralToken(f, symbol, "2")));
          }
          const deployer = f.manager.connect(f.deployer);

          expect(await deployer.callStatic.requestNewMarkets(comptroller, markets.slice(0, 2), [])).to.equal(
            (await f.manager.requestCount()).add(1),
          );
          await expect(deployer.requestNewMarkets(comptroller, markets, []))
            .to.be.revertedWithCustomError(f.manager, "TooManyMarkets")
            .withArgs(4, 3);
        });

        it("58. refuses new markets while the bond is short", async () => {
          const markets = [collateralMarket(await newCollateralToken(f, "LOW", "2"))];
          await approveSeeds(f, f.deployer, { collateralMarkets: markets, loanMarkets: [] });
          const deployer = f.manager.connect(f.deployer);

          // 30,000 XVS at $4 is $120,000, under tier one's $150,000
          await setPrice(f.xvsFeed, "4");
          await expect(deployer.requestNewMarkets(comptroller, markets, []))
            .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
            .withArgs(e18("120000"), e18("150000"));

          await setPrice(f.xvsFeed, "5");
          const requestId = (await f.manager.requestCount()).add(1);
          await expect(deployer.requestNewMarkets(comptroller, markets, []))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(requestId, NEW_MARKETS_REQUEST_TYPE, f.deployer.address, comptroller);
        });

        it("59. refuses a tier upgrade until the bond covers it", async () => {
          const deployer = f.manager.connect(f.deployer);

          // Tier two needs $375,000 ($250,000 at the 1.5 XVS factor): 75,000 XVS at $5
          await expect(deployer.requestTierUpgrade(comptroller, TIER_TWO))
            .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
            .withArgs(e18("150000"), e18("375000"));
          await topUpToTierTwo(f, comptroller);
          await setPrice(f.xvsFeed, "4.99");
          await expect(deployer.requestTierUpgrade(comptroller, TIER_TWO))
            .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
            .withArgs(e18("374250"), e18("375000"));

          await setPrice(f.xvsFeed, "5");
          const requestId = (await f.manager.requestCount()).add(1);
          await expect(deployer.requestTierUpgrade(comptroller, TIER_TWO))
            .to.emit(f.manager, "RequestSubmitted")
            .withArgs(requestId, TIER_UPGRADE_REQUEST_TYPE, f.deployer.address, comptroller);
        });

        it("60. refuses a same, lower or disabled tier", async () => {
          const lowerTierId = 3;
          await f.policyRegistry.connect(f.timelock).setTier(lowerTierId, {
            enabled: true,
            minTierBondUsd: e18("50000"),
            limits: TIER_ONE_LIMITS,
          });
          await updateTier(f, TIER_TWO, { enabled: false });
          await topUpToTierTwo(f, comptroller);
          const deployer = f.manager.connect(f.deployer);

          for (const tierId of [TIER_ONE, lowerTierId, TIER_TWO]) {
            await expect(deployer.requestTierUpgrade(comptroller, tierId))
              .to.be.revertedWithCustomError(f.manager, "InvalidTierUpgrade")
              .withArgs(TIER_ONE, tierId);
          }
          await updateTier(f, TIER_TWO, { enabled: true });
          await expect(deployer.requestTierUpgrade(comptroller, TIER_TWO)).to.emit(f.manager, "RequestSubmitted");
        });
      });
    });

    describe("a second loan asset", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };
      let usdcYieldGroup: Contract;

      before(async () => {
        f = await loadOpenSpokeFixture();
        usdcYieldGroup = await addUsdcLoanAsset();
        snapshot = await snapshotFixture(f);
      });

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      /// A USDC Hub from the live HubBeacon with its own YieldGroup, and USDC pinned at $1 and listed as a loan asset
      /// at half of each tier's loan cap; returns the YieldGroup
      async function addUsdcLoanAsset() {
        const hubInterface = new ethers.utils.Interface(HUB_ABI);
        const hubProxy = await (
          await ethers.getContractFactory("BeaconProxy", f.admin)
        ).deploy(
          bscmainnet.HUB_BEACON,
          hubInterface.encodeFunctionData("initialize", [
            USDC,
            "Venus Hub USDC",
            "vhUSDC",
            bscmainnet.ACM,
            6,
            MAX_UINT128,
            bscmainnet.NORMAL_TIMELOCK,
          ]),
        );
        const hub = new ethers.Contract(hubProxy.address, HUB_ABI, f.timelock);
        for (const signature of Object.values(HUB_ADMIN_ROLES)) {
          await grant(f.acm, f.timelock, hub.address, signature, bscmainnet.NORMAL_TIMELOCK);
        }

        const yieldGroup = await deployYieldGroup(f.admin, hub.address, USDC);
        for (const signature of [
          HUB_ROLES.addResource,
          HUB_ROLES.removeResource,
          HUB_ROLES.setInnerDepositQueue,
          HUB_ROLES.setInnerWithdrawQueue,
          HUB_ROLES.raiseResourceCap,
          HUB_ROLES.lowerResourceCap,
          HUB_ROLES.pauseResource,
        ]) {
          await grant(f.acm, f.timelock, yieldGroup.address, signature, bscmainnet.NORMAL_TIMELOCK);
        }
        await hub.addYieldGroup(yieldGroup.address, MAX_UINT128, 10_000);
        await hub.setOuterDepositQueue([yieldGroup.address]);
        await hub.setOuterWithdrawQueue([yieldGroup.address]);

        await pinLivePrice(f, USDC, "1");
        await f.manager.connect(f.timelock).setHubYieldGroup(USDC, yieldGroup.address);
        await f.policyRegistry.connect(f.timelock).setLoanAssetConfig(USDC, {
          factor: USDC_LOAN_FACTOR,
          interestRateModels: [f.loanInterestRateModel.address],
        });
        return yieldGroup;
      }

      /// Funds the deployer's USDC seed and lets the manager pull it
      async function fundUsdcSeed() {
        const usdc: IERC20 = IERC20__factory.connect(USDC, f.admin);
        await fundFrom(usdc, USDC_HOLDER, f.deployer.address, e18("1000"));
        await usdc.connect(f.deployer).approve(f.manager.address, ethers.constants.MaxUint256);
      }

      /// A tier-one pool with one collateral market and two loan markets, USDT then USDC
      async function openTwoLoanPool() {
        const collateral = await newCollateralToken(f, "TWO", "2");
        await fundUsdcSeed();
        return openPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f), { asset: USDC, interestRateModel: f.loanInterestRateModel.address }],
        });
      }

      it("61. adds a USDC loan market to a live pool", async () => {
        const pool = await openDefaultPool(f);
        await fundUsdcSeed();
        const requestId = await requestMarkets(
          f,
          pool.comptroller.address,
          [],
          [{ asset: USDC, interestRateModel: f.loanInterestRateModel.address }],
        );
        const { payload, vTokens } = await buildRequest(f, requestId);
        const seed = seedFor(priceMantissa("1"));
        expect(await f.manager.requestSeeds(requestId, USDC)).to.equal(seed);
        await executeVip(f, payload);

        const vToken = (await ethers.getContractAt("VToken", vTokens[0])) as VToken;
        const { comptroller } = pool;
        expect(await vToken.underlying()).to.equal(USDC);
        expect(await vToken.interestRateModel()).to.equal(f.loanInterestRateModel.address);
        expect(await comptroller.getAllMarkets()).to.have.lengthOf(3);
        const market = await comptroller.markets(vToken.address);
        expect(market.isListed).to.equal(true);
        expect(market.collateralFactorMantissa).to.equal(0);
        expect(market.liquidationThresholdMantissa).to.equal(0);
        expect(await comptroller.supplyCaps(vToken.address)).to.equal(USDC_TIER_ONE_CAP);
        expect(await comptroller.borrowCaps(vToken.address)).to.equal(USDC_TIER_ONE_CAP);
        expect(await comptroller.isSupplyAllowlistEnabled(vToken.address)).to.equal(true);
        expect(await comptroller.isAllowedSupplier(vToken.address, usdcYieldGroup.address)).to.equal(true);
        expect(await comptroller.isAllowedSupplier(vToken.address, f.yieldGroup.address)).to.equal(false);
        expect(await usdcYieldGroup.resources()).to.deep.equal([vToken.address]);
        expect(await usdcYieldGroup.resourceCap(vToken.address)).to.equal(USDC_TIER_ONE_CAP);

        const minted = seed.mul(EXP_SCALE).div(await vToken.exchangeRateStored());
        expect(await vToken.totalSupply()).to.equal(minted);
        expect(await vToken.balanceOf(ZERO)).to.equal(minted);
        expect(await vToken.balanceOf(bscmainnet.NORMAL_TIMELOCK)).to.equal(0);
        expect(await vToken.getCash()).to.equal(seed);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
        await expectManagerHoldsNothing(f, [USDC]);
      });

      it("62. raises both loan markets' caps on a tier upgrade", async () => {
        const pool = await openTwoLoanPool();
        const comptroller = pool.comptroller.address;
        const [usdtVToken, usdcVToken] = pool.loanVTokens;
        expect(await f.policyRegistry.getLoanSupplyCapUsd(TIER_TWO, USDC)).to.equal(
          TIER_TWO_LOAN_CAP.mul(USDC_LOAN_FACTOR).div(EXP_SCALE),
        );
        expect(await pool.comptroller.supplyCaps(usdcVToken.address)).to.equal(USDC_TIER_ONE_CAP);
        expect(await usdcYieldGroup.resourceCap(usdcVToken.address)).to.equal(USDC_TIER_ONE_CAP);

        const { requestId, payload } = await buildTierUpgrade(f, comptroller);
        await executeVip(f, payload);

        expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_TWO);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
        for (const [vToken, cap, yieldGroup] of [
          [usdtVToken, TIER_TWO_LOAN_CAP, f.yieldGroup],
          [usdcVToken, USDC_TIER_TWO_CAP, usdcYieldGroup],
        ] as [VToken, BigNumber, Contract][]) {
          expect(await pool.comptroller.supplyCaps(vToken.address)).to.equal(cap);
          expect(await pool.comptroller.borrowCaps(vToken.address)).to.equal(cap);
          expect(await yieldGroup.resourceCap(vToken.address)).to.equal(cap);
        }
      });

      it("63. changes only the Hub caps that differ from the new tier's", async () => {
        const pool = await openTwoLoanPool();
        const comptroller = pool.comptroller.address;
        const [usdtVToken, usdcVToken] = pool.loanVTokens;
        await usdcYieldGroup.connect(f.timelock).raiseResourceCap(usdcVToken.address, USDC_TIER_TWO_CAP);
        await f.yieldGroup.connect(f.timelock).raiseResourceCap(usdtVToken.address, e18("5000000"));

        const { payload } = await buildTierUpgrade(f, comptroller);
        expect(actionList(payload)).to.deep.equal([
          [f.manager.address, "settleRequest(uint256)"],
          [f.yieldGroup.address, "lowerResourceCap(address,uint256)"],
          [comptroller, "setMarketSupplyCaps(address[],uint256[])"],
          [comptroller, "setMarketBorrowCaps(address[],uint256[])"],
        ]);
        const coder = ethers.utils.defaultAbiCoder;
        const actions = vipActions(payload);
        expect(actions[1].calldata).to.equal(
          coder.encode(["address", "uint256"], [usdtVToken.address, TIER_TWO_LOAN_CAP]),
        );
        const caps = coder.encode(
          ["address[]", "uint256[]"],
          [
            [usdtVToken.address, usdcVToken.address],
            [TIER_TWO_LOAN_CAP, USDC_TIER_TWO_CAP],
          ],
        );
        expect(actions[2].calldata).to.equal(caps);
        expect(actions[3].calldata).to.equal(caps);

        await executeVip(f, payload);
        expect(await f.yieldGroup.resourceCap(usdtVToken.address)).to.equal(TIER_TWO_LOAN_CAP);
        expect(await usdcYieldGroup.resourceCap(usdcVToken.address)).to.equal(USDC_TIER_TWO_CAP);
        expect(await pool.comptroller.supplyCaps(usdcVToken.address)).to.equal(USDC_TIER_TWO_CAP);
        expect(await pool.comptroller.borrowCaps(usdtVToken.address)).to.equal(TIER_TWO_LOAN_CAP);
      });

      it("64. refuses a tier build once a loan asset is delisted", async () => {
        const pool = await openTwoLoanPool();
        const comptroller = pool.comptroller.address;
        await topUpToTierTwo(f, comptroller);
        await f.manager.connect(f.deployer).requestTierUpgrade(comptroller, TIER_TWO);
        const requestId = await f.manager.requestCount();

        await f.policyRegistry.connect(f.timelock).setLoanAssetConfig(USDC, { factor: 0, interestRateModels: [] });
        await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Tier"))
          .to.be.revertedWithCustomError(f.builder, "LoanAssetNotAllowed")
          .withArgs(USDC);
        expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Pending);

        await f.manager.connect(f.team).rejectRequest(requestId);
        expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_ONE);
      });
    });
  });
}

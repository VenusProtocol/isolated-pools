import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { EvilToken, MockToken, SpokeComptroller, VToken } from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import {
  MAX_RESIDUAL_POOL_DEBT_USD,
  MAX_STALE_PERIOD,
  OpenSpokeFixture,
  POOL_PARAMS,
  RISK_STEWARD_RECEIVER,
  TIER_ONE_BOND_USD,
  TIER_ONE_LIMITS,
  UpdateStatus,
  UpdateType,
  WIND_DOWN_PERIOD,
  XVS,
  XVS_BOND_FACTOR,
  deployMockFeed,
  e18,
  fundUsdt,
  fundXvs,
  loadOpenSpokeFixture,
  setPrice,
  snapshotFixture,
} from "./util/fixture";
import {
  Action,
  CollateralMarketParams,
  EXP_SCALE,
  NO_FEED,
  advanceTime,
  applyLatestUpdate,
  approveSeeds,
  assertInvariants,
  borrow,
  buildRequest,
  collateralMarket,
  depositToHub,
  executeVip,
  exitPool,
  impersonate,
  newCollateralToken,
  openFundedPool,
  openPool,
  priceMantissa,
  recoverFromBond,
  resilientOracle,
  supplyCollateral,
  usdValue,
  usdtLoanMarket,
  wireHubQueues,
} from "./util/helpers";

const FORK = process.env.FORK === "true";

const LIQUIDITY = e18("50000");
const SUPPLIED = e18("10000");
const INVALID_PRICE = "invalid resilient oracle price";
const DBO_COOLDOWN = 3600;
const DAY = 24 * 3600;
const PSR_ABI = [
  "function assetsReserves(address comptroller, address asset, uint8 schema) view returns (uint256)",
  "function totalAssetReserve(address asset) view returns (uint256)",
  "event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount, uint8 incomeType, uint8 schema)",
];
const IncomeType = { SPREAD: 0, LIQUIDATION: 1 };
const Schema = { PROTOCOL_RESERVES: 0, ADDITIONAL_REVENUE: 1 };
const RECEIVER_ABI = [
  "function UPDATE_EXPIRATION_TIME() view returns (uint256)",
  "function getRiskParameterConfig(string) view returns ((bool active, uint256 debounce, uint256 timelock, address riskSteward))",
  "function getExecutableUpdates(string updateType, address comptroller) view returns (uint256[])",
  "function processUpdate(uint256)",
  "function executeRegisteredUpdate(uint256)",
  "error UpdateTooFrequent()",
  "error UpdateWillExpireBeforeUnlock()",
  "error UpdateIsExpired()",
  "error UpdateAlreadyResolved()",
];

if (FORK) {
  describe("Open Spoke Pool: price risk and liquidations", function () {
    this.timeout(0);

    /// Funds `liquidator` with USDT and lets the loan market pull it
    async function fundLiquidator(f: OpenSpokeFixture, loanVToken: VToken, liquidator = f.liquidator) {
      await fundUsdt(f.usdt, liquidator.address, e18("100000"));
      await f.usdt.connect(liquidator).approve(loanVToken.address, ethers.constants.MaxUint256);
    }

    /// The principal and borrow index an account's debt grows from; read it right after the account's last borrow or repay
    async function debtSnapshot(vToken: VToken, account: string) {
      return { principal: await vToken.borrowBalanceStored(account), interestIndex: await vToken.borrowIndex() };
    }

    /// The account's debt as of the next mined block, at the market's current borrow rate
    async function debtAtNextBlock(vToken: VToken, debt: { principal: BigNumber; interestIndex: BigNumber }) {
      const [rate, index, accrualBlock, block] = await Promise.all([
        vToken.borrowRatePerBlock(),
        vToken.borrowIndex(),
        vToken.accrualBlockNumber(),
        ethers.provider.getBlockNumber(),
      ]);
      const nextIndex = rate
        .mul(block + 1 - accrualBlock.toNumber())
        .mul(index)
        .div(EXP_SCALE)
        .add(index);
      return debt.principal.mul(nextIndex).div(debt.interestIndex);
    }

    /// What `healAccount` makes the caller repay: the account's collateral at spot, discounted by the incentive
    async function maxClearableDebt(comptroller: SpokeComptroller, collateralVToken: VToken, account: string) {
      const oracle = await resilientOracle();
      const [balance, exchangeRate, price, incentive] = await Promise.all([
        collateralVToken.balanceOf(account),
        collateralVToken.exchangeRateStored(),
        oracle.getUnderlyingPrice(collateralVToken.address),
        comptroller.effectiveLiquidationIncentive(collateralVToken.address),
      ]);
      const collateralUsd = exchangeRate.mul(price).div(EXP_SCALE).mul(balance).div(EXP_SCALE);
      return collateralUsd.mul(EXP_SCALE).div(incentive);
    }

    /// The collateral vTokens a liquidation seizes and how `VToken._seize` splits them between liquidator and protocol
    async function expectedSeizure(
      comptroller: SpokeComptroller,
      borrowed: VToken,
      collateral: VToken,
      repay: BigNumber,
    ) {
      const oracle = await resilientOracle();
      const [borrowedPrice, collateralPrice, exchangeRate, incentive, protocolShare] = await Promise.all([
        oracle.getUnderlyingPrice(borrowed.address),
        oracle.getUnderlyingPrice(collateral.address),
        collateral.exchangeRateStored(),
        comptroller.effectiveLiquidationIncentive(collateral.address),
        collateral.protocolSeizeShareMantissa(),
      ]);
      const seizeTokens = repay.mul(incentive).mul(borrowedPrice).div(collateralPrice.mul(exchangeRate));
      const protocolTokens = seizeTokens.mul(protocolShare).div(EXP_SCALE).mul(EXP_SCALE).div(incentive);
      return {
        seizeTokens,
        protocolTokens,
        liquidatorTokens: seizeTokens.sub(protocolTokens),
        exchangeRate,
        incentive,
        collateralPrice,
      };
    }

    describe("price volatility", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };
      let oracle: Contract;

      /// Moves time like `advanceTime`, but leaves `frozenFeed` at its last update so it goes stale
      async function advanceTimeFreezing(f: OpenSpokeFixture, seconds: number, frozenFeed: Contract) {
        await time.increase(seconds);
        for (const feed of f.feeds) {
          if (feed.address !== frozenFeed.address) await feed.updateAnswer(await feed.latestAnswer());
        }
      }

      describe("on a funded pool", () => {
        let pool: Awaited<ReturnType<typeof openFundedPool>>;

        before(async () => {
          f = await loadOpenSpokeFixture();
          oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
          pool = await openFundedPool(f, LIQUIDITY);
          await fundLiquidator(f, pool.loanVToken);
          snapshot = await snapshotFixture(f);
        });

        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await snapshot.restore();
        });

        it("1. liquidations clear a gradual 50% collateral drop with no bad debt", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const borrowers: [SignerWithAddress, BigNumber][] = [
            [f.borrower, e18("9000")],
            [f.supplier, e18("7000")],
          ];
          for (const [user, debt] of borrowers) {
            await supplyCollateral(user, collateral, collateralVToken, e18("10000"));
            await borrow(user, loanVToken, debt);
          }
          const exchangeRateBefore = await loanVToken.exchangeRateStored();

          const liquidated = new Set<string>();
          for (let cents = 190; cents >= 100; cents -= 10) {
            await setPrice(collateral.feed, (cents / 100).toFixed(2));
            for (const [user] of borrowers) {
              while ((await comptroller.getAccountLiquidity(user.address)).shortfall.gt(0)) {
                const repay = (await loanVToken.borrowBalanceStored(user.address)).div(2);
                await loanVToken.connect(f.liquidator).liquidateBorrow(user.address, repay, collateralVToken.address);
                liquidated.add(user.address);
              }
            }
          }

          expect([...liquidated]).to.have.members([f.borrower.address, f.supplier.address]);
          for (const [user] of borrowers) {
            expect((await comptroller.getAccountLiquidity(user.address)).shortfall).to.equal(0);
          }
          expect(await loanVToken.badDebt()).to.equal(0);
          expect(await loanVToken.exchangeRateStored()).to.be.gte(exchangeRateBefore);
        });

        it("2. a 95% gap-down leaves bad debt that the bond repays", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("900"));
          await borrow(f.borrower, loanVToken, e18("800"));
          const debt = await debtSnapshot(loanVToken, f.borrower.address);

          await setPrice(collateral.feed, "0.1");
          const maxClearable = await maxClearableDebt(comptroller, collateralVToken, f.borrower.address);
          const badDebt = (await debtAtNextBlock(loanVToken, debt)).sub(maxClearable);
          const liquidatorUsdtBefore = await f.usdt.balanceOf(f.liquidator.address);
          await expect(comptroller.connect(f.liquidator).healAccount(f.borrower.address))
            .to.emit(loanVToken, "BadDebtIncreased")
            .withArgs(f.borrower.address, badDebt, 0, badDebt);

          expect(liquidatorUsdtBefore.sub(await f.usdt.balanceOf(f.liquidator.address))).to.equal(maxClearable);
          expect(await loanVToken.borrowBalanceStored(f.borrower.address)).to.equal(0);
          expect(await collateralVToken.balanceOf(f.borrower.address)).to.equal(0);
          expect(await loanVToken.badDebt()).to.equal(badDebt);

          const cashBefore = await loanVToken.getCash();
          const seized = await recoverFromBond(f, { comptroller, loanVToken }, badDebt);
          expect(seized).to.equal(badDebt.mul(e18("1")).div(priceMantissa("5")));
          expect(await loanVToken.badDebt()).to.equal(0);
          expect((await loanVToken.getCash()).sub(cashBefore)).to.equal(badDebt);
        });

        it("3. a crash in one collateral market leaves the other market's suppliers whole", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const second = await newCollateralToken(f, "SEC", "2");
          const addedMarkets = [collateralMarket(second)];
          await approveSeeds(f, f.deployer, { collateralMarkets: addedMarkets, loanMarkets: [] });
          await f.manager.connect(f.deployer).requestNewMarkets(comptroller.address, addedMarkets, []);
          const { payload, vTokens } = await buildRequest(f, (await f.manager.requestCount()).toNumber());
          await executeVip(f, payload);
          const secondVToken = (await ethers.getContractAt("VToken", vTokens[0])) as VToken;

          await supplyCollateral(f.supplier, collateral, collateralVToken, SUPPLIED);
          await borrow(f.supplier, loanVToken, e18("3000"));
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("40"));
          await supplyCollateral(f.borrower, second, secondVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("10000"));
          const [supplierTokens, borrowerFirstTokens, firstExchangeRate] = await Promise.all([
            collateralVToken.balanceOf(f.supplier.address),
            collateralVToken.balanceOf(f.borrower.address),
            collateralVToken.exchangeRateStored(),
          ]);

          await setPrice(second.feed, "0.01");
          expect(await oracle.getUnderlyingPrice(collateralVToken.address)).to.equal(priceMantissa("2"));
          expect((await comptroller.getAccountLiquidity(f.supplier.address)).shortfall).to.equal(0);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.supplier.address, e18("100"), collateralVToken.address),
          ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");

          const repay = (await maxClearableDebt(comptroller, secondVToken, f.borrower.address)).mul(99).div(100);
          const seizure = await expectedSeizure(comptroller, loanVToken, secondVToken, repay);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, repay, secondVToken.address),
          )
            .to.emit(loanVToken, "LiquidateBorrow")
            .withArgs(f.liquidator.address, f.borrower.address, repay, secondVToken.address, seizure.seizeTokens);
          expect(await collateralVToken.balanceOf(f.borrower.address)).to.equal(borrowerFirstTokens);

          const debt = await debtSnapshot(loanVToken, f.borrower.address);
          const maxClearable = (await maxClearableDebt(comptroller, collateralVToken, f.borrower.address)).add(
            await maxClearableDebt(comptroller, secondVToken, f.borrower.address),
          );
          const badDebt = (await debtAtNextBlock(loanVToken, debt)).sub(maxClearable);
          await expect(comptroller.connect(f.liquidator).healAccount(f.borrower.address))
            .to.emit(loanVToken, "BadDebtIncreased")
            .withArgs(f.borrower.address, badDebt, 0, badDebt);
          expect(await loanVToken.borrowBalanceStored(f.borrower.address)).to.equal(0);
          for (const vToken of [collateralVToken, secondVToken]) {
            expect(await vToken.balanceOf(f.borrower.address)).to.equal(0);
          }

          const cashBefore = await loanVToken.getCash();
          await recoverFromBond(f, { comptroller, loanVToken }, badDebt);
          expect(await loanVToken.badDebt()).to.equal(0);
          expect((await loanVToken.getCash()).sub(cashBefore)).to.equal(badDebt);

          expect(await collateralVToken.balanceOf(f.supplier.address)).to.equal(supplierTokens);
          expect(await collateralVToken.exchangeRateStored()).to.equal(firstExchangeRate);
          expect((await comptroller.getAccountLiquidity(f.supplier.address)).shortfall).to.equal(0);
          await fundUsdt(f.usdt, f.supplier.address, e18("100"));
          await f.usdt.connect(f.supplier).approve(loanVToken.address, ethers.constants.MaxUint256);
          await loanVToken.connect(f.supplier).repayBorrow(ethers.constants.MaxUint256);
          const collateralBefore = await collateral.token.balanceOf(f.supplier.address);
          await collateralVToken.connect(f.supplier).redeem(supplierTokens);
          expect((await collateral.token.balanceOf(f.supplier.address)).sub(collateralBefore)).to.equal(SUPPLIED);
        });

        it("4. a 5x pump does not raise borrowing power", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          const powerBeforePump = (await comptroller.getBorrowingPower(f.borrower.address)).liquidity;
          expect(powerBeforePump).to.equal(e18("10000"));

          await setPrice(collateral.feed, "10");
          expect((await comptroller.getBorrowingPower(f.borrower.address)).liquidity).to.equal(powerBeforePump);
          expect((await comptroller.getAccountLiquidity(f.borrower.address)).liquidity).to.equal(e18("60000"));
          await expect(borrow(f.borrower, loanVToken, powerBeforePump.add(1))).to.be.revertedWithCustomError(
            comptroller,
            "InsufficientLiquidity",
          );
          const usdtBefore = await f.usdt.balanceOf(f.borrower.address);
          await borrow(f.borrower, loanVToken, powerBeforePump);
          expect((await f.usdt.balanceOf(f.borrower.address)).sub(usdtBefore)).to.equal(powerBeforePump);
          expect(await dbo.currentlyUsingProtectedPrice(collateral.token.address)).to.equal(true);

          // The protected price outlives the cooldown; only a keeper narrowing the window ends it
          await advanceTime(f, DBO_COOLDOWN);
          expect(await dbo.canExitProtection(collateral.token.address)).to.equal(false);
          expect((await comptroller.getBorrowingPower(f.borrower.address)).liquidity).to.equal(0);
        });

        it("5. the guardian caps and pauses a pumped market", async () => {
          const { comptroller, collateral, collateralVToken } = pool;
          await setPrice(collateral.feed, "20");
          const price = await oracle.getUnderlyingPrice(collateralVToken.address);
          const tierCap = TIER_ONE_LIMITS.maxCollateralSupplyCapUsd.mul(EXP_SCALE).div(price);
          expect(usdValue(await comptroller.supplyCaps(collateralVToken.address), price)).to.be.gt(
            TIER_ONE_LIMITS.maxCollateralSupplyCapUsd,
          );

          await comptroller.connect(f.guardian).setMarketSupplyCaps([collateralVToken.address], [tierCap]);
          expect(await comptroller.supplyCaps(collateralVToken.address)).to.equal(tierCap);
          expect(usdValue(tierCap, price)).to.be.lte(TIER_ONE_LIMITS.maxCollateralSupplyCapUsd);
          await collateral.token.connect(f.supplier).faucet(tierCap);
          await collateral.token.connect(f.supplier).approve(collateralVToken.address, tierCap);
          await expect(collateralVToken.connect(f.supplier).mint(tierCap))
            .to.be.revertedWithCustomError(comptroller, "SupplyCapExceeded")
            .withArgs(collateralVToken.address, tierCap);

          await comptroller.connect(f.guardian).setActionsPaused([collateralVToken.address], [Action.MINT], true);
          await expect(collateralVToken.connect(f.supplier).mint(1))
            .to.be.revertedWithCustomError(comptroller, "ActionPaused")
            .withArgs(collateralVToken.address, Action.MINT);
        });

        it("6. a supply pause during a crash makes no account liquidatable", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("5000"));
          await supplyCollateral(f.supplier, collateral, collateralVToken, e18("1000"));
          await setPrice(collateral.feed, "1.6");
          const liquidityBefore = await comptroller.getAccountLiquidity(f.borrower.address);

          await f.manager.connect(f.deployer).pauseCollateralSupply(comptroller.address, collateralVToken.address);
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.supplyPause,
            collateralVToken.address,
          );
          await f.receiver.connect(f.keeper).processUpdate(updateId);
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Executed);

          const market = await comptroller.markets(collateralVToken.address);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
          expect(await comptroller.actionPaused(collateralVToken.address, Action.MINT)).to.equal(true);

          const liquidityAfter = await comptroller.getAccountLiquidity(f.borrower.address);
          expect(liquidityAfter.liquidity).to.equal(liquidityBefore.liquidity);
          expect(liquidityAfter.shortfall).to.equal(0);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("100"), collateralVToken.address),
          ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
          for (const user of [f.borrower, f.supplier]) {
            await expect(borrow(user, loanVToken, e18("1"))).to.be.revertedWithCustomError(
              comptroller,
              "InsufficientLiquidity",
            );
          }
          await expect(collateralVToken.connect(f.supplier).mint(1))
            .to.be.revertedWithCustomError(comptroller, "ActionPaused")
            .withArgs(collateralVToken.address, Action.MINT);
        });

        it("7. repay, redeem and liquidation work while borrowing is paused", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("8000"));

          await comptroller.connect(f.guardian).setActionsPaused([loanVToken.address], [Action.BORROW], true);
          await expect(borrow(f.borrower, loanVToken, e18("1")))
            .to.be.revertedWithCustomError(comptroller, "ActionPaused")
            .withArgs(loanVToken.address, Action.BORROW);

          const repay = e18("1000");
          await f.usdt.connect(f.borrower).approve(loanVToken.address, repay);
          await expect(loanVToken.connect(f.borrower).repayBorrow(repay))
            .to.emit(loanVToken, "RepayBorrow")
            .withArgs(f.borrower.address, f.borrower.address, repay, anyValue, anyValue);

          const collateralBefore = await collateral.token.balanceOf(f.borrower.address);
          await collateralVToken.connect(f.borrower).redeemUnderlying(e18("1000"));
          expect((await collateral.token.balanceOf(f.borrower.address)).sub(collateralBefore)).to.equal(e18("1000"));

          await setPrice(collateral.feed, "1.2");
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("2000"), collateralVToken.address),
          ).to.emit(loanVToken, "LiquidateBorrow");
        });

        it("8. a frozen lone feed halts borrows and liquidations until it is replaced", async () => {
          const { collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("5000"));

          await advanceTimeFreezing(f, MAX_STALE_PERIOD + 1, collateral.feed);
          await expect(oracle.getUnderlyingPrice(collateralVToken.address)).to.be.revertedWith(INVALID_PRICE);
          await expect(borrow(f.borrower, loanVToken, e18("1"))).to.be.revertedWith(INVALID_PRICE);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("100"), collateralVToken.address),
          ).to.be.revertedWith(INVALID_PRICE);

          const replacementFeed = await deployMockFeed(f, "0.8");
          await f.chainlinkOracle.connect(f.timelock)["setTokenConfig((address,address,uint256))"]({
            asset: collateral.token.address,
            feed: replacementFeed.address,
            maxStalePeriod: MAX_STALE_PERIOD,
          });
          expect(await oracle.getUnderlyingPrice(collateralVToken.address)).to.equal(priceMantissa("0.8"));
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("2000"), collateralVToken.address),
          ).to.emit(loanVToken, "LiquidateBorrow");
        });

        it("9. debt and residual debt are valued at a depegged loan asset's price", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("100"));
          await borrow(f.borrower, loanVToken, e18("10.5"));
          const borrowed = await loanVToken.borrowBalanceStored(f.borrower.address);
          const atPeg = await comptroller.getAccountLiquidity(f.borrower.address);

          await setPrice(f.usdtFeed, "0.9");
          const depegged = await comptroller.getAccountLiquidity(f.borrower.address);
          expect(depegged.liquidity.sub(atPeg.liquidity)).to.equal(
            borrowed.sub(borrowed.mul(e18("0.9")).div(EXP_SCALE)),
          );

          await exitPool(f, comptroller);
          await setPrice(f.usdtFeed, "1");
          await expect(f.manager.connect(f.team).closePool(comptroller.address))
            .to.be.revertedWithCustomError(f.manager, "ResidualDebtExceeded")
            .withArgs((debtUsd: BigNumber) => debtUsd.gt(MAX_RESIDUAL_POOL_DEBT_USD));
          await setPrice(f.usdtFeed, "0.9");
          await expect(f.manager.connect(f.team).closePool(comptroller.address))
            .to.emit(f.manager, "PoolClosed")
            .withArgs(comptroller.address);
        });

        it("10. an XVS crash blocks risk raises until the bond is topped up", async () => {
          const { comptroller, collateralVToken, bondAccount } = pool;
          const xvsPrice = priceMantissa("1.5");
          await setPrice(f.xvsFeed, "1.5");
          const requiredBondUsd = TIER_ONE_BOND_USD.mul(XVS_BOND_FACTOR).div(EXP_SCALE);
          const coverage = usdValue(await bondAccount.currentBondAmount(), xvsPrice)
            .mul(EXP_SCALE)
            .div(requiredBondUsd);
          expect(coverage).to.equal(e18("0.3"));

          const manager = f.manager.connect(f.deployer);
          await expect(
            manager.setCollateralFactor(comptroller.address, collateralVToken.address, e18("0.55"), e18("0.6")),
          )
            .to.be.revertedWithCustomError(f.manager, "CoverageTooLow")
            .withArgs(coverage, TIER_ONE_LIMITS.minCoverageRatio);
          await expect(manager.setCollateralSupplyCap(comptroller.address, collateralVToken.address, e18("120000")))
            .to.be.revertedWithCustomError(f.manager, "CoverageTooLow")
            .withArgs(coverage, TIER_ONE_LIMITS.minCoverageRatio);

          await manager.pauseCollateralSupply(comptroller.address, collateralVToken.address);
          await applyLatestUpdate(f, UpdateType.supplyPause, collateralVToken.address);
          expect(await comptroller.actionPaused(collateralVToken.address, Action.MINT)).to.equal(true);

          const coveredBond = requiredBondUsd.mul(TIER_ONE_LIMITS.minCoverageRatio).div(xvsPrice);
          const topUp = coveredBond.sub(await bondAccount.currentBondAmount());
          await fundXvs(f.xvs, f.deployer.address, topUp);
          await f.xvs.connect(f.deployer).approve(f.manager.address, topUp);
          await manager.topUpBond(comptroller.address, topUp);

          await expect(
            manager.setCollateralFactor(comptroller.address, collateralVToken.address, e18("0.55"), e18("0.6")),
          ).to.not.be.reverted;
          await manager.setCollateralSupplyCap(comptroller.address, collateralVToken.address, e18("120000"));
          await applyLatestUpdate(f, UpdateType.supplyCap, collateralVToken.address);
          expect(await comptroller.supplyCaps(collateralVToken.address)).to.equal(e18("120000"));
        });

        it("11. the deployer's next update waits for the previous one and the debounce", async () => {
          const { comptroller, collateralVToken } = pool;
          const vToken = collateralVToken.address;
          const manager = f.manager.connect(f.deployer);
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          expect((await receiver.getRiskParameterConfig(UpdateType.collateralFactors)).debounce).to.equal(2 * DAY);
          expect((await receiver.getRiskParameterConfig(UpdateType.supplyCap)).debounce).to.equal(DAY);
          const latestUpdateId = (updateType: string) =>
            f.riskOracle.getLatestUpdateIdByTypeAndMarket(updateType, vToken) as Promise<BigNumber>;

          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.6"), e18("0.7"));
          const firstId = await latestUpdateId(UpdateType.collateralFactors);
          await receiver.processUpdate(firstId);
          const { status, unlockTime } = await f.receiver.updates(firstId);
          expect(status).to.equal(UpdateStatus.Pending);
          await expect(manager.setCollateralFactor(comptroller.address, vToken, e18("0.55"), e18("0.7")))
            .to.be.revertedWithCustomError(f.manager, "PreviousUpdatePending")
            .withArgs(vToken);
          await advanceTime(f, unlockTime.sub(await time.latest()).toNumber());
          await receiver.executeRegisteredUpdate(firstId);
          expect((await comptroller.markets(vToken)).collateralFactorMantissa).to.equal(e18("0.6"));

          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.55"), e18("0.7"));
          const secondId = await latestUpdateId(UpdateType.collateralFactors);
          expect(secondId).to.not.equal(firstId);
          await expect(receiver.processUpdate(secondId)).to.be.revertedWithCustomError(receiver, "UpdateTooFrequent");

          await manager.setCollateralSupplyCap(comptroller.address, vToken, e18("150000"));
          const firstCapId = await applyLatestUpdate(f, UpdateType.supplyCap, vToken);
          const { executedAt } = await f.receiver.updates(firstCapId);
          await manager.setCollateralSupplyCap(comptroller.address, vToken, e18("120000"));
          const secondCapId = await latestUpdateId(UpdateType.supplyCap);
          await expect(receiver.processUpdate(secondCapId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateTooFrequent",
          );
          await advanceTime(
            f,
            executedAt
              .add(DAY)
              .sub(await time.latest())
              .toNumber(),
          );
          await applyLatestUpdate(f, UpdateType.supplyCap, vToken);
          expect(await comptroller.supplyCaps(vToken)).to.equal(e18("120000"));
        });

        it("12. an update that would expire before unlocking is refused, then dropped", async () => {
          const { comptroller, collateralVToken } = pool;
          const vToken = collateralVToken.address;
          const manager = f.manager.connect(f.deployer);
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          const { timelock } = await receiver.getRiskParameterConfig(UpdateType.collateralFactors);
          const expiration: BigNumber = await receiver.UPDATE_EXPIRATION_TIME();
          expect(expiration).to.equal(2 * DAY);

          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.6"), e18("0.7"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.collateralFactors, vToken);
          await advanceTime(f, expiration.sub(timelock).toNumber());
          await expect(receiver.processUpdate(updateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateWillExpireBeforeUnlock",
          );
          await expect(manager.setCollateralFactor(comptroller.address, vToken, e18("0.55"), e18("0.65")))
            .to.be.revertedWithCustomError(f.manager, "PreviousUpdatePending")
            .withArgs(vToken);

          await advanceTime(f, timelock.toNumber());
          await expect(receiver.processUpdate(updateId)).to.be.revertedWithCustomError(receiver, "UpdateIsExpired");
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.None);
          expect((await comptroller.markets(vToken)).collateralFactorMantissa).to.equal(e18("0.5"));

          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.55"), e18("0.65"));
          await applyLatestUpdate(f, UpdateType.collateralFactors, vToken);
          const market = await comptroller.markets(vToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.55"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.65"));
        });

        it("13. a pending update becomes executable once it unlocks", async () => {
          const { comptroller, collateralVToken } = pool;
          const vToken = collateralVToken.address;
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          const executable = async (updateType: string) =>
            ((await receiver.getExecutableUpdates(updateType, comptroller.address)) as BigNumber[]).map(String);

          await f.manager.connect(f.deployer).setCollateralFactor(comptroller.address, vToken, e18("0.6"), e18("0.7"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.collateralFactors, vToken);
          await receiver.processUpdate(updateId);
          expect(await executable(UpdateType.collateralFactors)).to.deep.equal([]);

          const { unlockTime } = await f.receiver.updates(updateId);
          await advanceTime(f, unlockTime.sub(await time.latest()).toNumber());
          expect(await executable(UpdateType.collateralFactors)).to.deep.equal([updateId.toString()]);
          expect(await executable(UpdateType.supplyCap)).to.deep.equal([]);

          await receiver.executeRegisteredUpdate(updateId);
          expect(await executable(UpdateType.collateralFactors)).to.deep.equal([]);
          expect((await comptroller.markets(vToken)).collateralFactorMantissa).to.equal(e18("0.6"));
        });

        it("14. the keeper rejects a raise when the price crashes during its timelock", async () => {
          const { comptroller, collateral, collateralVToken } = pool;
          const vToken = collateralVToken.address;
          const manager = f.manager.connect(f.deployer);
          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.6"), e18("0.7"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.collateralFactors, vToken);
          await f.receiver.connect(f.keeper).processUpdate(updateId);

          await setPrice(collateral.feed, "1.2");
          await f.receiver.connect(f.keeper).rejectUpdate(updateId);
          const { unlockTime } = await f.receiver.updates(updateId);
          await advanceTime(f, unlockTime.sub(await time.latest()).toNumber());
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          await expect(receiver.executeRegisteredUpdate(updateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateAlreadyResolved",
          );
          expect((await comptroller.markets(vToken)).collateralFactorMantissa).to.equal(e18("0.5"));

          // A rejected update no longer blocks the deployer's next one
          await manager.setCollateralFactor(comptroller.address, vToken, e18("0.45"), e18("0.6"));
          await applyLatestUpdate(f, UpdateType.collateralFactors, vToken);
          expect((await comptroller.markets(vToken)).collateralFactorMantissa).to.equal(e18("0.45"));
        });

        it("15. the guardian pauses supply directly while the keeper is offline", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const vToken = collateralVToken.address;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("5000"));
          await setPrice(collateral.feed, "1.6");

          await f.manager.connect(f.deployer).pauseCollateralSupply(comptroller.address, vToken);
          const publishedAt = await time.latest();
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.supplyPause, vToken);
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.None);
          await supplyCollateral(f.supplier, collateral, collateralVToken, e18("1000"));

          // What the supply pause steward would apply: mint paused, collateral factor 0, threshold kept
          await comptroller.connect(f.guardian).setActionsPaused([vToken], [Action.MINT], true);
          await comptroller.connect(f.guardian).setCollateralFactor(vToken, 0, e18("0.6"));
          await expect(collateralVToken.connect(f.supplier).mint(1))
            .to.be.revertedWithCustomError(comptroller, "ActionPaused")
            .withArgs(vToken, Action.MINT);
          expect((await comptroller.getAccountLiquidity(f.borrower.address)).shortfall).to.equal(0);

          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          const expiration: BigNumber = await receiver.UPDATE_EXPIRATION_TIME();
          await advanceTime(f, publishedAt + expiration.toNumber() + 1 - (await time.latest()));
          await expect(receiver.processUpdate(updateId)).to.be.revertedWithCustomError(receiver, "UpdateIsExpired");
        });

        it("16. full utilization charges the top rate, and repaying frees Hub liquidity", async () => {
          const { collateral, collateralVToken, loanVToken } = pool;
          const rateModel = f.loanInterestRateModel;
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("99000"));
          const available = (await loanVToken.getCash()).sub(await loanVToken.totalReserves());
          await borrow(f.borrower, loanVToken, available);

          const [cash, borrows, reserves, badDebt] = await Promise.all([
            loanVToken.getCash(),
            loanVToken.totalBorrows(),
            loanVToken.totalReserves(),
            loanVToken.badDebt(),
          ]);
          expect(await rateModel.utilizationRate(cash, borrows, reserves, badDebt)).to.equal(EXP_SCALE);
          expect(await loanVToken.interestRateModel()).to.equal(rateModel.address);
          expect(await loanVToken.borrowRatePerBlock()).to.equal(await rateModel.getBorrowRate(0, 1, 0, 0));

          const hub = await impersonate(f.hub.address);
          expect(await f.adapter.maxWithdraw(loanVToken.address, f.yieldGroup.address)).to.equal(0);
          await expect(f.yieldGroup.connect(hub).withdraw(1, f.outsider.address, { gasLimit: 3_000_000 })).to.be
            .reverted;

          await f.usdt.connect(f.borrower).approve(loanVToken.address, e18("20000"));
          await loanVToken.connect(f.borrower).repayBorrow(e18("20000"));
          expect(await f.adapter.maxWithdraw(loanVToken.address, f.yieldGroup.address)).to.be.gte(e18("10000"));
          const outsiderBefore = await f.usdt.balanceOf(f.outsider.address);
          await f.yieldGroup.connect(hub).withdraw(e18("10000"), f.outsider.address, { gasLimit: 3_000_000 });
          expect((await f.usdt.balanceOf(f.outsider.address)).sub(outsiderBefore)).to.equal(e18("10000"));
        });
      });

      describe("on a pool built per test", () => {
        before(async () => {
          f = await loadOpenSpokeFixture();
          oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
          snapshot = await snapshotFixture(f);
        });

        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await snapshot.restore();
        });

        /// A pool with the given collateral markets and a USDT loan market wired on the Hub and funded through it
        async function openFundedPoolWith(f: OpenSpokeFixture, collateralMarkets: CollateralMarketParams[]) {
          const pool = await openPool(f, f.deployer, { collateralMarkets, loanMarkets: [usdtLoanMarket(f)] });
          await wireHubQueues(f, [pool.loanVTokens[0].address]);
          await depositToHub(f, LIQUIDITY);
          return { ...pool, collateralVToken: pool.collateralVTokens[0], loanVToken: pool.loanVTokens[0] };
        }

        it("17. the guardian pauses supply once a pump lifts the cap above the tier limit", async () => {
          const collateral = await newCollateralToken(f, "PMP", "2");
          const { comptroller, collateralVTokens } = await openPool(f, f.deployer, {
            collateralMarkets: [collateralMarket(collateral, { supplyCap: e18("400000") })],
            loanMarkets: [usdtLoanMarket(f)],
          });
          const vToken = collateralVTokens[0].address;

          await setPrice(collateral.feed, "10");
          await advanceTime(f, 24 * 3600);
          const capUsd = usdValue(await comptroller.supplyCaps(vToken), await oracle.getUnderlyingPrice(vToken));
          expect(capUsd).to.be.gt(TIER_ONE_LIMITS.maxCollateralSupplyCapUsd);

          await comptroller.connect(f.guardian).setActionsPaused([vToken], [Action.MINT], true);
          await collateral.token.connect(f.supplier).faucet(e18("1"));
          await collateral.token.connect(f.supplier).approve(vToken, e18("1"));
          await expect(collateralVTokens[0].connect(f.supplier).mint(e18("1")))
            .to.be.revertedWithCustomError(comptroller, "ActionPaused")
            .withArgs(vToken, Action.MINT);
        });

        it("18. the fallback feed takes over once the main feed goes stale", async () => {
          const collateral = await newCollateralToken(f, "TRI", "2");
          const pivotFeed = await deployMockFeed(f, "2");
          const fallbackFeed = await deployMockFeed(f, "2");
          const mainStalePeriod = 3600;
          const pool = await openFundedPoolWith(f, [
            collateralMarket(collateral, {
              feeds: [
                {
                  oracle: bscmainnet.CHAINLINK_ORACLE,
                  feed: collateral.feed.address,
                  maxStalePeriod: mainStalePeriod,
                },
                { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivotFeed.address, maxStalePeriod: MAX_STALE_PERIOD },
                { oracle: f.thirdOracle.address, feed: fallbackFeed.address, maxStalePeriod: MAX_STALE_PERIOD },
              ],
            }),
          ]);
          const { comptroller, collateralVToken, loanVToken } = pool;
          await fundLiquidator(f, loanVToken);
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("5000"));

          // Well within the default stale period: only the main feed's own one-hour limit makes it stale
          await advanceTimeFreezing(f, mainStalePeriod + 1, collateral.feed);
          await setPrice(pivotFeed, "0.81");
          await setPrice(fallbackFeed, "0.8");
          expect(await oracle.getUnderlyingPrice(collateralVToken.address)).to.equal(priceMantissa("0.8"));

          const repay = e18("2000");
          const { seizeTokens } = await expectedSeizure(comptroller, loanVToken, collateralVToken, repay);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, repay, collateralVToken.address),
          )
            .to.emit(loanVToken, "LiquidateBorrow")
            .withArgs(f.liquidator.address, f.borrower.address, repay, collateralVToken.address, seizeTokens);
        });

        it("19. a main feed deviating from its pivot halts borrows and liquidations", async () => {
          const collateral = await newCollateralToken(f, "DEV", "2");
          const pivotFeed = await deployMockFeed(f, "2");
          const pool = await openFundedPoolWith(f, [
            collateralMarket(collateral, {
              feeds: [
                {
                  oracle: bscmainnet.CHAINLINK_ORACLE,
                  feed: collateral.feed.address,
                  maxStalePeriod: MAX_STALE_PERIOD,
                },
                { oracle: bscmainnet.REDSTONE_ORACLE, feed: pivotFeed.address, maxStalePeriod: MAX_STALE_PERIOD },
                NO_FEED,
              ],
            }),
          ]);
          const { comptroller, collateralVToken, loanVToken } = pool;
          await fundLiquidator(f, loanVToken);
          await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
          await borrow(f.borrower, loanVToken, e18("5000"));
          const liquidate = () =>
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("1000"), collateralVToken.address);

          await setPrice(collateral.feed, "0.5");
          await expect(oracle.getUnderlyingPrice(collateralVToken.address)).to.be.revertedWith(INVALID_PRICE);
          await expect(liquidate()).to.be.revertedWith(INVALID_PRICE);
          await expect(borrow(f.borrower, loanVToken, e18("1"))).to.be.revertedWith(INVALID_PRICE);

          await setPrice(collateral.feed, "2");
          expect(await oracle.getUnderlyingPrice(collateralVToken.address)).to.equal(priceMantissa("2"));
          await expect(liquidate()).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
          await expect(borrow(f.borrower, loanVToken, e18("1000"))).to.not.be.reverted;
        });

        it("20. the team repays bad debt that an XVS bond on XVS collateral cannot cover", async () => {
          await fundXvs(f.xvs, f.deployer.address, e18("10"));
          const pool = await openFundedPoolWith(f, [
            {
              asset: XVS,
              collateralFactor: e18("0.5"),
              liquidationThreshold: e18("0.6"),
              supplyCap: e18("100000"),
              feeds: [
                { oracle: bscmainnet.CHAINLINK_ORACLE, feed: f.xvsFeed.address, maxStalePeriod: MAX_STALE_PERIOD },
                NO_FEED,
                NO_FEED,
              ],
            },
          ]);
          const { comptroller, collateralVToken: xvsVToken, loanVToken, bondAccount } = pool;
          await fundLiquidator(f, loanVToken);
          const supplied = e18("20000");
          await fundXvs(f.xvs, f.borrower.address, supplied);
          await f.xvs.connect(f.borrower).approve(xvsVToken.address, supplied);
          await xvsVToken.connect(f.borrower).mint(supplied);
          await comptroller.connect(f.borrower).enterMarkets([xvsVToken.address]);
          const { liquidity: borrowingPower } = await comptroller.getBorrowingPower(f.borrower.address);
          await borrow(f.borrower, loanVToken, borrowingPower.mul(99).div(100));

          await setPrice(f.xvsFeed, "0.25");
          await loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, e18("4500"), xvsVToken.address);
          const debt = await debtSnapshot(loanVToken, f.borrower.address);
          const maxClearable = await maxClearableDebt(comptroller, xvsVToken, f.borrower.address);
          const badDebt = (await debtAtNextBlock(loanVToken, debt)).sub(maxClearable);
          await comptroller.connect(f.liquidator).healAccount(f.borrower.address);
          expect(await loanVToken.badDebt()).to.equal(badDebt);

          const [debtPrice, xvsPrice] = await Promise.all([
            oracle.getUnderlyingPrice(loanVToken.address),
            oracle.getPrice(XVS),
          ]);
          const bond = await bondAccount.currentBondAmount();
          const recoverable = bond.mul(xvsPrice).div(debtPrice);
          const uncovered = badDebt.sub(recoverable);
          expect(uncovered).to.be.gt(0);

          const seized = await recoverFromBond(f, { comptroller, loanVToken }, recoverable);
          expect(seized).to.equal(bond);
          expect(await bondAccount.currentBondAmount()).to.equal(0);
          expect(await loanVToken.badDebt()).to.equal(uncovered);

          await fundUsdt(f.usdt, bscmainnet.NORMAL_TIMELOCK, uncovered);
          await f.usdt.connect(f.timelock).approve(f.shortfall.address, uncovered);
          await expect(f.shortfall.connect(f.timelock).repayBadDebt(loanVToken.address, uncovered))
            .to.emit(f.shortfall, "BadDebtRepaid")
            .withArgs(comptroller.address, loanVToken.address, bscmainnet.NORMAL_TIMELOCK, uncovered);
          expect(await loanVToken.badDebt()).to.equal(0);
        });
      });
    });

    describe("liquidations", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };

      describe("on a funded pool", () => {
        let pool: Awaited<ReturnType<typeof openFundedPool>>;
        let smallAccounts: SignerWithAddress[];

        before(async () => {
          f = await loadOpenSpokeFixture();
          smallAccounts = (await ethers.getSigners()).slice(13, 16);
          pool = await openFundedPool(f, LIQUIDITY);
          await fundLiquidator(f, pool.loanVToken);
          snapshot = await snapshotFixture(f);
        });

        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await snapshot.restore();
        });

        const liquidate = (borrower: SignerWithAddress, repay: BigNumber) =>
          pool.loanVToken.connect(f.liquidator).liquidateBorrow(borrower.address, repay, pool.collateralVToken.address);

        /// Exits the pool, waits out the wind-down and executes the force close VIP
        async function forceClose(f: OpenSpokeFixture, comptroller: SpokeComptroller) {
          await exitPool(f, comptroller);
          await advanceTime(f, WIND_DOWN_PERIOD);
          await f.manager.connect(f.team).buildForceCloseProposal(comptroller.address, "Force close");
          await executeVip(f, await f.manager.exitProposals(comptroller.address));
        }

        it("21. the liquidator gets the repaid debt times the incentive, within the close factor", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("9000"));
          await setPrice(collateral.feed, "1.4");

          await expect(liquidate(f.borrower, e18("4600"))).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");

          const repay = e18("4000");
          const seizure = await expectedSeizure(comptroller, loanVToken, collateralVToken, repay);
          const [borrowerTokensBefore, liquidatorTokensBefore, totalSupplyBefore, usdtBefore] = await Promise.all([
            collateralVToken.balanceOf(f.borrower.address),
            collateralVToken.balanceOf(f.liquidator.address),
            collateralVToken.totalSupply(),
            f.usdt.balanceOf(f.liquidator.address),
          ]);
          await expect(liquidate(f.borrower, repay))
            .to.emit(loanVToken, "LiquidateBorrow")
            .withArgs(f.liquidator.address, f.borrower.address, repay, collateralVToken.address, seizure.seizeTokens);

          expect(usdtBefore.sub(await f.usdt.balanceOf(f.liquidator.address))).to.equal(repay);
          expect(borrowerTokensBefore.sub(await collateralVToken.balanceOf(f.borrower.address))).to.equal(
            seizure.seizeTokens,
          );
          expect((await collateralVToken.balanceOf(f.liquidator.address)).sub(liquidatorTokensBefore)).to.equal(
            seizure.liquidatorTokens,
          );
          expect(totalSupplyBefore.sub(await collateralVToken.totalSupply())).to.equal(seizure.protocolTokens);
          expect(seizure.seizeTokens.mul(seizure.exchangeRate).div(EXP_SCALE)).to.be.closeTo(
            repay.mul(seizure.incentive).div(seizure.collateralPrice),
            seizure.exchangeRate.div(EXP_SCALE),
          );

          const collateralBefore = await collateral.token.balanceOf(f.liquidator.address);
          await collateralVToken.connect(f.liquidator).redeem(seizure.liquidatorTokens);
          expect((await collateral.token.balanceOf(f.liquidator.address)).sub(collateralBefore)).to.equal(
            seizure.liquidatorTokens.mul(seizure.exchangeRate).div(EXP_SCALE),
          );
        });

        it("22. the protocol seize share goes to the PSR, booked to the pool", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const psr = await ethers.getContractAt(PSR_ABI, bscmainnet.PSR);
          await supplyCollateral(f.borrower, collateral, collateralVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("9000"));
          await setPrice(collateral.feed, "1.4");

          const repay = e18("4000");
          const seizure = await expectedSeizure(comptroller, loanVToken, collateralVToken, repay);
          expect(await collateralVToken.protocolSeizeShareMantissa()).to.equal(e18("0.05"));
          const protocolAmount = seizure.protocolTokens.mul(seizure.exchangeRate).div(EXP_SCALE);
          const cashBefore = await collateralVToken.getCash();
          await expect(liquidate(f.borrower, repay))
            .to.emit(collateralVToken, "ProtocolSeize")
            .withArgs(f.borrower.address, bscmainnet.PSR, protocolAmount)
            .and.to.emit(psr, "AssetsReservesUpdated")
            .withArgs(
              comptroller.address,
              collateral.token.address,
              protocolAmount,
              IncomeType.LIQUIDATION,
              Schema.ADDITIONAL_REVENUE,
            );

          expect(cashBefore.sub(await collateralVToken.getCash())).to.equal(protocolAmount);
          expect(await collateral.token.balanceOf(bscmainnet.PSR)).to.equal(protocolAmount);
          expect(await psr.totalAssetReserve(collateral.token.address)).to.equal(protocolAmount);
          expect(
            await psr.assetsReserves(comptroller.address, collateral.token.address, Schema.ADDITIONAL_REVENUE),
          ).to.equal(protocolAmount);
        });

        it("23. the loan market's reserves move to the PSR once the block delta passes", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const psr = await ethers.getContractAt(PSR_ABI, bscmainnet.PSR);
          await supplyCollateral(f.borrower, collateral, collateralVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("8000"));
          const delta = await loanVToken.reduceReservesBlockDelta();
          expect(delta).to.equal(100);
          const [psrBalanceBefore, psrTotalBefore, poolReservesBefore] = await Promise.all([
            f.usdt.balanceOf(bscmainnet.PSR),
            psr.totalAssetReserve(bscmainnet.USDT),
            psr.assetsReserves(comptroller.address, bscmainnet.USDT, Schema.PROTOCOL_RESERVES),
          ]);

          // One block before the delta, accrued reserves stay in the market
          const reductionBlock = (await loanVToken.reduceReservesBlockNumber()).add(delta).toNumber();
          await mine(reductionBlock - 2 - (await ethers.provider.getBlockNumber()));
          await loanVToken.accrueInterest();
          expect(await loanVToken.totalReserves()).to.be.gt(0);
          expect(await f.usdt.balanceOf(bscmainnet.PSR)).to.equal(psrBalanceBefore);

          const [rate, borrows, reserves, accrualBlock, reserveFactor] = await Promise.all([
            loanVToken.borrowRatePerBlock(),
            loanVToken.totalBorrows(),
            loanVToken.totalReserves(),
            loanVToken.accrualBlockNumber(),
            loanVToken.reserveFactorMantissa(),
          ]);
          const interest = rate
            .mul(reductionBlock - accrualBlock.toNumber())
            .mul(borrows)
            .div(EXP_SCALE);
          const reduced = reserveFactor.mul(interest).div(EXP_SCALE).add(reserves);
          await expect(loanVToken.reduceReserves(reduced))
            .to.emit(loanVToken, "SpreadReservesReduced")
            .withArgs(bscmainnet.PSR, reduced, 0)
            .and.to.emit(psr, "AssetsReservesUpdated")
            .withArgs(comptroller.address, bscmainnet.USDT, reduced, IncomeType.SPREAD, Schema.PROTOCOL_RESERVES);

          expect(await loanVToken.totalReserves()).to.equal(0);
          expect((await f.usdt.balanceOf(bscmainnet.PSR)).sub(psrBalanceBefore)).to.equal(reduced);
          expect((await psr.totalAssetReserve(bscmainnet.USDT)).sub(psrTotalBefore)).to.equal(reduced);
          expect(
            (await psr.assetsReserves(comptroller.address, bscmainnet.USDT, Schema.PROTOCOL_RESERVES)).sub(
              poolReservesBefore,
            ),
          ).to.equal(reduced);
        });

        it("24. liquidateAccount clears a small solvent account", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const [account] = smallAccounts;
          await supplyCollateral(account, collateral, collateralVToken, e18("100"));
          await borrow(account, loanVToken, e18("60"));
          const debt = await debtSnapshot(loanVToken, account.address);

          await setPrice(collateral.feed, "0.9");
          await expect(liquidate(account, e18("10")))
            .to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated")
            .withArgs(POOL_PARAMS.minLiquidatableCollateral, e18("90"));

          const repay = await debtAtNextBlock(loanVToken, debt);
          const seizure = await expectedSeizure(comptroller, loanVToken, collateralVToken, repay);
          const tokensBefore = await collateralVToken.balanceOf(account.address);
          await comptroller
            .connect(f.liquidator)
            .liquidateAccount(account.address, [
              { vTokenCollateral: collateralVToken.address, vTokenBorrowed: loanVToken.address, repayAmount: repay },
            ]);

          expect(await loanVToken.borrowBalanceStored(account.address)).to.equal(0);
          expect(await collateralVToken.balanceOf(account.address)).to.equal(tokensBefore.sub(seizure.seizeTokens));
          expect(await loanVToken.badDebt()).to.equal(0);
        });

        it("25. healAccount writes off an underwater small account as bad debt", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const [account] = smallAccounts;
          await supplyCollateral(account, collateral, collateralVToken, e18("100"));
          await borrow(account, loanVToken, e18("90"));
          const debt = await debtSnapshot(loanVToken, account.address);

          await setPrice(collateral.feed, "0.9");
          const maxClearable = await maxClearableDebt(comptroller, collateralVToken, account.address);
          const orders = [
            { vTokenCollateral: collateralVToken.address, vTokenBorrowed: loanVToken.address, repayAmount: 1 },
          ];
          const debtWhenLiquidated = await debtAtNextBlock(loanVToken, debt);
          await expect(comptroller.connect(f.liquidator).liquidateAccount(account.address, orders))
            .to.be.revertedWithCustomError(comptroller, "DebtExceedsClearableAmount")
            .withArgs(debtWhenLiquidated, maxClearable);

          const badDebt = (await debtAtNextBlock(loanVToken, debt)).sub(maxClearable);
          const usdtBefore = await f.usdt.balanceOf(f.liquidator.address);
          await expect(comptroller.connect(f.liquidator).healAccount(account.address))
            .to.emit(loanVToken, "BadDebtIncreased")
            .withArgs(account.address, badDebt, 0, badDebt);
          expect(usdtBefore.sub(await f.usdt.balanceOf(f.liquidator.address))).to.equal(maxClearable);
          expect(await loanVToken.borrowBalanceStored(account.address)).to.equal(0);
          expect(await collateralVToken.balanceOf(account.address)).to.equal(0);
        });

        it("26. the liquidator allowlist blocks other liquidators", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const [account] = smallAccounts;
          await supplyCollateral(account, collateral, collateralVToken, e18("100"));
          await borrow(account, loanVToken, e18("90"));
          await supplyCollateral(f.borrower, collateral, collateralVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("9000"));
          await setPrice(collateral.feed, "0.9");

          await comptroller.connect(f.timelock).setLiquidationAllowlistEnabled(true);
          await comptroller.connect(f.timelock).setAllowedLiquidator(f.liquidator.address, true);
          await fundLiquidator(f, loanVToken, f.outsider);
          await expect(comptroller.connect(f.outsider).healAccount(account.address))
            .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
            .withArgs(f.outsider.address);
          await expect(
            loanVToken.connect(f.outsider).liquidateBorrow(f.borrower.address, e18("1000"), collateralVToken.address),
          )
            .to.be.revertedWithCustomError(comptroller, "LiquidationNotAllowed")
            .withArgs(f.outsider.address);

          await expect(comptroller.connect(f.liquidator).healAccount(account.address)).to.emit(
            loanVToken,
            "BadDebtIncreased",
          );
          await expect(liquidate(f.borrower, e18("1000"))).to.emit(loanVToken, "LiquidateBorrow");
        });

        it("27. the deployer cannot cut a liquidation threshold", async () => {
          const { comptroller, collateralVToken } = pool;
          await expect(
            f.manager
              .connect(f.deployer)
              .setCollateralFactor(comptroller.address, collateralVToken.address, e18("0.5"), e18("0.55")),
          )
            .to.be.revertedWithCustomError(f.manager, "InvalidCollateralFactors")
            .withArgs(collateralVToken.address);
          expect((await comptroller.markets(collateralVToken.address)).liquidationThresholdMantissa).to.equal(
            e18("0.6"),
          );
        });

        it("28. a CF raise, cap cut or supply pause liquidates no healthy account", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          await supplyCollateral(f.borrower, collateral, collateralVToken, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("9000"));
          await setPrice(collateral.feed, "1.55");
          const expectHealthy = async () => {
            expect((await comptroller.getAccountLiquidity(f.borrower.address)).shortfall).to.equal(0);
            await expect(liquidate(f.borrower, e18("100"))).to.be.revertedWithCustomError(
              comptroller,
              "InsufficientShortfall",
            );
          };
          await expectHealthy();
          const manager = f.manager.connect(f.deployer);

          await manager.setCollateralFactor(comptroller.address, collateralVToken.address, e18("0.55"), e18("0.65"));
          await applyLatestUpdate(f, UpdateType.collateralFactors, collateralVToken.address);
          expect((await comptroller.markets(collateralVToken.address)).collateralFactorMantissa).to.equal(e18("0.55"));
          await expectHealthy();

          await manager.setCollateralSupplyCap(comptroller.address, collateralVToken.address, e18("5000"));
          await applyLatestUpdate(f, UpdateType.supplyCap, collateralVToken.address);
          expect(await comptroller.supplyCaps(collateralVToken.address)).to.equal(e18("5000"));
          await expectHealthy();

          await manager.pauseCollateralSupply(comptroller.address, collateralVToken.address);
          await applyLatestUpdate(f, UpdateType.supplyPause, collateralVToken.address);
          const market = await comptroller.markets(collateralVToken.address);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.65"));
          await expectHealthy();
        });

        it("29. after an exit, only accounts under the lower threshold are liquidatable", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const [safe, unsafe, repaying] = [f.supplier, f.borrower, f.outsider];
          for (const [user, debt] of [
            [safe, e18("3000")],
            [unsafe, e18("9000")],
            [repaying, e18("5000")],
          ] as [SignerWithAddress, BigNumber][]) {
            await supplyCollateral(user, collateral, collateralVToken, SUPPLIED);
            await borrow(user, loanVToken, debt);
          }
          const suppliedTokens = await collateralVToken.balanceOf(safe.address);

          await exitPool(f, comptroller, e18("0.4"));
          const market = await comptroller.markets(collateralVToken.address);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.4"));

          expect((await comptroller.getAccountLiquidity(safe.address)).shortfall).to.equal(0);
          await expect(liquidate(safe, e18("100"))).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
          expect(await collateralVToken.balanceOf(safe.address)).to.equal(suppliedTokens);

          expect((await comptroller.getAccountLiquidity(unsafe.address)).shortfall).to.be.gt(0);
          await expect(liquidate(unsafe, e18("4000"))).to.emit(loanVToken, "LiquidateBorrow");

          await fundUsdt(f.usdt, repaying.address, e18("100"));
          await f.usdt.connect(repaying).approve(loanVToken.address, ethers.constants.MaxUint256);
          await loanVToken.connect(repaying).repayBorrow(ethers.constants.MaxUint256);
          expect(await loanVToken.borrowBalanceStored(repaying.address)).to.equal(0);
          const collateralBefore = await collateral.token.balanceOf(repaying.address);
          await collateralVToken.connect(repaying).redeem(await collateralVToken.balanceOf(repaying.address));
          expect((await collateral.token.balanceOf(repaying.address)).sub(collateralBefore)).to.equal(SUPPLIED);
        });

        it("30. a force close liquidates every borrower at the incentive", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          for (const user of [f.supplier, f.borrower]) {
            await supplyCollateral(user, collateral, collateralVToken, SUPPLIED);
          }
          await borrow(f.supplier, loanVToken, e18("3000"));
          await borrow(f.borrower, loanVToken, e18("5000"));
          const borrowerDebt = await debtSnapshot(loanVToken, f.borrower.address);

          await forceClose(f, comptroller);
          const market = await comptroller.markets(collateralVToken.address);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(0);
          expect(await comptroller.isForcedLiquidationEnabled(loanVToken.address)).to.equal(true);

          const liquidations: [SignerWithAddress, () => Promise<BigNumber>][] = [
            [f.supplier, async () => e18("2000")],
            [f.borrower, () => debtAtNextBlock(loanVToken, borrowerDebt)],
          ];
          for (const [user, repayAmount] of liquidations) {
            const repay = await repayAmount();
            const seizure = await expectedSeizure(comptroller, loanVToken, collateralVToken, repay);
            const tokensBefore = await collateralVToken.balanceOf(user.address);
            await expect(liquidate(user, repay))
              .to.emit(loanVToken, "LiquidateBorrow")
              .withArgs(f.liquidator.address, user.address, repay, collateralVToken.address, seizure.seizeTokens);
            expect(await collateralVToken.balanceOf(user.address)).to.equal(tokensBefore.sub(seizure.seizeTokens));
          }
          expect(await loanVToken.borrowBalanceStored(f.borrower.address)).to.equal(0);
        });

        it("31. a force close clears every debt, small accounts included", async () => {
          const { comptroller, collateral, collateralVToken, loanVToken } = pool;
          const [forcedSmall, unforcedSmall, underwaterSmall] = smallAccounts;
          const positions: [SignerWithAddress, BigNumber, BigNumber][] = [
            [f.borrower, SUPPLIED, e18("3000")],
            [forcedSmall, e18("45"), e18("40")],
            [unforcedSmall, e18("45"), e18("40")],
            [underwaterSmall, e18("45"), e18("44")],
          ];
          const debts = new Map<string, { principal: BigNumber; interestIndex: BigNumber }>();
          for (const [user, supplied, debt] of positions) {
            await supplyCollateral(user, collateral, collateralVToken, supplied);
            await borrow(user, loanVToken, debt);
            debts.set(user.address, await debtSnapshot(loanVToken, user.address));
          }
          const fullDebt = (user: SignerWithAddress) => debtAtNextBlock(loanVToken, debts.get(user.address)!);

          await forceClose(f, comptroller);
          for (const user of [forcedSmall, f.borrower]) {
            await expect(liquidate(user, await fullDebt(user))).to.emit(loanVToken, "LiquidateBorrow");
          }

          // Without forced liquidation, a small account can only be cleared through liquidateAccount
          await comptroller.connect(f.timelock).setForcedLiquidation(loanVToken.address, false);
          await expect(liquidate(unforcedSmall, e18("10")))
            .to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated")
            .withArgs(POOL_PARAMS.minLiquidatableCollateral, e18("90"));
          await comptroller.connect(f.liquidator).liquidateAccount(unforcedSmall.address, [
            {
              vTokenCollateral: collateralVToken.address,
              vTokenBorrowed: loanVToken.address,
              repayAmount: await fullDebt(unforcedSmall),
            },
          ]);

          await setPrice(collateral.feed, "0.9");
          await comptroller.connect(f.liquidator).healAccount(underwaterSmall.address);

          for (const [user] of positions) {
            expect(await loanVToken.borrowBalanceStored(user.address)).to.equal(0);
          }
        });
      });

      describe("with a pausable collateral token", () => {
        let pool: Awaited<ReturnType<typeof openFundedPausablePool>>;

        before(async () => {
          f = await loadOpenSpokeFixture();
          pool = await openFundedPausablePool(f);
          await fundLiquidator(f, pool.loanVToken);
          snapshot = await snapshotFixture(f);
        });

        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await snapshot.restore();
        });

        const supplyPausable = async (user: SignerWithAddress, amount: BigNumber) => {
          await pool.token.allocateTo(user.address, amount);
          await pool.token.connect(user).approve(pool.collateralVToken.address, amount);
          await pool.collateralVToken.connect(user).mint(amount);
          await pool.comptroller.connect(user).enterMarkets([pool.collateralVToken.address]);
        };

        /// A funded pool whose collateral token can be made to fail every transfer, like a paused or blocklisting token
        async function openFundedPausablePool(f: OpenSpokeFixture) {
          const token = (await (
            await ethers.getContractFactory("EvilToken", f.admin)
          ).deploy(e18("1000000000"), "Pausable Token", 18, "PAUSE")) as EvilToken;
          await token.setFail(false);
          const feed = await deployMockFeed(f, "2");
          await token.allocateTo(f.deployer.address, e18("1000"));
          const pool = await openPool(f, f.deployer, {
            collateralMarkets: [collateralMarket({ token: token as unknown as MockToken, feed })],
            loanMarkets: [usdtLoanMarket(f)],
          });
          await wireHubQueues(f, [pool.loanVTokens[0].address]);
          await depositToHub(f, LIQUIDITY);
          return { ...pool, token, feed, collateralVToken: pool.collateralVTokens[0], loanVToken: pool.loanVTokens[0] };
        }

        // VToken._seize sends the protocol share to the PSR in the underlying, so a paused token reverts every seizure
        it("32. a paused collateral token blocks every seizure", async () => {
          const { comptroller, collateralVToken, loanVToken, token, feed } = pool;
          await supplyPausable(f.borrower, SUPPLIED);
          await borrow(f.borrower, loanVToken, e18("9000"));
          await setPrice(feed, "1.4");
          await token.setFail(true);

          const repay = e18("4000");
          const borrowerTokensBefore = await collateralVToken.balanceOf(f.borrower.address);
          await expect(
            loanVToken.connect(f.liquidator).liquidateBorrow(f.borrower.address, repay, collateralVToken.address),
          ).to.be.revertedWith("SafeERC20: ERC20 operation did not succeed");
          expect(await collateralVToken.balanceOf(f.borrower.address)).to.equal(borrowerTokensBefore);
          expect(await comptroller.isMarketListed(collateralVToken.address)).to.equal(true);
        });

        it("33. a paused collateral token's bad debt stays recoverable from the bond", async () => {
          const { comptroller, collateralVToken, loanVToken, token, feed } = pool;
          await supplyPausable(f.borrower, e18("100"));
          await borrow(f.borrower, loanVToken, e18("90"));
          await setPrice(feed, "0.9");
          await comptroller.connect(f.liquidator).healAccount(f.borrower.address);
          const badDebt = await loanVToken.badDebt();
          expect(badDebt).to.be.gt(0);

          await token.setFail(true);
          const seizedTokens = await collateralVToken.balanceOf(f.liquidator.address);
          expect(seizedTokens).to.be.gt(0);
          await expect(collateralVToken.connect(f.liquidator).redeem(seizedTokens)).to.be.reverted;

          const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
          const seized = badDebt
            .mul(await oracle.getUnderlyingPrice(loanVToken.address))
            .div(await oracle.getPrice(XVS));
          await fundUsdt(f.usdt, f.recoverer.address, badDebt);
          await f.usdt.connect(f.recoverer).approve(f.shortfall.address, badDebt);
          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(loanVToken.address, badDebt))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(comptroller.address, loanVToken.address, f.recoverer.address, badDebt, seized);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(seized);
          expect(await loanVToken.badDebt()).to.equal(0);
        });
      });
    });
  });
}

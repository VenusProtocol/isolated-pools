import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";

import { IERC20, SpokeComptroller, SpokePoolManager, VToken } from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import {
  MAX_RESIDUAL_POOL_DEBT_USD,
  MAX_STALE_PERIOD,
  OpenSpokeFixture,
  RISK_ORACLE,
  TIER_TWO,
  TIER_TWO_BOND_USD,
  UpdateType,
  WIND_DOWN_PERIOD,
  XVS,
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
  CollateralToken,
  EXIT_LIQUIDATION_THRESHOLDS,
  EXP_SCALE,
  NO_FEED,
  PoolStatus,
  RequestStatus,
  TIER_ONE_XVS_BOND,
  advanceTime,
  approveSeeds,
  assertInvariants,
  borrow,
  buildExit,
  buildRequest,
  collateralMarket,
  crashAndHeal,
  depositToHub,
  executeVip,
  exitLiquidationThresholds,
  exitPool,
  newCollateralToken,
  openDefaultPool,
  openFundedPool,
  priceMantissa,
  proposeAndQueue,
  recoverFromBond,
  requestPool,
  resilientOracle,
  seedFor,
  supplyCollateral,
  usdValue,
  usdtLoanMarket,
  vipActions,
  vipFailure,
  wireHubQueues,
  xvsBondFor,
} from "./util/helpers";

const FORK = process.env.FORK === "true";

const HUB_LIQUIDITY = e18("100000");
const RISK_ORACLE_PUBLISH_ABI = [
  "function publishRiskParameterUpdate(string referenceId, bytes newValue, string updateType, address market, uint96 poolId, uint32 dstEid, bytes additionalData)",
];

if (FORK) {
  describe("Open Spoke Pool: exit and isolation", function () {
    this.timeout(0);

    describe("exit and close", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };
      let pool: Awaited<ReturnType<typeof openFundedPool>>;

      before(async () => {
        f = await loadOpenSpokeFixture();
        pool = await openFundedPool(f, HUB_LIQUIDITY);
        snapshot = await snapshotFixture(f);
      });

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      /// The pool's borrows plus bad debt in USD, as `closePool` prices them in the next block
      async function residualDebtUsdInNextBlock(comptroller: SpokeComptroller) {
        const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
        const nextBlock = (await ethers.provider.getBlockNumber()) + 1;
        let debtUsd = BigNumber.from(0);
        for (const market of await comptroller.getAllMarkets()) {
          const vToken = await ethers.getContractAt("VToken", market);
          const borrows = await vToken.totalBorrows();
          const blocks = nextBlock - (await vToken.accrualBlockNumber()).toNumber();
          const interest = borrows
            .mul(await vToken.borrowRatePerBlock())
            .mul(blocks)
            .div(EXP_SCALE);
          const debt = borrows.add(interest).add(await vToken.badDebt());
          if (!debt.isZero()) debtUsd = debtUsd.add(usdValue(debt, await oracle.getUnderlyingPrice(market)));
        }
        return debtUsd;
      }

      type ExitCall =
        | "requestExit"
        | "buildExitProposal"
        | "startWindDown"
        | "buildForceCloseProposal"
        | "closePool"
        | "rejectExit"
        | "handoverPoolToGovernance"
        | "releaseBond";

      /// Every exit step on `comptroller`, each sent by the account allowed to take it
      const exitCalls = (comptroller: string): Record<ExitCall, () => Promise<ContractTransaction>> => ({
        requestExit: () => f.manager.connect(f.deployer).requestExit(comptroller),
        buildExitProposal: () =>
          f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit"),
        startWindDown: () => f.manager.connect(f.timelock).startWindDown(comptroller),
        buildForceCloseProposal: () => f.manager.connect(f.team).buildForceCloseProposal(comptroller, "Force close"),
        closePool: () => f.manager.connect(f.team).closePool(comptroller),
        rejectExit: () => f.manager.connect(f.team).rejectExit(comptroller),
        handoverPoolToGovernance: () => f.manager.connect(f.timelock).handoverPoolToGovernance(comptroller),
        releaseBond: () => f.manager.connect(f.timelock).releaseBond(comptroller),
      });

      /// Checks the pool is at `status` and each `rejected` step reverts with `InvalidPoolStatus(comptroller)`
      async function expectInvalidPoolStatus(
        calls: Record<ExitCall, () => Promise<ContractTransaction>>,
        comptroller: string,
        status: number,
        rejected: ExitCall[],
      ) {
        expect((await f.manager.getPool(comptroller)).status).to.equal(status);
        for (const call of rejected) {
          await expect(calls[call](), call)
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);
        }
      }

      /// The team publishes a supply pause, which the steward rejects: MINT is already paused and the CF already 0
      async function expectRedundantSupplyPause(collateralVToken: VToken) {
        const riskOracle = new ethers.Contract(RISK_ORACLE, RISK_ORACLE_PUBLISH_ABI, f.team);
        await riskOracle.publishRiskParameterUpdate(
          "",
          "0x",
          UpdateType.supplyPause,
          collateralVToken.address,
          0,
          0,
          "0x",
        );
        const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
          UpdateType.supplyPause,
          collateralVToken.address,
        );
        await expect(f.receiver.connect(f.keeper).processUpdate(updateId)).to.be.revertedWithCustomError(
          f.supplyPauseSteward,
          "RedundantValue",
        );
      }

      it("1. exit pauses supply and borrowing, keeps repay, redeem and liquidation open", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken } = pool;
        await supplyCollateral(f.supplier, collateral, collateralVToken, e18("1000"));
        await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
        await borrow(f.borrower, loanVToken, e18("5000"));

        await expect(f.manager.connect(f.deployer).requestExit(comptroller.address))
          .to.emit(f.manager, "ExitRequested")
          .withArgs(comptroller.address);
        const liquidationThresholds = await exitLiquidationThresholds(comptroller, e18("0.1"));
        await expect(f.manager.connect(f.team).buildExitProposal(comptroller.address, liquidationThresholds, "Exit"))
          .to.emit(f.manager, "ExitBuilt")
          .withArgs(comptroller.address);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitProposed);
        const receipt = await executeVip(f, await f.manager.exitProposals(comptroller.address));

        const managerPool = await f.manager.getPool(comptroller.address);
        expect(managerPool.status).to.equal(PoolStatus.WindingDown);
        expect(managerPool.windDownStartedAt).to.equal((await ethers.provider.getBlock(receipt.blockNumber)).timestamp);
        for (const market of [collateralVToken, loanVToken]) {
          for (const action of [Action.MINT, Action.BORROW, Action.ENTER_MARKET]) {
            expect(await comptroller.actionPaused(market.address, action)).to.equal(true);
          }
          for (const action of [Action.REDEEM, Action.REPAY, Action.LIQUIDATE]) {
            expect(await comptroller.actionPaused(market.address, action)).to.equal(false);
          }
          expect(await comptroller.supplyCaps(market.address)).to.equal(0);
          expect(await comptroller.borrowCaps(market.address)).to.equal(0);
        }
        const collateralState = await comptroller.markets(collateralVToken.address);
        expect(collateralState.collateralFactorMantissa).to.equal(0);
        expect(collateralState.liquidationThresholdMantissa).to.equal(e18("0.1"));
        const loanState = await comptroller.markets(loanVToken.address);
        expect(loanState.collateralFactorMantissa).to.equal(0);
        expect(loanState.liquidationThresholdMantissa).to.equal(0);

        await collateral.token.connect(f.supplier).faucet(e18("1"));
        await collateral.token.connect(f.supplier).approve(collateralVToken.address, e18("1"));
        await expect(collateralVToken.connect(f.supplier).mint(e18("1")))
          .to.be.revertedWithCustomError(comptroller, "ActionPaused")
          .withArgs(collateralVToken.address, Action.MINT);
        await expect(loanVToken.connect(f.borrower).borrow(e18("1")))
          .to.be.revertedWithCustomError(comptroller, "ActionPaused")
          .withArgs(loanVToken.address, Action.BORROW);
        await expect(comptroller.connect(f.outsider).enterMarkets([collateralVToken.address]))
          .to.be.revertedWithCustomError(comptroller, "ActionPaused")
          .withArgs(collateralVToken.address, Action.ENTER_MARKET);

        const redeemed = e18("1000");
        const collateralBefore = await collateral.token.balanceOf(f.supplier.address);
        await collateralVToken.connect(f.supplier).redeemUnderlying(redeemed);
        expect((await collateral.token.balanceOf(f.supplier.address)).sub(collateralBefore)).to.equal(redeemed);

        const repayment = e18("1000");
        await f.usdt.connect(f.borrower).approve(loanVToken.address, repayment);
        const borrowerUsdtBefore = await f.usdt.balanceOf(f.borrower.address);
        await loanVToken.connect(f.borrower).repayBorrow(repayment);
        expect(borrowerUsdtBefore.sub(await f.usdt.balanceOf(f.borrower.address))).to.equal(repayment);

        // At a 0.1 threshold the borrower's $20,000 of collateral backs $2,000, under the ~$4,000 still owed
        const liquidation = e18("1000");
        await fundUsdt(f.usdt, f.liquidator.address, liquidation);
        await f.usdt.connect(f.liquidator).approve(loanVToken.address, liquidation);
        const [, seizeTokens] = await comptroller.liquidateCalculateSeizeTokens(
          loanVToken.address,
          collateralVToken.address,
          liquidation,
        );
        const borrowerVTokensBefore = await collateralVToken.balanceOf(f.borrower.address);
        await loanVToken
          .connect(f.liquidator)
          .liquidateBorrow(f.borrower.address, liquidation, collateralVToken.address);
        expect(borrowerVTokensBefore.sub(await collateralVToken.balanceOf(f.borrower.address))).to.equal(seizeTokens);
      });

      it("2. the first exit VIP executed wins and the other reverts", async () => {
        const { comptroller, collateralVToken } = pool;
        const firstPayload = await buildExit(f, comptroller, e18("0.55"));
        const latestPayload = await buildExit(f, comptroller, e18("0.5"));
        expect(latestPayload).to.not.equal(firstPayload);
        expect(await f.manager.exitProposals(comptroller.address)).to.equal(latestPayload);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitProposed);

        const firstProposal = await proposeAndQueue(f, firstPayload);
        const latestProposal = await proposeAndQueue(f, latestPayload);
        await f.governor.execute(firstProposal);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.WindingDown);
        expect((await comptroller.markets(collateralVToken.address)).liquidationThresholdMantissa).to.equal(
          e18("0.55"),
        );

        await expect(f.governor.execute(latestProposal)).to.be.reverted;
        const failure = await vipFailure(f, latestPayload);
        expect(failure?.signature).to.equal("startWindDown(address)");
        expect(failure?.reason).to.include(`InvalidPoolStatus("${comptroller.address}")`);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.WindingDown);
        expect((await comptroller.markets(collateralVToken.address)).liquidationThresholdMantissa).to.equal(
          e18("0.55"),
        );
      });

      it("3. builds the force close only after the wind-down period", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken } = pool;
        await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
        await borrow(f.borrower, loanVToken, e18("1000"));
        await exitPool(f, comptroller);

        const windDownEnd =
          (await f.manager.getPool(comptroller.address)).windDownStartedAt.toNumber() + WIND_DOWN_PERIOD;
        await time.setNextBlockTimestamp(windDownEnd - 1);
        await expect(
          f.manager.connect(f.team).buildForceCloseProposal(comptroller.address, "Force close"),
        ).to.be.revertedWithCustomError(f.manager, "WindDownPeriodNotElapsed");

        await time.setNextBlockTimestamp(windDownEnd);
        await expect(f.manager.connect(f.team).buildForceCloseProposal(comptroller.address, "Force close"))
          .to.emit(f.manager, "ForceCloseBuilt")
          .withArgs(comptroller.address);
        await executeVip(f, await f.manager.exitProposals(comptroller.address));

        const collateralState = await comptroller.markets(collateralVToken.address);
        expect(collateralState.collateralFactorMantissa).to.equal(0);
        expect(collateralState.liquidationThresholdMantissa).to.equal(0);
        expect(await comptroller.isForcedLiquidationEnabled(loanVToken.address)).to.equal(true);
        expect(await comptroller.isForcedLiquidationEnabled(collateralVToken.address)).to.equal(false);
      });

      it("4. closes a pool with residual debt under the max", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken } = pool;
        await supplyCollateral(f.borrower, collateral, collateralVToken, e18("100"));
        await borrow(f.borrower, loanVToken, e18("5"));
        await exitPool(f, comptroller);

        await expect(f.manager.connect(f.team).closePool(comptroller.address))
          .to.emit(f.manager, "PoolClosed")
          .withArgs(comptroller.address);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Closed);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(ethers.constants.AddressZero);
        expect(await loanVToken.totalBorrows()).to.be.gt(0);
      });

      it("5. refuses to close a pool with residual debt over the max", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken } = pool;
        await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
        await borrow(f.borrower, loanVToken, e18("1000"));
        await exitPool(f, comptroller);

        await loanVToken.accrueInterest();
        const residualDebtUsd = await residualDebtUsdInNextBlock(comptroller);
        expect(residualDebtUsd).to.be.gt(MAX_RESIDUAL_POOL_DEBT_USD);
        await expect(f.manager.connect(f.team).closePool(comptroller.address))
          .to.be.revertedWithCustomError(f.manager, "ResidualDebtExceeded")
          .withArgs(residualDebtUsd);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.WindingDown);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(comptroller.address);
      });

      it("6. closes a pool after governance repays its unrecovered debt", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken, bondAccount } = pool;
        const [crashedBorrower, idleBorrower] = [f.borrower, f.supplier];
        await supplyCollateral(crashedBorrower, collateral, collateralVToken, e18("100"));
        await borrow(crashedBorrower, loanVToken, e18("80"));
        await supplyCollateral(idleBorrower, collateral, collateralVToken, e18("10000"));
        await borrow(idleBorrower, loanVToken, e18("50"));
        await exitPool(f, comptroller);

        await setPrice(collateral.feed, "0.2");
        await fundUsdt(f.usdt, f.liquidator.address, e18("100"));
        await f.usdt.connect(f.liquidator).approve(loanVToken.address, ethers.constants.MaxUint256);
        await comptroller.connect(f.liquidator).healAccount(crashedBorrower.address);
        const badDebt = await loanVToken.badDebt();
        expect(badDebt).to.be.gt(0);
        await expect(f.manager.connect(f.team).closePool(comptroller.address)).to.be.revertedWithCustomError(
          f.manager,
          "ResidualDebtExceeded",
        );

        await fundUsdt(f.usdt, bscmainnet.NORMAL_TIMELOCK, e18("1000"));
        await f.usdt.connect(f.timelock).approve(f.shortfall.address, badDebt);
        await expect(f.shortfall.connect(f.timelock).repayBadDebt(loanVToken.address, badDebt))
          .to.emit(f.shortfall, "BadDebtRepaid")
          .withArgs(comptroller.address, loanVToken.address, bscmainnet.NORMAL_TIMELOCK, badDebt);
        expect(await loanVToken.badDebt()).to.equal(0);

        await f.usdt.connect(f.timelock).approve(loanVToken.address, ethers.constants.MaxUint256);
        await loanVToken.connect(f.timelock).repayBorrowBehalf(idleBorrower.address, ethers.constants.MaxUint256);
        expect(await loanVToken.borrowBalanceStored(idleBorrower.address)).to.equal(0);

        await expect(f.manager.connect(f.team).closePool(comptroller.address))
          .to.emit(f.manager, "PoolClosed")
          .withArgs(comptroller.address);
        expect(await f.manager.maxResidualPoolDebtUsd()).to.equal(MAX_RESIDUAL_POOL_DEBT_USD);
        expect(await bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
      });

      // Known gap: exit and close never touch the Hub, so the YieldGroup keeps the loan market as an open resource
      it("7. pauses the loan market's Hub resource on exit and removes it on close", async () => {
        const { comptroller, loanVToken } = pool;
        await exitPool(f, comptroller);
        const yieldGroupConfigs = new ethers.Contract(
          f.yieldGroup.address,
          ["function resourceConfig(address) view returns (bool registered, bool paused, address adapter)"],
          f.admin,
        );
        expect((await yieldGroupConfigs.resourceConfig(loanVToken.address)).paused).to.equal(true);

        const shares = await f.hub.balanceOf(f.hubDepositor.address);
        await f.hub.connect(f.hubDepositor).redeem(shares, f.hubDepositor.address, f.hubDepositor.address);
        await f.manager.connect(f.team).closePool(comptroller.address);
        expect(await f.yieldGroup.resources()).to.not.include(loanVToken.address);
      });

      it("8. lets the Hub withdraw from an exited pool while other pools keep working", async () => {
        const { comptroller, loanVToken } = pool;
        const otherPool = await openDefaultPool(f, f.secondDeployer);
        await wireHubQueues(f, [loanVToken.address, otherPool.loanVToken.address]);
        await exitPool(f, comptroller);

        const exitedCashBefore = await loanVToken.getCash();
        const depositorUsdtBefore = await f.usdt.balanceOf(f.hubDepositor.address);
        const shares = await f.hub.balanceOf(f.hubDepositor.address);
        // Simulates at the redeem's own timestamp, so the Hub accrues its sources to the same second
        await time.setNextBlockTimestamp((await time.latest()) + 1);
        const redeemable = await f.hub
          .connect(f.hubDepositor)
          .callStatic.redeem(shares, f.hubDepositor.address, f.hubDepositor.address, { blockTag: "pending" });
        await f.hub.connect(f.hubDepositor).redeem(shares, f.hubDepositor.address, f.hubDepositor.address);
        expect((await f.usdt.balanceOf(f.hubDepositor.address)).sub(depositorUsdtBefore)).to.equal(redeemable);
        expect(exitedCashBefore.sub(await loanVToken.getCash())).to.equal(HUB_LIQUIDITY);
        expect(await loanVToken.balanceOf(f.yieldGroup.address)).to.equal(0);
        await f.manager.connect(f.team).closePool(comptroller.address);

        const exitedCash = await loanVToken.getCash();
        const otherCashBefore = await otherPool.loanVToken.getCash();
        const deposit = e18("50000");
        await depositToHub(f, deposit);
        expect((await otherPool.loanVToken.getCash()).sub(otherCashBefore)).to.equal(deposit);
        expect(await loanVToken.getCash()).to.equal(exitedCash);

        await supplyCollateral(f.supplier, otherPool.collateral, otherPool.collateralVToken, e18("10000"));
        const supplierUsdtBefore = await f.usdt.balanceOf(f.supplier.address);
        await borrow(f.supplier, otherPool.loanVToken, e18("1000"));
        expect((await f.usdt.balanceOf(f.supplier.address)).sub(supplierUsdtBefore)).to.equal(e18("1000"));
      });

      it("9. accrues interest through the wind-down and counts it at close", async () => {
        const { comptroller, collateral, collateralVToken, loanVToken } = pool;
        await supplyCollateral(f.borrower, collateral, collateralVToken, e18("10000"));
        await borrow(f.borrower, loanVToken, e18("5000"));
        await exitPool(f, comptroller);

        const debtAtWindDown = await loanVToken.callStatic.borrowBalanceCurrent(f.borrower.address);
        await mine(10_000);
        expect(await loanVToken.callStatic.borrowBalanceCurrent(f.borrower.address)).to.be.gt(debtAtWindDown);

        await loanVToken.accrueInterest();
        await mine(10_000);
        const residualDebtUsd = await residualDebtUsdInNextBlock(comptroller);
        const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
        const storedDebtUsd = usdValue(
          await loanVToken.totalBorrows(),
          await oracle.getUnderlyingPrice(loanVToken.address),
        );
        expect(residualDebtUsd).to.be.gt(storedDebtUsd);
        await expect(f.manager.connect(f.team).closePool(comptroller.address))
          .to.be.revertedWithCustomError(f.manager, "ResidualDebtExceeded")
          .withArgs(residualDebtUsd);

        await fundUsdt(f.usdt, f.borrower.address, e18("100"));
        await f.usdt.connect(f.borrower).approve(loanVToken.address, ethers.constants.MaxUint256);
        await loanVToken.connect(f.borrower).repayBorrow(ethers.constants.MaxUint256);
        expect(await loanVToken.borrowBalanceStored(f.borrower.address)).to.equal(0);
        await expect(f.manager.connect(f.team).closePool(comptroller.address))
          .to.emit(f.manager, "PoolClosed")
          .withArgs(comptroller.address);
      });

      it("10. allows each exit step only from its own status", async () => {
        const { comptroller, bondAccount, requestId } = pool;
        const calls = exitCalls(comptroller.address);

        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.Live, [
          "startWindDown",
          "buildForceCloseProposal",
          "closePool",
          "rejectExit",
          "handoverPoolToGovernance",
          "releaseBond",
        ]);
        await expect(
          f.manager.connect(f.team).buildExitProposal(comptroller.address, [e18("0.6")], "Exit"),
        ).to.be.revertedWithCustomError(f.builder, "InvalidArrayLength");

        await expect(calls.requestExit()).to.emit(f.manager, "ExitRequested").withArgs(comptroller.address);
        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.ExitRequested, [
          "requestExit",
          "startWindDown",
          "buildForceCloseProposal",
          "closePool",
          "releaseBond",
        ]);

        await expect(calls.buildExitProposal()).to.emit(f.manager, "ExitBuilt").withArgs(comptroller.address);
        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.ExitProposed, [
          "requestExit",
          "buildForceCloseProposal",
          "closePool",
          "releaseBond",
        ]);

        await executeVip(f, await f.manager.exitProposals(comptroller.address));
        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.WindingDown, [
          "requestExit",
          "buildExitProposal",
          "startWindDown",
          "rejectExit",
          "handoverPoolToGovernance",
          "releaseBond",
        ]);
        await expect(calls.buildForceCloseProposal()).to.be.revertedWithCustomError(
          f.manager,
          "WindDownPeriodNotElapsed",
        );

        await expect(calls.closePool()).to.emit(f.manager, "PoolClosed").withArgs(comptroller.address);
        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.Closed, [
          "requestExit",
          "buildExitProposal",
          "startWindDown",
          "buildForceCloseProposal",
          "closePool",
          "rejectExit",
          "handoverPoolToGovernance",
        ]);
        await expect(f.manager.connect(f.timelock).settleRequest(requestId))
          .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
          .withArgs(requestId);

        await expect(calls.releaseBond())
          .to.emit(f.bondManager, "BondReleased")
          .withArgs(comptroller.address, bondAccount.address);
        await expect(calls.releaseBond())
          .to.be.revertedWithCustomError(f.bondManager, "BondNotFound")
          .withArgs(comptroller.address);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Closed);
      });

      it("11. hands a pool over to governance, failing its exit VIP", async () => {
        const { comptroller, bondAccount, requestId } = pool;
        const calls = exitCalls(comptroller.address);
        await calls.requestExit();
        const exitProposal = await proposeAndQueue(f, await buildExit(f, comptroller, e18("0.6")));

        await expect(calls.handoverPoolToGovernance())
          .to.emit(f.manager, "PoolHandedOver")
          .withArgs(comptroller.address);
        expect(await f.manager.activePools(f.deployer.address)).to.equal(ethers.constants.AddressZero);
        await expect(f.governor.execute(exitProposal)).to.be.reverted;
        const failure = await vipFailure(f, await f.manager.exitProposals(comptroller.address));
        expect(failure?.signature).to.equal("startWindDown(address)");
        expect(failure?.reason).to.include(`InvalidPoolStatus("${comptroller.address}")`);

        await expectInvalidPoolStatus(calls, comptroller.address, PoolStatus.HandedOver, [
          "requestExit",
          "buildExitProposal",
          "startWindDown",
          "buildForceCloseProposal",
          "closePool",
          "rejectExit",
          "handoverPoolToGovernance",
        ]);
        await expect(f.manager.connect(f.timelock).settleRequest(requestId))
          .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
          .withArgs(requestId);

        await expect(calls.releaseBond())
          .to.emit(f.bondManager, "BondReleased")
          .withArgs(comptroller.address, bondAccount.address);
        await expect(calls.releaseBond())
          .to.be.revertedWithCustomError(f.bondManager, "BondNotFound")
          .withArgs(comptroller.address);
        expect((await f.manager.getPool(comptroller.address)).status).to.equal(PoolStatus.HandedOver);
      });

      it("12. rejects a supply pause after exit or force close as redundant", async () => {
        const { comptroller, collateralVToken } = pool;
        await exitPool(f, comptroller, e18("0.55"));
        await f.riskOracle.connect(f.timelock).addAuthorizedSender(f.team.address);

        await expectRedundantSupplyPause(collateralVToken);
        let market = await comptroller.markets(collateralVToken.address);
        expect(market.collateralFactorMantissa).to.equal(0);
        expect(market.liquidationThresholdMantissa).to.equal(e18("0.55"));

        await advanceTime(f, WIND_DOWN_PERIOD);
        await f.manager.connect(f.team).buildForceCloseProposal(comptroller.address, "Force close");
        await executeVip(f, await f.manager.exitProposals(comptroller.address));
        await expectRedundantSupplyPause(collateralVToken);
        market = await comptroller.markets(collateralVToken.address);
        expect(market.collateralFactorMantissa).to.equal(0);
        expect(market.liquidationThresholdMantissa).to.equal(0);
      });
    });

    describe("pool isolation", () => {
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

      /// What a loan market's borrower and lenders see: borrows, rate, cash, exchange rate, the borrower's debt and
      /// liquidity, and the market's Hub cap
      async function loanMarketState(comptroller: SpokeComptroller, loanVToken: string, borrower: SignerWithAddress) {
        const vToken = await ethers.getContractAt("VToken", loanVToken);
        const [, liquidity, shortfall] = await comptroller.getAccountLiquidity(borrower.address);
        const state = [
          await vToken.totalBorrows(),
          await vToken.borrowRatePerBlock(),
          await vToken.getCash(),
          await vToken.exchangeRateStored(),
          await vToken.borrowBalanceStored(borrower.address),
          liquidity,
          shortfall,
          await f.yieldGroup.resourceCap(loanVToken),
        ] as BigNumber[];
        return state.map(value => value.toString());
      }

      /// The pool a built request lists, with one collateral market and one loan market
      async function listedPool(built: Awaited<ReturnType<typeof buildRequest>>, collateral: CollateralToken) {
        return {
          comptroller: (await ethers.getContractAt("SpokeComptroller", built.comptroller)) as SpokeComptroller,
          collateral,
          collateralVToken: (await ethers.getContractAt("VToken", built.vTokens[0])) as VToken,
          loanVToken: (await ethers.getContractAt("VToken", built.vTokens[1])) as VToken,
          bondAccount: await ethers.getContractAt("IBondAccount", await f.bondManager.bondAccounts(built.comptroller)),
        };
      }

      it("13. keeps one pool's crash and recovery away from another on the same Hub", async () => {
        const crashed = await openFundedPool(f, e18("100000"));
        const healthy = await openDefaultPool(f, f.secondDeployer);
        await wireHubQueues(f, [healthy.loanVToken.address, crashed.loanVToken.address]);
        await depositToHub(f, e18("100000"));

        await supplyCollateral(f.borrower, crashed.collateral, crashed.collateralVToken, e18("100"));
        await borrow(f.borrower, crashed.loanVToken, e18("80"));
        await supplyCollateral(f.supplier, healthy.collateral, healthy.collateralVToken, e18("10000"));
        await borrow(f.supplier, healthy.loanVToken, e18("5000"));
        const healthyStateBefore = await loanMarketState(healthy.comptroller, healthy.loanVToken.address, f.supplier);

        await setPrice(crashed.collateral.feed, "0.2");
        await fundUsdt(f.usdt, f.liquidator.address, e18("100"));
        await f.usdt.connect(f.liquidator).approve(crashed.loanVToken.address, ethers.constants.MaxUint256);
        await crashed.comptroller.connect(f.liquidator).healAccount(f.borrower.address);
        const badDebt = await crashed.loanVToken.badDebt();
        expect(badDebt).to.be.gt(0);

        const oracle = new ethers.Contract(
          bscmainnet.RESILIENT_ORACLE,
          [
            "function getPrice(address) view returns (uint256)",
            "function getUnderlyingPrice(address) view returns (uint256)",
          ],
          f.admin,
        );
        const seized = badDebt
          .mul(await oracle.getUnderlyingPrice(crashed.loanVToken.address))
          .div(await oracle.getPrice(XVS));
        await fundUsdt(f.usdt, f.recoverer.address, badDebt);
        await f.usdt.connect(f.recoverer).approve(f.shortfall.address, badDebt);
        const recovererXvsBefore = await f.xvs.balanceOf(f.recoverer.address);
        await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(crashed.loanVToken.address, badDebt))
          .to.emit(f.shortfall, "BadDebtRecovered")
          .withArgs(crashed.comptroller.address, crashed.loanVToken.address, f.recoverer.address, badDebt, seized);
        expect((await f.xvs.balanceOf(f.recoverer.address)).sub(recovererXvsBefore)).to.equal(seized);
        expect(await crashed.loanVToken.badDebt()).to.equal(0);
        expect(await f.xvs.balanceOf(crashed.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(seized));

        expect(await f.xvs.balanceOf(healthy.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await healthy.bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
        expect(await healthy.loanVToken.badDebt()).to.equal(0);
        expect(await loanMarketState(healthy.comptroller, healthy.loanVToken.address, f.supplier)).to.deep.equal(
          healthyStateBefore,
        );

        const supplierUsdtBefore = await f.usdt.balanceOf(f.supplier.address);
        await borrow(f.supplier, healthy.loanVToken, e18("100"));
        expect((await f.usdt.balanceOf(f.supplier.address)).sub(supplierUsdtBefore)).to.equal(e18("100"));
      });

      it("14. escrows and refunds correctly when two requests interleave", async () => {
        const firstCollateral = await newCollateralToken(f, "ONE", "2");
        const secondCollateral = await newCollateralToken(f, "TWO", "2");
        const firstRequest = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(firstCollateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const secondRequest = await requestPool(f, f.secondDeployer, {
          collateralMarkets: [collateralMarket(secondCollateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        expect(await f.xvs.balanceOf(f.manager.address)).to.equal(TIER_ONE_XVS_BOND.mul(2));
        const secondDeployerTokens = [f.xvs, f.usdt, secondCollateral.token as unknown as IERC20];
        const secondDeployerBalances = () =>
          Promise.all(secondDeployerTokens.map(token => token.balanceOf(f.secondDeployer.address)));
        const secondDeployerAfterRequest = await secondDeployerBalances();

        await buildRequest(f, secondRequest);
        const { payload: firstPayload } = await buildRequest(f, firstRequest);
        const collateralSeed = seedFor(priceMantissa("2"));
        const usdtSeed = seedFor(priceMantissa("1"));
        expect(await f.usdt.balanceOf(f.manager.address)).to.equal(usdtSeed.mul(2));
        expect(await firstCollateral.token.balanceOf(f.manager.address)).to.equal(collateralSeed);
        expect(await secondCollateral.token.balanceOf(f.manager.address)).to.equal(collateralSeed);

        await executeVip(f, firstPayload);
        expect((await f.manager.getRequest(firstRequest)).status).to.equal(RequestStatus.Settled);
        expect((await f.manager.getRequest(secondRequest)).status).to.equal(RequestStatus.Built);
        const firstComptroller = (await f.manager.getRequest(firstRequest)).comptroller;
        expect(await f.manager.activePools(f.deployer.address)).to.equal(firstComptroller);
        expect(await f.xvs.balanceOf(await f.bondManager.bondAccounts(firstComptroller))).to.equal(TIER_ONE_XVS_BOND);
        expect(await f.xvs.balanceOf(f.manager.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await f.usdt.balanceOf(f.manager.address)).to.equal(usdtSeed);
        expect(await firstCollateral.token.balanceOf(f.manager.address)).to.equal(0);
        expect(await secondCollateral.token.balanceOf(f.manager.address)).to.equal(collateralSeed);

        await expect(f.manager.connect(f.team).rejectRequest(secondRequest))
          .to.emit(f.manager, "RequestRejected")
          .withArgs(secondRequest);
        expect((await f.manager.getRequest(secondRequest)).status).to.equal(RequestStatus.Rejected);
        for (const token of [f.xvs, f.usdt, secondCollateral.token]) {
          expect(await token.balanceOf(f.manager.address)).to.equal(0);
        }
        expect(await secondDeployerBalances()).to.deep.equal([
          secondDeployerAfterRequest[0].add(TIER_ONE_XVS_BOND),
          secondDeployerAfterRequest[1],
          secondDeployerAfterRequest[2],
        ]);
      });

      it("15. reverts the second VIP onboarding the same new collateral", async () => {
        const shared = await newCollateralToken(f, "SHR", "2");
        const secondFeed = await deployMockFeed(f, "2");
        const firstRequest = await requestPool(f, f.deployer, {
          collateralMarkets: [collateralMarket(shared)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const secondRequest = await requestPool(f, f.secondDeployer, {
          collateralMarkets: [
            collateralMarket(shared, {
              feeds: [
                { oracle: bscmainnet.CHAINLINK_ORACLE, feed: secondFeed.address, maxStalePeriod: MAX_STALE_PERIOD },
                NO_FEED,
                NO_FEED,
              ],
            }),
          ],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const { payload: firstPayload } = await buildRequest(f, firstRequest);
        const { payload: secondPayload } = await buildRequest(f, secondRequest);

        await executeVip(f, firstPayload);
        const secondProposal = await proposeAndQueue(f, secondPayload);
        await expect(f.governor.execute(secondProposal)).to.be.reverted;
        const failure = await vipFailure(f, secondPayload);
        expect(failure?.target).to.equal(bscmainnet.DEVIATION_BOUNDED_ORACLE);
        expect(failure?.signature).to.equal("setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])");
        expect(failure?.reason).to.include(
          new ethers.utils.Interface(["error MarketAlreadyInitialized(address)"]).encodeErrorResult(
            "MarketAlreadyInitialized",
            [shared.token.address],
          ),
        );

        expect((await f.manager.getRequest(secondRequest)).status).to.equal(RequestStatus.Built);
        expect(await f.manager.activePools(f.secondDeployer.address)).to.equal(ethers.constants.AddressZero);
        expect((await f.chainlinkOracle.tokenConfigs(shared.token.address)).feed).to.equal(shared.feed.address);

        await f.manager.connect(f.team).rejectRequest(secondRequest);
        for (const token of [f.xvs, f.usdt, shared.token]) {
          expect(await token.balanceOf(f.manager.address)).to.equal(0);
        }
      });

      it("16. prices shared collateral once, each bond covering only its pool", async () => {
        const shared = await newCollateralToken(f, "SHR", "2");
        const sharedRequest = { collateralMarkets: [collateralMarket(shared)], loanMarkets: [usdtLoanMarket(f)] };
        const oracleTargets = [
          bscmainnet.CHAINLINK_ORACLE,
          bscmainnet.REDSTONE_ORACLE,
          f.thirdOracle.address,
          bscmainnet.RESILIENT_ORACLE,
          bscmainnet.DEVIATION_BOUNDED_ORACLE,
        ];
        const oracleActions = (payload: string) =>
          vipActions(payload).filter(action => oracleTargets.includes(action.target));

        const firstBuilt = await buildRequest(f, await requestPool(f, f.deployer, sharedRequest));
        expect(oracleActions(firstBuilt.payload)).to.not.deep.equal([]);
        await executeVip(f, firstBuilt.payload);
        const secondBuilt = await buildRequest(f, await requestPool(f, f.secondDeployer, sharedRequest));
        expect(oracleActions(secondBuilt.payload)).to.deep.equal([]);
        await executeVip(f, secondBuilt.payload);
        const first = await listedPool(firstBuilt, shared);
        const second = await listedPool(secondBuilt, shared);
        expect((await f.chainlinkOracle.tokenConfigs(shared.token.address)).feed).to.equal(shared.feed.address);

        await wireHubQueues(f, [first.loanVToken.address, second.loanVToken.address]);
        await depositToHub(f, e18("100000"));
        await wireHubQueues(f, [second.loanVToken.address, first.loanVToken.address]);
        await depositToHub(f, e18("100000"));
        await supplyCollateral(f.borrower, shared, first.collateralVToken, e18("100"));
        await borrow(f.borrower, first.loanVToken, e18("80"));
        await supplyCollateral(f.supplier, shared, second.collateralVToken, e18("100"));
        await borrow(f.supplier, second.loanVToken, e18("80"));

        await setPrice(shared.feed, "0.2");
        const oracle = await resilientOracle();
        for (const [crashedPool, borrower] of [
          [first, f.borrower],
          [second, f.supplier],
        ] as const) {
          expect(await oracle.getUnderlyingPrice(crashedPool.collateralVToken.address)).to.equal(priceMantissa("0.2"));
          const [, liquidity, shortfall] = await crashedPool.comptroller.getAccountLiquidity(borrower.address);
          expect(liquidity).to.equal(0);
          expect(shortfall).to.be.gt(0);
        }
        const secondStateBefore = await loanMarketState(second.comptroller, second.loanVToken.address, f.supplier);
        const secondCollateralBefore = await second.collateralVToken.balanceOf(f.supplier.address);

        const badDebt = await crashAndHeal(f, first, f.borrower, "0.2");
        expect(badDebt).to.be.gt(0);
        const seized = await recoverFromBond(f, first, badDebt);
        expect(await first.loanVToken.badDebt()).to.equal(0);
        expect(await f.xvs.balanceOf(first.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(seized));

        expect(await f.xvs.balanceOf(second.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await second.bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
        expect(await second.loanVToken.badDebt()).to.equal(0);
        expect(await second.collateralVToken.balanceOf(f.supplier.address)).to.equal(secondCollateralBefore);
        expect(await loanMarketState(second.comptroller, second.loanVToken.address, f.supplier)).to.deep.equal(
          secondStateBefore,
        );
      });

      it("17. keeps a closed pool's bond apart from the deployer's new pool", async () => {
        const closed = await openDefaultPool(f);
        await exitPool(f, closed.comptroller);
        await f.manager.connect(f.team).closePool(closed.comptroller.address);
        const live = await openDefaultPool(f);

        expect(await f.manager.activePools(f.deployer.address)).to.equal(live.comptroller.address);
        expect((await f.manager.getPool(closed.comptroller.address)).status).to.equal(PoolStatus.Closed);
        expect((await f.manager.getPool(live.comptroller.address)).status).to.equal(PoolStatus.Live);
        expect(live.bondAccount.address).to.not.equal(closed.bondAccount.address);
        for (const bondAccount of [closed.bondAccount, live.bondAccount]) {
          expect(await bondAccount.bondHolder()).to.equal(f.deployer.address);
          expect(await f.xvs.balanceOf(bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        }

        const deployerXvsBefore = await f.xvs.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.timelock).releaseBond(closed.comptroller.address))
          .to.emit(f.bondManager, "BondReleased")
          .withArgs(closed.comptroller.address, closed.bondAccount.address);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerXvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        expect(await f.xvs.balanceOf(closed.bondAccount.address)).to.equal(0);
        expect(await closed.bondAccount.released()).to.equal(true);

        expect(await f.bondManager.bondAccounts(live.comptroller.address)).to.equal(live.bondAccount.address);
        expect(await f.xvs.balanceOf(live.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        expect(await live.bondAccount.released()).to.equal(false);
        await expect(f.manager.connect(f.timelock).releaseBond(live.comptroller.address))
          .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
          .withArgs(live.comptroller.address);
      });

      it("18. upgrades the tier, adds a market, then exits and closes", async () => {
        const pool = await openDefaultPool(f);
        const comptroller = pool.comptroller.address;
        const topUp = xvsBondFor(TIER_TWO_BOND_USD).sub(TIER_ONE_XVS_BOND);
        await fundXvs(f.xvs, f.deployer.address, topUp);
        await f.manager.connect(f.deployer).topUpBond(comptroller, topUp);
        await f.manager.connect(f.deployer).requestTierUpgrade(comptroller, TIER_TWO);
        await executeVip(f, (await buildRequest(f, (await f.manager.requestCount()).toNumber())).payload);
        expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_TWO);

        // A 0.65 collateral factor and a $2.4M cap are above tier one's limits and within tier two's
        const added = await newCollateralToken(f, "ADD", "2");
        const addedMarket = collateralMarket(added, {
          collateralFactor: e18("0.65"),
          liquidationThreshold: e18("0.75"),
          supplyCap: e18("1200000"),
        });
        await approveSeeds(f, f.deployer, { collateralMarkets: [addedMarket], loanMarkets: [] });
        // `collateralMarket` types feeds as an array; the manager takes a fixed three
        const addedMarkets = [addedMarket] as Parameters<SpokePoolManager["requestNewMarkets"]>[1];
        await f.manager.connect(f.deployer).requestNewMarkets(comptroller, addedMarkets, []);
        const { payload, vTokens } = await buildRequest(f, (await f.manager.requestCount()).toNumber());
        await executeVip(f, payload);
        const addedVToken = vTokens[0];
        const addedState = await pool.comptroller.markets(addedVToken);
        expect(addedState.collateralFactorMantissa).to.equal(e18("0.65"));
        expect(addedState.liquidationThresholdMantissa).to.equal(e18("0.75"));
        expect(await pool.comptroller.supplyCaps(addedVToken)).to.equal(e18("1200000"));
        expect(await pool.comptroller.getAllMarkets()).to.have.lengthOf(3);

        await exitPool(f, pool.comptroller, e18("0.5"));
        expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);
        for (const market of await pool.comptroller.getAllMarkets()) {
          expect(await pool.comptroller.actionPaused(market, Action.MINT)).to.equal(true);
          expect(await pool.comptroller.supplyCaps(market)).to.equal(0);
        }
        const exitedState = await pool.comptroller.markets(addedVToken);
        expect(exitedState.collateralFactorMantissa).to.equal(0);
        expect(exitedState.liquidationThresholdMantissa).to.equal(e18("0.5"));

        await expect(f.manager.connect(f.team).closePool(comptroller))
          .to.emit(f.manager, "PoolClosed")
          .withArgs(comptroller);
      });
    });
  });
}

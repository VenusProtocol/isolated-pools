import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import {
  ERC20Harness,
  FeeToken,
  MockToken,
  SpokeBondManager,
  SpokePoolManager,
  SpokePoolPolicyRegistry,
  SpokePoolShortfall,
} from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import { grant } from "../HubSpoke/fixture";
import {
  MAX_RESIDUAL_POOL_DEBT_USD,
  OpenSpokeFixture,
  POOL_PARAMS,
  RISK_ORACLE,
  RISK_STEWARD_RECEIVER,
  SourceType,
  TIER_ONE,
  TIER_ONE_LIMITS,
  TIER_ONE_LOAN_CAP,
  TIER_TWO,
  TIER_TWO_BOND_USD,
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
  DefaultPool,
  EXIT_LIQUIDATION_THRESHOLDS,
  EXP_SCALE,
  NO_FEED,
  PoolStatus,
  RequestStatus,
  TIER_ONE_XVS_BOND,
  ZERO,
  advanceTime,
  applyLatestUpdate,
  assertInvariants,
  borrow,
  buildRequest,
  collateralMarket,
  crashAndHeal,
  depositToHub,
  executeVip,
  fundDeployer,
  impersonate,
  newCollateralToken,
  openDefaultPool,
  openFundedPool,
  openPool,
  priceMantissa,
  proposeAndQueue,
  recoverFromBond,
  requestPool,
  resilientOracle,
  seedFor,
  supplyCollateral,
  updateTier,
  usdtLoanMarket,
  vipActions,
  vipFailure,
  waiveInvariants,
  wireHubQueues,
  xvsBondFor,
  xvsPrice,
} from "./util/helpers";

const FORK = process.env.FORK === "true";

const VOLATILE_TIER = 3;

const TREASURY = "0xF322942f644A996A617BD29c16bd7d231d9F35E9";
const POOL_LIQUIDITY = e18("500000");
const RELEASE_BOND = "releaseBond(address)";
const SEIZE_BOND = "seizeBond(address,uint256,address)";
const RISK_ORACLE_PUBLISH_ABI = [
  "function publishRiskParameterUpdate(string referenceId, bytes newValue, string updateType, address market, uint96 poolId, uint32 dstEid, bytes additionalData)",
];
const RECEIVER_ABI = [
  "function UPDATE_EXPIRATION_TIME() view returns (uint256)",
  "function executeRegisteredUpdate(uint256)",
  "function setConfigActive(string,bool)",
  "error ConfigNotActive()",
  "error UpdateIsExpired()",
  "error UpdateAlreadyResolved()",
];

type Call<T> = (contract: T) => Promise<unknown>;

if (FORK) {
  describe("Open Spoke Pool: deployer and governance", function () {
    this.timeout(0);

    /// The team, as an authorised RiskOracle sender, publishes a supply pause of `vToken`, which the keeper applies
    async function teamSupplyPause(f: OpenSpokeFixture, vToken: string) {
      await f.riskOracle.connect(f.timelock).addAuthorizedSender(f.team.address);
      const riskOracle = new ethers.Contract(RISK_ORACLE, RISK_ORACLE_PUBLISH_ABI, f.team);
      await riskOracle.publishRiskParameterUpdate("", "0x", UpdateType.supplyPause, vToken, 0, 0, "0x");
      await applyLatestUpdate(f, UpdateType.supplyPause, vToken);
    }

    describe("malicious deployer", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      /// The team's escape from an attacker that borrowed against its own token: pause the deployer, pause supply,
      /// heal, exit, wind down, force close, recover the bad debt from the bond and close. `checkpoint` runs after
      /// each step
      async function escapeFromAttacker(pool: DefaultPool, checkpoint: () => Promise<void>) {
        const comptroller = pool.comptroller.address;
        const collateralVToken = pool.collateralVToken.address;
        await supplyCollateral(f.supplier, pool.collateral, pool.collateralVToken, e18("1000"));
        await supplyCollateral(f.attacker, pool.collateral, pool.collateralVToken, e18("50000"));
        await borrow(f.attacker, pool.loanVToken, e18("40000"));
        await checkpoint();

        await f.manager.connect(f.guardian).pauseDeployer(comptroller);
        await expect(
          f.manager.connect(f.attacker).setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7")),
        )
          .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
          .withArgs(comptroller);
        await expect(f.manager.connect(f.attacker).withdrawBondExcess(comptroller))
          .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
          .withArgs(comptroller);
        await checkpoint();

        await teamSupplyPause(f, collateralVToken);
        const market = await pool.comptroller.markets(collateralVToken);
        expect(market.collateralFactorMantissa).to.equal(0);
        expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
        await checkpoint();

        const badDebt = await crashAndHeal(f, pool, f.attacker);
        expect(badDebt).to.be.gt(0);
        await checkpoint();

        await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
        await executeVip(f, await f.manager.exitProposals(comptroller));
        await checkpoint();

        await advanceTime(f, WIND_DOWN_PERIOD);
        await f.manager.connect(f.team).buildForceCloseProposal(comptroller, "Force close");
        await executeVip(f, await f.manager.exitProposals(comptroller));
        await checkpoint();

        const seized = await recoverFromBond(f, pool, badDebt);
        await f.manager.connect(f.team).closePool(comptroller);
        await checkpoint();
        return { badDebt, seized };
      }

      describe("with the attacker's live pool", () => {
        let pool: DefaultPool;
        let comptroller: string;
        let collateralVToken: string;

        before(async () => {
          f = await loadOpenSpokeFixture();
          pool = await openFundedPool(f, POOL_LIQUIDITY, f.attacker);
          comptroller = pool.comptroller.address;
          collateralVToken = pool.collateralVToken.address;
          snapshot = await snapshotFixture(f);
        });

        it("1. gives the deployer no admin power over its pool", async () => {
          const { attacker } = f;
          const asAttacker = pool.comptroller.connect(attacker);
          const unauthorized = (call: Promise<unknown>, target: { address: string }, signature: string) =>
            expect(call)
              .to.be.revertedWithCustomError(pool.comptroller, "Unauthorized")
              .withArgs(attacker.address, target.address, signature);

          await unauthorized(
            asAttacker.setCollateralFactor(collateralVToken, e18("0.6"), e18("0.7")),
            pool.comptroller,
            "setCollateralFactor(address,uint256,uint256)",
          );
          await unauthorized(
            asAttacker.setMarketSupplyCaps([collateralVToken], [e18("100000000")]),
            pool.comptroller,
            "setMarketSupplyCaps(address[],uint256[])",
          );
          await unauthorized(
            asAttacker.setActionsPaused([pool.loanVToken.address], [Action.BORROW], true),
            pool.comptroller,
            "setActionsPaused(address[],uint256[],bool)",
          );
          await unauthorized(
            asAttacker.setForcedLiquidation(pool.loanVToken.address, true),
            pool.comptroller,
            "setForcedLiquidation(address,bool)",
          );
          await unauthorized(
            asAttacker.setAllowedSupplier(pool.loanVToken.address, attacker.address, true),
            pool.comptroller,
            "setAllowedSupplier(address,address,bool)",
          );
          await expect(asAttacker.setPriceOracle(attacker.address)).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
          await unauthorized(
            pool.collateralVToken.connect(attacker).setReserveFactor(0),
            pool.collateralVToken,
            "setReserveFactor(uint256)",
          );
          await unauthorized(
            pool.loanVToken.connect(attacker).setInterestRateModel(attacker.address),
            pool.loanVToken,
            "setInterestRateModel(address)",
          );

          const ownFeed = await deployMockFeed(f, "1000");
          await expect(
            f.chainlinkOracle.connect(attacker)["setTokenConfig((address,address,uint256))"]({
              asset: pool.collateral.token.address,
              feed: ownFeed.address,
              maxStalePeriod: 3600,
            }),
          ).to.be.reverted;
          const riskOracle = new ethers.Contract(RISK_ORACLE, RISK_ORACLE_PUBLISH_ABI, attacker);
          await expect(
            riskOracle.publishRiskParameterUpdate(
              "",
              ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [e18("0.6"), e18("0.7")]),
              UpdateType.collateralFactors,
              collateralVToken,
              0,
              0,
              "0x",
            ),
          ).to.be.reverted;
          await expect(f.yieldGroup.connect(attacker).raiseResourceCap(pool.loanVToken.address, e18("100000000"))).to.be
            .reverted;
          await expect(f.yieldGroup.connect(attacker).setInnerWithdrawQueue([])).to.be.reverted;

          await expect(f.manager.connect(attacker).seizeBond(comptroller, 1, attacker.address))
            .to.be.revertedWithCustomError(f.manager, "Unauthorized")
            .withArgs(attacker.address, f.manager.address, SEIZE_BOND);
          await expect(f.manager.connect(attacker).releaseBond(comptroller))
            .to.be.revertedWithCustomError(f.manager, "Unauthorized")
            .withArgs(attacker.address, f.manager.address, RELEASE_BOND);
          await expect(f.bondManager.connect(attacker).seize(comptroller, 1, attacker.address))
            .to.be.revertedWithCustomError(f.bondManager, "NotSpokePoolManager")
            .withArgs(attacker.address);
          await expect(f.bondManager.connect(attacker).release(comptroller))
            .to.be.revertedWithCustomError(f.bondManager, "NotSpokePoolManager")
            .withArgs(attacker.address);
          await expect(pool.bondAccount.connect(attacker).seize(1, attacker.address))
            .to.be.revertedWithCustomError(pool.bondAccount, "NotBondManager")
            .withArgs(attacker.address);
          await expect(pool.bondAccount.connect(attacker).release())
            .to.be.revertedWithCustomError(pool.bondAccount, "NotBondManager")
            .withArgs(attacker.address);

          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.5"));
          expect(await pool.comptroller.isForcedLiquidationEnabled(pool.loanVToken.address)).to.equal(false);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("2. blocks a deployer from another deployer's pool and request", async () => {
          const other = f.secondDeployer;
          const asOther = f.manager.connect(other);
          const notDeployer = (call: Promise<unknown>) =>
            expect(call).to.be.revertedWithCustomError(f.manager, "NotDeployer").withArgs(other.address);

          await notDeployer(asOther.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65")));
          await notDeployer(asOther.setCollateralSupplyCap(comptroller, collateralVToken, e18("1")));
          await notDeployer(asOther.pauseCollateralSupply(comptroller, collateralVToken));
          await notDeployer(asOther.requestNewMarkets(comptroller, [], [usdtLoanMarket(f)]));
          await notDeployer(asOther.requestTierUpgrade(comptroller, TIER_TWO));
          await notDeployer(asOther.requestExit(comptroller));
          await notDeployer(asOther.withdrawBondExcess(comptroller));
          await notDeployer(asOther.topUpBond(comptroller, 1));

          const otherCollateral = await newCollateralToken(f, "OTH", "2");
          const otherRequestId = await requestPool(f, other, {
            collateralMarkets: [collateralMarket(otherCollateral)],
            loanMarkets: [usdtLoanMarket(f)],
          });
          await expect(f.manager.connect(f.attacker).cancelRequest(otherRequestId))
            .to.be.revertedWithCustomError(f.manager, "NotDeployer")
            .withArgs(f.attacker.address);
          expect((await f.manager.getRequest(otherRequestId)).status).to.equal(RequestStatus.Pending);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
        });

        it("3. blocks updates to another pool's market through the deployer's own comptroller", async () => {
          const victim = await openDefaultPool(f, f.deployer);
          const victimVToken = victim.collateralVToken.address;
          const latestUpdateIds = () =>
            Promise.all(
              Object.values(UpdateType).map(updateType =>
                f.riskOracle.getLatestUpdateIdByTypeAndMarket(updateType, victimVToken),
              ),
            );
          const updateIdsBefore = await latestUpdateIds();
          const asAttacker = f.manager.connect(f.attacker);
          const marketNotListed = (call: Promise<unknown>) =>
            expect(call).to.be.revertedWithCustomError(f.manager, "MarketNotListed").withArgs(victimVToken);

          await marketNotListed(asAttacker.setCollateralFactor(comptroller, victimVToken, e18("0.6"), e18("0.7")));
          await marketNotListed(asAttacker.setCollateralSupplyCap(comptroller, victimVToken, e18("1")));
          await marketNotListed(asAttacker.pauseCollateralSupply(comptroller, victimVToken));

          expect(await latestUpdateIds()).to.deep.equal(updateIdsBefore);
          const market = await victim.comptroller.markets(victimVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.5"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
          expect(await victim.comptroller.supplyCaps(victimVToken)).to.equal(e18("100000"));
          expect(await victim.comptroller.actionPaused(victimVToken, Action.MINT)).to.equal(false);
        });

        it("4. blocks deployer updates on the loan market", async () => {
          const loanVToken = pool.loanVToken.address;
          const asAttacker = f.manager.connect(f.attacker);
          const invalidMarketType = (call: Promise<unknown>) =>
            expect(call).to.be.revertedWithCustomError(f.manager, "InvalidMarketType").withArgs(loanVToken);

          await invalidMarketType(asAttacker.setCollateralFactor(comptroller, loanVToken, e18("0.5"), e18("0.6")));
          await invalidMarketType(asAttacker.setCollateralSupplyCap(comptroller, loanVToken, e18("1")));
          await invalidMarketType(asAttacker.pauseCollateralSupply(comptroller, loanVToken));

          for (const updateType of Object.values(UpdateType)) {
            expect(await f.riskOracle.getLatestUpdateIdByTypeAndMarket(updateType, loanVToken)).to.equal(0);
          }
          expect(await pool.comptroller.supplyCaps(loanVToken)).to.equal(TIER_ONE_LOAN_CAP);
          expect(await pool.comptroller.actionPaused(loanVToken, Action.MINT)).to.equal(false);
        });

        it("5. enforces tier limits, one pending update per market and no no-op updates", async () => {
          const asAttacker = f.manager.connect(f.attacker);
          const exceedsTierLimit = (call: Promise<unknown>) =>
            expect(call).to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit").withArgs(collateralVToken);

          await exceedsTierLimit(
            asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.61"), e18("0.7")),
          );
          await exceedsTierLimit(
            asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.5"), e18("0.71")),
          );
          // $1,000,002 at $2, over the tier's $1M
          await exceedsTierLimit(asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("500001")));

          await expect(asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.5"), e18("0.6")))
            .to.be.revertedWithCustomError(f.manager, "RedundantUpdate")
            .withArgs(collateralVToken);
          await expect(asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("100000")))
            .to.be.revertedWithCustomError(f.manager, "RedundantUpdate")
            .withArgs(collateralVToken);

          await asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          await asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("120000"));
          await expect(asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.56"), e18("0.66")))
            .to.be.revertedWithCustomError(f.manager, "PreviousUpdatePending")
            .withArgs(collateralVToken);
          await expect(asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("130000")))
            .to.be.revertedWithCustomError(f.manager, "PreviousUpdatePending")
            .withArgs(collateralVToken);

          const expiredUpdateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          await advanceTime(f, (await receiver.UPDATE_EXPIRATION_TIME()).toNumber() + 1);
          await asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.56"), e18("0.66"));
          await asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("130000"));
          expect(
            await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.collateralFactors, collateralVToken),
          ).to.be.gt(expiredUpdateId);
        });

        it("6. lets the guardian cut a supply cap set at a dipped price", async () => {
          const maxCapUsd = (await f.policyRegistry.getTier(TIER_ONE)).limits.maxCollateralSupplyCapUsd;
          await setPrice(pool.collateral.feed, "0.2");
          // $1M at $0.2, which passes the tier's USD check
          const cap = e18("5000000");
          await f.manager.connect(f.attacker).setCollateralSupplyCap(comptroller, collateralVToken, cap);
          await applyLatestUpdate(f, UpdateType.supplyCap, collateralVToken);
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(cap);

          await setPrice(pool.collateral.feed, "2");
          const oracle = await resilientOracle();
          const price = await oracle.getUnderlyingPrice(collateralVToken);
          expect(cap.mul(price).div(EXP_SCALE)).to.be.gt(maxCapUsd);

          const capWithinTier = maxCapUsd.mul(EXP_SCALE).div(price);
          await pool.comptroller.connect(f.guardian).setMarketSupplyCaps([collateralVToken], [capWithinTier]);
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(capWithinTier);
        });

        it("7. lets the keeper reject a raise published just before the deployer pause", async () => {
          await f.manager
            .connect(f.attacker)
            .setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          await expect(f.manager.connect(f.guardian).pauseDeployer(comptroller))
            .to.emit(f.manager, "DeployerPausedUpdated")
            .withArgs(comptroller, true);
          await expect(
            f.manager.connect(f.attacker).setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7")),
          )
            .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
            .withArgs(comptroller);

          // The published update survives the pause: anyone can still hand it to the receiver
          await f.receiver.connect(f.attacker).processUpdate(updateId);
          const registered = await f.receiver.updates(updateId);
          expect(registered.status).to.equal(UpdateStatus.Pending);

          await f.receiver.connect(f.keeper).rejectUpdate(updateId);
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Rejected);
          await advanceTime(f, registered.unlockTime.sub(await time.latest()).toNumber() + 1);
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          await expect(receiver.executeRegisteredUpdate(updateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateAlreadyResolved",
          );
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.5"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
        });

        it("8. rejects or expires deployer updates published before an exit", async () => {
          const asAttacker = f.manager.connect(f.attacker);
          await asAttacker.setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7"));
          await asAttacker.setCollateralSupplyCap(comptroller, collateralVToken, e18("400000"));
          const collateralFactorUpdateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          const supplyCapUpdateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.supplyCap,
            collateralVToken,
          );
          // Both are beyond the stewards' safe deltas, so the receiver holds them behind its timelock
          for (const updateId of [collateralFactorUpdateId, supplyCapUpdateId]) {
            await f.receiver.connect(f.keeper).processUpdate(updateId);
            expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Pending);
          }
          await f.receiver.connect(f.keeper).rejectUpdate(supplyCapUpdateId);

          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await executeVip(f, await f.manager.exitProposals(comptroller));
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);

          // A Normal VIP outlasts the RiskOracle update's expiry, so the update can no longer re-raise the pool
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          const publishedAt = (
            await (await ethers.getContractAt("IRiskOracle", RISK_ORACLE)).getUpdateById(collateralFactorUpdateId)
          ).timestamp;
          expect(await time.latest()).to.be.gt(publishedAt.add(await receiver.UPDATE_EXPIRATION_TIME()));
          await expect(receiver.executeRegisteredUpdate(collateralFactorUpdateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateIsExpired",
          );
          await expect(receiver.executeRegisteredUpdate(supplyCapUpdateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateAlreadyResolved",
          );
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(0);
        });

        it("9. keeps the bond seizable through the exit until the timelock releases it", async () => {
          await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("10000"));
          await borrow(f.borrower, pool.loanVToken, e18("8000"));
          await crashAndHeal(f, pool, f.borrower);
          const attackerXvsBefore = await f.xvs.balanceOf(f.attacker.address);

          await expect(f.manager.connect(f.attacker).requestExit(comptroller))
            .to.emit(f.manager, "ExitRequested")
            .withArgs(comptroller);
          expect(await f.bondManager.getCurrentBondAmount(comptroller)).to.equal(TIER_ONE_XVS_BOND);
          const seizedWhileExitRequested = await recoverFromBond(f, pool, e18("3000"));
          await expect(f.manager.connect(f.timelock).releaseBond(comptroller))
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);

          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await executeVip(f, await f.manager.exitProposals(comptroller));
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);
          const residualDebtUsd = (await pool.loanVToken.badDebt()).add(await pool.loanVToken.totalBorrows());
          await expect(f.manager.connect(f.team).closePool(comptroller))
            .to.be.revertedWithCustomError(f.manager, "ResidualDebtExceeded")
            .withArgs(residualDebtUsd);
          const leftToRecover = e18("5");
          const seizedWhileWindingDown = await recoverFromBond(
            f,
            pool,
            (await pool.loanVToken.badDebt()).sub(leftToRecover),
          );

          await expect(f.manager.connect(f.team).closePool(comptroller))
            .to.emit(f.manager, "PoolClosed")
            .withArgs(comptroller);
          const seizedWhileClosed = await recoverFromBond(f, pool, leftToRecover);
          expect(await pool.loanVToken.badDebt()).to.equal(0);

          await expect(f.manager.connect(f.attacker).releaseBond(comptroller))
            .to.be.revertedWithCustomError(f.manager, "Unauthorized")
            .withArgs(f.attacker.address, f.manager.address, RELEASE_BOND);
          await expect(f.manager.connect(f.timelock).releaseBond(comptroller))
            .to.emit(f.bondManager, "BondReleased")
            .withArgs(comptroller, pool.bondAccount.address);
          const seized = seizedWhileExitRequested.add(seizedWhileWindingDown).add(seizedWhileClosed);
          expect((await f.xvs.balanceOf(f.attacker.address)).sub(attackerXvsBefore)).to.equal(
            TIER_ONE_XVS_BOND.sub(seized),
          );
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(0);
        });

        it("10. closes an abandoned pool and releases its bond", async () => {
          const deployerXvsBefore = await f.xvs.balanceOf(f.attacker.address);

          await expect(f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit"))
            .to.emit(f.manager, "ExitBuilt")
            .withArgs(comptroller);
          await executeVip(f, await f.manager.exitProposals(comptroller));
          await advanceTime(f, WIND_DOWN_PERIOD);
          await expect(f.manager.connect(f.team).buildForceCloseProposal(comptroller, "Force close"))
            .to.emit(f.manager, "ForceCloseBuilt")
            .withArgs(comptroller);
          await executeVip(f, await f.manager.exitProposals(comptroller));
          await expect(f.manager.connect(f.team).closePool(comptroller))
            .to.emit(f.manager, "PoolClosed")
            .withArgs(comptroller);
          await f.manager.connect(f.timelock).releaseBond(comptroller);

          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Closed);
          expect(await f.manager.activePools(f.attacker.address)).to.equal(ethers.constants.AddressZero);
          expect(await f.bondManager.bondAccounts(comptroller)).to.equal(ethers.constants.AddressZero);
          expect(await pool.bondAccount.released()).to.equal(true);
          expect((await f.xvs.balanceOf(f.attacker.address)).sub(deployerXvsBefore)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("11. escapes an attacker, making the Hub whole while suppliers can withdraw", async () => {
          const supplierVTokens = async () => pool.collateralVToken.balanceOf(f.supplier.address);
          const supplierCanWithdraw = async () => {
            await pool.collateralVToken.connect(f.supplier).callStatic.redeem(await supplierVTokens());
          };

          const { seized } = await escapeFromAttacker(pool, supplierCanWithdraw);

          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(seized));
          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(await pool.loanVToken.totalBorrows()).to.equal(0);
          // With no debt left, the Hub's vTokens are worth their share of the market's cash net of reserves
          const marketValue = (await pool.loanVToken.getCash()).sub(await pool.loanVToken.totalReserves());
          const exchangeRate = marketValue.mul(EXP_SCALE).div(await pool.loanVToken.totalSupply());
          const hubVTokens = await pool.loanVToken.balanceOf(f.yieldGroup.address);
          const hubPosition = await pool.loanVToken.callStatic.balanceOfUnderlying(f.yieldGroup.address);
          expect(hubPosition).to.equal(hubVTokens.mul(exchangeRate).div(EXP_SCALE));
          expect(hubPosition).to.be.gt(POOL_LIQUIDITY);
          expect(marketValue).to.be.gte(hubPosition);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Closed);

          const vTokens = await supplierVTokens();
          const expected = vTokens.mul(await pool.collateralVToken.exchangeRateStored()).div(EXP_SCALE);
          const before = await pool.collateral.token.balanceOf(f.supplier.address);
          await pool.collateralVToken.connect(f.supplier).redeem(vTokens);
          expect((await pool.collateral.token.balanceOf(f.supplier.address)).sub(before)).to.equal(expected);
        });
      });

      describe("with no pool yet", () => {
        before(async () => {
          f = await loadOpenSpokeFixture();
          snapshot = await snapshotFixture(f);
        });

        /// Prices a custom token at $2 with its own mock feed, so it can be requested like a `newCollateralToken`
        async function asCollateral(token: { address: string }) {
          return { token: token as unknown as MockToken, feed: await deployMockFeed(f, "2") };
        }

        it("12. covers a self-dealing deployer's bad debt with a volatile tier's bond", async () => {
          const volatileTierBondUsd = e18("300000");
          const limits = { ...TIER_ONE_LIMITS, maxCollateralFactor: e18("0.2"), maxLiquidationThreshold: e18("0.3") };
          await f.policyRegistry.connect(f.timelock).setTier(VOLATILE_TIER, {
            enabled: true,
            minTierBondUsd: volatileTierBondUsd,
            limits,
          });
          const ownToken = await newCollateralToken(f, "OWN", "2");
          const cap = limits.maxCollateralSupplyCapUsd.mul(EXP_SCALE).div(priceMantissa("2"));
          const pool = await openPool(f, f.attacker, {
            tierId: VOLATILE_TIER,
            bondAmount: xvsBondFor(volatileTierBondUsd),
            collateralMarkets: [
              collateralMarket(ownToken, {
                collateralFactor: limits.maxCollateralFactor,
                liquidationThreshold: limits.maxLiquidationThreshold,
                supplyCap: cap,
              }),
            ],
            loanMarkets: [usdtLoanMarket(f)],
          });
          const [collateralVToken, loanVToken] = [pool.collateralVTokens[0], pool.loanVTokens[0]];
          await wireHubQueues(f, [loanVToken.address]);
          await depositToHub(f, e18("800000"));

          await supplyCollateral(f.attacker, ownToken, collateralVToken, cap.sub(e18("10")));
          const [, borrowingPower] = await pool.comptroller.getBorrowingPower(f.attacker.address);
          await borrow(f.attacker, loanVToken, borrowingPower.mul(99).div(100));
          await crashAndHeal(f, { ...pool, collateral: ownToken, loanVToken }, f.attacker, "0.0001");

          const oracle = await resilientOracle();
          const hubLossUsd = (await loanVToken.badDebt())
            .mul(await oracle.getUnderlyingPrice(loanVToken.address))
            .div(EXP_SCALE);
          const bondUsd = (await pool.bondAccount.currentBondAmount()).mul(await oracle.getPrice(XVS)).div(EXP_SCALE);
          expect(hubLossUsd).to.be.gt(0);
          expect(hubLossUsd).to.be.lte(bondUsd);

          const badDebt = await loanVToken.badDebt();
          await fundUsdt(f.usdt, f.recoverer.address, badDebt);
          await f.usdt.connect(f.recoverer).approve(f.shortfall.address, badDebt);
          await f.shortfall.connect(f.recoverer).recoverBadDebt(loanVToken.address, badDebt);
          expect(await loanVToken.badDebt()).to.equal(0);
        });

        it("13. refuses a fee-on-transfer collateral and refunds the bond", async () => {
          const feeToken = (await (
            await ethers.getContractFactory("FeeToken", f.admin)
          ).deploy(0, "Fee Token", 18, "FEE", 100, f.admin.address)) as FeeToken;
          await feeToken.allocateTo(f.attacker.address, e18("1000"));
          const requestId = await requestPool(f, f.attacker, {
            collateralMarkets: [collateralMarket(await asCollateral(feeToken))],
            loanMarkets: [usdtLoanMarket(f)],
          });
          const xvsBefore = await f.xvs.balanceOf(f.attacker.address);

          await expect(f.manager.connect(f.team).buildRequestProposal(requestId, "Fee token"))
            .to.be.revertedWithCustomError(f.manager, "TransferAmountMismatch")
            .withArgs(feeToken.address);
          await f.manager.connect(f.team).rejectRequest(requestId);
          expect((await f.xvs.balanceOf(f.attacker.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
          expect(await f.xvs.balanceOf(f.manager.address)).to.equal(0);
        });

        it("14. seeds a rebasing collateral at its build amount", async () => {
          const rebasingToken = (await (
            await ethers.getContractFactory("ERC20Harness", f.admin)
          ).deploy(0, "REB Token", 18, "REB")) as ERC20Harness;
          await rebasingToken.harnessSetBalance(f.attacker.address, e18("1000"));
          const requestId = await requestPool(f, f.attacker, {
            collateralMarkets: [collateralMarket(await asCollateral(rebasingToken))],
            loanMarkets: [usdtLoanMarket(f)],
          });
          const { payload } = await buildRequest(f, requestId);
          const seed = seedFor(priceMantissa("2"));
          expect(await rebasingToken.balanceOf(f.manager.address)).to.equal(seed);

          const rebase = seed.div(100);
          await rebasingToken.harnessSetBalance(f.manager.address, seed.add(rebase));
          await executeVip(f, payload);
          expect(await rebasingToken.balanceOf(f.manager.address)).to.equal(rebase);

          await expect(f.manager.connect(f.timelock).sweepToken(rebasingToken.address, TREASURY, rebase))
            .to.emit(f.manager, "SweepToken")
            .withArgs(rebasingToken.address, TREASURY, rebase);
          expect(await rebasingToken.balanceOf(f.manager.address)).to.equal(0);
        });

        it("15. confines a transfer-blocking token to its own request", async () => {
          const trapToken = (await (
            await ethers.getContractFactory("ERC20Harness", f.admin)
          ).deploy(0, "TRAP Token", 18, "TRAP")) as ERC20Harness;
          await trapToken.harnessSetBalance(f.attacker.address, e18("1000"));
          const trappedRequestId = await requestPool(f, f.attacker, {
            collateralMarkets: [collateralMarket(await asCollateral(trapToken))],
            loanMarkets: [usdtLoanMarket(f)],
          });
          await buildRequest(f, trappedRequestId);
          await trapToken.harnessSetFailTransferToAddress(f.attacker.address, true);

          await expect(f.manager.connect(f.team).rejectRequest(trappedRequestId)).to.be.revertedWith(
            "SafeERC20: ERC20 operation did not succeed",
          );
          await expect(f.manager.connect(f.attacker).cancelRequest(trappedRequestId))
            .to.be.revertedWithCustomError(f.manager, "InvalidRequestStatus")
            .withArgs(trappedRequestId);
          await expect(
            f.manager.connect(f.attacker).requestPool(TIER_ONE, XVS, TIER_ONE_XVS_BOND, [], [usdtLoanMarket(f)]),
          )
            .to.be.revertedWithCustomError(f.manager, "OpenRequestExists")
            .withArgs(trappedRequestId);
          expect((await f.manager.getRequest(trappedRequestId)).status).to.equal(RequestStatus.Built);
          const trappedXvs = await f.xvs.balanceOf(f.manager.address);
          const trappedUsdt = await f.usdt.balanceOf(f.manager.address);
          expect(trappedXvs).to.equal(TIER_ONE_XVS_BOND);

          const honestCollateral = await newCollateralToken(f, "HON", "2");
          const honestRequestId = await requestPool(f, f.deployer, {
            collateralMarkets: [collateralMarket(honestCollateral)],
            loanMarkets: [usdtLoanMarket(f)],
          });
          await buildRequest(f, honestRequestId);
          const xvsBefore = await f.xvs.balanceOf(f.deployer.address);
          const usdtBefore = await f.usdt.balanceOf(f.deployer.address);
          const collateralBefore = await honestCollateral.token.balanceOf(f.deployer.address);
          await expect(f.manager.connect(f.team).rejectRequest(honestRequestId))
            .to.emit(f.manager, "RequestRejected")
            .withArgs(honestRequestId);

          expect((await f.xvs.balanceOf(f.deployer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
          expect((await f.usdt.balanceOf(f.deployer.address)).sub(usdtBefore)).to.equal(seedFor(priceMantissa("1")));
          expect((await honestCollateral.token.balanceOf(f.deployer.address)).sub(collateralBefore)).to.equal(
            seedFor(priceMantissa("2")),
          );
          expect(await f.xvs.balanceOf(f.manager.address)).to.equal(trappedXvs);
          expect(await f.usdt.balanceOf(f.manager.address)).to.equal(trappedUsdt);
        });
      });

      describe("after escaping an attacker", () => {
        let pool: DefaultPool;
        let comptroller: string;
        let seized: BigNumber;

        before(async () => {
          f = await loadOpenSpokeFixture();
          pool = await openFundedPool(f, POOL_LIQUIDITY, f.attacker);
          comptroller = pool.comptroller.address;
          ({ seized } = await escapeFromAttacker(pool, async () => undefined));
          snapshot = await snapshotFixture(f);
        });

        it("16. keeps the leftover bond out of the attacker's reach", async () => {
          const leftover = TIER_ONE_XVS_BOND.sub(seized);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(leftover);

          for (const caller of [f.attacker, f.team, f.guardian, f.keeper, f.recoverer, f.outsider]) {
            await expect(f.manager.connect(caller).releaseBond(comptroller))
              .to.be.revertedWithCustomError(f.manager, "Unauthorized")
              .withArgs(caller.address, f.manager.address, RELEASE_BOND);
          }
          await expect(f.manager.connect(f.attacker).seizeBond(comptroller, leftover, f.attacker.address))
            .to.be.revertedWithCustomError(f.manager, "Unauthorized")
            .withArgs(f.attacker.address, f.manager.address, SEIZE_BOND);
          await expect(f.bondManager.connect(f.attacker).release(comptroller))
            .to.be.revertedWithCustomError(f.bondManager, "NotSpokePoolManager")
            .withArgs(f.attacker.address);
          await expect(pool.bondAccount.connect(f.attacker).seize(leftover, f.attacker.address))
            .to.be.revertedWithCustomError(pool.bondAccount, "NotBondManager")
            .withArgs(f.attacker.address);

          await expect(f.manager.connect(f.attacker).withdrawBondExcess(comptroller))
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(leftover);
          expect(await pool.bondAccount.released()).to.equal(false);
        });

        it("17. lets governance seize the leftover bond to the treasury", async () => {
          const leftover = await f.bondManager.getCurrentBondAmount(comptroller);
          expect(leftover).to.equal(TIER_ONE_XVS_BOND.sub(seized));
          await grant(f.acm, f.timelock, f.manager.address, SEIZE_BOND, bscmainnet.NORMAL_TIMELOCK);
          const treasuryBefore = await f.xvs.balanceOf(TREASURY);

          await expect(f.manager.connect(f.timelock).seizeBond(comptroller, leftover, TREASURY))
            .to.emit(f.bondManager, "BondSeized")
            .withArgs(comptroller, TREASURY, leftover);
          expect((await f.xvs.balanceOf(TREASURY)).sub(treasuryBefore)).to.equal(leftover);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(0);
          expect(await f.bondManager.getCurrentBondAmount(comptroller)).to.equal(0);
        });

        it("18. keeps a donated excess from the attacker of a closed pool", async () => {
          const requiredBondUsd = await f.policyRegistry.getRequiredBondUsd(TIER_ONE, XVS);
          const price = await xvsPrice();
          const requiredBond = requiredBondUsd.mul(EXP_SCALE).add(price).sub(1).div(price);
          const excess = e18("100");
          await fundXvs(
            f.xvs,
            pool.bondAccount.address,
            requiredBond.sub(await f.xvs.balanceOf(pool.bondAccount.address)),
          );
          await fundXvs(f.xvs, pool.bondAccount.address, excess);
          expect(await f.manager.getExcessBondAmount(comptroller)).to.equal(excess);

          // Only a live, unpaused pool's deployer may withdraw excess; the escape left the pool closed
          await expect(f.manager.connect(f.attacker).withdrawBondExcess(comptroller))
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(requiredBond.add(excess));
        });
      });
    });

    describe("governance fairness", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      describe("from a fresh request", () => {
        before(async () => {
          f = await loadOpenSpokeFixture();
          snapshot = await snapshotFixture(f);
        });

        it("19. costs an honest deployer only the seeds", async () => {
          const { deployer, manager } = f;
          const collateral = await newCollateralToken(f, "HON", "2");
          const request = { collateralMarkets: [collateralMarket(collateral)], loanMarkets: [usdtLoanMarket(f)] };
          await fundDeployer(f, deployer, request);
          const balances = async () => ({
            xvs: await f.xvs.balanceOf(deployer.address),
            usdt: await f.usdt.balanceOf(deployer.address),
            collateral: await collateral.token.balanceOf(deployer.address),
          });
          const balancesBefore = await balances();

          await manager
            .connect(deployer)
            .requestPool(TIER_ONE, XVS, TIER_ONE_XVS_BOND, request.collateralMarkets, request.loanMarkets);
          const { comptroller, payload } = await buildRequest(f, (await manager.requestCount()).toNumber());
          await executeVip(f, payload);
          const bondAccount = await f.bondManager.bondAccounts(comptroller);

          const donation = e18("100");
          await fundXvs(f.xvs, bondAccount, donation);
          await expect(manager.connect(deployer).withdrawBondExcess(comptroller))
            .to.emit(f.bondManager, "ExcessWithdrawn")
            .withArgs(comptroller, donation);

          await expect(manager.connect(deployer).requestExit(comptroller)).to.emit(manager, "ExitRequested");
          await manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await executeVip(f, await manager.exitProposals(comptroller));
          await expect(manager.connect(f.team).closePool(comptroller))
            .to.emit(manager, "PoolClosed")
            .withArgs(comptroller);
          await expect(manager.connect(f.timelock).releaseBond(comptroller))
            .to.emit(f.bondManager, "BondReleased")
            .withArgs(comptroller, bondAccount);

          const balancesAfter = await balances();
          expect(balancesAfter.xvs.sub(balancesBefore.xvs)).to.equal(donation);
          expect(balancesBefore.usdt.sub(balancesAfter.usdt)).to.equal(seedFor(priceMantissa("1")));
          expect(balancesBefore.collateral.sub(balancesAfter.collateral)).to.equal(seedFor(priceMantissa("2")));
          expect(await f.xvs.balanceOf(bondAccount)).to.equal(0);
          for (const token of [f.xvs, f.usdt, collateral.token]) {
            expect(await token.balanceOf(manager.address)).to.equal(0);
          }
        });
      });

      describe("with the deployer's live pool", () => {
        let pool: DefaultPool;
        let comptroller: string;
        let collateralVToken: string;

        before(async () => {
          f = await loadOpenSpokeFixture();
          pool = await openFundedPool(f);
          comptroller = pool.comptroller.address;
          collateralVToken = pool.collateralVToken.address;
          snapshot = await snapshotFixture(f);
        });

        /// The tokens the manager holds a different amount of than its open requests escrow: each pending or built
        /// request's bond, plus each built request's seeds
        async function escrowMismatches(): Promise<string[]> {
          const escrowed = new Map<string, BigNumber>();
          const add = (token: string, amount: BigNumber) => {
            const key = ethers.utils.getAddress(token);
            escrowed.set(key, (escrowed.get(key) ?? BigNumber.from(0)).add(amount));
          };
          add(XVS, BigNumber.from(0));
          add(bscmainnet.USDT, BigNumber.from(0));

          const requestCount = (await f.manager.requestCount()).toNumber();
          for (let requestId = 1; requestId <= requestCount; ++requestId) {
            const request = await f.manager.getRequest(requestId);
            if (request.status !== RequestStatus.Pending && request.status !== RequestStatus.Built) continue;
            if (request.bondAsset !== ethers.constants.AddressZero) add(request.bondAsset, request.bondAmount);
            for (const market of [...request.collateralMarkets, ...request.loanMarkets]) {
              add(market.asset, await f.manager.requestSeeds(requestId, market.asset));
            }
          }

          const mismatches: string[] = [];
          for (const [token, amount] of escrowed) {
            const held = await (await ethers.getContractAt("MockToken", token)).balanceOf(f.manager.address);
            if (!held.eq(amount)) mismatches.push(token);
          }
          return mismatches;
        }

        it("20. lets only the shortfall seize, in proportion to the bad debt repaid", async () => {
          const timelock = await ethers.getSigner(bscmainnet.NORMAL_TIMELOCK);
          const callers = [f.team, f.guardian, timelock, f.keeper, f.recoverer, f.deployer, f.outsider];
          // The live ACM predates `hasPermission`: a role is the hash of the contract and the function signature
          const seizeRole = ethers.utils.solidityKeccak256(["address", "string"], [f.manager.address, SEIZE_BOND]);
          expect(await f.acm.hasRole(seizeRole, f.shortfall.address)).to.equal(true);
          for (const caller of callers) {
            expect(await f.acm.hasRole(seizeRole, caller.address)).to.equal(false);
            await expect(f.manager.connect(caller).seizeBond(comptroller, 1, caller.address))
              .to.be.revertedWithCustomError(f.manager, "Unauthorized")
              .withArgs(caller.address, f.manager.address, SEIZE_BOND);
          }

          await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("10000"));
          await borrow(f.borrower, pool.loanVToken, e18("8000"));
          const badDebt = await crashAndHeal(f, pool, f.borrower);
          const repaid = badDebt.div(2);
          await fundUsdt(f.usdt, f.recoverer.address, repaid);
          await f.usdt.connect(f.recoverer).approve(f.shortfall.address, repaid);
          const oracle = await resilientOracle();
          const seized = repaid
            .mul(await oracle.getUnderlyingPrice(pool.loanVToken.address))
            .div(await oracle.getPrice(XVS));
          const recovererBefore = await f.xvs.balanceOf(f.recoverer.address);

          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, repaid))
            .to.emit(f.bondManager, "BondSeized")
            .withArgs(comptroller, f.recoverer.address, seized);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(recovererBefore)).to.equal(seized);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(seized));
          expect(await pool.loanVToken.badDebt()).to.equal(badDebt.sub(repaid));
        });

        it("21. refuses to release the bond before the pool closes", async () => {
          const releaseRefused = () =>
            expect(f.manager.connect(f.timelock).releaseBond(comptroller))
              .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
              .withArgs(comptroller);

          await releaseRefused();
          await f.manager.connect(f.deployer).requestExit(comptroller);
          await releaseRefused();
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.ExitProposed);
          await releaseRefused();
          await executeVip(f, await f.manager.exitProposals(comptroller));
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.WindingDown);
          await releaseRefused();
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("22. keeps a pool on its old limits after a tier cut until the deployer changes them", async () => {
          await updateTier(f, TIER_ONE, {
            limits: { maxCollateralFactor: e18("0.55"), maxCollateralSupplyCapUsd: e18("150000") },
          });

          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.5"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(e18("100000"));
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
          expect(await f.bondManager.getCurrentBondAmount(comptroller)).to.equal(TIER_ONE_XVS_BOND);

          // $180,000 at $2: above the lowered $150,000 limit, within the cap the pool was built with
          await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("90000"));
          await borrow(f.borrower, pool.loanVToken, e18("80000"));
          expect(await pool.loanVToken.borrowBalanceStored(f.borrower.address)).to.equal(e18("80000"));

          const asDeployer = f.manager.connect(f.deployer);
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.56"), e18("0.66")))
            .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
            .withArgs(collateralVToken);
          // $160,000 at $2, over the lowered $150,000
          await expect(asDeployer.setCollateralSupplyCap(comptroller, collateralVToken, e18("80000")))
            .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
            .withArgs(collateralVToken);
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          await asDeployer.setCollateralSupplyCap(comptroller, collateralVToken, e18("70000"));
        });

        it("23. checks a new markets request against the changed tier", async () => {
          await updateTier(f, TIER_ONE, {
            minTierBondUsd: e18("120000"),
            limits: { maxCollateralSupplyCapUsd: e18("150000"), loanSupplyCapUsd: e18("500000") },
          });
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(e18("100000"));
          expect(await pool.comptroller.supplyCaps(pool.loanVToken.address)).to.equal(TIER_ONE_LOAN_CAP);

          const asDeployer = f.manager.connect(f.deployer);
          const added = await newCollateralToken(f, "ADD", "2");
          // $150,000 of XVS against the raised $180,000 (120,000 * 1.5)
          await expect(asDeployer.requestNewMarkets(comptroller, [collateralMarket(added)], []))
            .to.be.revertedWithCustomError(f.manager, "InsufficientBondValue")
            .withArgs(e18("150000"), await f.policyRegistry.getRequiredBondUsd(TIER_ONE, XVS));

          const topUp = xvsBondFor(e18("120000")).sub(TIER_ONE_XVS_BOND);
          await fundXvs(f.xvs, f.deployer.address, topUp);
          await asDeployer.topUpBond(comptroller, topUp);
          // $200,000 at $2, over the lowered $150,000
          await expect(asDeployer.requestNewMarkets(comptroller, [collateralMarket(added)], []))
            .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
            .withArgs(added.token.address);
          await expect(
            asDeployer.requestNewMarkets(comptroller, [collateralMarket(added, { supplyCap: e18("75000") })], []),
          ).to.emit(f.manager, "RequestSubmitted");
        });

        it("24. freezes factors whose threshold is above a lowered tier maximum", async () => {
          await updateTier(f, TIER_ONE, {
            limits: { maxCollateralFactor: e18("0.5"), maxLiquidationThreshold: e18("0.55") },
          });
          const asDeployer = f.manager.connect(f.deployer);

          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.45"), e18("0.6")))
            .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
            .withArgs(collateralVToken);
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.45"), e18("0.55")))
            .to.be.revertedWithCustomError(f.manager, "InvalidCollateralFactors")
            .withArgs(collateralVToken);

          await pool.comptroller.connect(f.guardian).setCollateralFactor(collateralVToken, e18("0.5"), e18("0.55"));
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.45"), e18("0.55"));
        });

        // Accepted: the steward applies what the manager published and does not read the tier
        it("25. applies a pending raise above a tier lowered meanwhile", async () => {
          const asDeployer = f.manager.connect(f.deployer);
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7"));
          await updateTier(f, TIER_ONE, { limits: { maxCollateralFactor: e18("0.5") } });

          const updateId = await applyLatestUpdate(f, UpdateType.collateralFactors, collateralVToken);
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Executed);
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.6"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.7"));
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.7")))
            .to.be.revertedWithCustomError(f.manager, "ExceedsTierLimit")
            .withArgs(collateralVToken);
        });

        it("26. applies an update published before the tier upgrade executes", async () => {
          const topUp = xvsBondFor(TIER_TWO_BOND_USD).sub(TIER_ONE_XVS_BOND);
          await fundXvs(f.xvs, f.deployer.address, topUp);
          await f.manager.connect(f.deployer).topUpBond(comptroller, topUp);
          await f.manager.connect(f.deployer).requestTierUpgrade(comptroller, TIER_TWO);
          const { payload } = await buildRequest(f, (await f.manager.requestCount()).toNumber());
          const proposalId = await proposeAndQueue(f, payload);

          await f.manager
            .connect(f.deployer)
            .setCollateralFactor(comptroller, collateralVToken, e18("0.6"), e18("0.7"));
          await f.governor.execute(proposalId);
          expect((await f.manager.getPool(comptroller)).tierId).to.equal(TIER_TWO);

          const updateId = await applyLatestUpdate(f, UpdateType.collateralFactors, collateralVToken);
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Executed);
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.6"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.7"));
        });

        it("27. lets governance apply a change the receiver will not execute", async () => {
          const asDeployer = f.manager.connect(f.deployer);
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          const publishedAt = await time.latest();
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          await f.receiver.connect(f.keeper).processUpdate(updateId);
          const { unlockTime } = await f.receiver.updates(updateId);
          await advanceTime(f, unlockTime.sub(await time.latest()).toNumber());
          // Collateral factor updates switched off on the receiver, e.g. during an incident
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          await grant(
            f.acm,
            f.timelock,
            RISK_STEWARD_RECEIVER,
            "setConfigActive(string,bool)",
            bscmainnet.NORMAL_TIMELOCK,
          );
          await receiver.connect(f.timelock).setConfigActive(UpdateType.collateralFactors, false);
          await expect(receiver.executeRegisteredUpdate(updateId)).to.be.revertedWithCustomError(
            receiver,
            "ConfigNotActive",
          );
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Pending);
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.5"), e18("0.6")))
            .to.be.revertedWithCustomError(f.manager, "PreviousUpdatePending")
            .withArgs(collateralVToken);

          await pool.comptroller.connect(f.timelock).setCollateralFactor(collateralVToken, e18("0.55"), e18("0.65"));
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.55"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.65"));

          // Once the stuck update expires, the deployer can publish again
          const expiration: BigNumber = await receiver.UPDATE_EXPIRATION_TIME();
          await advanceTime(f, publishedAt + expiration.toNumber() + 1 - (await time.latest()));
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.5"), e18("0.65"));
          expect(
            await f.riskOracle.getLatestUpdateIdByTypeAndMarket(UpdateType.collateralFactors, collateralVToken),
          ).to.be.gt(updateId);
        });

        it("28. blocks raises under a higher required bond until a top-up", async () => {
          const asDeployer = f.manager.connect(f.deployer);
          const bondUsd = TIER_ONE_XVS_BOND.mul(await xvsPrice()).div(EXP_SCALE);
          const { minCoverageRatio } = TIER_ONE_LIMITS;
          const raiseCollateralFactor = () =>
            asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));

          await updateTier(f, TIER_ONE, { minTierBondUsd: e18("150000") });
          let requiredBondUsd = await f.policyRegistry.getRequiredBondUsd(TIER_ONE, XVS);
          await expect(raiseCollateralFactor())
            .to.be.revertedWithCustomError(f.manager, "CoverageTooLow")
            .withArgs(bondUsd.mul(EXP_SCALE).div(requiredBondUsd), minCoverageRatio);

          await f.policyRegistry.connect(f.timelock).setBondAssetFactor(XVS, e18("2"));
          requiredBondUsd = await f.policyRegistry.getRequiredBondUsd(TIER_ONE, XVS);
          await expect(raiseCollateralFactor())
            .to.be.revertedWithCustomError(f.manager, "CoverageTooLow")
            .withArgs(bondUsd.mul(EXP_SCALE).div(requiredBondUsd), minCoverageRatio);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);

          const topUp = requiredBondUsd
            .mul(EXP_SCALE)
            .div(await xvsPrice())
            .sub(TIER_ONE_XVS_BOND);
          await fundXvs(f.xvs, f.deployer.address, topUp);
          await expect(asDeployer.topUpBond(comptroller, topUp))
            .to.emit(f.bondManager, "BondToppedUp")
            .withArgs(comptroller, topUp);
          await raiseCollateralFactor();
        });

        // Governance must not disallow a bond asset a live pool holds, or its deployer cannot withdraw excess
        it("29. refuses excess withdrawals while the bond asset is disallowed", async () => {
          await f.policyRegistry.connect(f.timelock).setBondAssetFactor(XVS, 0);
          const otherCollateral = await newCollateralToken(f, "NEW", "2");
          await expect(
            requestPool(f, f.secondDeployer, {
              collateralMarkets: [collateralMarket(otherCollateral)],
              loanMarkets: [usdtLoanMarket(f)],
            }),
          )
            .to.be.revertedWithCustomError(f.policyRegistry, "BondAssetNotAllowed")
            .withArgs(XVS);

          const donation = e18("100");
          await fundXvs(f.xvs, pool.bondAccount.address, donation);
          await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller))
            .to.be.revertedWithCustomError(f.policyRegistry, "BondAssetNotAllowed")
            .withArgs(XVS);
          await expect(f.manager.getExcessBondAmount(comptroller))
            .to.be.revertedWithCustomError(f.policyRegistry, "BondAssetNotAllowed")
            .withArgs(XVS);

          await f.policyRegistry.connect(f.timelock).setBondAssetFactor(XVS, XVS_BOND_FACTOR);
          const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
          await f.manager.connect(f.deployer).withdrawBondExcess(comptroller);
          expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(donation);
        });

        it("30. leaves a paused deployer only cancel and top-up", async () => {
          const asDeployer = f.manager.connect(f.deployer);
          const newCollateral = await newCollateralToken(f, "ADD", "3");
          await asDeployer.requestNewMarkets(comptroller, [collateralMarket(newCollateral)], []);
          const requestId = await f.manager.requestCount();

          await expect(f.manager.connect(f.guardian).pauseDeployer(comptroller))
            .to.emit(f.manager, "DeployerPausedUpdated")
            .withArgs(comptroller, true);
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65")))
            .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
            .withArgs(comptroller);

          await expect(asDeployer.cancelRequest(requestId)).to.emit(f.manager, "RequestCanceled").withArgs(requestId);
          const topUp = e18("100");
          await fundXvs(f.xvs, f.deployer.address, topUp);
          await expect(asDeployer.topUpBond(comptroller, topUp))
            .to.emit(f.bondManager, "BondToppedUp")
            .withArgs(comptroller, topUp);
          const donation = e18("50");
          await fundXvs(f.xvs, pool.bondAccount.address, donation);
          await expect(asDeployer.withdrawBondExcess(comptroller))
            .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
            .withArgs(comptroller);

          await expect(f.manager.connect(f.team).unpauseDeployer(comptroller))
            .to.emit(f.manager, "DeployerPausedUpdated")
            .withArgs(comptroller, false);
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          // Everything above the required bond is excess, so the top-up comes back with the donation
          await expect(asDeployer.withdrawBondExcess(comptroller))
            .to.emit(f.bondManager, "ExcessWithdrawn")
            .withArgs(comptroller, topUp.add(donation));
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("31. lets a paused deployer open a new pool after a handover", async () => {
          await f.manager.connect(f.guardian).pauseDeployer(comptroller);
          await expect(f.manager.connect(f.deployer).requestExit(comptroller))
            .to.be.revertedWithCustomError(f.manager, "DeployerPaused")
            .withArgs(comptroller);

          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          await f.manager.connect(f.timelock).handoverPoolToGovernance(comptroller);
          expect(await f.manager.activePools(f.deployer.address)).to.equal(ZERO);

          const next = await openDefaultPool(f, f.deployer);
          const nextComptroller = next.comptroller.address;
          expect(await f.manager.activePools(f.deployer.address)).to.equal(nextComptroller);
          expect((await f.manager.getPool(comptroller)).deployerPaused).to.equal(true);
          expect((await f.manager.getPool(nextComptroller)).deployerPaused).to.equal(false);
          await f.manager
            .connect(f.deployer)
            .setCollateralFactor(nextComptroller, next.collateralVToken.address, e18("0.55"), e18("0.65"));
          await expect(
            f.manager.connect(f.deployer).setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65")),
          )
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);
        });

        // Accepted: a team supply pause leaves the deployer's controls on, so its later raise restores the factor
        it("32. lets a later collateral factor raise undo a team supply pause", async () => {
          await teamSupplyPause(f, collateralVToken);
          expect((await pool.comptroller.markets(collateralVToken)).collateralFactorMantissa).to.equal(0);
          expect(await pool.comptroller.actionPaused(collateralVToken, Action.MINT)).to.equal(true);

          await f.manager
            .connect(f.deployer)
            .setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          await f.receiver.connect(f.keeper).processUpdate(updateId);
          const registered = await f.receiver.updates(updateId);
          expect(registered.status).to.equal(UpdateStatus.Pending);
          await advanceTime(f, registered.unlockTime.sub(await time.latest()).toNumber());
          await f.receiver.connect(f.keeper).executeRegisteredUpdate(updateId);

          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Executed);
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(e18("0.55"));
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.65"));
          expect(await pool.comptroller.actionPaused(collateralVToken, Action.MINT)).to.equal(true);
        });

        it("33. lets the keeper reject a raise that would undo a supply pause", async () => {
          await teamSupplyPause(f, collateralVToken);
          await f.manager
            .connect(f.deployer)
            .setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
          const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(
            UpdateType.collateralFactors,
            collateralVToken,
          );
          await f.receiver.connect(f.keeper).processUpdate(updateId);
          const registered = await f.receiver.updates(updateId);
          expect(registered.status).to.equal(UpdateStatus.Pending);

          await f.receiver.connect(f.keeper).rejectUpdate(updateId);
          await advanceTime(f, registered.unlockTime.sub(await time.latest()).toNumber());
          const receiver = new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, f.keeper);
          await expect(receiver.executeRegisteredUpdate(updateId)).to.be.revertedWithCustomError(
            receiver,
            "UpdateAlreadyResolved",
          );
          expect((await f.receiver.updates(updateId)).status).to.equal(UpdateStatus.Rejected);
          const market = await pool.comptroller.markets(collateralVToken);
          expect(market.collateralFactorMantissa).to.equal(0);
          expect(market.liquidationThresholdMantissa).to.equal(e18("0.6"));
          expect(await pool.comptroller.actionPaused(collateralVToken, Action.MINT)).to.equal(true);
        });

        it("34. restores controls on rejectExit and fails the built exit VIP", async () => {
          const asDeployer = f.manager.connect(f.deployer);
          await asDeployer.requestExit(comptroller);
          await expect(asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65")))
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(comptroller);
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          const payload = await f.manager.exitProposals(comptroller);
          const proposalId = await proposeAndQueue(f, payload);

          await expect(f.manager.connect(f.team).rejectExit(comptroller))
            .to.emit(f.manager, "ExitRejected")
            .withArgs(comptroller);
          await expect(f.governor.execute(proposalId)).to.be.reverted;
          const failure = await vipFailure(f, payload);
          expect(failure?.index).to.equal(vipActions(payload).length - 1);
          expect(failure?.signature).to.equal("startWindDown(address)");
          expect(failure?.reason).to.include("InvalidPoolStatus");

          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.Live);
          expect(await pool.comptroller.actionPaused(collateralVToken, Action.MINT)).to.equal(false);
          expect(await pool.comptroller.supplyCaps(collateralVToken)).to.equal(e18("100000"));
          expect((await pool.comptroller.markets(collateralVToken)).collateralFactorMantissa).to.equal(e18("0.5"));
          await asDeployer.setCollateralFactor(comptroller, collateralVToken, e18("0.55"), e18("0.65"));
        });

        it("35. hands an exit-requested pool over to governance", async () => {
          await f.manager.connect(f.deployer).requestExit(comptroller);
          await expect(f.manager.connect(f.timelock).handoverPoolToGovernance(comptroller))
            .to.emit(f.manager, "PoolHandedOver")
            .withArgs(comptroller);
          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.HandedOver);
          expect(await f.manager.activePools(f.deployer.address)).to.equal(ethers.constants.AddressZero);

          await supplyCollateral(f.supplier, pool.collateral, pool.collateralVToken, e18("1000"));
          expect(await pool.collateralVToken.balanceOf(f.supplier.address)).to.be.gt(0);

          const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
          await f.manager.connect(f.timelock).releaseBond(comptroller);
          expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("36. hands an exit-proposed pool over to governance, failing its VIP", async () => {
          await f.manager.connect(f.team).buildExitProposal(comptroller, EXIT_LIQUIDATION_THRESHOLDS, "Exit");
          const payload = await f.manager.exitProposals(comptroller);
          const proposalId = await proposeAndQueue(f, payload);
          await f.manager.connect(f.timelock).handoverPoolToGovernance(comptroller);
          await expect(f.governor.execute(proposalId)).to.be.reverted;
          const failure = await vipFailure(f, payload);
          expect(failure?.index).to.equal(vipActions(payload).length - 1);
          expect(failure?.signature).to.equal("startWindDown(address)");
          expect(failure?.reason).to.include("InvalidPoolStatus");

          expect((await f.manager.getPool(comptroller)).status).to.equal(PoolStatus.HandedOver);
          expect(await pool.comptroller.actionPaused(collateralVToken, Action.MINT)).to.equal(false);
          await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("1000"));
          const borrowed = e18("100");
          const usdtBefore = await f.usdt.balanceOf(f.borrower.address);
          await borrow(f.borrower, pool.loanVToken, borrowed);
          expect((await f.usdt.balanceOf(f.borrower.address)).sub(usdtBefore)).to.equal(borrowed);

          const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
          await f.manager.connect(f.timelock).releaseBond(comptroller);
          expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("37. flags a sweep of escrowed bonds before a refund fails", async () => {
          waiveInvariants();
          const otherCollateral = await newCollateralToken(f, "ESC", "2");
          const requestId = await requestPool(f, f.secondDeployer, {
            collateralMarkets: [collateralMarket(otherCollateral)],
            loanMarkets: [usdtLoanMarket(f)],
          });
          expect(await escrowMismatches()).to.deep.equal([]);

          await expect(f.manager.connect(f.timelock).sweepToken(XVS, f.outsider.address, TIER_ONE_XVS_BOND))
            .to.emit(f.manager, "SweepToken")
            .withArgs(XVS, f.outsider.address, TIER_ONE_XVS_BOND);
          expect(await escrowMismatches()).to.deep.equal([ethers.utils.getAddress(XVS)]);
          await expect(f.manager.connect(f.secondDeployer).cancelRequest(requestId)).to.be.reverted;
          expect((await f.manager.getRequest(requestId)).status).to.equal(RequestStatus.Pending);
        });
      });
    });

    describe("permissions", () => {
      let f: OpenSpokeFixture;
      let snapshot: { restore: () => Promise<void> };
      let pool: Awaited<ReturnType<typeof openDefaultPool>>;
      let comptroller: string;

      before(async () => {
        f = await loadOpenSpokeFixture();
        pool = await openDefaultPool(f);
        comptroller = pool.comptroller.address;
        snapshot = await snapshotFixture(f);
      });

      afterEach(async function () {
        if (this.currentTest?.state === "passed") await assertInvariants(f);
        await snapshot.restore();
      });

      /// Asserts every refused caller reverts with `error` and every holder gets past it. An ACM-gated function
      /// passes its `signature`, which the ACM error carries after the caller and the contract
      async function expectOnlyHolders<T extends Contract>(
        contract: T,
        error: string,
        call: Call<T>,
        { holders, refused, signature }: { holders: Signer[]; refused: Signer[]; signature?: string },
      ) {
        for (const caller of refused) {
          const callerAddress = await caller.getAddress();
          const args = signature ? [callerAddress, contract.address, signature] : [callerAddress];
          await expect(call(contract.connect(caller) as T))
            .to.be.revertedWithCustomError(contract, error)
            .withArgs(...args);
        }
        for (const holder of holders) {
          await expect(call(contract.connect(holder) as T)).not.to.be.revertedWithCustomError(contract, error);
        }
      }

      /// Asserts an outsider is refused the owner-only setters and the initializer, and the owner passes the setters
      async function expectOwnerOnly(contract: Contract) {
        const owner = await impersonate(await contract.owner());
        const ownerOnly: Call<Contract>[] = [
          target => target.callStatic.setAccessControlManager(bscmainnet.ACM),
          target => target.callStatic.transferOwnership(f.outsider.address),
          target => target.callStatic.renounceOwnership(),
        ];
        for (const call of ownerOnly) {
          await expect(call(contract.connect(f.outsider))).to.be.revertedWith("Ownable: caller is not the owner");
          await expect(call(contract.connect(owner))).not.to.be.reverted;
        }
        await expect(contract.connect(f.outsider).callStatic.initialize(bscmainnet.ACM)).to.be.revertedWith(
          "Initializable: contract is already initialized",
        );
      }

      it("38. restricts each manager function to its role", async () => {
        const { requestId, collateralVToken } = pool;
        const collateral = pool.collateral.token.address;
        const shortfall = await impersonate(f.shortfall.address);
        const teamRoles: [string, Signer[], Call<SpokePoolManager>][] = [
          [
            "setOracleFeeds(uint256,address,OracleFeed[3],uint256)",
            [f.team],
            manager => manager.callStatic.setOracleFeeds(requestId, collateral, [NO_FEED, NO_FEED, NO_FEED], 0),
          ],
          [
            "setDeviationBoundedOracleParams(uint256,address,uint64,uint256,uint256)",
            [f.team],
            manager =>
              manager.callStatic.setDeviationBoundedOracleParams(requestId, collateral, 3600, e18("0.1"), e18("0.05")),
          ],
          [
            "buildRequestProposal(uint256,string)",
            [f.team],
            manager => manager.callStatic.buildRequestProposal(requestId, ""),
          ],
          ["rejectRequest(uint256)", [f.team], manager => manager.callStatic.rejectRequest(requestId)],
          [
            "buildExitProposal(address,uint256[],string)",
            [f.team],
            manager => manager.callStatic.buildExitProposal(comptroller, [e18("0.6"), 0], ""),
          ],
          [
            "buildForceCloseProposal(address,string)",
            [f.team],
            manager => manager.callStatic.buildForceCloseProposal(comptroller, ""),
          ],
          ["closePool(address)", [f.team], manager => manager.callStatic.closePool(comptroller)],
          ["rejectExit(address)", [f.team], manager => manager.callStatic.rejectExit(comptroller)],
          ["pauseDeployer(address)", [f.team, f.guardian], manager => manager.callStatic.pauseDeployer(comptroller)],
          ["unpauseDeployer(address)", [f.team], manager => manager.callStatic.unpauseDeployer(comptroller)],
          ["settleRequest(uint256)", [f.timelock], manager => manager.callStatic.settleRequest(requestId)],
          ["releaseBond(address)", [f.timelock], manager => manager.callStatic.releaseBond(comptroller)],
          ["startWindDown(address)", [f.timelock], manager => manager.callStatic.startWindDown(comptroller)],
          [
            "handoverPoolToGovernance(address)",
            [f.timelock],
            manager => manager.callStatic.handoverPoolToGovernance(comptroller),
          ],
          [
            "setProposalBuilder(address)",
            [f.timelock],
            manager => manager.callStatic.setProposalBuilder(f.builder.address),
          ],
          [
            "setBondManager(address)",
            [f.timelock],
            manager => manager.callStatic.setBondManager(f.bondManager.address),
          ],
          [
            "setHubYieldGroup(address,address)",
            [f.timelock],
            manager => manager.callStatic.setHubYieldGroup(bscmainnet.USDT, f.yieldGroup.address),
          ],
          [
            "setSupportedOracles(address[3])",
            [f.timelock],
            manager =>
              manager.callStatic.setSupportedOracles([
                bscmainnet.CHAINLINK_ORACLE,
                bscmainnet.REDSTONE_ORACLE,
                f.thirdOracle.address,
              ]),
          ],
          [
            "setWindDownPeriod(uint256)",
            [f.timelock],
            manager => manager.callStatic.setWindDownPeriod(WIND_DOWN_PERIOD),
          ],
          [
            "setMaxResidualPoolDebtUsd(uint256)",
            [f.timelock],
            manager => manager.callStatic.setMaxResidualPoolDebtUsd(MAX_RESIDUAL_POOL_DEBT_USD),
          ],
          [
            "sweepToken(address,address,uint256)",
            [f.timelock],
            manager => manager.callStatic.sweepToken(XVS, bscmainnet.NORMAL_TIMELOCK, 0),
          ],
          [
            "seizeBond(address,uint256,address)",
            [shortfall],
            manager => manager.callStatic.seizeBond(comptroller, 1, f.outsider.address),
          ],
        ];
        for (const [signature, holders, call] of teamRoles) {
          await expectOnlyHolders(f.manager, "Unauthorized", call, {
            holders,
            refused: [f.outsider, f.deployer],
            signature,
          });
        }

        const deployerControls: Call<SpokePoolManager>[] = [
          manager => manager.callStatic.requestNewMarkets(comptroller, [], []),
          manager => manager.callStatic.requestTierUpgrade(comptroller, TIER_TWO),
          manager => manager.callStatic.cancelRequest(requestId),
          manager =>
            manager.callStatic.setCollateralFactor(comptroller, collateralVToken.address, e18("0.55"), e18("0.6")),
          manager => manager.callStatic.setCollateralSupplyCap(comptroller, collateralVToken.address, e18("200000")),
          manager => manager.callStatic.pauseCollateralSupply(comptroller, collateralVToken.address),
          manager => manager.callStatic.withdrawBondExcess(comptroller),
          manager => manager.callStatic.topUpBond(comptroller, 0),
          manager => manager.callStatic.requestExit(comptroller),
        ];
        for (const call of deployerControls) {
          await expectOnlyHolders(f.manager, "NotDeployer", call, {
            holders: [f.deployer],
            refused: [f.outsider, f.team],
          });
        }

        await fundXvs(f.xvs, f.outsider.address, TIER_ONE_XVS_BOND);
        await f.xvs.connect(f.outsider).approve(f.manager.address, TIER_ONE_XVS_BOND);
        const nextRequestId = await f.manager
          .connect(f.outsider)
          .callStatic.requestPool(
            TIER_ONE,
            XVS,
            TIER_ONE_XVS_BOND,
            [collateralMarket(pool.collateral)],
            [usdtLoanMarket(f)],
          );
        expect(nextRequestId).to.equal((await f.manager.requestCount()).add(1));

        await expectOwnerOnly(f.manager);
      });

      it("39. lets only the manager build request VIPs", async () => {
        const manager = await impersonate(f.manager.address);
        await expectOnlyHolders(
          f.builder,
          "NotSpokePoolManager",
          builder => builder.callStatic.buildRequestProposal(pool.requestId, ""),
          { holders: [manager], refused: [f.outsider, f.deployer, f.team, f.timelock] },
        );
        // The exit and force-close builders are views, so anyone may preview them
        expect(await f.builder.connect(f.outsider).buildExitProposal(comptroller, [e18("0.6"), 0], "")).not.to.equal(
          "0x",
        );
        expect(await f.builder.connect(f.outsider).buildForceCloseProposal(comptroller, "")).not.to.equal("0x");
      });

      it("40. restricts recovery to the recoverer and repayment to the timelock", async () => {
        const loanVToken = pool.loanVToken.address;
        const roles: [string, Signer[], Signer[], Call<SpokePoolShortfall>][] = [
          [
            "recoverBadDebt(address,uint256)",
            [f.recoverer],
            [f.outsider, f.deployer, f.team, f.timelock],
            shortfall => shortfall.callStatic.recoverBadDebt(loanVToken, 0),
          ],
          [
            "repayBadDebt(address,uint256)",
            [f.timelock],
            [f.outsider, f.deployer, f.team, f.recoverer],
            shortfall => shortfall.callStatic.repayBadDebt(loanVToken, 0),
          ],
        ];
        for (const [signature, holders, refused, call] of roles) {
          await expectOnlyHolders(f.shortfall, "Unauthorized", call, { holders, refused, signature });
        }
        await expectOwnerOnly(f.shortfall);
      });

      it("41. restricts bond moves to the manager and config to the timelock", async () => {
        const manager = await impersonate(f.manager.address);
        const account = pool.bondAccount.address;
        const managerOnly: Call<SpokeBondManager>[] = [
          bondManager => bondManager.callStatic.createBond(f.outsider.address, f.deployer.address, XVS, 0),
          bondManager => bondManager.callStatic.topUp(comptroller, 0),
          bondManager => bondManager.callStatic.withdrawExcess(comptroller, 0),
          bondManager => bondManager.callStatic.seize(comptroller, 1, f.outsider.address),
          bondManager => bondManager.callStatic.release(comptroller),
        ];
        for (const call of managerOnly) {
          await expectOnlyHolders(f.bondManager, "NotSpokePoolManager", call, {
            holders: [manager],
            refused: [f.outsider, f.deployer, f.team, f.timelock],
          });
        }

        const idleImplementation = await f.bondManager.accountImplementations(SourceType.Idle);
        const timelockRoles: [string, Call<SpokeBondManager>][] = [
          ["depositInSource(address)", bondManager => bondManager.callStatic.depositInSource(account)],
          [
            "setAccountImplementation(uint8,address)",
            bondManager => bondManager.callStatic.setAccountImplementation(SourceType.Idle, idleImplementation),
          ],
          [
            "setAssetConfig(address,AssetConfig)",
            bondManager => bondManager.callStatic.setAssetConfig(XVS, { sourceType: SourceType.Idle, source: ZERO }),
          ],
        ];
        for (const [signature, call] of timelockRoles) {
          await expectOnlyHolders(f.bondManager, "Unauthorized", call, {
            holders: [f.timelock],
            refused: [f.outsider, f.deployer, f.team],
            signature,
          });
        }

        await expectOwnerOnly(f.bondManager);
      });

      it("42. lets only the timelock configure the policy registry", async () => {
        const tier = await f.policyRegistry.getTier(TIER_ONE);
        const marketParams = await f.policyRegistry.marketParams();
        const oracleParams = await f.policyRegistry.oracleParams();
        const usdtConfig = await f.policyRegistry.getLoanAssetConfig(bscmainnet.USDT);
        const roles: [string, Call<SpokePoolPolicyRegistry>][] = [
          [
            "setTier(uint256,Tier)",
            registry =>
              registry.callStatic.setTier(TIER_ONE, {
                enabled: tier.enabled,
                minTierBondUsd: tier.minTierBondUsd,
                limits: tier.limits,
              }),
          ],
          [
            "setLoanAssetConfig(address,LoanAssetConfig)",
            registry =>
              registry.callStatic.setLoanAssetConfig(bscmainnet.USDT, {
                factor: usdtConfig.factor,
                interestRateModels: usdtConfig.interestRateModels,
              }),
          ],
          [
            "setLoanAssetFactor(address,uint256)",
            registry => registry.callStatic.setLoanAssetFactor(bscmainnet.USDT, usdtConfig.factor),
          ],
          [
            "addInterestRateModel(address,address)",
            registry =>
              registry.callStatic.addInterestRateModel(bscmainnet.USDT, f.collateralInterestRateModel.address),
          ],
          [
            "setBondAssetFactor(address,uint256)",
            registry => registry.callStatic.setBondAssetFactor(XVS, XVS_BOND_FACTOR),
          ],
          ["setPoolParams(PoolParams)", registry => registry.callStatic.setPoolParams(POOL_PARAMS)],
          [
            "setMarketParams(ProtocolMarketParams)",
            registry =>
              registry.callStatic.setMarketParams({
                collateralInterestRateModel: marketParams.collateralInterestRateModel,
                reserveFactor: marketParams.reserveFactor,
                reduceReservesBlockDelta: marketParams.reduceReservesBlockDelta,
              }),
          ],
          [
            "setOracleParams(OracleParams)",
            registry =>
              registry.callStatic.setOracleParams({
                deviationBoundedOracleEnabled: oracleParams.deviationBoundedOracleEnabled,
                cooldownPeriod: oracleParams.cooldownPeriod,
                triggerThreshold: oracleParams.triggerThreshold,
                resetThreshold: oracleParams.resetThreshold,
                boundDeviation: oracleParams.boundDeviation,
              }),
          ],
        ];
        for (const [signature, call] of roles) {
          await expectOnlyHolders(f.policyRegistry, "Unauthorized", call, {
            holders: [f.timelock],
            refused: [f.outsider, f.deployer, f.team],
            signature,
          });
        }
        await expectOwnerOnly(f.policyRegistry);
      });

      it("43. lets only the bond manager move a bond account's funds", async () => {
        const bondManager = await impersonate(f.bondManager.address);
        const manager = await impersonate(f.manager.address);
        const liquidityHubImplementation = await ethers.getContractAt(
          "IBondAccount",
          await f.bondManager.accountImplementations(SourceType.LiquidityHub),
        );
        const accountCalls: Call<Contract>[] = [
          account => account.callStatic.depositInSource(),
          account => account.callStatic.withdrawExcess(0),
          account => account.callStatic.seize(1, f.outsider.address),
          account => account.callStatic.release(),
        ];

        for (const account of [pool.bondAccount, liquidityHubImplementation]) {
          for (const call of accountCalls) {
            await expectOnlyHolders(account, "NotBondManager", call, {
              holders: [bondManager],
              refused: [f.outsider, f.deployer, f.timelock, manager],
            });
          }
          await expect(
            account.connect(f.outsider).callStatic.initialize(f.outsider.address, XVS, ZERO),
          ).to.be.revertedWith("Initializable: contract is already initialized");
        }
      });
    });
  });
}

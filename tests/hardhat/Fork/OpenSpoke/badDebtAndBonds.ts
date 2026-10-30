import { smock } from "@defi-wonderland/smock";
import { mine, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { AccessControlManager, MockToken, VToken } from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import { grant } from "../HubSpoke/fixture";
import {
  OpenSpokeFixture,
  SourceType,
  TIER_ONE,
  TIER_ONE_BOND_USD,
  XVS,
  e18,
  fundUsdt,
  fundXvs,
  loadOpenSpokeFixture,
  pinLivePrice,
  setPrice,
  snapshotFixture,
} from "./util/fixture";
import {
  DefaultPool,
  EXP_SCALE,
  HUB_ABI,
  PoolStatus,
  TIER_ONE_XVS_BOND,
  ZERO,
  assertInvariants,
  borrow,
  collateralMarket,
  crashAndHeal,
  depositToHub,
  exitPool,
  newCollateralToken,
  openDefaultPool,
  openFundedPool,
  openPool,
  recoverFromBond,
  resilientOracle,
  supplyCollateral,
  updateTier,
  usdtLoanMarket,
  useLiquidityHubBonds,
  wireHubQueues,
} from "./util/helpers";

const FORK = process.env.FORK === "true";

const LIQUIDITY = e18("100000");
const USDT_BOND = e18("100000");
const HUB_VIEWS_ABI = [
  ...HUB_ABI,
  "function accrueFees()",
  "function previewDeposit(uint256) view returns (uint256)",
  "function previewWithdraw(uint256) view returns (uint256)",
  "error HubPaused()",
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
];

interface Default {
  collateral: BigNumber;
  borrowed: BigNumber;
  crashedUsd: string;
}

// $5 of collateral after the crash leaves ~$4.45 of bad debt, under the $10 a pool may close with
const SMALL_DEFAULT: Default = { collateral: e18("10"), borrowed: e18("9"), crashedUsd: "0.5" };
// Collateral worth $50 after the crash leaves ~$854 of bad debt
const DEFAULT: Default = { collateral: e18("1000"), borrowed: e18("900"), crashedUsd: "0.05" };
// Collateral worth $50 after the crash leaves ~$48,955 of bad debt
const LARGE_DEFAULT: Default = { collateral: e18("50000"), borrowed: e18("49000"), crashedUsd: "0.001" };

if (FORK) {
  describe("Open Spoke Pool: bad debt and bonds", function () {
    this.timeout(0);

    /// Borrows against the pool's collateral, crashes it and heals the account; returns the loan market's bad debt
    async function createBadDebt(f: OpenSpokeFixture, pool: DefaultPool, position: Default): Promise<BigNumber> {
      await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, position.collateral);
      await borrow(f.borrower, pool.loanVToken, position.borrowed);
      const badDebt = await crashAndHeal(f, pool, f.borrower, position.crashedUsd);
      expect(badDebt).to.be.gt(0);
      return badDebt;
    }

    /// The deployer requests an exit and governance executes the exit VIP
    async function windDown(f: OpenSpokeFixture, pool: DefaultPool) {
      await f.manager.connect(f.deployer).requestExit(pool.comptroller.address);
      await exitPool(f, pool.comptroller);
    }

    /// The live USDT Liquidity Hub, with the views and events these tests read
    function liquidityHub(f: OpenSpokeFixture): Contract {
      return new ethers.Contract(f.hub.address, HUB_VIEWS_ABI, f.admin);
    }

    /// The Hub as the timelock, granted pauseHub and unpauseHub
    async function hubAsTimelock(f: OpenSpokeFixture) {
      const hub = new ethers.Contract(f.hub.address, HUB_ABI, f.timelock);
      const hubAcm = (await ethers.getContractAt(
        "AccessControlManager",
        await hub.accessControlManager(),
      )) as AccessControlManager;
      for (const signature of ["pauseHub()", "unpauseHub()"]) {
        await grant(hubAcm, f.timelock, hub.address, signature, bscmainnet.NORMAL_TIMELOCK);
      }
      return hub;
    }

    /// What `read` returns to the next transaction: mines one block on a snapshot at a pinned timestamp, accruing Hub fees
    /// first when `accrueHub` (as Hub deposits and withdrawals do), then rewinds and pins the next block to that timestamp
    async function readAtNextBlock(f: OpenSpokeFixture, read: () => Promise<BigNumber>, accrueHub: boolean) {
      const timestamp = (await time.latest()) + 1;
      const snapshot = await takeSnapshot();
      await time.setNextBlockTimestamp(timestamp);
      if (accrueHub) await liquidityHub(f).accrueFees();
      else await mine(1);
      const value = await read();
      await snapshot.restore();
      await time.setNextBlockTimestamp(timestamp);
      return value;
    }

    /// The default pool with a USDT bond; given `liquidity`, its loan market is wired on the Hub and funded through it
    async function openUsdtBondPool(
      f: OpenSpokeFixture,
      liquidity?: BigNumber,
      bondAmount = USDT_BOND,
    ): Promise<DefaultPool> {
      const collateral = await newCollateralToken(f, "COL", "2");
      const pool = await openPool(f, f.deployer, {
        bondAsset: bscmainnet.USDT,
        bondAmount,
        collateralMarkets: [collateralMarket(collateral)],
        loanMarkets: [usdtLoanMarket(f)],
      });
      const loanVToken = pool.loanVTokens[0];
      if (liquidity) {
        await wireHubQueues(f, [loanVToken.address]);
        await depositToHub(f, liquidity);
      }
      return { ...pool, collateral, collateralVToken: pool.collateralVTokens[0], loanVToken };
    }

    describe("bad debt recovery", () => {
      let f: OpenSpokeFixture;
      let fixtureSnapshot: { restore: () => Promise<void> };

      before(async () => {
        f = await loadOpenSpokeFixture();
        await fundUsdt(f.usdt, f.recoverer.address, e18("200000"));
        await f.usdt.connect(f.recoverer).approve(f.shortfall.address, ethers.constants.MaxUint256);
        fixtureSnapshot = await snapshotFixture(f);
      });

      /// The bond a recovery of `repaid` bad debt pays out
      async function bondPayout(vToken: VToken, bondAsset: string, repaid: BigNumber) {
        const oracle = await resilientOracle();
        return repaid.mul(await oracle.getUnderlyingPrice(vToken.address)).div(await oracle.getPrice(bondAsset));
      }

      describe("with a USDT bond", () => {
        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await fixtureSnapshot.restore();
        });

        it("1. pays a recoverer from an idle USDT bond and restores the Hub", async () => {
          const pool = await openUsdtBondPool(f, LIQUIDITY);
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const payout = await bondPayout(pool.loanVToken, bscmainnet.USDT, badDebt);
          expect(payout).to.equal(badDebt);
          const holdings = await f.adapter.totalAssets(pool.loanVToken.address, f.yieldGroup.address);
          expect(await f.adapter.maxWithdraw(pool.loanVToken.address, f.yieldGroup.address)).to.be.lt(holdings);

          const recovererBefore = await f.usdt.balanceOf(f.recoverer.address);
          const cashBefore = await pool.loanVToken.getCash();
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, payout)
            .and.to.emit(pool.loanVToken, "BadDebtRecovered")
            .withArgs(badDebt, 0);

          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect((await pool.loanVToken.getCash()).sub(cashBefore)).to.equal(badDebt);
          expect(await f.usdt.balanceOf(f.recoverer.address)).to.equal(recovererBefore);
          expect(await f.usdt.balanceOf(pool.bondAccount.address)).to.equal(USDT_BOND.sub(payout));
          expect(await f.adapter.maxWithdraw(pool.loanVToken.address, f.yieldGroup.address)).to.equal(
            await f.adapter.totalAssets(pool.loanVToken.address, f.yieldGroup.address),
          );
        });

        it("2. pays a recoverer from a Liquidity Hub bond", async () => {
          await useLiquidityHubBonds(f);
          const pool = await openUsdtBondPool(f, LIQUIDITY);
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const hub = liquidityHub(f);
          const sharesBefore: BigNumber = await hub.balanceOf(pool.bondAccount.address);

          const recovererBefore = await f.usdt.balanceOf(f.recoverer.address);
          const burned = await readAtNextBlock(f, () => hub.previewWithdraw(badDebt), true);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, badDebt)
            .and.to.emit(f.bondManager, "BondSeized")
            .withArgs(pool.comptroller.address, f.recoverer.address, badDebt)
            .and.to.emit(pool.bondAccount, "Paid")
            .withArgs(f.recoverer.address, badDebt);

          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(await f.usdt.balanceOf(f.recoverer.address)).to.equal(recovererBefore);
          expect(await hub.balanceOf(pool.bondAccount.address)).to.equal(sharesBefore.sub(burned));
          expect(await f.usdt.balanceOf(pool.bondAccount.address)).to.equal(0);
        });

        it("3. refuses recovery while the Hub is paused; governance repays instead", async () => {
          await useLiquidityHubBonds(f);
          const pool = await openUsdtBondPool(f, LIQUIDITY);
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const hub = await hubAsTimelock(f);
          await hub.pauseHub();
          const bondSharesBefore = await hub.balanceOf(pool.bondAccount.address);

          await expect(
            f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt),
          ).to.be.revertedWithCustomError(liquidityHub(f), "HubPaused");
          expect(await pool.loanVToken.badDebt()).to.equal(badDebt);

          await fundUsdt(f.usdt, bscmainnet.NORMAL_TIMELOCK, badDebt);
          await f.usdt.connect(f.timelock).approve(f.shortfall.address, badDebt);
          const repayment = await f.shortfall.connect(f.timelock).repayBadDebt(pool.loanVToken.address, badDebt);
          await expect(repayment)
            .to.emit(f.shortfall, "BadDebtRepaid")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, bscmainnet.NORMAL_TIMELOCK, badDebt);
          await expect(repayment).not.to.emit(f.bondManager, "BondSeized");
          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(await hub.balanceOf(pool.bondAccount.address)).to.equal(bondSharesBefore);
        });

        it("4. pays a recoverer once the Hub unpauses", async () => {
          await useLiquidityHubBonds(f);
          const pool = await openUsdtBondPool(f, LIQUIDITY);
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const hub = await hubAsTimelock(f);
          await hub.pauseHub();
          await expect(
            f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt),
          ).to.be.revertedWithCustomError(liquidityHub(f), "HubPaused");

          await hub.unpauseHub();
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, badDebt);
          expect(await pool.loanVToken.badDebt()).to.equal(0);
        });

        it("5. redeems the whole Hub position when a recovery takes the whole bond", async () => {
          const bond = e18("10000");
          await updateTier(f, TIER_ONE, { minTierBondUsd: bond });
          await useLiquidityHubBonds(f);
          const pool = await openUsdtBondPool(f, LIQUIDITY, bond);
          const badDebt = await createBadDebt(f, pool, LARGE_DEFAULT);
          const hub = liquidityHub(f);
          const { bondAccount } = pool;
          const shares: BigNumber = await hub.balanceOf(bondAccount.address);
          const position = await readAtNextBlock(f, () => hub.previewRedeem(shares), true);
          expect(position).to.be.lt(badDebt);

          const recovererBefore = await f.usdt.balanceOf(f.recoverer.address);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, position))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, position, position)
            .and.to.emit(f.bondManager, "BondSeized")
            .withArgs(pool.comptroller.address, f.recoverer.address, position)
            .and.to.emit(hub, "Withdraw")
            .withArgs(bondAccount.address, bondAccount.address, bondAccount.address, position, shares);

          expect(await f.usdt.balanceOf(f.recoverer.address)).to.equal(recovererBefore);
          expect(await hub.balanceOf(bondAccount.address)).to.equal(0);
          expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);
          expect(await bondAccount.currentBondAmount()).to.equal(0);
          expect(await pool.loanVToken.badDebt()).to.equal(badDebt.sub(position));
        });

        it("6. pays a Hub bond from the borrowed-out market the repayment refills", async () => {
          await useLiquidityHubBonds(f);
          const pool = await openUsdtBondPool(f, e18("50000"));
          await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("60000"));
          await borrow(f.borrower, pool.loanVToken, await pool.loanVToken.getCash());
          expect(await pool.loanVToken.getCash()).to.equal(0);
          const badDebt = await crashAndHeal(f, pool, f.borrower);
          const hub = liquidityHub(f);
          const { bondAccount } = pool;
          const cashBefore = await pool.loanVToken.getCash();
          expect(cashBefore).to.be.lt(badDebt);
          const sharesBefore: BigNumber = await hub.balanceOf(bondAccount.address);

          const recovererBefore = await f.usdt.balanceOf(f.recoverer.address);
          const burned = await readAtNextBlock(f, () => hub.previewWithdraw(badDebt), true);
          const recovery = await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt);
          await expect(recovery)
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, badDebt)
            .and.to.emit(f.bondManager, "BondSeized")
            .withArgs(pool.comptroller.address, f.recoverer.address, badDebt)
            .and.to.emit(bondAccount, "Paid")
            .withArgs(f.recoverer.address, badDebt);

          // The Hub funds the payout by redeeming from the refilled loan market through the YieldGroup
          const { events } = await recovery.wait();
          const redeems = (events ?? [])
            .filter(event => event.address === pool.loanVToken.address)
            .map(event => pool.loanVToken.interface.parseLog(event))
            .filter(event => event.name === "Redeem");
          expect(redeems.map(event => event.args.redeemer)).to.deep.equal([f.yieldGroup.address]);
          const redeemed: BigNumber = redeems[0].args.redeemAmount;
          expect(redeemed).to.be.gte(badDebt);
          expect(await pool.loanVToken.getCash()).to.equal(cashBefore.add(badDebt).sub(redeemed));
          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(await f.usdt.balanceOf(f.recoverer.address)).to.equal(recovererBefore);
          expect(await hub.balanceOf(bondAccount.address)).to.equal(sharesBefore.sub(burned));
        });
      });

      describe("with a funded pool and an XVS bond", () => {
        let pool: DefaultPool;
        let poolSnapshot: { restore: () => Promise<void> };

        before(async () => {
          pool = await openFundedPool(f, LIQUIDITY);
          poolSnapshot = await snapshotFixture(f);
        });

        afterEach(async function () {
          if (this.currentTest?.state === "passed") await assertInvariants(f);
          await poolSnapshot.restore();
        });

        after(async () => {
          await fixtureSnapshot.restore();
        });

        it("7. pays a recoverer XVS worth the bad debt it repaid", async () => {
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const payout = await bondPayout(pool.loanVToken, XVS, badDebt);
          expect(payout).to.equal(badDebt.div(5));

          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          const usdtBefore = await f.usdt.balanceOf(f.recoverer.address);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, payout)
            .and.to.emit(f.bondManager, "BondSeized")
            .withArgs(pool.comptroller.address, f.recoverer.address, payout);

          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(usdtBefore.sub(await f.usdt.balanceOf(f.recoverer.address))).to.equal(badDebt);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(payout);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(payout));
        });

        it("8. caps a recovery at the bad debt", async () => {
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const payout = await bondPayout(pool.loanVToken, XVS, badDebt);

          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          const usdtBefore = await f.usdt.balanceOf(f.recoverer.address);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt.mul(2)))
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, badDebt, payout);

          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(usdtBefore.sub(await f.usdt.balanceOf(f.recoverer.address))).to.equal(badDebt);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(payout);
        });

        it("9. repays and seizes nothing without bad debt", async () => {
          expect(await pool.loanVToken.badDebt()).to.equal(0);
          const usdtBefore = await f.usdt.balanceOf(f.recoverer.address);
          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);

          const recovery = await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, e18("1000"));
          await expect(recovery)
            .to.emit(f.shortfall, "BadDebtRecovered")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, f.recoverer.address, 0, 0)
            .and.to.emit(pool.loanVToken, "BadDebtRecovered")
            .withArgs(0, 0);
          await expect(recovery).not.to.emit(f.bondManager, "BondSeized");

          expect(await f.usdt.balanceOf(f.recoverer.address)).to.equal(usdtBefore);
          expect(await f.xvs.balanceOf(f.recoverer.address)).to.equal(xvsBefore);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
        });

        it("10. refuses a recovery larger than the bond but pays the seizable part", async () => {
          const badDebt = await createBadDebt(f, pool, LARGE_DEFAULT);
          await setPrice(f.xvsFeed, "1");
          const payout = await bondPayout(pool.loanVToken, XVS, badDebt);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt))
            .to.be.revertedWithCustomError(pool.bondAccount, "InsufficientFunds")
            .withArgs(payout, TIER_ONE_XVS_BOND);

          const bondAmount = await f.bondManager.getCurrentBondAmount(pool.comptroller.address);
          const oracle = await resilientOracle();
          const repayable = bondAmount
            .mul(await oracle.getPrice(XVS))
            .div(await oracle.getUnderlyingPrice(pool.loanVToken.address));
          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, repayable);

          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(bondAmount);
          expect(await pool.loanVToken.badDebt()).to.equal(badDebt.sub(repayable));
        });

        it("11. takes the whole bond; governance repays the rest", async () => {
          const badDebt = await createBadDebt(f, pool, LARGE_DEFAULT);
          await setPrice(f.xvsFeed, "1");
          const oracle = await resilientOracle();
          const repayable = TIER_ONE_XVS_BOND.mul(await oracle.getPrice(XVS)).div(
            await oracle.getUnderlyingPrice(pool.loanVToken.address),
          );
          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, repayable);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(TIER_ONE_XVS_BOND);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(0);

          const remaining = badDebt.sub(repayable);
          await fundUsdt(f.usdt, bscmainnet.NORMAL_TIMELOCK, remaining);
          await f.usdt.connect(f.timelock).approve(f.shortfall.address, remaining);
          const repayment = await f.shortfall.connect(f.timelock).repayBadDebt(pool.loanVToken.address, remaining);
          await expect(repayment)
            .to.emit(f.shortfall, "BadDebtRepaid")
            .withArgs(pool.comptroller.address, pool.loanVToken.address, bscmainnet.NORMAL_TIMELOCK, remaining);
          await expect(repayment).not.to.emit(f.bondManager, "BondSeized");

          expect(await pool.loanVToken.badDebt()).to.equal(0);
          expect(await f.bondManager.getCurrentBondAmount(pool.comptroller.address)).to.equal(0);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(0);
        });

        it("12. refuses a caller without the recoverer role", async () => {
          await createBadDebt(f, pool, DEFAULT);
          await expect(f.shortfall.connect(f.outsider).recoverBadDebt(pool.loanVToken.address, 1))
            .to.be.revertedWithCustomError(f.shortfall, "Unauthorized")
            .withArgs(f.outsider.address, f.shortfall.address, "recoverBadDebt(address,uint256)");
        });

        it("13. refuses an unlisted market that names the pool's comptroller", async () => {
          const fakeMarket = await smock.fake<VToken>("VToken");
          fakeMarket.comptroller.returns(pool.comptroller.address);
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(fakeMarket.address, 1))
            .to.be.revertedWithCustomError(f.shortfall, "MarketNotListed")
            .withArgs(fakeMarket.address);
        });

        const statuses: [string, number, (pool: DefaultPool) => Promise<unknown>][] = [
          ["live", PoolStatus.Live, async () => undefined],
          [
            "exit requested",
            PoolStatus.ExitRequested,
            pool => f.manager.connect(f.deployer).requestExit(pool.comptroller.address),
          ],
          ["winding down", PoolStatus.WindingDown, pool => windDown(f, pool)],
          [
            "closed",
            PoolStatus.Closed,
            async pool => {
              await windDown(f, pool);
              await f.manager.connect(f.team).closePool(pool.comptroller.address);
            },
          ],
          [
            "handed over",
            PoolStatus.HandedOver,
            async pool => {
              await f.manager.connect(f.deployer).requestExit(pool.comptroller.address);
              await f.manager.connect(f.timelock).handoverPoolToGovernance(pool.comptroller.address);
            },
          ],
        ];
        for (const [index, [label, status, enterStatus]] of statuses.entries()) {
          it(`${14 + index}. recovers from the bond while the pool is ${label}`, async () => {
            const badDebt = await createBadDebt(f, pool, SMALL_DEFAULT);
            await enterStatus(pool);
            expect((await f.manager.getPool(pool.comptroller.address)).status).to.equal(status);

            const payout = await bondPayout(pool.loanVToken, XVS, badDebt);
            const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
            await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt);

            expect(await pool.loanVToken.badDebt()).to.equal(0);
            expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(payout);
          });
        }

        it("19. refuses recovery once the bond is released", async () => {
          const badDebt = await createBadDebt(f, pool, SMALL_DEFAULT);
          await windDown(f, pool);
          await f.manager.connect(f.team).closePool(pool.comptroller.address);
          await f.manager.connect(f.timelock).releaseBond(pool.comptroller.address);

          await expect(
            f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt),
          ).to.be.revertedWithoutReason();
          expect(await pool.loanVToken.badDebt()).to.equal(badDebt);
        });

        it("20. refuses withdrawals, top-ups and deposits once the bond is released", async () => {
          await windDown(f, pool);
          await f.manager.connect(f.team).closePool(pool.comptroller.address);
          await f.manager.connect(f.timelock).releaseBond(pool.comptroller.address);
          expect(await f.bondManager.bondAccounts(pool.comptroller.address)).to.equal(ZERO);
          await fundXvs(f.xvs, f.deployer.address, e18("1000"));

          await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
            .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
            .withArgs(pool.comptroller.address);
          await expect(f.manager.getExcessBondAmount(pool.comptroller.address))
            .to.be.revertedWithCustomError(f.bondManager, "BondNotFound")
            .withArgs(pool.comptroller.address);
          await expect(
            f.manager.connect(f.deployer).topUpBond(pool.comptroller.address, e18("1000")),
          ).to.be.revertedWithoutReason();
          // A released account refuses to deposit even a later donation into its source
          await fundXvs(f.xvs, pool.bondAccount.address, e18("1"));
          await expect(
            f.bondManager.connect(f.timelock).depositInSource(pool.bondAccount.address),
          ).to.be.revertedWithCustomError(pool.bondAccount, "BondAlreadyReleased");
          expect(await pool.bondAccount.released()).to.equal(true);
          expect(await pool.bondAccount.currentBondAmount()).to.equal(0);
        });

        it("21. pays two recoverers, then refuses once the bond is exhausted", async () => {
          const secondRecoverer = (await ethers.getSigners())[13];
          await grant(
            f.acm,
            f.timelock,
            f.shortfall.address,
            "recoverBadDebt(address,uint256)",
            secondRecoverer.address,
          );
          await fundUsdt(f.usdt, secondRecoverer.address, e18("10000"));
          await f.usdt.connect(secondRecoverer).approve(f.shortfall.address, ethers.constants.MaxUint256);
          const badDebt = await createBadDebt(f, pool, LARGE_DEFAULT);
          await setPrice(f.xvsFeed, "1");

          const firstRepaid = e18("20000");
          const secondRepaid = e18("10000");
          const firstXvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          const secondXvsBefore = await f.xvs.balanceOf(secondRecoverer.address);
          await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, firstRepaid);
          await f.shortfall.connect(secondRecoverer).recoverBadDebt(pool.loanVToken.address, secondRepaid);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(firstXvsBefore)).to.equal(
            await bondPayout(pool.loanVToken, XVS, firstRepaid),
          );
          expect((await f.xvs.balanceOf(secondRecoverer.address)).sub(secondXvsBefore)).to.equal(
            await bondPayout(pool.loanVToken, XVS, secondRepaid),
          );
          expect(await f.bondManager.getCurrentBondAmount(pool.comptroller.address)).to.equal(0);

          const badDebtLeft = badDebt.sub(firstRepaid).sub(secondRepaid);
          expect(await pool.loanVToken.badDebt()).to.equal(badDebtLeft);
          const lateRepaid = e18("1000");
          await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, lateRepaid))
            .to.be.revertedWithCustomError(pool.bondAccount, "InsufficientFunds")
            .withArgs(await bondPayout(pool.loanVToken, XVS, lateRepaid), 0);
          expect(await pool.loanVToken.badDebt()).to.equal(badDebtLeft);
        });

        it("22. pays only the excess while bad debt is outstanding", async () => {
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          const donation = e18("1000");
          await fundXvs(f.xvs, pool.bondAccount.address, donation);
          expect(await f.manager.getExcessBondAmount(pool.comptroller.address)).to.equal(donation);

          const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
          await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
            .to.emit(f.bondManager, "ExcessWithdrawn")
            .withArgs(pool.comptroller.address, donation);
          expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(donation);
          expect(await f.manager.getExcessBondAmount(pool.comptroller.address)).to.equal(0);
          await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
            .to.be.revertedWithCustomError(pool.bondAccount, "NoExcessBond")
            .withArgs(TIER_ONE_XVS_BOND, TIER_ONE_XVS_BOND);
          expect(await f.bondManager.getCurrentBondAmount(pool.comptroller.address)).to.equal(TIER_ONE_XVS_BOND);

          const payout = await bondPayout(pool.loanVToken, XVS, badDebt);
          const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
          await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt);
          expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(payout);
          expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.sub(payout));
        });

        it("23. closes a winding-down pool once recovery brings its debt under the cap", async () => {
          const badDebt = await createBadDebt(f, pool, DEFAULT);
          await windDown(f, pool);
          const residualDebt = (await pool.loanVToken.callStatic.totalBorrowsCurrent()).add(badDebt);
          await expect(f.manager.connect(f.team).closePool(pool.comptroller.address))
            .to.be.revertedWithCustomError(f.manager, "ResidualDebtExceeded")
            .withArgs(residualDebt);

          const residual = e18("5");
          await f.shortfall.connect(f.recoverer).recoverBadDebt(pool.loanVToken.address, badDebt.sub(residual));
          expect(await pool.loanVToken.badDebt()).to.equal(residual);
          await expect(f.manager.connect(f.team).closePool(pool.comptroller.address))
            .to.emit(f.manager, "PoolClosed")
            .withArgs(pool.comptroller.address);
          expect((await f.manager.getPool(pool.comptroller.address)).status).to.equal(PoolStatus.Closed);
          expect(await f.manager.activePools(f.deployer.address)).to.equal(ethers.constants.AddressZero);
        });
      });
    });

    describe("bond accounts", () => {
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

      /// Tier one's required bond in `bondAsset` at its current price, rounded up: the floor an excess withdrawal keeps
      async function requiredBond(f: OpenSpokeFixture, bondAsset: string) {
        const requiredUsd = await f.policyRegistry.getRequiredBondUsd(TIER_ONE, bondAsset);
        const price = await (await resilientOracle()).getPrice(bondAsset);
        return requiredUsd.mul(EXP_SCALE).add(price).sub(1).div(price);
      }

      /// The implementation an EIP-1167 clone delegates to, read from its bytecode
      async function cloneImplementation(account: string) {
        const code = await ethers.provider.getCode(account);
        return ethers.utils.getAddress(`0x${code.slice(22, 62)}`);
      }

      it("24. keeps a Hub bond idle while the Hub is paused, until deposited", async () => {
        const hub = await hubAsTimelock(f);
        await hub.pauseHub();
        await useLiquidityHubBonds(f);
        const { bondAccount } = await openUsdtBondPool(f);

        const activationBlock = await ethers.provider.getBlockNumber();
        const refusals = await bondAccount.queryFilter(bondAccount.filters.SourceDepositRefused(), activationBlock);
        expect(refusals.map(event => event.args?.amount)).to.deep.equal([USDT_BOND]);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(USDT_BOND);
        expect(await hub.balanceOf(bondAccount.address)).to.equal(0);
        expect(await bondAccount.currentBondAmount()).to.equal(USDT_BOND);

        await expect(f.bondManager.connect(f.timelock).depositInSource(bondAccount.address))
          .to.emit(bondAccount, "SourceDepositRefused")
          .withArgs(USDT_BOND);

        await hub.unpauseHub();
        await expect(f.bondManager.connect(f.timelock).depositInSource(bondAccount.address)).not.to.emit(
          bondAccount,
          "SourceDepositRefused",
        );
        const shares: BigNumber = await hub.balanceOf(bondAccount.address);
        expect(shares).to.be.gt(0);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);
        expect(await bondAccount.currentBondAmount()).to.equal(await hub.previewRedeem(shares));
      });

      it("25. pays a donation to an idle bond as excess", async () => {
        const pool = await openDefaultPool(f);
        const donation = e18("1000");
        await fundXvs(f.xvs, pool.bondAccount.address, donation);
        expect(await pool.bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND.add(donation));
        expect(await f.manager.getExcessBondAmount(pool.comptroller.address)).to.equal(donation);

        const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(pool.comptroller.address, donation);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(donation);
        expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND);
      });

      it("26. deposits a donation to a Hub bond, then pays it as excess", async () => {
        await useLiquidityHubBonds(f);
        const { bondAccount, comptroller } = await openUsdtBondPool(f);
        const hub = liquidityHub(f);
        const sharesBefore: BigNumber = await hub.balanceOf(bondAccount.address);
        const donation = e18("1000");
        await fundUsdt(f.usdt, bondAccount.address, donation);

        const minted = await readAtNextBlock(f, () => hub.previewDeposit(donation), true);
        await f.bondManager.connect(f.timelock).depositInSource(bondAccount.address);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);
        expect(await hub.balanceOf(bondAccount.address)).to.equal(sharesBefore.add(minted));

        expect(await requiredBond(f, bscmainnet.USDT)).to.equal(USDT_BOND);
        const excess = await readAtNextBlock(f, () => f.manager.getExcessBondAmount(comptroller.address), true);
        // Share rounding may lose a few wei; the Hub's yield on the bond adds a little
        expect(excess)
          .to.be.gte(donation.sub(10))
          .and.lt(donation.add(e18("0.01")));
        const deployerBefore = await f.usdt.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess);
        expect((await f.usdt.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);
      });

      it("27. deposits a Hub bond's top-up, pays its excess and releases the rest", async () => {
        await useLiquidityHubBonds(f);
        const pool = await openUsdtBondPool(f, LIQUIDITY);
        const { bondAccount, comptroller } = pool;
        const hub = liquidityHub(f);
        const topUp = e18("1000");
        await fundUsdt(f.usdt, f.deployer.address, topUp);
        await f.usdt.connect(f.deployer).approve(f.manager.address, topUp);
        const sharesBefore: BigNumber = await hub.balanceOf(bondAccount.address);
        const minted = await readAtNextBlock(f, () => hub.previewDeposit(topUp), true);
        await expect(f.manager.connect(f.deployer).topUpBond(comptroller.address, topUp))
          .to.emit(f.bondManager, "BondToppedUp")
          .withArgs(comptroller.address, topUp)
          .and.to.emit(hub, "Deposit")
          .withArgs(bondAccount.address, bondAccount.address, topUp, minted);
        const shares = sharesBefore.add(minted);
        expect(await hub.balanceOf(bondAccount.address)).to.equal(shares);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);

        await supplyCollateral(f.borrower, pool.collateral, pool.collateralVToken, e18("50000"));
        await borrow(f.borrower, pool.loanVToken, e18("40000"));
        await mine(50_000);
        const floor = await requiredBond(f, bscmainnet.USDT);
        expect(floor).to.equal(USDT_BOND);
        const value = await readAtNextBlock(f, () => hub.previewRedeem(shares), true);
        const excess = value.sub(floor);
        expect(excess).to.be.gt(topUp);
        expect(await readAtNextBlock(f, () => f.manager.getExcessBondAmount(comptroller.address), true)).to.equal(
          excess,
        );
        const burned = await readAtNextBlock(f, () => hub.previewWithdraw(excess), true);
        const deployerBefore = await f.usdt.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess)
          .and.to.emit(bondAccount, "Paid")
          .withArgs(f.deployer.address, excess);
        expect((await f.usdt.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);
        expect(await hub.balanceOf(bondAccount.address)).to.equal(shares.sub(burned));

        await fundUsdt(f.usdt, f.borrower.address, e18("100"));
        await f.usdt.connect(f.borrower).approve(pool.loanVToken.address, ethers.constants.MaxUint256);
        await pool.loanVToken.connect(f.borrower).repayBorrow(ethers.constants.MaxUint256);
        await windDown(f, pool);
        await f.manager.connect(f.team).closePool(comptroller.address);

        const pausableHub = await hubAsTimelock(f);
        await pausableHub.pauseHub();
        const remainingShares = shares.sub(burned);
        await expect(f.manager.connect(f.timelock).releaseBond(comptroller.address)).to.be.revertedWithCustomError(
          hub,
          "HubPaused",
        );
        expect(await f.bondManager.bondAccounts(comptroller.address)).to.equal(bondAccount.address);

        await pausableHub.unpauseHub();
        const position = await readAtNextBlock(f, () => hub.previewRedeem(remainingShares), true);
        const holderBefore = await f.usdt.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.timelock).releaseBond(comptroller.address))
          .to.emit(f.bondManager, "BondReleased")
          .withArgs(comptroller.address, bondAccount.address)
          .and.to.emit(bondAccount, "Paid")
          .withArgs(f.deployer.address, position)
          .and.to.emit(hub, "Withdraw")
          .withArgs(bondAccount.address, bondAccount.address, bondAccount.address, position, remainingShares);
        expect((await f.usdt.balanceOf(f.deployer.address)).sub(holderBefore)).to.equal(position);
        expect(await hub.balanceOf(bondAccount.address)).to.equal(0);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);
        expect(await bondAccount.released()).to.equal(true);
        expect(await bondAccount.currentBondAmount()).to.equal(0);
      });

      it("28. pays only the excess above a raised tier bond", async () => {
        const pool = await openDefaultPool(f);
        const { bondAccount, comptroller } = pool;
        await updateTier(f, TIER_ONE, { minTierBondUsd: e18("120000") });
        const floor = await requiredBond(f, XVS);
        expect(floor).to.equal(e18("36000"));
        const donation = e18("10000");
        await fundXvs(f.xvs, bondAccount.address, donation);
        const excess = TIER_ONE_XVS_BOND.add(donation).sub(floor);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(excess);

        const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess)
          .and.to.emit(bondAccount, "Paid")
          .withArgs(f.deployer.address, excess);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);
        expect(await f.xvs.balanceOf(bondAccount.address)).to.equal(floor);
        expect(await bondAccount.currentBondAmount()).to.equal(floor);

        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.be.revertedWithCustomError(bondAccount, "NoExcessBond")
          .withArgs(floor, floor);
      });

      it("29. pays an over-sized bond's excess left after a seizure", async () => {
        const extra = e18("10000");
        const collateral = await newCollateralToken(f, "COL", "2");
        const opened = await openPool(f, f.deployer, {
          bondAmount: TIER_ONE_XVS_BOND.add(extra),
          collateralMarkets: [collateralMarket(collateral)],
          loanMarkets: [usdtLoanMarket(f)],
        });
        const pool = {
          ...opened,
          collateral,
          collateralVToken: opened.collateralVTokens[0],
          loanVToken: opened.loanVTokens[0],
        };
        const { bondAccount, comptroller } = pool;
        await wireHubQueues(f, [pool.loanVToken.address]);
        await depositToHub(f, LIQUIDITY);
        expect(await requiredBond(f, XVS)).to.equal(TIER_ONE_XVS_BOND);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(extra);

        const badDebt = await createBadDebt(f, pool, DEFAULT);
        const seized = await recoverFromBond(f, pool, badDebt);
        expect(seized).to.be.gt(0).and.lt(extra);
        const excess = extra.sub(seized);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(excess);

        const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);
        expect(await bondAccount.currentBondAmount()).to.equal(TIER_ONE_XVS_BOND);
      });

      it("30. applies an asset config change to new bonds only", async () => {
        await useLiquidityHubBonds(f);
        const first = await openUsdtBondPool(f);
        await f.bondManager
          .connect(f.timelock)
          .setAssetConfig(bscmainnet.USDT, { sourceType: SourceType.Idle, source: ZERO });
        const hub = liquidityHub(f);
        expect(await first.bondAccount.source()).to.equal(f.hub.address);
        expect(await cloneImplementation(first.bondAccount.address)).to.equal(
          await f.bondManager.accountImplementations(SourceType.LiquidityHub),
        );

        const topUp = e18("1000");
        await fundUsdt(f.usdt, f.deployer.address, topUp);
        await f.usdt.connect(f.deployer).approve(f.manager.address, topUp);
        const sharesBefore: BigNumber = await hub.balanceOf(first.bondAccount.address);
        const minted = await readAtNextBlock(f, () => hub.previewDeposit(topUp), true);
        await f.manager.connect(f.deployer).topUpBond(first.comptroller.address, topUp);
        expect(await hub.balanceOf(first.bondAccount.address)).to.equal(sharesBefore.add(minted));
        expect(await f.usdt.balanceOf(first.bondAccount.address)).to.equal(0);

        const second = await openPool(f, f.secondDeployer, {
          bondAsset: bscmainnet.USDT,
          bondAmount: USDT_BOND,
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "COL", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        });
        expect(await second.bondAccount.source()).to.equal(ZERO);
        expect(await cloneImplementation(second.bondAccount.address)).to.equal(
          await f.bondManager.accountImplementations(SourceType.Idle),
        );
        expect(await f.usdt.balanceOf(second.bondAccount.address)).to.equal(USDT_BOND);
        expect(await hub.balanceOf(second.bondAccount.address)).to.equal(0);
        expect(await second.bondAccount.currentBondAmount()).to.equal(USDT_BOND);
      });

      it("31. keeps a bond idle in an asset without a config", async () => {
        const bondToken = (await (
          await ethers.getContractFactory("MockToken", f.admin)
        ).deploy("Bond Token", "BND", 18)) as MockToken;
        await pinLivePrice(f, bondToken.address, "1");
        await f.policyRegistry.connect(f.timelock).setBondAssetFactor(bondToken.address, EXP_SCALE);
        const config = await f.bondManager.assetConfigs(bondToken.address);
        expect([config.sourceType, config.source]).to.deep.equal([SourceType.Idle, ZERO]);

        await bondToken.connect(f.deployer).faucet(TIER_ONE_BOND_USD);
        const { bondAccount } = await openPool(f, f.deployer, {
          bondAsset: bondToken.address,
          bondAmount: TIER_ONE_BOND_USD,
          collateralMarkets: [collateralMarket(await newCollateralToken(f, "COL", "2"))],
          loanMarkets: [usdtLoanMarket(f)],
        });
        expect(await bondAccount.source()).to.equal(ZERO);
        expect(await cloneImplementation(bondAccount.address)).to.equal(
          await f.bondManager.accountImplementations(SourceType.Idle),
        );
        expect(await bondToken.balanceOf(bondAccount.address)).to.equal(TIER_ONE_BOND_USD);
        expect(await bondAccount.currentBondAmount()).to.equal(TIER_ONE_BOND_USD);
      });

      // Accepted: the floor follows the bond asset's price, so excess withdrawn at a high price is not clawed back
      it("32. frees excess on a price rise, leaving the bond short after the fall", async () => {
        const { bondAccount, comptroller } = await openDefaultPool(f);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(0);

        await setPrice(f.xvsFeed, "10");
        const floor = await requiredBond(f, XVS);
        expect(floor).to.equal(TIER_ONE_XVS_BOND.div(2));
        const excess = TIER_ONE_XVS_BOND.sub(floor);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(excess);
        const deployerBefore = await f.xvs.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess);
        expect((await f.xvs.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);

        await setPrice(f.xvsFeed, "5");
        expect(await requiredBond(f, XVS)).to.equal(TIER_ONE_XVS_BOND);
        expect(await bondAccount.currentBondAmount()).to.equal(floor);
        expect(await f.manager.getExcessBondAmount(comptroller.address)).to.equal(0);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.be.revertedWithCustomError(bondAccount, "NoExcessBond")
          .withArgs(floor, TIER_ONE_XVS_BOND);
      });

      it("33. pays a Hub bond's excess only once the Hub unpauses", async () => {
        await useLiquidityHubBonds(f);
        const { bondAccount, comptroller } = await openUsdtBondPool(f);
        const topUp = e18("1000");
        await fundUsdt(f.usdt, f.deployer.address, topUp);
        await f.usdt.connect(f.deployer).approve(f.manager.address, topUp);
        await f.manager.connect(f.deployer).topUpBond(comptroller.address, topUp);
        const donation = e18("10");
        await fundUsdt(f.usdt, bondAccount.address, donation);

        const hub = await hubAsTimelock(f);
        await hub.pauseHub();
        // The donation sits idle in the account, but paying out the top-up needs a Hub withdrawal
        await expect(
          f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address),
        ).to.be.revertedWithCustomError(liquidityHub(f), "HubPaused");

        await hub.unpauseHub();
        const excess = await readAtNextBlock(f, () => f.manager.getExcessBondAmount(comptroller.address), true);
        // Share rounding may lose a few wei; the Hub's yield on the top-up adds a little
        expect(excess)
          .to.be.gte(topUp.add(donation).sub(10))
          .and.lt(topUp.add(donation).add(e18("0.01")));
        const deployerBefore = await f.usdt.balanceOf(f.deployer.address);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(comptroller.address))
          .to.emit(f.bondManager, "ExcessWithdrawn")
          .withArgs(comptroller.address, excess);
        expect((await f.usdt.balanceOf(f.deployer.address)).sub(deployerBefore)).to.equal(excess);
        expect(await f.usdt.balanceOf(bondAccount.address)).to.equal(0);
      });

      it("34. refuses an asset config whose source does not fit the asset", async () => {
        const configs: [string, { sourceType: number; source: string }][] = [
          [XVS, { sourceType: SourceType.LiquidityHub, source: f.hub.address }],
          [bscmainnet.USDT, { sourceType: SourceType.Idle, source: f.hub.address }],
          [bscmainnet.USDT, { sourceType: SourceType.LiquidityHub, source: ZERO }],
        ];
        for (const [asset, config] of configs) {
          await expect(f.bondManager.connect(f.timelock).setAssetConfig(asset, config))
            .to.be.revertedWithCustomError(f.bondManager, "InvalidAssetConfig")
            .withArgs(asset);
        }
      });

      it("35. refuses an excess withdrawal once the pool leaves Live", async () => {
        const pool = await openDefaultPool(f);
        const donation = e18("1000");
        await fundXvs(f.xvs, pool.bondAccount.address, donation);

        await f.manager.connect(f.deployer).requestExit(pool.comptroller.address);
        expect(await f.manager.getExcessBondAmount(pool.comptroller.address)).to.equal(donation);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
          .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
          .withArgs(pool.comptroller.address);

        await exitPool(f, pool.comptroller);
        expect((await f.manager.getPool(pool.comptroller.address)).status).to.equal(PoolStatus.WindingDown);
        await expect(f.manager.connect(f.deployer).withdrawBondExcess(pool.comptroller.address))
          .to.be.revertedWithCustomError(f.manager, "InvalidPoolStatus")
          .withArgs(pool.comptroller.address);
        expect(await f.xvs.balanceOf(pool.bondAccount.address)).to.equal(TIER_ONE_XVS_BOND.add(donation));
      });
    });
  });
}

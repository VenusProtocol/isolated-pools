import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  Comptroller,
  Comptroller__factory,
  IERC20__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../../../typechain";
import { initMainnetUser } from "../../utils";
import {
  BEACON_SLOT,
  BalanceSlot,
  MarketPauseStatus,
  NetworkTestConfig,
  getBalanceSlot,
  getBeaconOwner,
  getComptrollerAdmin,
  getCoreComptroller,
  getMarketPauseStatus,
  setTokenBalance,
} from "./helpers";

const { expect } = chai;

interface MarketInfo {
  name: string;
  address: string;
  underlying: string;
  decimals: number;
  vToken: VToken;
  pauseStatus: MarketPauseStatus;
  balanceSlot: BalanceSlot | null;
}

/**
 * Runs the full donation attack prevention test suite for a given network.
 * All on-chain addresses (comptroller, admin, ACM, beacon) are read dynamically
 * from deployment artifacts and on-chain state — only network-specific config
 * (block number, VToken constructor args) is passed in.
 */
export function runDonationAttackTests(config: NetworkTestConfig): void {
  const COMPTROLLER = getCoreComptroller(config.network);

  describe(`Donation Attack Prevention - ${config.network}`, function () {
    this.timeout(180_000);

    let comptroller: Comptroller;
    let impersonatedAdmin: Signer;
    let admin: string;
    let acm: string;

    // All Core pool markets with their metadata
    let allMarkets: MarketInfo[];
    // Only markets where no actions are paused — used for testing
    let activeMarkets: MarketInfo[];
    // Active markets with known balance slots — used for donation and funding tests
    let testableMarkets: MarketInfo[];

    // Shared user and attacker signers
    let user: Signer;
    let attacker: Signer;

    /**
     * Performs a donation attack on each testable market and calls the provided
     * assertion callback with before/after exchange rates and internalCash.
     * Returns the number of markets tested.
     */
    async function runDonationAttackOnAllMarkets(
      assertFn: (
        market: MarketInfo,
        rateBefore: BigNumber,
        rateAfter: BigNumber,
        internalCashBefore: BigNumber,
        internalCashAfter: BigNumber,
        donationAmount: BigNumber,
      ) => void,
      useStoredRate: boolean,
    ): Promise<number> {
      const attackerAddr = await attacker.getAddress();

      for (const market of testableMarkets) {
        const snapshotId = await ethers.provider.send("evm_snapshot", []);

        // Accrue interest upfront so stored rate reads aren't affected by block-level accrual
        if (useStoredRate) {
          await market.vToken.connect(attacker).accrueInterest();
        }

        // Exchange rate before donation
        const rateBefore = useStoredRate
          ? await market.vToken.exchangeRateStored()
          : await market.vToken.callStatic.exchangeRateCurrent();
        const internalCashBefore = useStoredRate ? await market.vToken.internalCash() : BigNumber.from(0);

        // Fund attacker and donate directly to vToken (bypasses mint — no vTokens minted)
        const donationAmount = parseUnits("1000", market.decimals);
        await setTokenBalance(
          market.underlying,
          attackerAddr,
          donationAmount,
          market.balanceSlot!.slot,
          market.balanceSlot!.isVyper,
        );
        const underlying = IERC20__factory.connect(market.underlying, attacker);
        await underlying.transfer(market.address, donationAmount);

        // Exchange rate after donation
        const rateAfter = useStoredRate
          ? await market.vToken.exchangeRateStored()
          : await market.vToken.callStatic.exchangeRateCurrent();
        const internalCashAfter = useStoredRate ? await market.vToken.internalCash() : BigNumber.from(0);

        assertFn(market, rateBefore, rateAfter, internalCashBefore, internalCashAfter, donationAmount);

        await ethers.provider.send("evm_revert", [snapshotId]);
      }

      return testableMarkets.length;
    }

    before(async () => {
      // 1. Fork at pinned block
      await ethers.provider.send("hardhat_reset", [
        {
          forking: {
            jsonRpcUrl: process.env[`ARCHIVE_NODE_${config.network}`],
            blockNumber: config.blockNumber,
          },
        },
      ]);
      console.log(`\n  Network: ${config.network} | Block: ${config.blockNumber} | Comptroller: ${COMPTROLLER}`);

      // 2. Get admin and ACM dynamically from comptroller
      ({ admin, acm } = await getComptrollerAdmin(COMPTROLLER));
      console.log(`  Admin: ${admin} | ACM: ${acm}`);

      impersonatedAdmin = await initMainnetUser(admin, parseUnits("10"));
      comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);

      // 3. Get signers for user and attacker
      [user, attacker] = await ethers.getSigners();

      // 4. Discover all markets in Core pool
      const marketAddresses = await comptroller.getAllMarkets();
      console.log(`  Markets discovered: ${marketAddresses.length}`);

      allMarkets = [];
      for (const addr of marketAddresses) {
        const vToken = VToken__factory.connect(addr, ethers.provider);
        const [name, underlying] = await Promise.all([vToken.symbol(), vToken.underlying()]);

        const underlyingToken = IERC20__factory.connect(underlying, ethers.provider);
        let decimals: number;
        try {
          decimals = await underlyingToken.decimals();
        } catch {
          // Some underlying tokens (e.g. vweETH_Core on Unichain) use non-standard proxies
          // that revert on decimals(). Skip these markets since we cannot determine token precision.
          console.log(`  ⏭ ${name}: skipped (underlying.decimals() reverted)`);
          continue;
        }
        const balanceSlot = await getBalanceSlot(underlying, config.network);
        const pauseStatus = await getMarketPauseStatus(COMPTROLLER, addr);

        allMarkets.push({ name, address: addr, underlying, decimals, vToken, pauseStatus, balanceSlot });
      }

      // 5. Filter active markets — skip any market with ANY paused action
      activeMarkets = allMarkets.filter(
        m =>
          !m.pauseStatus.mintPaused &&
          !m.pauseStatus.redeemPaused &&
          !m.pauseStatus.borrowPaused &&
          !m.pauseStatus.repayPaused,
      );

      testableMarkets = activeMarkets.filter(m => m.balanceSlot !== null);

      console.log(
        `\n  Active markets: ${activeMarkets.length}/${allMarkets.length} | Testable: ${testableMarkets.length}`,
      );
      const skippedMarkets = allMarkets.filter(m => !activeMarkets.includes(m));
      if (skippedMarkets.length > 0) {
        console.log(`  Skipped (paused): ${skippedMarkets.map(m => m.name).join(", ")}`);
      }
    });

    it("setup: all markets discovered and categorized", () => {
      expect(allMarkets.length).to.be.gt(0, "No markets found in Core pool");
      expect(activeMarkets.length).to.be.gt(0, "No active markets to test");

      // Markets without a balance slot can't be funded — log them but don't fail
      const noSlot = activeMarkets.filter(m => m.balanceSlot === null);
      if (noSlot.length > 0) {
        console.log(
          `      Note: ${noSlot.map(m => m.name).join(", ")} — balance slot not found, will be skipped in tests`,
        );
      }

      expect(testableMarkets.length).to.be.gt(0, "No testable active markets (all missing balance slots)");
    });

    describe("Before Upgrade: Donation attack inflates exchange rate", () => {
      it("direct ERC20 transfer inflates exchange rate for all active markets", async () => {
        const verified = await runDonationAttackOnAllMarkets(
          (market, rateBefore, rateAfter, _icBefore, _icAfter, donationAmount) => {
            // Donation must inflate the exchange rate (proves vulnerability before upgrade)
            expect(rateAfter).to.be.gt(rateBefore, `${market.name}: exchange rate not inflated by donation`);

            const rateDelta = rateAfter.sub(rateBefore);
            console.log(
              `      ${market.name}: donated ${ethers.utils.formatUnits(
                donationAmount,
                market.decimals,
              )} underlying | ` +
                `exchange rate: ${rateBefore.toString()} -> ${rateAfter.toString()} (delta: +${rateDelta.toString()})`,
            );
          },
          false,
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Pre-upgrade donation: only ${verified}/${testableMarkets.length} markets verified`,
        );
      });
    });

    describe("Upgrade: Deploy new VToken, upgrade beacon, verify syncCash", () => {
      before(async () => {
        // 1. Deploy new VToken implementation with internalCash fix
        const VTokenFactory = await ethers.getContractFactory("VToken");
        const vTokenImpl = await VTokenFactory.deploy(
          config.vTokenArgs.timeBased,
          config.vTokenArgs.blocksPerYear,
          BigNumber.from(config.vTokenArgs.maxBorrowRateMantissa),
        );
        await vTokenImpl.deployed();
        console.log(`\n      New VToken impl deployed at: ${vTokenImpl.address}`);

        // 2. Get beacon address from first market's proxy storage
        const beaconSlotValue = await ethers.provider.getStorageAt(allMarkets[0].address, BEACON_SLOT);
        const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));

        // 3. Get beacon owner and impersonate
        const beaconOwnerAddr = await getBeaconOwner(allMarkets[0].address);
        const impersonatedBeaconOwner = await initMainnetUser(beaconOwnerAddr, parseUnits("10"));

        // 4. Upgrade beacon to new implementation
        const beacon = UpgradeableBeacon__factory.connect(beaconAddress, impersonatedBeaconOwner);
        await beacon.upgradeTo(vTokenImpl.address);
        console.log(`      Beacon upgraded to new implementation`);

        // 5. Grant syncCash permission via ACM and sync all markets
        const acmContract = await ethers.getContractAt("AccessControlManager", acm, impersonatedAdmin);

        for (const market of allMarkets) {
          const vToken = VToken__factory.connect(market.address, ethers.provider);
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);

          // Before syncCash: internalCash should be 0 (new uninitialized storage slot)
          const internalCashBefore = await vToken.internalCash();
          expect(internalCashBefore).to.equal(0, `${market.name}: internalCash should be 0 before syncCash`);

          const balanceOf = await underlying.balanceOf(market.address);

          // Grant syncCash permission and call syncCash
          await acmContract.giveCallPermission(market.address, "syncCash()", admin);
          const vTokenAsAdmin = VToken__factory.connect(market.address, impersonatedAdmin);
          await vTokenAsAdmin.syncCash();

          // After syncCash: internalCash must equal balanceOf
          const internalCashAfter = await vToken.internalCash();
          expect(internalCashAfter).to.equal(
            balanceOf,
            `${market.name}: internalCash should equal balanceOf after syncCash`,
          );
        }
      });

      it("syncCash is idempotent", async () => {
        for (const market of allMarkets) {
          const vToken = VToken__factory.connect(market.address, impersonatedAdmin);
          const internalCashBefore = await vToken.internalCash();

          await vToken.syncCash();

          const internalCashAfter = await vToken.internalCash();
          expect(internalCashAfter).to.equal(
            internalCashBefore,
            `${market.name}: internalCash changed on second syncCash`,
          );
        }
      });

      it("syncCash reverts for non-admin", async () => {
        const [, , randomUser] = await ethers.getSigners();
        const vToken = VToken__factory.connect(allMarkets[0].address, randomUser);
        await expect(vToken.syncCash()).to.be.revertedWithCustomError(vToken, "Unauthorized");
      });
    });

    describe("After Upgrade: Donation attack is blocked", () => {
      it("direct ERC20 transfer does NOT inflate exchange rate for all active markets", async () => {
        const verified = await runDonationAttackOnAllMarkets(
          (market, rateBefore, rateAfter, internalCashBefore, internalCashAfter) => {
            // Donation must NOT inflate the exchange rate (proves fix works)
            expect(rateAfter).to.equal(rateBefore, `${market.name}: exchange rate changed after donation`);

            // internalCash must remain unchanged (direct transfer bypasses accounting)
            expect(internalCashAfter).to.equal(
              internalCashBefore,
              `${market.name}: internalCash changed after donation`,
            );
          },
          true,
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Post-upgrade donation: only ${verified}/${testableMarkets.length} markets verified`,
        );
        console.log(`      Verified donation attack is blocked for all ${verified} testable markets`);
      });
    });

    describe("After Upgrade: Normal operations update internalCash correctly", () => {
      let snapshotId: string;
      let userAddr: string;

      before(async () => {
        // Lift supply/borrow caps and unpause actions so normal ops work on all markets
        const marketAddrs = testableMarkets.map(m => m.address);
        const maxCap = ethers.constants.MaxUint256;
        const caps = marketAddrs.map(() => maxCap);
        await comptroller.connect(impersonatedAdmin).setMarketSupplyCaps(marketAddrs, caps);
        await comptroller.connect(impersonatedAdmin).setMarketBorrowCaps(marketAddrs, caps);
      });

      /**
       * Runs an operation on all testable markets and verifies internalCash updates correctly.
       * Handles: accrueInterest settle, before/after reads, direction + balanceOf assertions.
       */
      async function verifyInternalCashUpdate(
        operationName: string,
        direction: "increase" | "decrease",
        setupFn: (market: MarketInfo, underlying: ReturnType<typeof IERC20__factory.connect>) => Promise<boolean>,
        operationFn: (market: MarketInfo, underlying: ReturnType<typeof IERC20__factory.connect>) => Promise<void>,
      ): Promise<number> {
        let verified = 0;

        for (const market of testableMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);

          try {
            const shouldContinue = await setupFn(market, underlying);
            if (!shouldContinue) continue;
          } catch {
            continue;
          }

          // Settle interest so the operation's internal accrueInterest() is a no-op
          await market.vToken.connect(user).accrueInterest();
          const internalCashBefore = await market.vToken.internalCash();

          try {
            await operationFn(market, underlying);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.address);

          if (direction === "increase") {
            expect(internalCashAfter).to.be.gt(
              internalCashBefore,
              `${market.name}: internalCash should increase after ${operationName}`,
            );
          } else {
            expect(internalCashAfter).to.be.lt(
              internalCashBefore,
              `${market.name}: internalCash should decrease after ${operationName}`,
            );
          }
          expect(internalCashAfter).to.equal(
            actualBalance,
            `${market.name}: internalCash != balanceOf after ${operationName}`,
          );

          verified++;
        }

        return verified;
      }

      /**
       * Funds user, approves, mints collateral, and enters market.
       * Shared setup for borrow and repay tests.
       */
      async function setupBorrowPosition(
        market: MarketInfo,
        underlying: ReturnType<typeof IERC20__factory.connect>,
        collateralAmount: BigNumber,
      ) {
        await setTokenBalance(
          market.underlying,
          userAddr,
          collateralAmount,
          market.balanceSlot!.slot,
          market.balanceSlot!.isVyper,
        );
        await underlying.connect(user).approve(market.address, collateralAmount);
        await market.vToken.connect(user).mint(collateralAmount);
        await comptroller.connect(user).enterMarkets([market.address]);
      }

      before(async () => {
        userAddr = await user.getAddress();
      });

      beforeEach(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("mint increases internalCash", async () => {
        const verified = await verifyInternalCashUpdate(
          "mint",
          "increase",
          async (market, underlying) => {
            const mintAmount = parseUnits("1", market.decimals);
            await setTokenBalance(
              market.underlying,
              userAddr,
              mintAmount,
              market.balanceSlot!.slot,
              market.balanceSlot!.isVyper,
            );
            await underlying.connect(user).approve(market.address, mintAmount);
            return true;
          },
          async market => {
            await market.vToken.connect(user).mint(parseUnits("1", market.decimals));
          },
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Mint: only ${verified}/${testableMarkets.length} markets verified`,
        );
        console.log(`      Verified mint increases internalCash for all ${verified} testable markets`);
      });

      it("redeem decreases internalCash", async () => {
        const verified = await verifyInternalCashUpdate(
          "redeem",
          "decrease",
          async (market, underlying) => {
            const mintAmount = parseUnits("1", market.decimals);
            await setTokenBalance(
              market.underlying,
              userAddr,
              mintAmount,
              market.balanceSlot!.slot,
              market.balanceSlot!.isVyper,
            );
            await underlying.connect(user).approve(market.address, mintAmount);
            await market.vToken.connect(user).mint(mintAmount);
            const vTokenBalance = await market.vToken.balanceOf(userAddr);
            return !vTokenBalance.isZero();
          },
          async market => {
            const vTokenBalance = await market.vToken.balanceOf(userAddr);
            await market.vToken.connect(user).redeem(vTokenBalance);
          },
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Redeem: only ${verified}/${testableMarkets.length} markets verified`,
        );
        console.log(`      Verified redeem decreases internalCash for all ${verified} testable markets`);
      });

      it("borrow decreases internalCash", async () => {
        const verified = await verifyInternalCashUpdate(
          "borrow",
          "decrease",
          async (market, underlying) => {
            if ((await market.vToken.internalCash()).isZero()) return false;
            await setupBorrowPosition(market, underlying, parseUnits("10", market.decimals));
            return true;
          },
          async market => {
            await market.vToken.connect(user).borrow(parseUnits("1", market.decimals));
          },
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Borrow: only ${verified}/${testableMarkets.length} markets verified`,
        );
        console.log(`      Verified borrow decreases internalCash for all ${verified} testable markets`);
      });

      it("repay increases internalCash", async () => {
        const verified = await verifyInternalCashUpdate(
          "repay",
          "increase",
          async (market, underlying) => {
            if ((await market.vToken.internalCash()).isZero()) return false;
            const borrowAmount = parseUnits("1", market.decimals);
            await setupBorrowPosition(market, underlying, parseUnits("10", market.decimals));
            await market.vToken.connect(user).borrow(borrowAmount);
            // Fund user for repay (2x to cover any accrued interest)
            const repayFunding = borrowAmount.mul(2);
            await setTokenBalance(
              market.underlying,
              userAddr,
              repayFunding,
              market.balanceSlot!.slot,
              market.balanceSlot!.isVyper,
            );
            await underlying.connect(user).approve(market.address, repayFunding);
            return true;
          },
          async market => {
            await market.vToken.connect(user).repayBorrow(parseUnits("1", market.decimals));
          },
        );
        expect(verified).to.equal(
          testableMarkets.length,
          `Repay: only ${verified}/${testableMarkets.length} markets verified`,
        );
        console.log(`      Verified repay increases internalCash for all ${verified} testable markets`);
      });
    });
  });
}

import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  Comptroller__factory,
  IERC20__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../../../typechain";
import { initMainnetUser } from "../../utils";
import {
  BalanceSlot,
  NetworkTestConfig,
  getBalanceSlot,
  getBeaconOwner,
  getComptrollerAdmin,
  getCoreComptroller,
  setTokenBalance,
} from "../DonationAttack/helpers";
import { BEACON_SLOT, StorageSnapshot, assertStoragePreserved, findBalanceSlot, takeStorageSnapshot } from "./helpers";

const { expect } = chai;

interface MarketInfo {
  name: string;
  address: string;
  underlying: string;
  decimals: number;
  vToken: VToken;
  balanceSlot: BalanceSlot | null;
}

/**
 * Runs the full vToken storage checks test suite for a given network.
 * Verifies that upgrading the VToken implementation does not corrupt storage,
 * that syncCash initializes internalCash correctly, and that normal operations
 * continue working post-upgrade.
 */
export function runStorageCheckTests(config: NetworkTestConfig): void {
  const COMPTROLLER = getCoreComptroller(config.network);

  describe(`vToken Storage Checks - ${config.network}`, function () {
    this.timeout(180_000);

    let impersonatedAdmin: Signer;
    let admin: string;
    let acm: string;
    let allMarketAddresses: string[];
    let upgradedMarkets: MarketInfo[];
    let preUpgradeSnapshots: Map<string, StorageSnapshot>;

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

      const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
      allMarketAddresses = await comptroller.getAllMarkets();
      console.log(`  Markets discovered: ${allMarketAddresses.length}`);

      // 3. Take pre-upgrade storage snapshots
      preUpgradeSnapshots = new Map();
      for (const marketAddr of allMarketAddresses) {
        const vToken = VToken__factory.connect(marketAddr, ethers.provider);
        const snapshot = await takeStorageSnapshot(vToken);
        preUpgradeSnapshots.set(marketAddr, snapshot);
      }

      // 4. Deploy new impl and upgrade beacon
      const VTokenFactory = await ethers.getContractFactory("VToken");
      const vTokenImpl = await VTokenFactory.deploy(
        config.vTokenArgs.timeBased,
        config.vTokenArgs.blocksPerYear,
        BigNumber.from(config.vTokenArgs.maxBorrowRateMantissa),
      );
      await vTokenImpl.deployed();

      const beaconSlotValue = await ethers.provider.getStorageAt(allMarketAddresses[0], BEACON_SLOT);
      const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));

      const beaconOwnerAddr = await getBeaconOwner(allMarketAddresses[0]);
      const impersonatedBeaconOwner = await initMainnetUser(beaconOwnerAddr, parseUnits("10"));
      const beacon = UpgradeableBeacon__factory.connect(beaconAddress, impersonatedBeaconOwner);
      await beacon.upgradeTo(vTokenImpl.address);

      const acmContract = await ethers.getContractAt("AccessControlManager", acm, impersonatedAdmin);

      // 5. syncCash on all markets
      upgradedMarkets = [];
      for (const marketAddr of allMarketAddresses) {
        await acmContract.giveCallPermission(marketAddr, "syncCash()", admin);

        const vToken = VToken__factory.connect(marketAddr, impersonatedAdmin);
        await vToken.syncCash();

        const name = await vToken.symbol();
        const underlying = await vToken.underlying();

        const underlyingToken = IERC20__factory.connect(underlying, ethers.provider);
        let decimals: number;
        try {
          decimals = await underlyingToken.decimals();
        } catch {
          // Some underlying tokens (e.g. vweETH_Core on Unichain) use non-standard proxies
          // that revert on decimals(). Skip these markets from normal ops testing.
          console.log(`  ⏭ ${name}: skipped from normal ops (underlying.decimals() reverted)`);
          continue;
        }

        const balanceSlot = await getBalanceSlot(underlying, config.network);
        upgradedMarkets.push({ name, address: marketAddr, underlying, decimals, vToken, balanceSlot });
      }

      expect(upgradedMarkets.length).to.be.gt(0, "No markets could be set up");
    });

    describe("Storage Layout - No Collision After Upgrade", () => {
      it("all existing storage slots preserved", async () => {
        for (const market of upgradedMarkets) {
          const postSnapshot = await takeStorageSnapshot(market.vToken);
          const preSnapshot = preUpgradeSnapshots.get(market.address)!;
          assertStoragePreserved(preSnapshot, postSnapshot, market.name);

          // Verify internalCash == actual underlying balance
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const internalCash = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCash).to.equal(actualBalance, `${market.name}: internalCash != actual balance`);
        }
      });
    });

    describe("syncCash", () => {
      it("internalCash matches actual balance", async () => {
        for (const market of upgradedMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const internalCash = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCash).to.equal(actualBalance, `${market.name}: internalCash should equal actual balance`);
        }
      });

      it("is idempotent", async () => {
        const market = upgradedMarkets[0];
        const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
        const balanceBefore = await underlying.balanceOf(market.address);

        await market.vToken.syncCash();

        const internalCashAfter = await market.vToken.internalCash();
        expect(internalCashAfter).to.equal(balanceBefore);
      });

      it("reverts for non-admin", async () => {
        const [, randomUser] = await ethers.getSigners();
        const vToken = VToken__factory.connect(upgradedMarkets[0].address, randomUser);
        await expect(vToken.syncCash()).to.be.revertedWithCustomError(vToken, "Unauthorized");
      });
    });

    describe("accrueInterest", () => {
      it("succeeds on all markets without revert", async () => {
        for (const market of upgradedMarkets) {
          await expect(market.vToken.accrueInterest()).to.not.be.reverted;
        }
      });
    });

    describe("Donation attack blocked", () => {
      it("exchange rate immune to direct transfer", async () => {
        const [attacker] = await ethers.getSigners();
        let tested = 0;

        for (const market of upgradedMarkets) {
          const snapshotId = await ethers.provider.send("evm_snapshot", []);

          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const vToken = VToken__factory.connect(market.address, ethers.provider);

          const totalSupply = await vToken.totalSupply();
          const internalCash = await market.vToken.internalCash();
          if (totalSupply.isZero() || internalCash.isZero()) {
            await ethers.provider.send("evm_revert", [snapshotId]);
            continue;
          }

          const balanceSlot = market.balanceSlot ?? (await findBalanceSlot(market.underlying));
          if (balanceSlot === null) {
            await ethers.provider.send("evm_revert", [snapshotId]);
            continue;
          }

          await vToken.connect(attacker).accrueInterest();

          const exchangeRateBefore = await vToken.exchangeRateStored();
          const internalCashBefore = await market.vToken.internalCash();

          const donationAmount = internalCash.div(2);
          await setTokenBalance(
            market.underlying,
            attacker.address,
            donationAmount,
            balanceSlot.slot,
            balanceSlot.isVyper,
          );
          await underlying.connect(attacker).transfer(market.address, donationAmount);

          const exchangeRateAfter = await vToken.exchangeRateStored();
          expect(exchangeRateAfter).to.equal(exchangeRateBefore, `${market.name}: exchange rate changed`);
          expect(await market.vToken.internalCash()).to.equal(
            internalCashBefore,
            `${market.name}: internalCash changed`,
          );

          tested++;
          await ethers.provider.send("evm_revert", [snapshotId]);
        }

        expect(tested).to.be.gt(0, "Should have tested at least one market");
      });
    });

    describe("Normal operations", () => {
      let snapshotId: string;

      before(async () => {
        const comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedAdmin);
        const marketAddrs = upgradedMarkets.map(m => m.address);
        const actions = [0, 1, 2, 3, 7]; // MINT, REDEEM, BORROW, REPAY, ENTER_MARKET
        for (const action of actions) {
          await comptroller.setActionsPaused(marketAddrs, [action], false);
        }
        const maxCap = ethers.constants.MaxUint256;
        const caps = marketAddrs.map(() => maxCap);
        await comptroller.setMarketSupplyCaps(marketAddrs, caps);
        await comptroller.setMarketBorrowCaps(marketAddrs, caps);
      });

      beforeEach(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("mint increases internalCash", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const vToken = VToken__factory.connect(market.address, ethers.provider);

          const totalSupply = await vToken.totalSupply();
          if (totalSupply.isZero()) continue;

          const balanceSlot = market.balanceSlot;
          if (balanceSlot === null) continue;

          const mintAmount = parseUnits("1", market.decimals);
          const [minter] = await ethers.getSigners();
          await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot.slot, balanceSlot.isVyper);

          await underlying.connect(minter).approve(market.address, mintAmount);
          try {
            await vToken.connect(minter).mint(mintAmount);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after mint`);

          verified++;
        }
        expect(verified).to.be.gt(0, "Mint could not be verified on any market");
      });

      it("redeem decreases internalCash", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const vToken = VToken__factory.connect(market.address, ethers.provider);

          const totalSupply = await vToken.totalSupply();
          if (totalSupply.isZero()) continue;

          const balanceSlot = market.balanceSlot;
          if (balanceSlot === null) continue;

          const mintAmount = parseUnits("1", market.decimals);
          const [minter] = await ethers.getSigners();
          await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot.slot, balanceSlot.isVyper);
          await underlying.connect(minter).approve(market.address, mintAmount);

          try {
            await vToken.connect(minter).mint(mintAmount);
          } catch {
            continue;
          }

          const vTokenBalance = await vToken.balanceOf(minter.address);
          if (vTokenBalance.isZero()) continue;

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await vToken.connect(minter).redeem(vTokenBalance);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.lt(internalCashBefore, `${market.name}: internalCash should decrease`);

          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after redeem`);

          verified++;
        }
        expect(verified).to.be.gt(0, "Redeem could not be verified on any market");
      });

      it("borrow decreases internalCash", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const vToken = VToken__factory.connect(market.address, ethers.provider);

          const cash = await market.vToken.internalCash();
          if (cash.isZero()) continue;

          const balanceSlot = market.balanceSlot;
          if (balanceSlot === null) continue;

          const mintAmount = parseUnits("10", market.decimals);
          const borrowAmount = parseUnits("1", market.decimals);

          const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
          const [user] = await ethers.getSigners();
          await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot.slot, balanceSlot.isVyper);
          await underlying.connect(user).approve(market.address, mintAmount);

          try {
            await vToken.connect(user).mint(mintAmount);
            await comptroller.connect(user).enterMarkets([market.address]);
          } catch {
            continue;
          }

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await vToken.connect(user).borrow(borrowAmount);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.lt(internalCashBefore, `${market.name}: internalCash should decrease`);

          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after borrow`);

          verified++;
          if (verified >= 3) break;
        }
        expect(verified).to.be.gt(0, "Borrow could not be verified on any market");
      });

      it("repay increases internalCash", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const vToken = VToken__factory.connect(market.address, ethers.provider);

          const cash = await market.vToken.internalCash();
          if (cash.isZero()) continue;

          const balanceSlot = market.balanceSlot;
          if (balanceSlot === null) continue;

          const mintAmount = parseUnits("10", market.decimals);
          const borrowAmount = parseUnits("1", market.decimals);

          const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
          const [user] = await ethers.getSigners();
          await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot.slot, balanceSlot.isVyper);
          await underlying.connect(user).approve(market.address, mintAmount);

          try {
            await vToken.connect(user).mint(mintAmount);
            await comptroller.connect(user).enterMarkets([market.address]);
            await vToken.connect(user).borrow(borrowAmount);
          } catch {
            continue;
          }

          await setTokenBalance(
            market.underlying,
            user.address,
            borrowAmount.mul(2),
            balanceSlot.slot,
            balanceSlot.isVyper,
          );
          await underlying.connect(user).approve(market.address, borrowAmount.mul(2));

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await vToken.connect(user).repayBorrow(borrowAmount);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.gt(internalCashBefore, `${market.name}: internalCash should increase`);

          const actualBalance = await underlying.balanceOf(market.address);
          expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after repay`);

          verified++;
          if (verified >= 3) break;
        }
        expect(verified).to.be.gt(0, "Repay could not be verified on any market");
      });
    });
  });
}

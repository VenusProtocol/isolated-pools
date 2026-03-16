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
import { initMainnetUser, setForkBlock } from "../../utils";
import { BEACON_SLOT, findBalanceSlot, setTokenBalance } from "./helpers";

const { expect } = chai;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "zksyncmainnet";

const COMPTROLLER = "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1";
const ADMIN = "0x093565Bc20AA326F4209eBaF3a26089272627613";
const ACM = "0x526159A92A82afE5327d37Ef446b68FD9a5cA914";
const BLOCK_NUMBER = 69100000;

type MarketInfo = {
  name: string;
  address: string;
  underlying: string;
  vToken: VToken;
};

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  console.log(`fork tests running on: ${FORKED_NETWORK}, block: ${BLOCK_NUMBER}`);

  describe("Donation Attack Prevention - zkSync Mainnet", () => {
    let impersonatedTimelock: Signer;
    let allMarketAddresses: string[];

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
      impersonatedTimelock = await initMainnetUser(ADMIN, parseUnits("10"));

      const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
      allMarketAddresses = await comptroller.getAllMarkets();
    });

    describe("Before upgrade: donation attack succeeds on all markets", () => {
      let topSnapshotId: string;

      before(async () => {
        topSnapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [topSnapshotId]);
      });

      it("direct token transfer inflates exchange rate on all markets", async () => {
        const [attacker] = await ethers.getSigners();
        let attacked = 0;

        for (const marketAddr of allMarketAddresses) {
          const snapshotId = await ethers.provider.send("evm_snapshot", []);

          try {
            const vToken = VToken__factory.connect(marketAddr, attacker);
            const underlyingAddr = await vToken.underlying();
            const underlying = IERC20__factory.connect(underlyingAddr, ethers.provider);

            const totalSupply = await vToken.totalSupply();
            const cash = await underlying.balanceOf(marketAddr);
            const name = await vToken.symbol();
            if (totalSupply.isZero() || cash.isZero()) {
              console.log(`      ⏭ ${name}: skipped (empty market — totalSupply: ${totalSupply}, cash: ${cash})`);
              await ethers.provider.send("evm_revert", [snapshotId]);
              continue;
            }

            const balanceSlot = await findBalanceSlot(underlyingAddr);
            if (balanceSlot === null) {
              console.log(`      ⏭ ${name}: skipped (balance slot not found)`);
              await ethers.provider.send("evm_revert", [snapshotId]);
              continue;
            }

            await vToken.accrueInterest();

            const exchangeRateBefore = await vToken.exchangeRateStored();

            const donationAmount = cash.div(2);
            await setTokenBalance(underlyingAddr, attacker.address, donationAmount, balanceSlot);
            await underlying.connect(attacker).transfer(marketAddr, donationAmount);

            const exchangeRateAfter = await vToken.exchangeRateStored();

            expect(exchangeRateAfter).to.be.gt(
              exchangeRateBefore as any,
              `${name}: exchange rate should increase after donation (vulnerable)`,
            );

            console.log(
              `      ✓ ${name}: donation attack succeeded — rate ${exchangeRateBefore} → ${exchangeRateAfter}`,
            );

            attacked++;
          } catch {
            // Skip markets whose underlying token reverts (e.g. non-standard ERC20)
          }

          await ethers.provider.send("evm_revert", [snapshotId]);
        }

        expect(attacked).to.be.gt(0, "Should have attacked at least one market");
        console.log(`      Total markets attacked: ${attacked}/${allMarketAddresses.length}`);
      });
    });

    describe("After upgrade: donation attack fails on all markets", () => {
      let upgradedMarkets: MarketInfo[];

      before(async () => {
        const VTokenFactory = await ethers.getContractFactory("VToken");
        const vTokenImpl = await VTokenFactory.deploy(false, 10512000, BigNumber.from("5000000000000"));
        await vTokenImpl.deployed();

        const beaconSlotValue = await ethers.provider.getStorageAt(allMarketAddresses[0], BEACON_SLOT);
        const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));

        const beacon = UpgradeableBeacon__factory.connect(beaconAddress, impersonatedTimelock);
        await beacon.upgradeTo(vTokenImpl.address);

        const acm = await ethers.getContractAt("AccessControlManager", ACM, impersonatedTimelock);

        upgradedMarkets = [];
        for (const marketAddr of allMarketAddresses) {
          await acm.giveCallPermission(marketAddr, "syncCash()", ADMIN);

          const vToken = VToken__factory.connect(marketAddr, impersonatedTimelock);
          await vToken.syncCash();

          const name = await vToken.symbol();
          const underlying = await vToken.underlying();
          upgradedMarkets.push({ name, address: marketAddr, underlying, vToken });
        }

        expect(upgradedMarkets.length).to.equal(allMarketAddresses.length);
      });

      describe("syncCash", () => {
        it("internalCash matches actual balance for all markets", async () => {
          for (const market of upgradedMarkets) {
            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const internalCash = await market.vToken.internalCash();
            const actualBalance = await underlying.balanceOf(market.address);

            expect(internalCash).to.equal(actualBalance, `${market.name}: internalCash should equal actual balance`);
          }
        });

        it("is idempotent when called again by admin", async () => {
          const market = upgradedMarkets[0];
          const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
          const balanceBefore = await underlying.balanceOf(market.address);

          await market.vToken.syncCash();

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.equal(balanceBefore);
        });

        it("reverts for non-admin callers", async () => {
          const [, randomUser] = await ethers.getSigners();
          const vToken = VToken__factory.connect(upgradedMarkets[0].address, randomUser);
          await expect(vToken.syncCash()).to.be.revertedWithCustomError(vToken, "Unauthorized");
        });
      });

      describe("exchange rates", () => {
        it("remain valid after upgrade + syncCash", async () => {
          for (const market of upgradedMarkets) {
            const totalSupply = await market.vToken.totalSupply();
            if (totalSupply.isZero()) continue;

            const exchangeRate = await market.vToken.callStatic.exchangeRateCurrent();
            expect(exchangeRate).to.be.gt(0, `${market.name}: exchange rate should be positive`);
          }
        });
      });

      describe("donation attack", () => {
        it("exchange rate is immune to direct token transfer on all markets", async () => {
          const [attacker] = await ethers.getSigners();
          let tested = 0;

          for (const market of upgradedMarkets) {
            const snapshotId = await ethers.provider.send("evm_snapshot", []);

            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const vToken = VToken__factory.connect(market.address, ethers.provider);

            const totalSupply = await vToken.totalSupply();
            const internalCash = await market.vToken.internalCash();
            if (totalSupply.isZero() || internalCash.isZero()) {
              console.log(
                `      ⏭ ${market.name}: skipped (empty market — totalSupply: ${totalSupply}, internalCash: ${internalCash})`,
              );
              await ethers.provider.send("evm_revert", [snapshotId]);
              continue;
            }

            const balanceSlot = await findBalanceSlot(market.underlying);
            if (balanceSlot === null) {
              console.log(`      ⏭ ${market.name}: skipped (balance slot not found)`);
              await ethers.provider.send("evm_revert", [snapshotId]);
              continue;
            }

            await vToken.connect(attacker).accrueInterest();

            const exchangeRateBefore = await vToken.exchangeRateStored();
            const cashBefore = await vToken.getCash();
            const internalCashBefore = await market.vToken.internalCash();

            const donationAmount = internalCash.div(2);
            await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
            await underlying.connect(attacker).transfer(market.address, donationAmount);

            const exchangeRateAfter = await vToken.exchangeRateStored();
            expect(exchangeRateAfter).to.equal(exchangeRateBefore, `${market.name}: exchange rate changed`);
            expect(await vToken.getCash()).to.equal(cashBefore, `${market.name}: getCash changed`);
            expect(await market.vToken.internalCash()).to.equal(
              internalCashBefore,
              `${market.name}: internalCash changed`,
            );

            const balanceAfter = await underlying.balanceOf(market.address);
            expect(balanceAfter).to.be.gt(internalCashBefore as any, `${market.name}: excess should exist`);

            console.log(
              `      ✓ ${market.name}: donation attack blocked — expected: ${exchangeRateBefore}, got: ${exchangeRateAfter}`,
            );

            tested++;
            await ethers.provider.send("evm_revert", [snapshotId]);
          }

          expect(tested).to.be.gt(0, "Should have tested at least one market");
          console.log(`      Total markets protected: ${tested}/${upgradedMarkets.length}`);
        });
      });

      describe("normal operations", () => {
        let snapshotId: string;

        before(async () => {
          const comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
          const vTokens = upgradedMarkets.map(m => m.vToken);
          const actions = [0, 1, 2, 3, 7]; // MINT, REDEEM, BORROW, REPAY, ENTER_MARKET
          for (const action of actions) {
            await comptroller.setActionsPaused(
              vTokens.map(v => v.address),
              [action],
              false,
            );
          }
          const marketAddrs = upgradedMarkets.map(m => m.address);
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

        it("mint increases internalCash correctly", async () => {
          let verified = 0;
          for (const market of upgradedMarkets) {
            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const vToken = VToken__factory.connect(market.address, ethers.provider);

            const totalSupply = await vToken.totalSupply();
            if (totalSupply.isZero()) continue;

            const balanceSlot = await findBalanceSlot(market.underlying);
            if (balanceSlot === null) continue;

            const decimals = await underlying.decimals();
            const mintAmount = parseUnits("1", decimals);
            const [minter] = await ethers.getSigners();
            await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);

            const exchangeRateBefore = await vToken.callStatic.exchangeRateCurrent();

            await underlying.connect(minter).approve(market.address, mintAmount);
            try {
              await vToken.connect(minter).mint(mintAmount);
            } catch {
              continue;
            }

            const internalCashAfter = await market.vToken.internalCash();
            const actualBalance = await underlying.balanceOf(market.address);
            expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after mint`);

            const exchangeRateAfter = await vToken.callStatic.exchangeRateCurrent();
            const tolerance = exchangeRateBefore.div(10000);
            expect(exchangeRateAfter.sub(exchangeRateBefore).abs()).to.be.lte(
              tolerance,
              `${market.name}: exchange rate diverged after mint`,
            );

            verified++;
          }
          console.log(`        Mint verified on ${verified} markets`);
          expect(verified).to.be.gt(0, "Mint could not be verified on any market");
        });

        it("redeem decreases internalCash correctly", async () => {
          let verified = 0;
          for (const market of upgradedMarkets) {
            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const vToken = VToken__factory.connect(market.address, ethers.provider);

            const totalSupply = await vToken.totalSupply();
            if (totalSupply.isZero()) continue;

            const balanceSlot = await findBalanceSlot(market.underlying);
            if (balanceSlot === null) continue;

            const decimals = await underlying.decimals();
            const mintAmount = parseUnits("1", decimals);
            const [minter] = await ethers.getSigners();
            await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);
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
          console.log(`        Redeem verified on ${verified} markets`);
          expect(verified).to.be.gt(0, "Redeem could not be verified on any market");
        });

        it("borrow decreases internalCash correctly", async () => {
          let verified = 0;
          for (const market of upgradedMarkets) {
            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const vToken = VToken__factory.connect(market.address, ethers.provider);

            const cash = await market.vToken.internalCash();
            if (cash.isZero()) continue;

            const balanceSlot = await findBalanceSlot(market.underlying);
            if (balanceSlot === null) continue;

            const decimals = await underlying.decimals();
            const mintAmount = parseUnits("10", decimals);
            const borrowAmount = parseUnits("1", decimals);

            const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
            const [user] = await ethers.getSigners();
            await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot);
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
          console.log(`        Borrow verified on ${verified} markets`);
        });

        it("repay increases internalCash correctly", async () => {
          let verified = 0;
          for (const market of upgradedMarkets) {
            const underlying = IERC20__factory.connect(market.underlying, ethers.provider);
            const vToken = VToken__factory.connect(market.address, ethers.provider);

            const cash = await market.vToken.internalCash();
            if (cash.isZero()) continue;

            const balanceSlot = await findBalanceSlot(market.underlying);
            if (balanceSlot === null) continue;

            const decimals = await underlying.decimals();
            const mintAmount = parseUnits("10", decimals);
            const borrowAmount = parseUnits("1", decimals);

            const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
            const [user] = await ethers.getSigners();
            await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot);
            await underlying.connect(user).approve(market.address, mintAmount);

            try {
              await vToken.connect(user).mint(mintAmount);
              await comptroller.connect(user).enterMarkets([market.address]);
              await vToken.connect(user).borrow(borrowAmount);
            } catch {
              continue;
            }

            await setTokenBalance(market.underlying, user.address, borrowAmount.mul(2), balanceSlot);
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
          console.log(`        Repay verified on ${verified} markets`);
        });
      });
    });
  });
}

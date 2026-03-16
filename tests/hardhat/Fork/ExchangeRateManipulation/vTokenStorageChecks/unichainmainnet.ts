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
import {
  BEACON_SLOT,
  StorageSnapshot,
  assertStoragePreserved,
  findBalanceSlot,
  setTokenBalance,
  takeStorageSnapshot,
} from "./helpers";

const { expect } = chai;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = "unichainmainnet";

const COMPTROLLER = "0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe";
const ADMIN = "0x918532A78d22419Da4091930d472bDdf532BE89a";
const ACM = "0x1f12014c497a9d905155eB9BfDD9FaC6885e61d0";
const BLOCK_NUMBER = 42930000;

type MarketInfo = {
  name: string;
  address: string;
  underlying: string;
  vToken: VToken;
};

if (FORK && process.env.FORKED_NETWORK === FORKED_NETWORK) {
  console.log(`fork tests running on: ${FORKED_NETWORK}, block: ${BLOCK_NUMBER}`);

  describe("vToken Storage Checks - Unichain Mainnet", () => {
    let impersonatedTimelock: Signer;
    let allMarketAddresses: string[];
    let upgradedMarkets: MarketInfo[];
    let preUpgradeSnapshots: Map<string, StorageSnapshot>;

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
      impersonatedTimelock = await initMainnetUser(ADMIN, parseUnits("10"));

      const comptroller = Comptroller__factory.connect(COMPTROLLER, ethers.provider);
      allMarketAddresses = await comptroller.getAllMarkets();

      preUpgradeSnapshots = new Map();
      for (const marketAddr of allMarketAddresses) {
        const vToken = VToken__factory.connect(marketAddr, ethers.provider);
        const snapshot = await takeStorageSnapshot(vToken);
        preUpgradeSnapshots.set(marketAddr, snapshot);
      }

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

    describe("Storage Layout - No Collision After Upgrade", () => {
      it("all existing storage slots preserved", async () => {
        for (const market of upgradedMarkets) {
          const postSnapshot = await takeStorageSnapshot(market.vToken);
          const preSnapshot = preUpgradeSnapshots.get(market.address)!;
          assertStoragePreserved(preSnapshot, postSnapshot, market.name);

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

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) {
            await ethers.provider.send("evm_revert", [snapshotId]);
            continue;
          }

          await vToken.connect(attacker).accrueInterest();

          const exchangeRateBefore = await vToken.exchangeRateStored();
          const internalCashBefore = await market.vToken.internalCash();

          const donationAmount = internalCash.div(2);
          await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
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
        const comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
        const vTokens = upgradedMarkets.map(m => m.vToken);
        const actions = [0, 1, 2, 3, 7];
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

      it("mint increases internalCash", async () => {
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
        expect(verified).to.be.gt(0, "Redeem could not be verified on any market");
      });

      it("borrow decreases internalCash", async () => {
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
      });

      it("repay increases internalCash", async () => {
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
      });
    });
  });
}

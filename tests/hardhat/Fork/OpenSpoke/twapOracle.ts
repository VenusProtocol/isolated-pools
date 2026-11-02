import { SnapshotRestorer, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";

import { ResilientOracleInterface, TwapOracle } from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import { grant } from "../HubSpoke/fixture";
import {
  OpenSpokeFixture,
  XVS,
  deployMockFeed,
  deployProxy,
  e18,
  loadOpenSpokeFixture,
  setPrice,
} from "./util/fixture";
import { impersonate, resilientOracle } from "./util/helpers";

const FORK = process.env.FORK === "true";

const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const HOURS_PER_WEEK = WEEK / HOUR;
const LONG_STALE_PERIOD = 10 * 365 * DAY;
const INVALID_PRICE = "invalid resilient oracle price";
const SET_TOKEN_CONFIG = "setTokenConfig(address,uint256,uint256)";
const SET_TOKEN_ENABLED = "setTokenEnabled(address,bool)";
const FEED_CONFIG = "setTokenConfig((address,address,uint256))";
const RESILIENT_CONFIG = "setTokenConfig((address,address[3],bool[3],bool))";
const RESILIENT_ABI = [
  "function boundValidator() view returns (address)",
  "function setTokenConfig((address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
];
const BOUND_VALIDATOR_ABI = [
  "function setValidateConfig((address asset, uint256 upperBoundRatio, uint256 lowerBoundRatio))",
];
const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function getProxyImplementation(address) view returns (address)",
  "function upgrade(address proxy, address implementation)",
];

type Checkpoint = { timestamp: number; cumulativePrice: BigNumber };

/// An independent copy of the oracle's accumulator: every update and read is checked against it
class TwapModel {
  lastUpdatedAt = 0;
  lastPrice = BigNumber.from(0);
  cumulativePrice = BigNumber.from(0);
  checkpoints = new Map<number, Checkpoint>();

  constructor(readonly period: number, readonly updateInterval: number, readonly configuredAt: number) {}

  /// Returns whether the update takes a checkpoint
  update(timestamp: number, price: BigNumber) {
    const slot = Math.floor(timestamp / this.updateInterval);
    if (this.lastUpdatedAt !== 0 && Math.floor(this.lastUpdatedAt / this.updateInterval) === slot) return false;
    this.cumulativePrice = this.cumulativeAt(timestamp);
    this.lastUpdatedAt = timestamp;
    this.lastPrice = price;
    this.checkpoints.set(slot, { timestamp, cumulativePrice: this.cumulativePrice });
    return true;
  }

  cumulativeAt(timestamp: number) {
    return this.cumulativePrice.add(this.lastPrice.mul(timestamp - this.lastUpdatedAt));
  }

  /// The TWAP at `timestamp`, or undefined without a usable checkpoint where the window starts
  price(timestamp: number) {
    const start = this.checkpoints.get(Math.floor((timestamp - this.period) / this.updateInterval));
    if (!start || start.timestamp <= this.configuredAt) return undefined;
    return this.cumulativeAt(timestamp)
      .sub(start.cumulativePrice)
      .div(timestamp - start.timestamp);
  }
}

/// The TWAP of hourly prices over a full window: `hours[i]` hours at `usd[i]`, as the oracle rounds it
const hourlyTwap = (...segments: [usd: string, hours: number][]) => {
  const total = segments.reduce((sum, [usd, hours]) => sum.add(e18(usd).mul(hours)), BigNumber.from(0));
  const hours = segments.reduce((sum, [, h]) => sum + h, 0);
  return total.div(hours);
};

const min = (a: BigNumber, b: BigNumber) => (a.lt(b) ? a : b);

if (FORK) {
  describe("TwapOracle on bscmainnet: XVS priced at min(spot, 7-day TWAP)", function () {
    this.timeout(0);

    let f: OpenSpokeFixture;
    let twap: TwapOracle;
    let oracle: ResilientOracleInterface;
    let deployed: SnapshotRestorer;
    /// The start of a day after the setup; hour `h` of the history is `t0 + h * HOUR`
    let t0: number;
    let model: TwapModel;
    let enabled: boolean;

    const hour = (h: number) => t0 + h * HOUR;

    before(async () => {
      f = await loadOpenSpokeFixture();
      oracle = await resilientOracle();
      twap = (await deployProxy(f.admin, "TwapOracle", [bscmainnet.RESILIENT_ORACLE])) as TwapOracle;
      for (const signature of [SET_TOKEN_CONFIG, SET_TOKEN_ENABLED]) {
        await grant(f.acm, f.timelock, twap.address, signature, bscmainnet.NORMAL_TIMELOCK);
      }
      deployed = await takeSnapshot();
    });

    beforeEach(async () => {
      await deployed.restore();
      t0 = (Math.floor((await time.latest()) / DAY) + 2) * DAY;
      enabled = false;
      await configure(WEEK, HOUR, t0 - HOUR / 2);
    });

    afterEach(async function () {
      if (this.currentTest?.state !== "passed") return;
      const config = await twap.tokenConfigs(XVS);
      expect(config.enabled).to.equal(enabled);
      expect(config.period).to.equal(model.period);
      expect(config.updateInterval).to.equal(model.updateInterval);
      expect(config.lastConfiguredAt).to.equal(model.configuredAt);
      expect(config.lastUpdatedAt).to.equal(model.lastUpdatedAt);
      expect(config.lastPrice).to.equal(model.lastPrice);
      expect(config.cumulativePrice).to.equal(model.cumulativePrice);
      const expected = enabled && model.period !== 0 ? model.price(await time.latest()) : undefined;
      expect(await twap.isPriceAvailable(XVS)).to.equal(expected !== undefined);
      if (expected !== undefined) expect(await twap.getPrice(XVS)).to.equal(expected);
    });

    const at = (timestamp: number) => time.setNextBlockTimestamp(timestamp);

    async function configure(period: number, updateInterval: number, timestamp?: number) {
      if (timestamp !== undefined) await at(timestamp);
      const tx = await twap.connect(f.timelock).setTokenConfig(XVS, period, updateInterval);
      await expect(tx).to.emit(twap, "TokenConfigUpdated").withArgs(XVS, period, updateInterval);
      model = new TwapModel(
        period,
        updateInterval,
        (await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp,
      );
      enabled = enabled && period !== 0;
    }

    async function setEnabled(value: boolean, timestamp?: number) {
      if (timestamp !== undefined) await at(timestamp);
      await expect(twap.connect(f.timelock).setTokenEnabled(XVS, value))
        .to.emit(twap, "TokenEnabledUpdated")
        .withArgs(XVS, value);
      enabled = value;
    }

    /// Moves the XVS main feed to `usd` a minute before `timestamp`
    async function movePrice(timestamp: number, usd: string, feed: Contract = f.xvsFeed) {
      await at(timestamp - 60);
      await setPrice(feed, usd);
    }

    /// `caller` updates XVS at `timestamp`, after the feed moves to `usd` when given; the event must match the model
    async function update(timestamp: number, usd?: string, caller: Signer = f.keeper): Promise<ContractTransaction> {
      if (usd !== undefined) await movePrice(timestamp, usd);
      await at(timestamp);
      const tx = await twap.connect(caller).updatePrice(XVS);
      const spot = await oracle.getPrice(XVS);
      if (model.update(timestamp, spot)) {
        await expect(tx).to.emit(twap, "PriceUpdated").withArgs(XVS, spot, model.cumulativePrice);
      } else {
        await expect(tx).not.to.emit(twap, "PriceUpdated");
      }
      return tx;
    }

    /// Keeper updates at the start of hours `from`, `from + 1`, ...; an undefined price keeps the feed where it is
    async function updateHourly(from: number, prices: (string | undefined)[]) {
      for (const [i, usd] of prices.entries()) await update(hour(from + i), usd);
    }

    /// A week of keeper updates at the start of each hour, at the pinned $5 unless `usd` is given
    const fillWeek = (usd?: string) => updateHourly(0, [usd, ...Array(HOURS_PER_WEEK - 1).fill(undefined)]);

    async function goTo(timestamp: number) {
      if ((await time.latest()) < timestamp) await time.increaseTo(timestamp);
      expect(await time.latest()).to.equal(timestamp);
    }

    /// The model's TWAP at `timestamp`, which must exist
    function modelTwap(timestamp: number) {
      const price = model.price(timestamp);
      if (price === undefined) throw new Error(`no TWAP at ${timestamp}`);
      return price;
    }

    async function expectTwap(timestamp: number, expected: BigNumber) {
      await goTo(timestamp);
      expect(model.price(timestamp)).to.equal(expected);
      expect(await twap.getPrice(XVS)).to.equal(expected);
      expect(await twap.isPriceAvailable(XVS)).to.equal(true);
    }

    async function expectNoTwap(timestamp: number) {
      await goTo(timestamp);
      expect(model.price(timestamp)).to.equal(undefined);
      await expect(twap.getPrice(XVS)).to.be.revertedWithCustomError(twap, "InsufficientHistory").withArgs(XVS);
      expect(await twap.isPriceAvailable(XVS)).to.equal(false);
    }

    async function expectNotEnabled() {
      await expect(twap.getPrice(XVS)).to.be.revertedWithCustomError(twap, "AssetNotEnabled").withArgs(XVS);
      expect(await twap.isPriceAvailable(XVS)).to.equal(false);
    }

    /// The bond pricing rule the manager applies to XVS
    const bondPrice = async () => min(await oracle.getPrice(XVS), await twap.getPrice(XVS));

    describe("rollout", () => {
      it("runs behind the default proxy admin on the live ResilientOracle and AccessControlManager", async () => {
        expect(await twap.RESILIENT_ORACLE()).to.equal(bscmainnet.RESILIENT_ORACLE);
        expect(await twap.accessControlManager()).to.equal(bscmainnet.ACM);
        const proxyAdmin = new ethers.Contract(bscmainnet.DEFAULT_PROXY_ADMIN, PROXY_ADMIN_ABI, f.admin);
        const implementation = await proxyAdmin.getProxyImplementation(twap.address);
        expect(await ethers.provider.getCode(implementation)).not.to.equal("0x");
        expect(await twap.tokenConfigs(XVS)).to.deep.equal([false, WEEK, HOUR, t0 - HOUR / 2, 0, 0, 0]);
      });

      it("serves the TWAP at once when governance enables XVS after the keeper filled a week while disabled", async () => {
        await fillWeek();
        await goTo(hour(HOURS_PER_WEEK) - 1);
        await expectNotEnabled();
        await setEnabled(true, hour(HOURS_PER_WEEK));
        expect(await twap.getPrice(XVS)).to.equal(e18("5"));
        expect(await oracle.getPrice(XVS)).to.equal(e18("5"));
        expect(await bondPrice()).to.equal(e18("5"));
      });

      it("warms up for exactly one period after the first update", async () => {
        await setEnabled(true);
        await expectNoTwap(hour(0) - 1);
        await fillWeek();
        await expectNoTwap(hour(HOURS_PER_WEEK) - 1);
        await expectTwap(hour(HOURS_PER_WEEK), e18("5"));
      });
    });

    describe("with XVS enabled", () => {
      beforeEach(async () => {
        await setEnabled(true);
      });

      describe("normal operation", () => {
        it("tracks a steady price exactly while the window slides for a day", async () => {
          await fillWeek();
          for (let h = HOURS_PER_WEEK; h < HOURS_PER_WEEK + 24; h++) {
            // An update at a timestamp leaves the TWAP at that timestamp unchanged
            await update(hour(h));
            await expectTwap(hour(h), e18("5"));
            await expectTwap(hour(h) + HOUR / 2, e18("5"));
          }
        });

        it("averages a rising price hour by hour and drops the oldest hour as the window slides", async () => {
          const ramp = (h: number) => (5 + h / 100).toFixed(2);
          await updateHourly(
            0,
            Array.from({ length: HOURS_PER_WEEK }, (_, h) => ramp(h)),
          );
          await update(hour(HOURS_PER_WEEK), ramp(HOURS_PER_WEEK));
          // The mean of 5.00, 5.01, ..., 6.67, then of 5.01, ..., 6.68
          await expectTwap(hour(HOURS_PER_WEEK), e18("5.835"));
          await expectTwap(hour(HOURS_PER_WEEK + 1), e18("5.845"));
        });

        it("values the bond at the TWAP in a rally and at the spot in a sell-off", async () => {
          await fillWeek();
          await updateHourly(HOURS_PER_WEEK, ["5.5", "6", "6.5", "7"]);
          await goTo(hour(HOURS_PER_WEEK + 4));
          const rallyTwap = hourlyTwap(["5", 164], ["5.5", 1], ["6", 1], ["6.5", 1], ["7", 1]);
          await expectTwap(hour(HOURS_PER_WEEK + 4), rallyTwap);
          expect(await oracle.getPrice(XVS)).to.equal(e18("7"));
          expect(await bondPrice()).to.equal(rallyTwap);

          await update(hour(HOURS_PER_WEEK + 4) + 120, "3");
          // From hour 5: 163 hours at 5, an hour each at 5.5, 6 and 6.5, then 7 until the update two minutes in
          const selloffTwap = e18("5")
            .mul(163 * HOUR)
            .add(e18("18").mul(HOUR))
            .add(e18("7").mul(HOUR + 120))
            .add(e18("3").mul(HOUR - 120))
            .div(WEEK);
          await expectTwap(hour(HOURS_PER_WEEK + 5), selloffTwap);
          expect(await bondPrice()).to.equal(e18("3"));
        });

        it("keeps one checkpoint an hour when the keeper runs late and a second keeper repeats it", async () => {
          for (let h = 0; h < HOURS_PER_WEEK; h++) {
            await update(hour(h) + 45 * 60, h % 2 === 0 ? "5" : "6");
            await update(hour(h) + 50 * 60, undefined, f.outsider);
          }
          await expectTwap(hour(HOURS_PER_WEEK) + 45 * 60, e18("5.5"));
          // Until the next update the window keeps starting at hour 0's late checkpoint
          await expectTwap(hour(HOURS_PER_WEEK) + 50 * 60, modelTwap(hour(HOURS_PER_WEEK) + 50 * 60));
        });
      });

      describe("edge cases", () => {
        it("counts a missed hour at the last price and refuses a TWAP for the hour the window starts in it", async () => {
          await updateHourly(0, ["5", ...Array(49).fill(undefined)]);
          // Hour 50 is missed while the feed already moved to 7
          await movePrice(hour(50), "7");
          await updateHourly(51, Array(HOURS_PER_WEEK - 50).fill(undefined));
          await expectTwap(hour(HOURS_PER_WEEK), hourlyTwap(["5", 51], ["7", 117]));

          await updateHourly(HOURS_PER_WEEK + 1, Array(50).fill(undefined));
          await expectNoTwap(hour(HOURS_PER_WEEK + 50));
          await expectNoTwap(hour(HOURS_PER_WEEK + 51) - 1);
          await update(hour(HOURS_PER_WEEK + 51));
          await expectTwap(hour(HOURS_PER_WEEK + 51), e18("7"));
        });

        it("carries the last price through a keeper outage and fails closed once the window passes the last update", async () => {
          await updateHourly(0, ["5", ...Array(HOURS_PER_WEEK - 25).fill(undefined), "6"]);
          await updateHourly(HOURS_PER_WEEK - 23, Array(23).fill(undefined));
          await movePrice(hour(HOURS_PER_WEEK + 1), "9");

          // The unrecorded move to 9 is invisible: the last price, 6, runs on
          await expectTwap(hour(HOURS_PER_WEEK + 10), hourlyTwap(["5", 134], ["6", 34]));
          expect(await oracle.getPrice(XVS)).to.equal(e18("9"));
          expect(await bondPrice()).to.equal(hourlyTwap(["5", 134], ["6", 34]));
          await expectTwap(hour(2 * HOURS_PER_WEEK) - 1, e18("6"));
          await expectNoTwap(hour(2 * HOURS_PER_WEEK));
        });

        it("rejects an update while the ResilientOracle reverts, runs the last price on and recovers in the same hour", async () => {
          await fillWeek();
          await movePrice(hour(HOURS_PER_WEEK), "0");
          await at(hour(HOURS_PER_WEEK));
          await expect(twap.connect(f.keeper).updatePrice(XVS)).to.be.revertedWith(INVALID_PRICE);
          await expectTwap(hour(HOURS_PER_WEEK) + 10 * 60, e18("5"));

          await movePrice(hour(HOURS_PER_WEEK) + 30 * 60, "6");
          await update(hour(HOURS_PER_WEEK) + 30 * 60);
          expect(model.lastPrice).to.equal(e18("6"));
          await updateHourly(HOURS_PER_WEEK + 1, Array(3).fill(undefined));
          await expectTwap(hour(HOURS_PER_WEEK + 4), modelTwap(hour(HOURS_PER_WEEK + 4)));
          // Hours 4 to 167 and the first half of hour 168 at 5, the rest at 6
          expect(await twap.getPrice(XVS)).to.equal(
            e18("5")
              .mul(164 * HOUR + HOUR / 2)
              .add(e18("6").mul(3 * HOUR + HOUR / 2))
              .div(WEEK),
          );
        });

        it("stops updates while the main feed is stale and resumes when it reports again", async () => {
          await f.chainlinkOracle
            .connect(f.timelock)
            [FEED_CONFIG]({ asset: XVS, feed: f.xvsFeed.address, maxStalePeriod: 2 * HOUR });
          await updateHourly(
            0,
            Array.from({ length: HOURS_PER_WEEK }, () => "5"),
          );
          await update(hour(HOURS_PER_WEEK));
          await at(hour(HOURS_PER_WEEK + 1));
          await expect(twap.connect(f.keeper).updatePrice(XVS)).to.be.revertedWith(INVALID_PRICE);
          await at(hour(HOURS_PER_WEEK + 2));
          await expect(twap.connect(f.keeper).updatePrice(XVS)).to.be.revertedWith(INVALID_PRICE);
          await update(hour(HOURS_PER_WEEK + 3), "8");
          // The stale hours run at the last price, 5
          await expectTwap(hour(HOURS_PER_WEEK + 4), hourlyTwap(["5", 167], ["8", 1]));
          await expectTwap(hour(HOURS_PER_WEEK + 5), modelTwap(hour(HOURS_PER_WEEK + 5)));
        });

        it("records whatever the ResilientOracle settles on across main, pivot and fallback", async () => {
          const pivotFeed = await deployMockFeed(f, "5");
          const fallbackFeed = await deployMockFeed(f, "5.02");
          await f.redStoneOracle
            .connect(f.timelock)
            [FEED_CONFIG]({ asset: XVS, feed: pivotFeed.address, maxStalePeriod: LONG_STALE_PERIOD });
          await f.thirdOracle
            .connect(f.timelock)
            [FEED_CONFIG]({ asset: XVS, feed: fallbackFeed.address, maxStalePeriod: LONG_STALE_PERIOD });
          const resilient = new ethers.Contract(bscmainnet.RESILIENT_ORACLE, RESILIENT_ABI, f.timelock);
          const boundValidator = await resilient.boundValidator();
          await grant(
            f.acm,
            f.timelock,
            boundValidator,
            "setValidateConfig(ValidateConfig)",
            bscmainnet.NORMAL_TIMELOCK,
          );
          await new ethers.Contract(boundValidator, BOUND_VALIDATOR_ABI, f.timelock).setValidateConfig({
            asset: XVS,
            upperBoundRatio: e18("1.01"),
            lowerBoundRatio: e18("0.99"),
          });
          await resilient[RESILIENT_CONFIG]({
            asset: XVS,
            oracles: [bscmainnet.CHAINLINK_ORACLE, bscmainnet.REDSTONE_ORACLE, f.thirdOracle.address],
            enableFlagsForOracles: [true, true, true],
            cachingEnabled: false,
          });

          await updateHourly(0, Array(HOURS_PER_WEEK - 3).fill(undefined));
          expect(model.lastPrice).to.equal(e18("5"));
          // The main feed deviates from the pivot: the fallback, which the pivot validates, is used
          await update(hour(HOURS_PER_WEEK - 3), "8");
          expect(model.lastPrice).to.equal(e18("5.02"));
          // The main feed fails: the fallback is used
          await update(hour(HOURS_PER_WEEK - 2), "0");
          expect(model.lastPrice).to.equal(e18("5.02"));
          // No two sources agree: the ResilientOracle reverts and so does the update
          await movePrice(hour(HOURS_PER_WEEK - 1), "5.5", pivotFeed);
          await at(hour(HOURS_PER_WEEK - 1));
          await expect(twap.connect(f.keeper).updatePrice(XVS)).to.be.revertedWith(INVALID_PRICE);

          await expectTwap(hour(HOURS_PER_WEEK), hourlyTwap(["5", 165], ["5.02", 3]));
        });

        it("stops reads but not updates while disabled, and re-enabling serves the TWAP over that time", async () => {
          await fillWeek();
          await setEnabled(false, hour(HOURS_PER_WEEK) - HOUR / 2);
          await expectNotEnabled();
          await updateHourly(HOURS_PER_WEEK, ["6", ...Array(11).fill(undefined)]);
          await goTo(hour(HOURS_PER_WEEK + 11) + 10);
          await expectNotEnabled();
          await setEnabled(true, hour(HOURS_PER_WEEK + 11) + HOUR / 2);
          // The window starts at hour 11: 157 hours at 5, then 11.5 hours at 6
          const expected = e18("5")
            .mul(157 * HOUR)
            .add(e18("6").mul(11 * HOUR + HOUR / 2))
            .div(168 * HOUR + HOUR / 2);
          await expectTwap(hour(HOURS_PER_WEEK + 11) + HOUR / 2, expected);
        });

        it("restarts the history on a period change and ignores the checkpoints from before it", async () => {
          await fillWeek();
          await update(hour(HOURS_PER_WEEK));
          await configure(DAY, HOUR, hour(HOURS_PER_WEEK) + HOUR / 2);
          expect(enabled).to.equal(true);
          // The window would start in hour 144, which has a checkpoint from the old history
          await expectNoTwap(hour(HOURS_PER_WEEK) + HOUR / 2 + 1);

          await updateHourly(HOURS_PER_WEEK + 1, ["8", ...Array(23).fill(undefined)]);
          // The window starts in hour 168, which only has the old history's checkpoint
          await expectNoTwap(hour(HOURS_PER_WEEK + 25) - 1);
          await expectTwap(hour(HOURS_PER_WEEK + 25), e18("8"));
        });

        it("stops updates and reads once XVS is removed, and a re-added XVS starts over disabled", async () => {
          await fillWeek();
          await configure(0, 0);
          expect(enabled).to.equal(false);
          await expectNotEnabled();
          await expect(twap.connect(f.keeper).updatePrice(XVS))
            .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
            .withArgs(XVS);
          await expect(twap.connect(f.timelock).setTokenEnabled(XVS, true))
            .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
            .withArgs(XVS);

          await configure(WEEK, HOUR, hour(HOURS_PER_WEEK) + 10);
          expect(enabled).to.equal(false);
          await setEnabled(true);
          // Hour 0's old checkpoint is where the window starts, and it is ignored
          await expectNoTwap(hour(HOURS_PER_WEEK) + 20);
        });

        it("keeps the history and the TWAP across an implementation upgrade", async () => {
          await updateHourly(
            0,
            Array.from({ length: HOURS_PER_WEEK }, (_, h) => (h % 3 === 0 ? "4" : "6")),
          );
          await goTo(hour(HOURS_PER_WEEK));
          const before = await twap.getPrice(XVS);
          expect(before).to.equal(hourlyTwap(["4", 56], ["6", 112]));

          const proxyAdmin = new ethers.Contract(bscmainnet.DEFAULT_PROXY_ADMIN, PROXY_ADMIN_ABI, f.admin);
          const implementation = await (
            await ethers.getContractFactory("TwapOracle", f.admin)
          ).deploy(bscmainnet.RESILIENT_ORACLE);
          await proxyAdmin
            .connect(await impersonate(await proxyAdmin.owner()))
            .upgrade(twap.address, implementation.address);
          expect(await proxyAdmin.getProxyImplementation(twap.address)).to.equal(implementation.address);

          // The upgrade took a few seconds, which the history carries at the last price
          expect(await twap.getPrice(XVS)).to.equal(modelTwap(await time.latest()));
          expect(await twap.getPrice(XVS)).to.be.closeTo(before, before.div(10_000));
          expect(await twap.accessControlManager()).to.equal(bscmainnet.ACM);
          await update(hour(HOURS_PER_WEEK) + 60);
          // Hour 0, at 4, left the window and hour 168, at 6, joined it
          await expectTwap(hour(HOURS_PER_WEEK + 1), hourlyTwap(["4", 55], ["6", 113]));
        });
      });

      describe("attack vectors", () => {
        beforeEach(async () => {
          await fillWeek();
        });

        it("a one-hour 5x pump moves the TWAP by a 168th of the pump, and the bond is valued at the TWAP", async () => {
          await update(hour(HOURS_PER_WEEK), "25");
          await goTo(hour(HOURS_PER_WEEK + 1));
          const pumped = hourlyTwap(["5", 167], ["25", 1]);
          await expectTwap(hour(HOURS_PER_WEEK + 1), pumped);
          expect(await oracle.getPrice(XVS)).to.equal(e18("25"));
          expect(await bondPrice()).to.equal(pumped);
          expect(pumped.sub(e18("5"))).to.equal(e18("20").div(168));
        });

        it("a pump held for a day moves the TWAP in proportion to the hours held", async () => {
          await updateHourly(HOURS_PER_WEEK, ["25", ...Array(23).fill(undefined)]);
          const pumped = hourlyTwap(["5", 144], ["25", 24]);
          await expectTwap(hour(HOURS_PER_WEEK + 24), pumped);
          expect(await bondPrice()).to.equal(pumped);
          expect(pumped.sub(e18("5"))).to.equal(e18("20").mul(24).div(168));
        });

        it("a one-block pump the attacker records first counts for that whole hour and no more", async () => {
          await update(hour(HOURS_PER_WEEK), "25", f.attacker);
          await movePrice(hour(HOURS_PER_WEEK) + 120, "5");
          // The keeper's honest update in the same hour does nothing
          await update(hour(HOURS_PER_WEEK) + 120);
          expect(model.lastPrice).to.equal(e18("25"));
          await update(hour(HOURS_PER_WEEK + 1));
          expect(model.lastPrice).to.equal(e18("5"));

          const pumped = hourlyTwap(["5", 167], ["25", 1]);
          await expectTwap(hour(HOURS_PER_WEEK + 2) - 1, modelTwap(hour(HOURS_PER_WEEK + 2) - 1));
          await expectTwap(hour(HOURS_PER_WEEK + 2), pumped);
          expect(await oracle.getPrice(XVS)).to.equal(e18("5"));
          expect(await bondPrice()).to.equal(e18("5"));
        });

        it("spamming updates in one hour, at any price, leaves a single checkpoint", async () => {
          await update(hour(HOURS_PER_WEEK), "6", f.attacker);
          for (let i = 1; i <= 10; i++) {
            await update(hour(HOURS_PER_WEEK) + i * 300, (6 + i).toString(), f.attacker);
          }
          expect(model.lastUpdatedAt).to.equal(hour(HOURS_PER_WEEK));
          expect(model.lastPrice).to.equal(e18("6"));
          await expectTwap(hour(HOURS_PER_WEEK + 1), hourlyTwap(["5", 167], ["6", 1]));
        });

        it("a crash lowers the TWAP by its share only, and the bond is valued at the lower spot", async () => {
          await update(hour(HOURS_PER_WEEK), "1");
          await expectTwap(hour(HOURS_PER_WEEK + 1), hourlyTwap(["5", 167], ["1", 1]));
          expect(await bondPrice()).to.equal(e18("1"));
        });

        it("an attacker cannot configure, enable, disable or remove XVS", async () => {
          const calls = [
            { signature: SET_TOKEN_CONFIG, call: () => twap.connect(f.attacker).setTokenConfig(XVS, HOUR, HOUR) },
            { signature: SET_TOKEN_CONFIG, call: () => twap.connect(f.attacker).setTokenConfig(XVS, 0, 0) },
            { signature: SET_TOKEN_ENABLED, call: () => twap.connect(f.attacker).setTokenEnabled(XVS, false) },
            { signature: SET_TOKEN_ENABLED, call: () => twap.connect(f.attacker).setTokenEnabled(XVS, true) },
          ];
          for (const { signature, call } of calls) {
            await expect(call())
              .to.be.revertedWithCustomError(twap, "Unauthorized")
              .withArgs(f.attacker.address, twap.address, signature);
          }
          await expectTwap(hour(HOURS_PER_WEEK), e18("5"));
        });

        it("an attacker cannot reinitialize the proxy or the implementation to swap the AccessControlManager", async () => {
          await expect(twap.connect(f.attacker).initialize(f.attacker.address)).to.be.revertedWith(
            "Initializable: contract is already initialized",
          );
          const proxyAdmin = new ethers.Contract(bscmainnet.DEFAULT_PROXY_ADMIN, PROXY_ADMIN_ABI, f.admin);
          const implementation = twap.attach(await proxyAdmin.getProxyImplementation(twap.address));
          await expect(implementation.connect(f.attacker).initialize(f.attacker.address)).to.be.revertedWith(
            "Initializable: contract is already initialized",
          );
          expect(await twap.accessControlManager()).to.equal(bscmainnet.ACM);
        });

        it("updating other assets cannot touch the XVS history", async () => {
          await expect(twap.connect(f.attacker).updatePrice(bscmainnet.USDT))
            .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
            .withArgs(bscmainnet.USDT);
          await twap.connect(f.timelock).setTokenConfig(bscmainnet.USDT, DAY, HOUR);
          await at(hour(HOURS_PER_WEEK));
          await expect(twap.connect(f.attacker).updatePrice(bscmainnet.USDT))
            .to.emit(twap, "PriceUpdated")
            .withArgs(bscmainnet.USDT, e18("1"), 0);
          await expectTwap(hour(HOURS_PER_WEEK) + 1, e18("5"));
        });

        it("a missed hour cannot be backfilled later", async () => {
          await movePrice(hour(HOURS_PER_WEEK), "9");
          await update(hour(HOURS_PER_WEEK + 1) - 1, undefined, f.attacker);
          // That update landed in hour 168; hour 169 is skipped and no later call can write it
          await updateHourly(HOURS_PER_WEEK + 2, Array(HOURS_PER_WEEK).fill(undefined));
          expect(model.checkpoints.has(Math.floor(hour(HOURS_PER_WEEK + 1) / HOUR))).to.equal(false);
          await expectNoTwap(hour(2 * HOURS_PER_WEEK + 1));
          await expectNoTwap(hour(2 * HOURS_PER_WEEK + 2) - 1);
          await update(hour(2 * HOURS_PER_WEEK + 2));
          await expectTwap(hour(2 * HOURS_PER_WEEK + 2), e18("9"));
        });
      });
    });
  });
}

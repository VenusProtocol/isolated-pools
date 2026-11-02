import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
  TwapOracle,
  TwapOracle__factory,
} from "../../../typechain";
import { NO_ESTIMATE, deployProxy, e18, resetFakes } from "../Spoke/OpenSpokePool/utils";

const { expect } = chai;
chai.use(smock.matchers);

const HOUR = 3600;
const DAY = 24 * HOUR;
const UPDATE_INTERVAL = HOUR;
const PERIOD = 4 * HOUR;
const SET_TOKEN_CONFIG = "setTokenConfig(address,uint256,uint256)";
const SET_ASSET_PARAMS = "setAssetParams(address,uint256,uint256)";
const SET_TOKEN_ENABLED = "setTokenEnabled(address,bool)";

describe("TwapOracle", () => {
  let owner: SignerWithAddress;
  let asset: SignerWithAddress;
  let otherAsset: SignerWithAddress;
  let keeper: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let resilientOracle: FakeContract<ResilientOracleInterface>;
  let twap: TwapOracle;
  /// The start of a day after the fixture, so a test's timestamps line up with interval slots up to a day
  let t0: number;

  const deployFixture = async () => {
    [owner, asset, otherAsset, keeper, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    resilientOracle = await smock.fake<ResilientOracleInterface>(ResilientOracleInterface__factory.abi);
    twap = await deployProxy(await new TwapOracle__factory(owner).deploy(resilientOracle.address), acm.address);
  };

  beforeEach(async () => {
    await loadFixture(deployFixture);
    resetFakes(acm, resilientOracle);
    acm.isAllowedToCall.returns(true);
    t0 = (Math.floor((await time.latest()) / DAY) + 2) * DAY;
  });

  const configure = (period: BigNumberish = PERIOD, updateInterval: BigNumberish = UPDATE_INTERVAL) =>
    twap.setTokenConfig(asset.address, period, updateInterval);

  const setParams = (period: BigNumberish, updateInterval: BigNumberish) =>
    twap.setAssetParams(asset.address, period, updateInterval);

  const configureAndEnable = async () => {
    await configure();
    await twap.setTokenEnabled(asset.address, true);
  };

  /// The keeper updates the asset at `timestamp`, with the ResilientOracle returning `price`
  const updateAt = async (timestamp: number, price: BigNumber) => {
    resilientOracle.getPrice.returns(price);
    await time.setNextBlockTimestamp(timestamp);
    return twap.connect(keeper).updatePrice(asset.address, NO_ESTIMATE);
  };

  /// Hourly updates from `t0`, one per price
  const updateHourly = async (prices: BigNumber[], from = t0) => {
    for (const [i, price] of prices.entries()) {
      await updateAt(from + i * HOUR, price);
    }
  };

  /// Mines a block at `timestamp` so the next view reads the oracle at that time
  const viewAt = (timestamp: number) => time.increaseTo(timestamp);

  const expectPrice = async (timestamp: number, price: BigNumberish) => {
    await viewAt(timestamp);
    expect(await twap.getPrice(asset.address)).to.equal(price);
    expect(await twap.isPriceAvailable(asset.address)).to.equal(true);
  };

  const expectInsufficientHistory = async (timestamp: number) => {
    await viewAt(timestamp);
    await expect(twap.getPrice(asset.address))
      .to.be.revertedWithCustomError(twap, "InsufficientHistory")
      .withArgs(asset.address);
    expect(await twap.isPriceAvailable(asset.address)).to.equal(false);
  };

  const expectNotEnabled = async () => {
    await expect(twap.getPrice(asset.address))
      .to.be.revertedWithCustomError(twap, "AssetNotEnabled")
      .withArgs(asset.address);
    expect(await twap.isPriceAvailable(asset.address)).to.equal(false);
  };

  describe("deployment", () => {
    it("reverts on a zero ResilientOracle", async () => {
      const factory = new TwapOracle__factory(owner);
      await expect(factory.deploy(constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the ResilientOracle and the AccessControlManager", async () => {
      expect(await twap.RESILIENT_ORACLE()).to.equal(resilientOracle.address);
      expect(await twap.accessControlManager()).to.equal(acm.address);
      expect(await twap.owner()).to.equal(owner.address);
    });

    it("cannot be initialized again", async () => {
      await expect(twap.initialize(acm.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("leaves the implementation uninitializable", async () => {
      const implementation = await new TwapOracle__factory(owner).deploy(resilientOracle.address);
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("access control", () => {
    const restricted = [
      { signature: SET_TOKEN_CONFIG, call: () => twap.connect(other).setTokenConfig(asset.address, PERIOD, HOUR) },
      { signature: SET_ASSET_PARAMS, call: () => twap.connect(other).setAssetParams(asset.address, PERIOD, HOUR) },
      { signature: SET_TOKEN_ENABLED, call: () => twap.connect(other).setTokenEnabled(asset.address, true) },
    ];

    for (const { signature, call } of restricted) {
      it(`reverts ${signature} for a caller the AccessControlManager does not allow`, async () => {
        acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
        await expect(call())
          .to.be.revertedWithCustomError(twap, "Unauthorized")
          .withArgs(other.address, twap.address, signature);
      });
    }

    it("lets anyone update a price", async () => {
      await configure();
      acm.isAllowedToCall.returns(false);
      resilientOracle.getPrice.returns(e18("1"));
      await expect(twap.connect(other).updatePrice(asset.address)).to.emit(twap, "PriceUpdated");
    });
  });

  describe("setTokenConfig", () => {
    it("reverts on a zero asset", async () => {
      await expect(twap.setTokenConfig(constants.AddressZero, PERIOD, HOUR)).to.be.revertedWithCustomError(
        twap,
        "ZeroAddressNotAllowed",
      );
    });

    const invalid = [
      { name: "a zero period", period: 0, updateInterval: 0 },
      { name: "a zero update interval", period: PERIOD, updateInterval: 0 },
      { name: "an update interval longer than the period", period: PERIOD, updateInterval: PERIOD + 1 },
    ];

    for (const { name, period, updateInterval } of invalid) {
      it(`reverts on ${name}`, async () => {
        await expect(configure(period, updateInterval))
          .to.be.revertedWithCustomError(twap, "InvalidTokenConfig")
          .withArgs(asset.address);
      });
    }

    it("accepts a period equal to the update interval", async () => {
      await configure(HOUR, HOUR);
      expect((await twap.tokenConfigs(asset.address)).period).to.equal(HOUR);
    });

    it("stores a disabled config with an empty history, lists the asset and emits TokenConfigAdded", async () => {
      await expect(configure()).to.emit(twap, "TokenConfigAdded").withArgs(asset.address, PERIOD, UPDATE_INTERVAL);
      expect(await twap.tokenConfigs(asset.address)).to.deep.equal([
        asset.address,
        false,
        PERIOD,
        UPDATE_INTERVAL,
        0,
        0,
        0,
      ]);
      expect(await twap.getAllAssets()).to.deep.equal([asset.address]);
    });

    it("reverts on an asset that is already configured", async () => {
      await configure();
      await expect(configure(2 * PERIOD, HOUR))
        .to.be.revertedWithCustomError(twap, "AssetAlreadyConfigured")
        .withArgs(asset.address);
    });

    it("lists the assets in the order they were added", async () => {
      await configure();
      await twap.setTokenConfig(otherAsset.address, PERIOD, HOUR);
      await setParams(2 * PERIOD, HOUR);
      expect(await twap.getAllAssets()).to.deep.equal([asset.address, otherAsset.address]);
    });

    it("leaves other assets alone", async () => {
      await configureAndEnable();
      await updateAt(t0, e18("1"));
      await twap.setTokenConfig(otherAsset.address, 2 * PERIOD, HOUR);
      const config = await twap.tokenConfigs(asset.address);
      expect(config.enabled).to.equal(true);
      expect(config.lastPrice).to.equal(e18("1"));
    });
  });

  describe("setAssetParams", () => {
    it("reverts on an asset without a config", async () => {
      await expect(setParams(PERIOD, HOUR))
        .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
        .withArgs(asset.address);
    });

    const invalid = [
      { name: "a zero period", period: 0, updateInterval: 0 },
      { name: "a zero update interval", period: PERIOD, updateInterval: 0 },
      { name: "an update interval longer than the period", period: PERIOD, updateInterval: PERIOD + 1 },
    ];

    for (const { name, period, updateInterval } of invalid) {
      it(`reverts on ${name}`, async () => {
        await configure();
        await expect(setParams(period, updateInterval))
          .to.be.revertedWithCustomError(twap, "InvalidTokenConfig")
          .withArgs(asset.address);
      });
    }

    it("changes the period and update interval, emitting the old and new values, and keeps the rest", async () => {
      await configureAndEnable();
      await updateHourly([e18("1"), e18("2")]);
      await expect(setParams(2 * PERIOD + 1, 2 * HOUR))
        .to.emit(twap, "AssetParamsUpdated")
        .withArgs(asset.address, PERIOD, 2 * PERIOD + 1, UPDATE_INTERVAL, 2 * HOUR);
      expect(await twap.tokenConfigs(asset.address)).to.deep.equal([
        asset.address,
        true,
        2 * PERIOD + 1,
        2 * HOUR,
        t0 + HOUR,
        e18("2"),
        e18("1").mul(HOUR),
      ]);
      expect(await twap.getAllAssets()).to.deep.equal([asset.address]);
    });
  });

  describe("setTokenEnabled", () => {
    for (const enabled of [true, false]) {
      it(`reverts when setting ${enabled} on an asset without a config`, async () => {
        await expect(twap.setTokenEnabled(asset.address, enabled))
          .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
          .withArgs(asset.address);
      });
    }

    it("enables a configured asset and emits TokenEnabledUpdated", async () => {
      await configure();
      await expect(twap.setTokenEnabled(asset.address, true))
        .to.emit(twap, "TokenEnabledUpdated")
        .withArgs(asset.address, true);
      expect((await twap.tokenConfigs(asset.address)).enabled).to.equal(true);
    });

    it("disables an asset and keeps its config and history", async () => {
      await configureAndEnable();
      await updateAt(t0, e18("1"));
      await expect(twap.setTokenEnabled(asset.address, false))
        .to.emit(twap, "TokenEnabledUpdated")
        .withArgs(asset.address, false);
      const config = await twap.tokenConfigs(asset.address);
      expect(config.enabled).to.equal(false);
      expect(config.period).to.equal(PERIOD);
      expect(config.lastPrice).to.equal(e18("1"));
    });

    it("does nothing when the flag does not change", async () => {
      await configure();
      await expect(twap.setTokenEnabled(asset.address, false)).not.to.emit(twap, "TokenEnabledUpdated");
      await twap.setTokenEnabled(asset.address, true);
      await expect(twap.setTokenEnabled(asset.address, true)).not.to.emit(twap, "TokenEnabledUpdated");
    });
  });

  describe("updatePrice", () => {
    it("reverts for an asset without a config", async () => {
      await expect(twap.updatePrice(asset.address))
        .to.be.revertedWithCustomError(twap, "AssetNotConfigured")
        .withArgs(asset.address);
    });

    it("stores the first price with a zero running total", async () => {
      await configure();
      await expect(updateAt(t0, e18("5")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("5"), 0);
      const config = await twap.tokenConfigs(asset.address);
      expect(config.lastUpdatedAt).to.equal(t0);
      expect(config.lastPrice).to.equal(e18("5"));
      expect(config.cumulativePrice).to.equal(0);
      expect(resilientOracle.getPrice).to.have.been.calledOnceWith(asset.address);
    });

    it("adds the elapsed time at the last price to the running total", async () => {
      await configure();
      await updateHourly([e18("5")]);
      await expect(updateAt(t0 + HOUR, e18("7")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("7"), e18("5").mul(HOUR));
      await expect(updateAt(t0 + 2 * HOUR, e18("1")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("1"), e18("12").mul(HOUR));
      expect((await twap.tokenConfigs(asset.address)).cumulativePrice).to.equal(e18("12").mul(HOUR));
    });

    for (const offset of [1, HOUR / 2, HOUR - 1]) {
      it(`does nothing on a second update ${offset}s into the same interval slot`, async () => {
        await configure();
        await updateAt(t0, e18("5"));
        await expect(updateAt(t0 + offset, e18("9"))).not.to.emit(twap, "PriceUpdated");
        const config = await twap.tokenConfigs(asset.address);
        expect(config.lastUpdatedAt).to.equal(t0);
        expect(config.lastPrice).to.equal(e18("5"));
        expect(resilientOracle.getPrice).to.have.been.calledOnce;
      });
    }

    it("updates again at the start of the next interval slot, even under a full interval after the last update", async () => {
      await configure();
      await updateAt(t0 + HOUR - 1, e18("5"));
      await expect(updateAt(t0 + HOUR, e18("9")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("9"), e18("5"));
    });

    it("counts a gap of missed interval slots at the last price", async () => {
      await configure();
      await updateAt(t0, e18("5"));
      await expect(updateAt(t0 + 3 * HOUR, e18("100")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("100"), e18("5").mul(3 * HOUR));
    });

    it("propagates a ResilientOracle revert and stores nothing", async () => {
      await configure();
      await updateAt(t0, e18("5"));
      resilientOracle.getPrice.reverts("invalid resilient oracle price");
      await time.setNextBlockTimestamp(t0 + HOUR);
      await expect(twap.updatePrice(asset.address, NO_ESTIMATE)).to.be.revertedWith("invalid resilient oracle price");
      expect((await twap.tokenConfigs(asset.address)).lastUpdatedAt).to.equal(t0);

      resilientOracle.getPrice.reset();
      await expect(updateAt(t0 + HOUR + 1, e18("6")))
        .to.emit(twap, "PriceUpdated")
        .withArgs(asset.address, e18("6"), e18("5").mul(HOUR + 1));
    });

    it("runs while the asset is disabled", async () => {
      await configure();
      await expect(updateAt(t0, e18("5"))).to.emit(twap, "PriceUpdated");
    });

    it("does nothing in the same interval slot after a config change, which keeps the history", async () => {
      await configure();
      await updateAt(t0, e18("5"));
      await setParams(2 * PERIOD, UPDATE_INTERVAL);
      await expect(updateAt(t0 + 10, e18("6"))).not.to.emit(twap, "PriceUpdated");
    });

    it("keeps each asset's history separate", async () => {
      await configure();
      await twap.setTokenConfig(otherAsset.address, PERIOD, UPDATE_INTERVAL);
      await updateAt(t0, e18("5"));
      resilientOracle.getPrice.whenCalledWith(otherAsset.address).returns(e18("8"));
      await expect(twap.updatePrice(otherAsset.address))
        .to.emit(twap, "PriceUpdated")
        .withArgs(otherAsset.address, e18("8"), 0);
      expect((await twap.tokenConfigs(asset.address)).lastPrice).to.equal(e18("5"));
    });
  });

  describe("getPrice and isPriceAvailable", () => {
    it("reject an asset without a config", async () => {
      await expectNotEnabled();
    });

    it("reject a configured asset that is not enabled", async () => {
      await configure();
      await updateHourly([e18("1"), e18("1"), e18("1"), e18("1")]);
      await viewAt(t0 + PERIOD);
      await expectNotEnabled();
    });

    it("reject an enabled asset without updates", async () => {
      await configureAndEnable();
      await expectInsufficientHistory(t0 + PERIOD);
    });

    it("reject until a full period has passed since the first update", async () => {
      await configureAndEnable();
      await updateHourly([e18("1"), e18("2"), e18("3"), e18("4")]);
      await expectInsufficientHistory(t0 + PERIOD - 1);
    });

    it("return the time-weighted average once a full window of history exists", async () => {
      await configureAndEnable();
      await updateHourly([e18("100"), e18("200"), e18("300"), e18("400")]);
      // (100 + 200 + 300 + 400) for an hour each
      await expectPrice(t0 + PERIOD, e18("250"));
    });

    it("return the one price when it never changes", async () => {
      await configureAndEnable();
      await updateHourly([e18("3"), e18("3"), e18("3"), e18("3")]);
      await expectPrice(t0 + PERIOD + HOUR / 2, e18("3"));
    });

    it("count the time since the last update at the last price", async () => {
      await configureAndEnable();
      await updateAt(t0, e18("100"));
      await expectPrice(t0 + PERIOD, e18("100"));
    });

    it("slide the window so older prices drop out", async () => {
      await configureAndEnable();
      await updateHourly([e18("100"), e18("200"), e18("300"), e18("400"), e18("500")]);
      // The window starts at the 200 update
      await expectPrice(t0 + 5 * HOUR, e18("350"));
    });

    it("start the window between checkpoints at the earlier one's price, over exactly the period", async () => {
      await configureAndEnable();
      await updateHourly([e18("100"), e18("200"), e18("300"), e18("400")]);
      // 100 for half an hour, 200 and 300 for an hour each, then 400 for an hour and a half
      await expectPrice(t0 + PERIOD + HOUR / 2, e18("287.5"));
    });

    it("round the TWAP down", async () => {
      await configureAndEnable();
      await updateHourly([e18("100"), e18("200"), e18("300"), e18("400")]);
      await viewAt(t0 + PERIOD + 1000);
      const total = e18("100")
        .mul(HOUR - 1000)
        .add(e18("500").mul(HOUR))
        .add(e18("400").mul(HOUR + 1000));
      expect(total.mod(PERIOD)).not.to.equal(0);
      expect(await twap.getPrice(asset.address)).to.equal(total.div(PERIOD));
    });

    it("reject until a checkpoint exists at or before the window start", async () => {
      await configureAndEnable();
      await updateAt(t0 + HOUR / 2, e18("100"));
      await updateAt(t0 + HOUR, e18("200"));
      await expectInsufficientHistory(t0 + PERIOD);
      await expectInsufficientHistory(t0 + PERIOD + HOUR / 2 - 1);
      // 100 for half an hour, then 200 for three and a half hours
      await expectPrice(t0 + PERIOD + HOUR / 2, e18("187.5"));
    });

    it("bridge a missed update at the last price", async () => {
      await configureAndEnable();
      await updateAt(t0, e18("100"));
      await updateAt(t0 + 2 * HOUR, e18("300"));
      await updateAt(t0 + 3 * HOUR, e18("300"));
      await expectPrice(t0 + PERIOD, e18("200"));
      // The window starts in the missed hour, still at 100
      await expectPrice(t0 + PERIOD + HOUR, e18("250"));
      await expectPrice(t0 + PERIOD + 2 * HOUR, e18("300"));
    });

    it("bridge a gap of any length at the last price, also at the window start", async () => {
      await configureAndEnable();
      await updateAt(t0, e18("100"));
      await updateAt(t0 + 10 * HOUR, e18("300"));
      // The window starts seven hours after the last checkpoint before it: 100 for three hours, then 300 for one
      await expectPrice(t0 + 11 * HOUR, e18("150"));
    });

    it("serve a changed period at once from the history the asset already has", async () => {
      await configureAndEnable();
      await updateHourly([...Array(4).fill(e18("100")), ...Array(4).fill(e18("300"))]);
      await time.setNextBlockTimestamp(t0 + 7 * HOUR + 60);
      await setParams(2 * HOUR, HOUR);
      await expectPrice(t0 + 8 * HOUR, e18("300"));

      await time.setNextBlockTimestamp(t0 + 8 * HOUR + 60);
      await setParams(8 * HOUR, HOUR);
      // 100 for three hours, then 300 for five
      await expectPrice(t0 + 9 * HOUR, e18("225"));

      // A period longer than the history waits for it
      await time.setNextBlockTimestamp(t0 + 9 * HOUR + 60);
      await setParams(16 * HOUR, HOUR);
      await expectInsufficientHistory(t0 + 9 * HOUR + 120);
    });

    it("use the history filled while the asset was disabled", async () => {
      await configure();
      await updateHourly([e18("100"), e18("200"), e18("300"), e18("400")]);
      await expectNotEnabled();
      await time.setNextBlockTimestamp(t0 + PERIOD);
      await twap.setTokenEnabled(asset.address, true);
      expect(await twap.getPrice(asset.address)).to.equal(e18("250"));
    });

    it("resume with the updates made while the asset was disabled", async () => {
      await configureAndEnable();
      await updateHourly([e18("100"), e18("100")]);
      await twap.setTokenEnabled(asset.address, false);
      await updateHourly([e18("300"), e18("300")], t0 + 2 * HOUR);
      await expectNotEnabled();
      await time.setNextBlockTimestamp(t0 + PERIOD);
      await twap.setTokenEnabled(asset.address, true);
      expect(await twap.getPrice(asset.address)).to.equal(e18("200"));
    });

    it("use the asset's own period and update interval", async () => {
      await configure(2 * HOUR, 2 * HOUR);
      await twap.setTokenEnabled(asset.address, true);
      await updateAt(t0, e18("100"));
      await expectInsufficientHistory(t0 + 2 * HOUR - 1);
      await updateAt(t0 + 2 * HOUR, e18("300"));
      // 100 for an hour, then 300 for one
      await expectPrice(t0 + 3 * HOUR, e18("200"));
      await expectPrice(t0 + 4 * HOUR, e18("300"));
    });

    it("price a week-long window of hourly updates with a final pump", async () => {
      await twap.setTokenConfig(asset.address, 7 * DAY, HOUR);
      await twap.setTokenEnabled(asset.address, true);
      const prices = [...Array(7 * 24 - 1).fill(e18("5")), e18("25")];
      await updateHourly(prices);
      // (5 × 167 + 25) / 168
      await expectPrice(t0 + 7 * 24 * HOUR, e18("860").div(168));
    });

    it("handle prices scaled for low-decimal assets", async () => {
      await configureAndEnable();
      const price = BigNumber.from(10).pow(36);
      await updateHourly([price, price.mul(3)]);
      await expectPrice(t0 + PERIOD, price.mul(1 + 3 * 3).div(4));
    });
  });
});

import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  IDeviationBoundedOracle,
  PoolRegistry,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokeComptroller__factory,
  UpgradedSpokeComptroller__factory,
  VToken,
} from "../../../typechain";
import { Action, MAX_LOOPS_LIMIT, ONE } from "./fixtures";

const { expect } = chai;
chai.use(smock.matchers);

const CLOSE_FACTOR = parseUnits("0.5", 18);
const COLLATERAL_FACTOR = parseUnits("0.6", 18);
const LIQUIDATION_THRESHOLD = parseUnits("0.8", 18);
const POOL_INCENTIVE = parseUnits("1.1", 18);
const MARKET_INCENTIVE = parseUnits("1.15", 18);
const MIN_LIQUIDATABLE_COLLATERAL = parseUnits("100", 18);
const SUPPLY_CAP = parseUnits("5000", 18);
const BORROW_CAP = parseUnits("4000", 18);

// Spoke pools sit behind a beacon of their own, so one upgrade moves every pool at once and there is no per-pool
// chance to catch a mistake. These tests cover what that costs: storage has to survive the swap, and the values the
// implementation carries in bytecode rather than in storage have to be re-supplied correctly on every upgrade.
describe("SpokeComptroller: beacon upgrade", () => {
  let account: SignerWithAddress;
  let delegate: SignerWithAddress;
  let poolRegistry: FakeContract<PoolRegistry>;
  let acm: FakeContract<AccessControlManager>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let market: FakeContract<VToken>;
  let beacon: Contract;
  let comptroller: SpokeComptroller;

  /// Everything a listing VIP configures, read back through the public surface. Compared as a whole after an
  /// upgrade, so a value that silently moves does not need its own test to be noticed.
  async function configuration() {
    const marketData = await comptroller.markets(market.address);
    return {
      owner: await comptroller.owner(),
      accessControlManager: await comptroller.accessControlManager(),
      maxLoopsLimit: await comptroller.maxLoopsLimit(),
      oracle: await comptroller.oracle(),
      deviationBoundedOracle: await comptroller.deviationBoundedOracle(),
      closeFactor: await comptroller.closeFactorMantissa(),
      minLiquidatableCollateral: await comptroller.minLiquidatableCollateral(),
      marketIncentive: await comptroller.effectiveLiquidationIncentive(market.address),
      isListed: marketData.isListed,
      collateralFactor: marketData.collateralFactorMantissa,
      liquidationThreshold: marketData.liquidationThresholdMantissa,
      supplyCap: await comptroller.supplyCaps(market.address),
      borrowCap: await comptroller.borrowCaps(market.address),
      allMarkets: (await comptroller.getAllMarkets()).map(address => address.toString()),
      assetsIn: (await comptroller.getAssetsIn(account.address)).map(address => address.toString()),
      isMember: await comptroller.checkMembership(account.address, market.address),
      supplyAllowlistEnabled: await comptroller.isSupplyAllowlistEnabled(market.address),
      allowedSupplier: await comptroller.isAllowedSupplier(market.address, account.address),
      liquidationAllowlistEnabled: await comptroller.isLiquidationAllowlistEnabled(),
      allowedLiquidator: await comptroller.isAllowedLiquidator(account.address),
      forcedLiquidation: await comptroller.isForcedLiquidationEnabled(market.address),
      transferPaused: await comptroller.actionPaused(market.address, Action.TRANSFER),
      delegate: await comptroller.approvedDelegates(account.address, delegate.address),
    };
  }

  beforeEach(async () => {
    [, account, delegate] = await ethers.getSigners();

    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    market = await smock.fake<VToken>("VToken");
    market.isVToken.returns(true);
    oracle.getUnderlyingPrice.whenCalledWith(market.address).returns(ONE);
    await setBalance(poolRegistry.address, parseEther("1"));

    const factory = (await ethers.getContractFactory("SpokeComptroller")) as SpokeComptroller__factory;
    beacon = await upgrades.deployBeacon(factory, { constructorArgs: [poolRegistry.address] });
    comptroller = (await upgrades.deployBeaconProxy(beacon, factory, [MAX_LOOPS_LIMIT, acm.address], {
      initializer: "initialize(uint256,address)",
      constructorArgs: [poolRegistry.address],
    })) as SpokeComptroller;

    await comptroller.setPriceOracle(oracle.address);
    await comptroller.setDeviationBoundedOracle(boundedOracle.address);
    await comptroller.setCloseFactor(CLOSE_FACTOR);
    await comptroller.setLiquidationIncentive(POOL_INCENTIVE);
    await comptroller.setMinLiquidatableCollateral(MIN_LIQUIDATABLE_COLLATERAL);
    await comptroller.connect(poolRegistry.wallet).supportMarket(market.address);
    await comptroller.setCollateralFactor(market.address, COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
    await comptroller.setMarketSupplyCaps([market.address], [SUPPLY_CAP]);
    await comptroller.setMarketBorrowCaps([market.address], [BORROW_CAP]);
    await comptroller.setMarketLiquidationIncentive(market.address, MARKET_INCENTIVE);
    await comptroller.setSupplyAllowlistEnabled(market.address, true);
    await comptroller.setAllowedSupplier(market.address, account.address, true);
    await comptroller.setLiquidationAllowlistEnabled(true);
    await comptroller.setAllowedLiquidator(account.address, true);
    await comptroller.setForcedLiquidation(market.address, true);
    await comptroller.setActionsPaused([market.address], [Action.TRANSFER], true);
    await comptroller.connect(account).updateDelegate(delegate.address, true);
    await comptroller.connect(account).enterMarkets([market.address]);
  });

  async function upgradeTo(registry: string = poolRegistry.address): Promise<void> {
    const upgraded = (await ethers.getContractFactory("UpgradedSpokeComptroller")) as UpgradedSpokeComptroller__factory;
    await upgrades.upgradeBeacon(beacon, upgraded, { constructorArgs: [registry] });
  }

  it("carries every configured value through the upgrade", async () => {
    const before = await configuration();

    await upgradeTo();

    expect(await configuration()).to.deep.equal(before);
  });

  it("runs the new implementation, whose appended slot starts empty", async () => {
    await upgradeTo();

    const upgraded = await ethers.getContractAt("UpgradedSpokeComptroller", comptroller.address);
    expect(await upgraded.addedAfterUpgrade()).to.equal(0);

    // Proves the proxy really is running the new code rather than the old, which is what makes the assertion above
    // about storage meaningful.
    await upgraded.setAddedAfterUpgrade(42);
    expect(await upgraded.addedAfterUpgrade()).to.equal(42);
  });

  it("keeps the pool usable, with the risk parameters it had before", async () => {
    await upgradeTo();

    // The allowlist is on and this account is on it, and the market is capped well above the amount.
    market.totalSupply.returns(0);
    market.exchangeRateStored.returns(ONE);
    await expect(comptroller.callStatic.preMintHook(market.address, account.address, ONE)).to.not.be.reverted;
    await expect(comptroller.callStatic.preMintHook(market.address, delegate.address, ONE))
      .to.be.revertedWithCustomError(comptroller, "SupplyNotAllowed")
      .withArgs(market.address, delegate.address);
  });

  it("cannot be initialized a second time", async () => {
    await upgradeTo();

    await expect(comptroller.initialize(MAX_LOOPS_LIMIT + 1, acm.address)).to.be.revertedWith(
      "Initializable: contract is already initialized",
    );
  });

  it("moves every pool on the beacon at once", async () => {
    const factory = (await ethers.getContractFactory("SpokeComptroller")) as SpokeComptroller__factory;
    const second = (await upgrades.deployBeaconProxy(beacon, factory, [MAX_LOOPS_LIMIT, acm.address], {
      initializer: "initialize(uint256,address)",
      constructorArgs: [poolRegistry.address],
    })) as SpokeComptroller;

    await upgradeTo();

    for (const pool of [comptroller.address, second.address]) {
      const upgraded = await ethers.getContractAt("UpgradedSpokeComptroller", pool);
      await expect(upgraded.setAddedAfterUpgrade(1)).to.not.be.reverted;
    }
  });

  it("takes the pool registry from the new implementation, not from storage", async () => {
    // `poolRegistry` is immutable, so it lives in the implementation's bytecode. An upgrade that passes a different
    // constructor argument re-points every pool on the beacon at another registry, and nothing in storage records
    // that it changed. The value has to be re-supplied correctly on each upgrade, and this is what would catch it.
    const wrongRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    expect(await comptroller.poolRegistry()).to.equal(poolRegistry.address);

    await upgradeTo(wrongRegistry.address);

    expect(await comptroller.poolRegistry()).to.equal(wrongRegistry.address);
  });

  it("is not interchangeable with the shared Comptroller implementation", async () => {
    // The spoke returns upstream's Prime slot to the gap, so the two layouts diverge from that slot on: see the
    // storage layout tests. Pointing a spoke pool at the shared implementation would read `approvedDelegates` as
    // `prime`. OpenZeppelin's own validator is what a deploy script would run, so this is the check that matters.
    const shared = await ethers.getContractFactory("Comptroller");
    const spoke = await ethers.getContractFactory("SpokeComptroller");

    await expect(
      upgrades.validateUpgrade(spoke, shared, {
        kind: "beacon",
        constructorArgs: [poolRegistry.address],
        unsafeAllowRenames: true,
      }),
    ).to.be.rejectedWith("New storage layout is incompatible");
  });
});

import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, BigNumberish, constants } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  IDeviationBoundedOracle,
  IDeviationBoundedOracle__factory,
  OptimizedTransparentUpgradeableProxy__factory,
  PoolRegistry,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokeComptroller__factory,
  VToken,
} from "../../../typechain";

/* eslint-disable @typescript-eslint/no-var-requires */
// The published DeviationBoundedOracle is compiled for the Cancun EVM and uses TSTORE/TLOAD through its
// Transient library. This repo compiles at `paris`, so adding the source to `dependencyCompiler` would fail to
// compile it. The hardhat network does run Cancun, so the shipped bytecode is deployed directly instead. That
// also means these tests exercise exactly the bytecode that is deployed on chain.
const deviationBoundedOracleArtifact = require("@venusprotocol/oracle/artifacts/contracts/DeviationBoundedOracle.sol/DeviationBoundedOracle.json");
/* eslint-enable @typescript-eslint/no-var-requires */

export const ONE = parseUnits("1", 18);
export const MAX_LOOPS_LIMIT = 150;

/// Matches `enum Action` in contracts/ComptrollerInterface.sol, in declaration order.
export const Action = {
  MINT: 0,
  REDEEM: 1,
  BORROW: 2,
  REPAY: 3,
  SEIZE: 4,
  LIQUIDATE: 5,
  TRANSFER: 6,
  ENTER_MARKET: 7,
  EXIT_MARKET: 8,
};

/// A vToken this pool lists, paired with the underlying the oracles key prices by.
export interface TestMarket {
  vToken: FakeContract<VToken>;
  underlying: string;
  /// Price `resetPrices` restores. See the note there for why a baseline is needed at all.
  baselinePrice: BigNumber;
}

export interface SpokeFixture {
  acm: FakeContract<AccessControlManager>;
  poolRegistry: FakeContract<PoolRegistry>;
  oracle: FakeContract<ResilientOracleInterface>;
  comptroller: MockContract<SpokeComptroller>;
  markets: TestMarket[];
  /// The bounded oracle wired into the comptroller, or undefined when the fixture left it unset. Real when
  /// `realBoundedOracle` was requested, otherwise a fake whose calls can be counted.
  boundedOracle?: IDeviationBoundedOracle | FakeContract<IDeviationBoundedOracle>;
  /// Sets a market's spot price on both oracle entry points at once. `SpokeComptroller` asks for
  /// `getUnderlyingPrice(vToken)` while the deviation-bounded oracle asks for `getPrice(underlying)`; letting the
  /// two drift would silently invalidate every price assertion, so nothing sets them separately.
  setSpotPrice: (market: TestMarket, price: BigNumberish) => void;
  /// Same, but also records the price as the market's baseline, so `resetPrices` restores it.
  setBaselinePrice: (market: TestMarket, price: BigNumberish) => void;
  /// Restores every market to its baseline price.
  ///
  /// `loadFixture` rewinds chain state but returns the same smock fakes, and a fake's configured behaviour lives
  /// in JavaScript rather than in the EVM, so a price set by one test is still in place for the next one. Any
  /// test that moves a price has to be followed by this, or later assertions silently measure the wrong prices.
  resetPrices: () => void;
}

export interface SpokeFixtureOptions {
  /// Number of markets to list. Each gets a distinct underlying address.
  marketCount?: number;
  /// Pool-wide liquidation incentive. Pass null to leave it unset, which is the state of a pool that
  /// `PoolRegistry.addPool` has not registered yet.
  liquidationIncentive?: BigNumber | null;
  minLiquidatableCollateral?: BigNumberish;
  /// Leave false to test the fail-closed behaviour of an unset deviation-bounded oracle.
  setBoundedOracle?: boolean;
  /// When true the bounded oracle is the real contract; otherwise a fake, which is what call-count assertions need.
  realBoundedOracle?: boolean;
  /// Initial spot price applied to every market.
  spotPrice?: BigNumberish;
  /// Loop limit the pool is initialized with. It can only ever be raised, so a test that needs the guard to bite
  /// has to start low. Must leave room for `marketCount`, which is bounded by the same limit.
  maxLoopsLimit?: number;
}

/// `_getUnderlyingAsset` short-circuits the configured native market to a synthetic native address, so it must
/// never collide with a vToken under test or that market's prices resolve to the wrong asset.
const UNRELATED_NATIVE_MARKET = "0x0000000000000000000000000000000000001111";

function underlyingAddressFor(index: number): string {
  return ethers.utils.getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`);
}

/**
 * Deploys the real DeviationBoundedOracle behind a transparent proxy.
 *
 * The proxy admin must not be the account that later calls through the proxy: OpenZeppelin's transparent proxy
 * refuses to forward calls made by its own admin.
 */
export async function deployRealBoundedOracle(
  oracle: FakeContract<ResilientOracleInterface>,
  acm: FakeContract<AccessControlManager>,
): Promise<IDeviationBoundedOracle> {
  const [deployer, , , proxyAdmin] = await ethers.getSigners();

  const implementation = await new ethers.ContractFactory(
    deviationBoundedOracleArtifact.abi,
    deviationBoundedOracleArtifact.bytecode,
    deployer,
  ).deploy(oracle.address, UNRELATED_NATIVE_MARKET, constants.AddressZero);
  await implementation.deployed();

  const proxy = await new OptimizedTransparentUpgradeableProxy__factory(deployer).deploy(
    implementation.address,
    proxyAdmin.address,
    implementation.interface.encodeFunctionData("initialize", [acm.address]),
  );
  await proxy.deployed();

  return IDeviationBoundedOracle__factory.connect(proxy.address, deployer);
}

/**
 * Registers an asset with the real bounded oracle. Seeds the price window from the current spot, so the spot price
 * has to be set before this runs.
 *
 * @param triggerThreshold Deviation that activates protection. The oracle only accepts 5% to 50%.
 * @param caching Whether the resolved pair is cached in transient storage for the rest of the transaction.
 */
export async function configureBoundedPricing(
  boundedOracle: IDeviationBoundedOracle,
  underlying: string,
  {
    triggerThreshold = parseUnits("0.2", 18),
    resetThreshold = parseUnits("0.05", 18),
    cooldownPeriod = 3600,
    caching = true,
  } = {},
): Promise<void> {
  await boundedOracle.setTokenConfig({
    asset: underlying,
    cooldownPeriod,
    triggerThreshold,
    resetThreshold,
    enableBoundedPricing: true,
    enableCaching: caching,
  });
}

/**
 * Deploys a SpokeComptroller with fake markets. Access control allows everything, so tests that care about it
 * deny a specific role explicitly.
 */
export async function deploySpokeComptroller(options: SpokeFixtureOptions = {}): Promise<SpokeFixture> {
  const {
    marketCount = 2,
    liquidationIncentive = parseUnits("1.1", 18),
    minLiquidatableCollateral = parseUnits("100", 18),
    setBoundedOracle = true,
    realBoundedOracle = false,
    spotPrice = ONE,
    maxLoopsLimit = MAX_LOOPS_LIMIT,
  } = options;

  const poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const acm = await smock.fake<AccessControlManager>("AccessControlManager");
  acm.isAllowedToCall.returns(true);

  const comptrollerFactory = await smock.mock<SpokeComptroller__factory>("SpokeComptroller");
  const comptroller = (await upgrades.deployProxy(comptrollerFactory, [maxLoopsLimit, acm.address], {
    constructorArgs: [poolRegistry.address],
    initializer: "initialize(uint256,address)",
  })) as MockContract<SpokeComptroller>;

  await comptroller.setPriceOracle(oracle.address);

  const markets: TestMarket[] = [];
  const setSpotPrice = (market: TestMarket, price: BigNumberish) => {
    oracle.getUnderlyingPrice.whenCalledWith(market.vToken.address).returns(price);
    oracle.getPrice.whenCalledWith(market.underlying).returns(price);
  };
  const setBaselinePrice = (market: TestMarket, price: BigNumberish) => {
    market.baselinePrice = BigNumber.from(price);
    setSpotPrice(market, price);
  };
  const resetPrices = () => {
    oracle.getUnderlyingPrice.reset();
    oracle.getPrice.reset();
    for (const market of markets) {
      setSpotPrice(market, market.baselinePrice);
    }
  };

  await setBalance(poolRegistry.address, parseEther("1"));
  for (let i = 0; i < marketCount; ++i) {
    const vToken = await smock.fake<VToken>("VToken");
    const market: TestMarket = {
      vToken,
      underlying: underlyingAddressFor(i),
      baselinePrice: BigNumber.from(spotPrice),
    };

    vToken.isVToken.returns(true);
    vToken.comptroller.returns(comptroller.address);
    vToken.underlying.returns(market.underlying);
    vToken.exchangeRateStored.returns(ONE);
    // [error, vTokenBalance, borrowBalance, exchangeRate]: no position until a test gives one.
    vToken.getAccountSnapshot.returns([0, 0, 0, ONE]);
    vToken.borrowBalanceStored.returns(0);
    vToken.totalSupply.returns(0);
    vToken.totalBorrows.returns(0);

    setSpotPrice(market, spotPrice);
    await comptroller.connect(poolRegistry.wallet).supportMarket(vToken.address);
    // Uncapped on both sides. Caps default to zero, which blocks every mint and borrow, so leaving them would make
    // the cap branch decide outcomes that tests are attributing to something else.
    await comptroller.setMarketSupplyCaps([vToken.address], [constants.MaxUint256]);
    await comptroller.setMarketBorrowCaps([vToken.address], [constants.MaxUint256]);
    markets.push(market);
  }

  let boundedOracle: IDeviationBoundedOracle | FakeContract<IDeviationBoundedOracle> | undefined;
  if (setBoundedOracle) {
    if (realBoundedOracle) {
      boundedOracle = await deployRealBoundedOracle(oracle, acm);
    } else {
      const fake = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
      // Outside protection the real oracle returns spot on both legs; the fake has to match that.
      fake.getBoundedPricesView.returns([spotPrice, spotPrice]);
      boundedOracle = fake;
    }
    await comptroller.setDeviationBoundedOracle(boundedOracle.address);
  }

  if (liquidationIncentive !== null) {
    await comptroller.setLiquidationIncentive(liquidationIncentive);
  }
  await comptroller.setMinLiquidatableCollateral(minLiquidatableCollateral);

  return {
    acm,
    poolRegistry,
    oracle,
    comptroller,
    markets,
    boundedOracle,
    setSpotPrice,
    setBaselinePrice,
    resetPrices,
  };
}

/**
 * Sets a market's risk weights. `setCollateralFactor` rejects a liquidation threshold below the collateral factor
 * and rejects a nonzero collateral factor while the price is zero, so the price must already be set.
 */
export async function setRiskWeights(
  comptroller: MockContract<SpokeComptroller>,
  market: TestMarket,
  collateralFactor: BigNumberish,
  liquidationThreshold: BigNumberish,
): Promise<void> {
  await comptroller.setCollateralFactor(market.vToken.address, collateralFactor, liquidationThreshold);
}

/**
 * Gives an account a position in a market and enters it. A borrower is a member of every market it borrows from,
 * including ones it holds no collateral in, which is what `preBorrowHook` does.
 */
export async function givePosition(
  comptroller: MockContract<SpokeComptroller>,
  account: { address: string },
  positions: { market: TestMarket; collateral?: BigNumberish; borrow?: BigNumberish }[],
): Promise<void> {
  const signer = await ethers.getSigner(account.address);
  for (const { market, collateral = 0, borrow = 0 } of positions) {
    market.vToken.getAccountSnapshot.whenCalledWith(account.address).returns([0, collateral, borrow, ONE]);
    market.vToken.borrowBalanceStored.whenCalledWith(account.address).returns(borrow);
    market.vToken.balanceOf.whenCalledWith(account.address).returns(collateral);
  }
  await comptroller.connect(signer).enterMarkets(positions.map(p => p.market.vToken.address));
}

/**
 * Takes a market out of the pool. `unlistMarket` refuses while any action is still live or any risk parameter is
 * still set, so the caller would otherwise have to reproduce all three preconditions.
 */
export async function unlistMarket(comptroller: MockContract<SpokeComptroller>, market: TestMarket): Promise<void> {
  await comptroller.setActionsPaused([market.vToken.address], Object.values(Action), true);
  await comptroller.setMarketBorrowCaps([market.vToken.address], [0]);
  await comptroller.setMarketSupplyCaps([market.vToken.address], [0]);
  await comptroller.setCollateralFactor(market.vToken.address, 0, 0);
  await comptroller.unlistMarket(market.vToken.address);
}

/**
 * Clears the recorded call history of every fake in the fixture.
 *
 * `loadFixture` rewinds chain state but returns the same fake objects, so call history survives into the next
 * test. Any assertion on a call count is wrong without this.
 */
export function resetFakeHistory(fixture: SpokeFixture): void {
  fixture.oracle.updatePrice.reset();
  fixture.acm.isAllowedToCall.reset();
  fixture.acm.isAllowedToCall.returns(true);
  for (const { vToken } of fixture.markets) {
    vToken.seize.reset();
    vToken.healBorrow.reset();
    vToken.accrueInterest.reset();
    vToken.forceLiquidateBorrow.reset();
  }
}

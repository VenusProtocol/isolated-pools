import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  AccessControlManager__factory,
  AdapterSpokeV1,
  IERC20,
  IERC20__factory,
  JumpRateModelV2,
  PoolRegistry,
  PoolRegistry__factory,
  SpokeComptroller,
  SpokeComptroller__factory,
  VToken,
  VToken__factory,
} from "../../../../typechain";
import { initMainnetUser, setForkBlock } from "../utils";
import { bscmainnet } from "./constants";

/// Pinned so the live DeviationBoundedOracle windows, the Hub's TVL and every market rate the
/// assertions lean on are the same on every run.
export const BLOCK_NUMBER = 116_847_000;

const MAX_LOOPS_LIMIT = 100;

/// Longer than any run. See `relaxPriceStaleness`.
const STALE_PERIOD = 10 * 365 * 24 * 60 * 60;
const EXP_SCALE = ethers.utils.parseUnits("1", 18);

/// The live VToken implementation this chain's beacon points at is block-based on this cadence.
/// The interest rate model the suite deploys has to be built the same way or the market's rate is
/// off by the ratio between the two.
const BLOCKS_PER_YEAR = 42_048_000;

/// Role strings the spoke comptroller checks, verbatim. A VIP that grants anything else grants
/// nothing: the ACM hashes the string, so a near-miss is silently a different role.
export const SPOKE_ROLES = {
  setCollateralFactor: "setCollateralFactor(address,uint256,uint256)",
  setLiquidationIncentive: "setLiquidationIncentive(uint256)",
  setCloseFactor: "setCloseFactor(uint256)",
  setMinLiquidatableCollateral: "setMinLiquidatableCollateral(uint256)",
  setMarketSupplyCaps: "setMarketSupplyCaps(address[],uint256[])",
  setMarketBorrowCaps: "setMarketBorrowCaps(address[],uint256[])",
  setActionsPaused: "setActionsPaused(address[],uint8[],bool)",
  setForcedLiquidation: "setForcedLiquidation(address,bool)",
  unlistMarket: "unlistMarket(address)",
  // The five the fork of the shared Comptroller adds. None of these role strings exists on any
  // other Venus contract, so no pre-existing grant covers them.
  setMarketLiquidationIncentive: "setMarketLiquidationIncentive(address,uint256)",
  setSupplyAllowlistEnabled: "setSupplyAllowlistEnabled(address,bool)",
  setAllowedSupplier: "setAllowedSupplier(address,address,bool)",
  setLiquidationAllowlistEnabled: "setLiquidationAllowlistEnabled(bool)",
  setAllowedLiquidator: "setAllowedLiquidator(address,bool)",
};

/// The calls `PoolRegistry` makes into a comptroller while registering a pool and its markets. The
/// ACM's wildcard grants covering these are keyed on `address(0)` but name the live registry as the
/// account, so a registry deployed for this pool inherits none of them and the VIP grants all six.
export const REGISTRY_DRIVEN_ROLES = [
  SPOKE_ROLES.setCloseFactor,
  SPOKE_ROLES.setLiquidationIncentive,
  SPOKE_ROLES.setMinLiquidatableCollateral,
  SPOKE_ROLES.setCollateralFactor,
  SPOKE_ROLES.setMarketSupplyCaps,
  SPOKE_ROLES.setMarketBorrowCaps,
];

/// Role strings `PoolRegistry` checks, verbatim. `addMarket` passes the struct name, not the expanded
/// tuple, and the ACM hashes whatever string the contract passes.
export const REGISTRY_ROLES = {
  addPool: "addPool(string,address,uint256,uint256,uint256)",
  addMarket: "addMarket(AddMarketInput)",
  setPoolName: "setPoolName(address,string)",
  updatePoolMetadata: "updatePoolMetadata(address,VenusPoolMetaData)",
};

/// Role strings on the hub side, read from `YieldGroupBase` and `Hub`.
export const HUB_ROLES = {
  addYieldGroup: "addYieldGroup(address,uint256,uint16)",
  setOuterDepositQueue: "setOuterDepositQueue(address[])",
  setOuterWithdrawQueue: "setOuterWithdrawQueue(address[])",
  addResource: "addResource(address,address)",
  removeResource: "removeResource(address)",
  setInnerDepositQueue: "setInnerDepositQueue(address[])",
  setInnerWithdrawQueue: "setInnerWithdrawQueue(address[])",
  raiseResourceCap: "raiseResourceCap(address,uint256)",
  lowerResourceCap: "lowerResourceCap(address,uint256)",
  pauseResource: "pauseResource(address)",
};

/// Minimal human-readable ABIs for the two hub-side contracts the suite binds by address. Kept
/// here rather than imported, because this repo does not depend on the hub. Every member is
/// exercised by the suite, so a signature that drifts fails a test rather than passing silently.
/// Hub role strings, from `Hub`'s own `_checkAccessAllowed` calls.
export const HUB_ADMIN_ROLES = {
  addYieldGroup: "addYieldGroup(address,uint256,uint16)",
  setOuterDepositQueue: "setOuterDepositQueue(address[])",
  setOuterWithdrawQueue: "setOuterWithdrawQueue(address[])",
};

export const HUB_ABI = [
  "function asset() view returns (address)",
  "function owner() view returns (address)",
  "function accessControlManager() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function registeredYieldGroups() view returns (address[])",
  "function outerDepositQueue() view returns (address[])",
  "function outerWithdrawQueue() view returns (address[])",
  "function yieldGroupConfig(address) view returns (tuple(uint256 absoluteCap, uint16 percentageCapBps, bool paused, bool registered))",
  "function addYieldGroup(address yieldGroup, uint256 absoluteCap, uint16 percentageCapBps)",
  "function setOuterDepositQueue(address[] queue)",
  "function setOuterWithdrawQueue(address[] queue)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
  "function initialize(address asset_, string name_, string symbol_, address acm_, uint8 decimalsOffset_, uint256 initialMaxWithdrawalSize, address feeRecipient_)",
];

export const YIELD_GROUP_ABI = [
  "function initialize(address hub_, address asset_, uint256 blocksPerYear_, address acm_)",
  "function hub() view returns (address)",
  "function asset() view returns (address)",
  "function resources() view returns (address[])",
  "function totalAssets() view returns (uint256)",
  "function maxDeposit() view returns (uint256)",
  "function maxWithdraw() view returns (uint256)",
  "function deposit(uint256 amount) returns (uint256)",
  "function withdraw(uint256 amount, address to)",
  "function depositResource(address resource, uint256 amount) returns (uint256)",
  "function withdrawResource(address resource, uint256 amount, address to)",
  "function addResource(address resource, address adapter)",
  "function removeResource(address resource)",
  "function setInnerDepositQueue(address[] queue)",
  "function setInnerWithdrawQueue(address[] queue)",
  "function raiseResourceCap(address resource, uint256 newCap)",
  "function lowerResourceCap(address resource, uint256 newCap)",
  "function pauseResource(address resource)",
  "function resourceCap(address resource) view returns (uint256)",
];

/// The slice of `ProtocolShareReserve` this suite touches. It holds one pool registry, which is what
/// makes re-pointing it a protocol-wide decision rather than a spoke-local one.
export const PSR_ABI = [
  "function owner() view returns (address)",
  "function poolRegistry() view returns (address)",
  "function setPoolRegistry(address newPoolRegistry)",
  "function updateAssetsState(address comptroller, address asset, uint8 incomeType)",
];

export interface SpokeForkFixture extends SpokeStack, SpokeMarkets, HubSide {}

const isSame = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/// Grant `who` permission to call `sig` on `target`, through the live ACM, as the Timelock does in
/// a VIP. `timelock` holds DEFAULT_ADMIN_ROLE on the live ACM, which is what makes this a replay of
/// the real governance action rather than a shortcut around it.
export async function grant(acm: AccessControlManager, timelock: Signer, target: string, sig: string, who: string) {
  await acm.connect(timelock).giveCallPermission(target, sig, who);
}

/**
 * Take the pinned block's price rounds out of the picture.
 *
 * Hardhat advances a forked chain's timestamp with real elapsed time, so every transaction a suite
 * runs eats into the staleness budget the pinned block leaves. At `BLOCK_NUMBER` that is about 77
 * seconds for BTCB, past which `ResilientOracle` runs out of oracles that agree and reverts
 * "invalid resilient oracle price", failing anything that prices collateral.
 *
 * Widening `maxStalePeriod` is what the other fork suites here do. Main and pivot are both widened,
 * so `ResilientOracle` still validates one against the other. No price changes: the rounds, the
 * bound validator and the deviation-bounded oracle are the live ones, and only the clock stops
 * being a variable.
 */
async function relaxPriceStaleness(timelock: Signer) {
  const acm = AccessControlManager__factory.connect(bscmainnet.ACM, timelock);
  const feedAbi = [
    "function tokenConfigs(address) view returns (address asset, address feed, uint256 maxStalePeriod)",
    "function setTokenConfig((address asset, address feed, uint256 maxStalePeriod) tokenConfig)",
  ];

  for (const oracleAddress of [bscmainnet.CHAINLINK_ORACLE, bscmainnet.REDSTONE_ORACLE]) {
    await acm.giveCallPermission(oracleAddress, "setTokenConfig(TokenConfig)", bscmainnet.NORMAL_TIMELOCK);
    const oracle = await ethers.getContractAt(feedAbi, oracleAddress, timelock);

    for (const asset of [bscmainnet.USDT, bscmainnet.BTCB]) {
      const { feed } = await oracle.tokenConfigs(asset);
      // An oracle that does not price this asset has nothing to widen, and `setTokenConfig` rejects
      // the zero feed anyway.
      if (feed === ethers.constants.AddressZero) continue;
      await oracle.setTokenConfig({ asset, feed, maxStalePeriod: STALE_PERIOD });
    }
  }
}

/// The spoke pool's own `PoolRegistry`, behind the chain's shared proxy admin, standing in for
/// `deploy/024-deploy-spoke-pool-registry.ts`. The live isolated-pools registry is the directory the
/// indexer, the frontend pool list and the risk tooling iterate, and a pool whose supply, borrow and
/// liquidation sides are each restricted does not belong in it.
async function deploySpokePoolRegistry(deployer: SignerWithAddress): Promise<PoolRegistry> {
  const implFactory = await ethers.getContractFactory("PoolRegistry", deployer);
  const impl = await implFactory.deploy();
  await impl.deployed();

  const proxyFactory = await ethers.getContractFactory(
    "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol:OptimizedTransparentUpgradeableProxy",
    deployer,
  );
  const proxy = await proxyFactory.deploy(
    impl.address,
    bscmainnet.DEFAULT_PROXY_ADMIN,
    implFactory.interface.encodeFunctionData("initialize", [bscmainnet.ACM]),
  );
  await proxy.deployed();
  return PoolRegistry__factory.connect(proxy.address, deployer);
}

async function deployIrm(acm: string, deployer: SignerWithAddress): Promise<JumpRateModelV2> {
  const factory = await ethers.getContractFactory("JumpRateModelV2", deployer);
  return (await factory.deploy(
    0, // baseRatePerYear
    ethers.utils.parseUnits("0.1", 18), // multiplierPerYear
    ethers.utils.parseUnits("2", 18), // jumpMultiplierPerYear
    ethers.utils.parseUnits("0.8", 18), // kink
    acm,
    false, // timeBased: the live VToken implementation is block-based
    BLOCKS_PER_YEAR,
  )) as JumpRateModelV2;
}

async function deployVToken(
  deployer: SignerWithAddress,
  underlying: string,
  comptroller: string,
  irm: string,
  name: string,
  symbol: string,
  decimals: number,
  reserveFactorMantissa: BigNumber,
  underlyingDecimals: number,
  initialExchangeRateMantissa?: BigNumber,
): Promise<VToken> {
  // Minted from the chain's live VTokenBeacon, so the market runs the same implementation every
  // other isolated pool on this chain runs, with the same immutables.
  const vTokenFactory = await ethers.getContractFactory("VToken");
  const initData = vTokenFactory.interface.encodeFunctionData("initialize", [
    underlying,
    comptroller,
    irm,
    // 10 ** (18 + underlyingDecimals - vTokenDecimals), the rate every live isolated market is
    // listed at. For an 18-decimal underlying that is 1e28; for a 6-decimal one it is 1e16, i.e.
    // BELOW `EXP_SCALE`, which is the regime `AdapterSpokeV1._bumpToSettleable` exists for.
    initialExchangeRateMantissa ?? ethers.utils.parseUnits("1", 18 + underlyingDecimals - decimals),
    name,
    symbol,
    decimals,
    await deployer.getAddress(),
    bscmainnet.ACM,
    { shortfall: bscmainnet.SHORTFALL, protocolShareReserve: bscmainnet.PSR },
    reserveFactorMantissa,
  ]);
  const proxyFactory = await ethers.getContractFactory("BeaconProxy", deployer);
  const proxy = await proxyFactory.deploy(bscmainnet.VTOKEN_BEACON, initData);
  await proxy.deployed();
  return VToken__factory.connect(proxy.address, deployer);
}

/// Move `amount` of `token` from a live whale to `to`.
export async function fundFrom(token: IERC20, whale: string, to: string, amount: BigNumber) {
  const holder = await initMainnetUser(whale, ethers.utils.parseUnits("2"));
  await token.connect(holder).transfer(to, amount);
}

/**
 * Stands the whole hub-funded spoke pool up on a bscmainnet fork, in the order the listing VIP has
 * to use. Everything it binds is live; everything it deploys is a contract that genuinely has to be
 * deployed to ship this feature.
 *
 * Deliberately NOT run through `deploy/025-deploy-spoke-comptroller.ts`: `deployment.ts` covers that
 * script on its own, and the behavioural suites need the pool in a listed, configured state that the
 * script explicitly leaves to the VIP.
 */
export interface SpokeStack {
  timelock: Signer;
  deployer: SignerWithAddress;
  supplier: SignerWithAddress;
  borrower: SignerWithAddress;
  liquidator: SignerWithAddress;
  outsider: SignerWithAddress;
  acm: AccessControlManager;
  registry: PoolRegistry;
  oracle: Contract;
  boundedOracle: Contract;
  usdt: IERC20;
  btcb: IERC20;
  spoke: SpokeComptroller;
  spokeBeacon: Contract;
  spokeImpl: string;
}

/**
 * Deploy the spoke stack exactly as `deploy/025-deploy-spoke-comptroller.ts` does, then hand it to
 * governance. Stops short of registering the pool, which is where the listing VIP starts.
 *
 * `configure: false` leaves the pool in the raw state the deploy script produces - no oracle, no
 * ACM grants, deployer still the live owner - so a test can assert what the VIP has to supply.
 */
export async function deploySpokeStack(configure = true): Promise<SpokeStack> {
  await setForkBlock(BLOCK_NUMBER);

  const [deployer, supplier, borrower, liquidator, outsider] = await ethers.getSigners();
  const timelock = await initMainnetUser(bscmainnet.NORMAL_TIMELOCK, ethers.utils.parseUnits("100"));
  await relaxPriceStaleness(timelock);

  const acm = AccessControlManager__factory.connect(bscmainnet.ACM, deployer);
  const registry = await deploySpokePoolRegistry(deployer);
  const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
  const boundedOracle = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE);
  const usdt = IERC20__factory.connect(bscmainnet.USDT, deployer);
  const btcb = IERC20__factory.connect(bscmainnet.BTCB, deployer);

  const implFactory = await ethers.getContractFactory("SpokeComptroller", deployer);
  // Immutable, and `supportMarket` only answers this address, so no other registry can list markets
  // in this pool.
  const impl = await implFactory.deploy(registry.address);
  await impl.deployed();

  const beaconFactory = await ethers.getContractFactory("UpgradeableBeacon", deployer);
  const spokeBeacon = await beaconFactory.deploy(impl.address);
  await spokeBeacon.deployed();

  const proxyFactory = await ethers.getContractFactory("BeaconProxy", deployer);
  const proxy = await proxyFactory.deploy(
    spokeBeacon.address,
    implFactory.interface.encodeFunctionData("initialize", [MAX_LOOPS_LIMIT, bscmainnet.ACM]),
  );
  await proxy.deployed();
  const spoke = SpokeComptroller__factory.connect(proxy.address, deployer);

  // Ownable2Step, so the script can only nominate; the VIP accepts. Two of them, comptroller and
  // registry, so the VIP carries two `acceptOwnership` calls.
  await spoke.transferOwnership(bscmainnet.NORMAL_TIMELOCK);
  await registry.transferOwnership(bscmainnet.NORMAL_TIMELOCK);
  await spokeBeacon.transferOwnership(bscmainnet.NORMAL_TIMELOCK);

  const stack: SpokeStack = {
    timelock,
    deployer,
    supplier,
    borrower,
    liquidator,
    outsider,
    acm,
    registry,
    oracle,
    boundedOracle,
    usdt,
    btcb,
    spoke,
    spokeBeacon,
    spokeImpl: impl.address,
  };

  if (configure) await configureSpokeStack(stack);
  return stack;
}

/// The first three steps of the listing VIP: take ownership, point the pool at both oracles, and
/// grant governance every role the pool's setters check.
export async function configureSpokeStack(s: SpokeStack) {
  await s.spoke.connect(s.timelock).acceptOwnership();
  await s.spoke.connect(s.timelock).setPriceOracle(bscmainnet.RESILIENT_ORACLE);
  await s.spoke.connect(s.timelock).setDeviationBoundedOracle(bscmainnet.DEVIATION_BOUNDED_ORACLE);
  for (const sig of Object.values(SPOKE_ROLES)) {
    await grant(s.acm, s.timelock, s.spoke.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }

  // A second contract governance has to take over and permission. ACM roles are
  // `keccak256(contractAddress, roleString)`, so nothing granted against the isolated-pools registry
  // reaches this address.
  await s.registry.connect(s.timelock).acceptOwnership();
  for (const sig of Object.values(REGISTRY_ROLES)) {
    await grant(s.acm, s.timelock, s.registry.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }

  // The other direction: `addPool` and `addMarket` drive six comptroller setters as the registry, and
  // the wildcard grants covering those name the live registry's address, not this one.
  for (const sig of REGISTRY_DRIVEN_ROLES) {
    await grant(s.acm, s.timelock, s.spoke.address, sig, s.registry.address);
  }

  await pointProtocolShareReserveAtSpokeRegistry(s);
}

/**
 * `ProtocolShareReserve` rejects income from any non-core pool whose vToken its one configured
 * registry does not know, and every `liquidateBorrow` and `reduceReserves` here goes through that
 * check, so the pool takes no income until PSR points at its registry.
 *
 * On a fork that is one owner call. On chain it takes the isolated pools out and their liquidations
 * start reverting, which `psrRegistryConflict.ts` pins. PSR support for more than one registry ships
 * from its own repo and has to be live before this pool is wired into it.
 */
export async function pointProtocolShareReserveAtSpokeRegistry(s: SpokeStack) {
  const psr = await ethers.getContractAt(PSR_ABI, bscmainnet.PSR);
  const psrOwner = await initMainnetUser(await psr.owner(), ethers.utils.parseUnits("10"));
  await psr.connect(psrOwner).setPoolRegistry(s.registry.address);
}

/// `PoolRegistry.addPool`, with the pool parameters a hub-funded spoke pool would ship with.
export async function listSpokePool(s: SpokeStack) {
  await s.registry.connect(s.timelock).addPool(
    "Hub-funded spoke",
    s.spoke.address,
    ethers.utils.parseUnits("0.5", 18), // close factor
    ethers.utils.parseUnits("1.1", 18), // pool-wide liquidation incentive
    ethers.utils.parseUnits("100", 18), // minLiquidatableCollateral, in USD
  );
}

export interface SpokeMarkets {
  vUSDT: VToken;
  vBTCB: VToken;
  irm: JumpRateModelV2;
}

/**
 * List the two markets through the live `PoolRegistry`: the USDT liquidity market the Hub funds,
 * and the BTCB collateral market borrowers post against. The liquidity market carries no collateral
 * factor, because nobody borrows against it.
 */
export async function addSpokeMarkets(s: SpokeStack): Promise<SpokeMarkets> {
  const irm = await deployIrm(bscmainnet.ACM, s.deployer);
  const vUSDT = await deployVToken(
    s.deployer,
    bscmainnet.USDT,
    s.spoke.address,
    irm.address,
    "Venus USDT (Hub-funded spoke)",
    "vUSDT_HubSpoke",
    8,
    ethers.utils.parseUnits("0.25", 18),
    18,
  );
  const vBTCB = await deployVToken(
    s.deployer,
    bscmainnet.BTCB,
    s.spoke.address,
    irm.address,
    "Venus BTCB (Hub-funded spoke)",
    "vBTCB_HubSpoke",
    8,
    ethers.utils.parseUnits("0.25", 18),
    18,
  );

  const usdtSeed = ethers.utils.parseUnits("10000", 18);
  const btcbSeed = ethers.utils.parseUnits("0.05", 18);
  await fundFrom(s.usdt, bscmainnet.USDT_HOLDER, bscmainnet.NORMAL_TIMELOCK, usdtSeed);
  await fundFrom(s.btcb, bscmainnet.BTCB_HOLDER, bscmainnet.NORMAL_TIMELOCK, btcbSeed);
  await s.usdt.connect(s.timelock).approve(s.registry.address, usdtSeed);
  await s.btcb.connect(s.timelock).approve(s.registry.address, btcbSeed);

  await s.registry.connect(s.timelock).addMarket({
    vToken: vUSDT.address,
    collateralFactor: 0,
    liquidationThreshold: 0,
    initialSupply: usdtSeed,
    vTokenReceiver: bscmainnet.NORMAL_TIMELOCK,
    supplyCap: ethers.utils.parseUnits("5000000", 18),
    borrowCap: ethers.utils.parseUnits("4000000", 18),
  });
  await s.registry.connect(s.timelock).addMarket({
    vToken: vBTCB.address,
    collateralFactor: ethers.utils.parseUnits("0.75", 18),
    liquidationThreshold: ethers.utils.parseUnits("0.8", 18),
    initialSupply: btcbSeed,
    vTokenReceiver: bscmainnet.NORMAL_TIMELOCK,
    supplyCap: ethers.utils.parseUnits("100", 18),
    borrowCap: 0,
  });

  return { vUSDT, vBTCB, irm };
}

export interface HubSide {
  hub: Contract;
  spokeSource: Contract;
  adapter: AdapterSpokeV1;
}

/**
 * Deploy the hub-side pieces this feature needs: the stateless adapter, and one spoke source per
 * Hub. The source is the generic `YieldGroup` already deployed on this chain, behind a beacon of
 * its own, so the suite drives the exact implementation production would.
 */
export async function deployHubSide(s: SpokeStack): Promise<HubSide> {
  const adapterFactory = await ethers.getContractFactory("AdapterSpokeV1", s.deployer);
  const adapter = (await adapterFactory.deploy()) as AdapterSpokeV1;
  await adapter.deployed();

  const hub = new ethers.Contract(bscmainnet.HUB_USDT, HUB_ABI, s.deployer);
  if (!isSame(await hub.asset(), bscmainnet.USDT)) {
    throw new Error(`Hub asset is ${await hub.asset()}, expected USDT ${bscmainnet.USDT}`);
  }

  const spokeSource = await deployYieldGroup(s.deployer, bscmainnet.HUB_USDT, bscmainnet.USDT);
  for (const sig of [
    HUB_ROLES.addResource,
    HUB_ROLES.removeResource,
    HUB_ROLES.setInnerDepositQueue,
    HUB_ROLES.setInnerWithdrawQueue,
    HUB_ROLES.raiseResourceCap,
    HUB_ROLES.lowerResourceCap,
    HUB_ROLES.pauseResource,
  ]) {
    await grant(s.acm, s.timelock, spokeSource.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }

  return { hub, spokeSource, adapter };
}

/// Mint one generic `YieldGroup` proxy from the implementation already deployed on this chain.
export async function deployYieldGroup(deployer: SignerWithAddress, hub: string, asset: string): Promise<Contract> {
  const beaconFactory = await ethers.getContractFactory("UpgradeableBeacon", deployer);
  const beacon = await beaconFactory.deploy(bscmainnet.YIELD_GROUP_IMPL);
  await beacon.deployed();

  const proxyFactory = await ethers.getContractFactory("BeaconProxy", deployer);
  const ygIface = new ethers.utils.Interface(YIELD_GROUP_ABI);
  const proxy = await proxyFactory.deploy(
    beacon.address,
    // blocksPerYear is 0: each spoke market carries its own annualiser, so the adapter reads that
    // rather than a YieldGroup-level constant.
    ygIface.encodeFunctionData("initialize", [hub, asset, 0, bscmainnet.ACM]),
  );
  await proxy.deployed();
  return new ethers.Contract(proxy.address, YIELD_GROUP_ABI, deployer);
}

/// The whole thing: a listed, configured, hub-funded spoke pool with both markets and the hub-side
/// pieces deployed but not yet registered on the Hub.
export async function spokeForkFixture(): Promise<SpokeForkFixture> {
  const stack = await deploySpokeStack();
  await listSpokePool(stack);
  const markets = await addSpokeMarkets(stack);
  const hubSide = await deployHubSide(stack);
  return { ...stack, ...markets, ...hubSide };
}

/**
 * Register the liquidity market as the spoke source's only resource, in the order the listing VIP
 * has to use: the supply allowlist grant comes first, because `AdapterSpokeV1.validateRegistration`
 * refuses a market whose allowlist is on without the registering YieldGroup on it.
 */
export async function registerSpokeResource(f: SpokeForkFixture, cap?: BigNumber) {
  await f.spoke.connect(f.timelock).setSupplyAllowlistEnabled(f.vUSDT.address, true);
  await f.spoke.connect(f.timelock).setAllowedSupplier(f.vUSDT.address, f.spokeSource.address, true);

  await f.spokeSource.connect(f.timelock).addResource(f.vUSDT.address, f.adapter.address);
  // A fresh resource's cap is already unbounded: on the YieldGroup, `0` means "no cap", which is
  // the inverse of the isolated-pools `supplyCaps` sentinel where `0` rejects every mint. Tightening
  // it is therefore `lowerResourceCap`, and `raiseResourceCap` on a new resource reverts
  // `NotIncreasing`. Only set one when the caller asked for it.
  if (cap !== undefined) {
    await f.spokeSource.connect(f.timelock).lowerResourceCap(f.vUSDT.address, cap);
  }
  await f.spokeSource.connect(f.timelock).setInnerDepositQueue([f.vUSDT.address]);
  await f.spokeSource.connect(f.timelock).setInnerWithdrawQueue([f.vUSDT.address]);
}

/**
 * Put the spoke source on the live Hub and move it to the head of both outer queues, so a deposit
 * routes into the spoke market and a withdrawal comes back out of it. The existing groups are kept,
 * in their existing order, behind it: this Hub holds real depositors' money and a VIP that dropped
 * a live group from the queues would strand it.
 */
export async function registerOnHub(f: SpokeForkFixture, absoluteCap: BigNumber, percentageCapBps = 10_000) {
  await f.hub.connect(f.timelock).addYieldGroup(f.spokeSource.address, absoluteCap, percentageCapBps);

  const depositQueue: string[] = await f.hub.outerDepositQueue();
  const withdrawQueue: string[] = await f.hub.outerWithdrawQueue();
  await f.hub.connect(f.timelock).setOuterDepositQueue([f.spokeSource.address, ...depositQueue]);
  await f.hub.connect(f.timelock).setOuterWithdrawQueue([f.spokeSource.address, ...withdrawQueue]);
}

/**
 * List a market whose underlying has FEWER decimals than the vToken, so the market's exchange rate
 * starts below `EXP_SCALE`. TRX is the only asset in the live DeviationBoundedOracle's initialized
 * set that qualifies on this chain, and the regime matters: below `1e18` a redeem request can burn
 * plenty of vTokens and still truncate its payout to zero, which is the case
 * `AdapterSpokeV1._bumpToSettleable` exists for and which no 18-decimal market can reach.
 *
 * Returns the market, a spoke source whose asset is that underlying, and the Hub that owns it. A
 * YieldGroup rejects a Hub whose asset differs from its own, and this chain has no TRX Hub, so one
 * is minted from the live `HubBeacon` - the same implementation every deployed Hub runs, created the
 * same way. Every contract in the path is the real one.
 */
export async function addLowDecimalMarket(
  f: SpokeForkFixture,
): Promise<{ vTRX: VToken; trxSource: Contract; trx: IERC20; trxHub: Contract }> {
  const trx = IERC20__factory.connect(bscmainnet.TRX, f.deployer);
  const vTRX = await deployVToken(
    f.deployer,
    bscmainnet.TRX,
    f.spoke.address,
    f.irm.address,
    "Venus TRX (Hub-funded spoke)",
    "vTRX_HubSpoke",
    8,
    ethers.utils.parseUnits("0.25", 18),
    6,
    // A rate that is deliberately NOT a power of ten. The convention is to list at
    // 10 ** (18 + underlyingDecimals - vTokenDecimals), which here is 1e16 - and 1e16 divides 1e18
    // exactly, so every redeem request lands on a whole number of units and the payout never
    // truncates. That is true of a market on its first block and of no market after it, because the
    // first wei of interest takes the rate off the divisor. Listing at 3.7e16 puts the market where
    // it spends its whole life, which is where `_bumpToSettleable` and `_redeemPayout` matter.
    BigNumber.from("37000000000000000"),
  );

  const seed = ethers.utils.parseUnits("1000", 6);
  await fundFrom(trx, bscmainnet.TRX_HOLDER, bscmainnet.NORMAL_TIMELOCK, seed);
  await trx.connect(f.timelock).approve(f.registry.address, seed);
  await f.registry.connect(f.timelock).addMarket({
    vToken: vTRX.address,
    collateralFactor: 0,
    liquidationThreshold: 0,
    initialSupply: seed,
    vTokenReceiver: bscmainnet.NORMAL_TIMELOCK,
    supplyCap: ethers.utils.parseUnits("100000000", 6),
    borrowCap: ethers.utils.parseUnits("50000000", 6),
  });

  // A YieldGroup refuses a Hub whose asset is not its own (`HubAssetMismatch`), so the 6-decimal
  // asset needs its own Hub. Minted from the chain's live `HubBeacon`, which is exactly how a TRX
  // Hub would be created in production; nothing here is a stand-in.
  const proxyFactory = await ethers.getContractFactory("BeaconProxy", f.deployer);
  const hubIface = new ethers.utils.Interface(HUB_ABI);
  const trxHubProxy = await proxyFactory.deploy(
    bscmainnet.HUB_BEACON,
    hubIface.encodeFunctionData("initialize", [
      bscmainnet.TRX,
      "Venus Hub TRX",
      "vhTRX",
      bscmainnet.ACM,
      6, // decimals offset, the value the production asset-vault script uses
      MAX_UINT128,
      bscmainnet.NORMAL_TIMELOCK,
    ]),
  );
  await trxHubProxy.deployed();
  const trxHub = new ethers.Contract(trxHubProxy.address, HUB_ABI, f.deployer);
  for (const sig of Object.values(HUB_ADMIN_ROLES)) {
    await grant(f.acm, f.timelock, trxHub.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }

  const trxSource = await deployYieldGroup(f.deployer, trxHub.address, bscmainnet.TRX);
  for (const sig of [
    HUB_ROLES.addResource,
    HUB_ROLES.removeResource,
    HUB_ROLES.setInnerDepositQueue,
    HUB_ROLES.setInnerWithdrawQueue,
    HUB_ROLES.raiseResourceCap,
    HUB_ROLES.lowerResourceCap,
    HUB_ROLES.pauseResource,
  ]) {
    await grant(f.acm, f.timelock, trxSource.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }

  await f.spoke.connect(f.timelock).setSupplyAllowlistEnabled(vTRX.address, true);
  await f.spoke.connect(f.timelock).setAllowedSupplier(vTRX.address, trxSource.address, true);
  await trxSource.connect(f.timelock).addResource(vTRX.address, f.adapter.address);
  await trxSource.connect(f.timelock).setInnerDepositQueue([vTRX.address]);
  await trxSource.connect(f.timelock).setInnerWithdrawQueue([vTRX.address]);

  await trxHub.connect(f.timelock).addYieldGroup(trxSource.address, MAX_UINT128, 10_000);
  await trxHub.connect(f.timelock).setOuterDepositQueue([trxSource.address]);
  await trxHub.connect(f.timelock).setOuterWithdrawQueue([trxSource.address]);

  return { vTRX, trxSource, trx, trxHub };
}

/// `type(uint128).max`, the "effectively unbounded" cap the Hub stack uses in place of uint256 max.
export const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

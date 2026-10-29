import { mine, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers, network } from "hardhat";

import {
  AccessControlManager,
  IERC20,
  IERC20__factory,
  JumpRateModelV2,
  PoolRegistry,
  SpokeBondManager,
  SpokePoolManager,
  SpokePoolPolicyRegistry,
  SpokePoolProposalBuilder,
  SpokePoolShortfall,
} from "../../../../../typechain";
import { bscmainnet } from "../../HubSpoke/constants";
import {
  REGISTRY_DRIVEN_ROLES,
  REGISTRY_ROLES,
  SPOKE_ROLES,
  deployHubSide,
  deploySpokeStack,
  fundFrom,
  grant,
  pointProtocolShareReserveAtSpokeRegistry,
  registerOnHub,
} from "../../HubSpoke/fixture";

export const e18 = (value: string) => ethers.utils.parseUnits(value, 18);

export const XVS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
export const XVS_VAULT = "0x051100480289e704d20e9DB4804837068f3f9204";
export const XVS_POOL_ID = 0;
export const GOVERNOR_BRAVO = "0x2d56dC077072B53571b8252008C60e945108c75a";
export const RISK_ORACLE = "0x0E3E51958b0Daa8C57c949675975CBEDd7b5a1a1";
export const RISK_STEWARD_RECEIVER = "0x47856bFa74B71d24a5545c7506862B8FddE52baB";
export const COLLATERAL_FACTORS_STEWARD = "0x1414ADf007E324ec1D0A77b9F1A8759Ad33d2879";
export const MARKET_CAPS_STEWARD = "0x816FfD00A274EDE0091421F77817ca260Db3a3E3";
const CORE_POOL_COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const XVS_WHALES = ["0xF977814e90dA44bFA03b6295A0616a897441aceC", "0x5a52E96BAcdaBb82fd05763E25335261B270Efcb"];

// Not on chain yet: built from the governance-contracts branch that adds it (feat/vpd-2196-action-pause-steward)
const SUPPLY_PAUSE_STEWARD_ARTIFACT =
  "../../../../../../governance-contracts/artifacts/contracts/RiskSteward/SupplyPauseSteward.sol/SupplyPauseSteward.json";
const MOCK_FEED_ARTIFACT = "@venusprotocol/oracle/artifacts/contracts/test/MockV3Aggregator.sol/MockV3Aggregator.json";
const CHAINLINK_ORACLE_ARTIFACT =
  "@venusprotocol/oracle/artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json";

const BLOCKS_PER_YEAR = 42_048_000;
const LONG_STALE_PERIOD = 10 * 365 * 24 * 3600;
export const FEED_DECIMALS = 8;
export const MAX_STALE_PERIOD = 24 * 3600;
export const WIND_DOWN_PERIOD = 7 * 24 * 3600;
export const MAX_RESIDUAL_POOL_DEBT_USD = e18("10");
export const HUB_YIELD_GROUP_CAP = e18("10000000");

export const SourceType = { Idle: 0, LiquidityHub: 1 };
export const UpdateStatus = { None: 0, Pending: 1, Executed: 2, Rejected: 3, Expired: 4 };
export const UpdateType = {
  collateralFactors: "collateralFactors",
  supplyCap: "supplyCap",
  supplyPause: "supplyPause",
};

export const TIER_ONE = 1;
export const TIER_TWO = 2;
export const TIER_ONE_LOAN_CAP = e18("1000000");
export const TIER_TWO_LOAN_CAP = e18("3000000");
export const TIER_ONE_LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.6"),
  maxLiquidationThreshold: e18("0.7"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
  loanSupplyCapUsd: TIER_ONE_LOAN_CAP,
};
export const TIER_TWO_LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.7"),
  maxLiquidationThreshold: e18("0.8"),
  maxCollateralMarkets: 5,
  maxCollateralSupplyCapUsd: e18("3000000"),
  loanSupplyCapUsd: TIER_TWO_LOAN_CAP,
};
export const TIER_ONE_BOND_USD = e18("100000");
export const TIER_TWO_BOND_USD = e18("250000");
export const XVS_BOND_FACTOR = e18("1.5");
export const USDT_BOND_FACTOR = e18("1");

export const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};

export const GOVERNOR_ABI = [
  "function proposalCount() view returns (uint256)",
  "function state(uint256) view returns (uint8)",
  "function castVote(uint256,uint8)",
  "function queue(uint256)",
  "function execute(uint256)",
  "function proposalConfigs(uint256) view returns (uint256 votingDelay, uint256 votingPeriod, uint256 proposalThreshold)",
  "function proposalMaxOperations() view returns (uint256)",
  "function getActions(uint256) view returns (address[] targets, uint256[] values, string[] signatures, bytes[] calldatas)",
];
const XVS_VAULT_ABI = ["function deposit(address,uint256,uint256)", "function delegate(address)"];
const RECEIVER_ABI = [
  "function processUpdate(uint256)",
  "function executeRegisteredUpdate(uint256)",
  "function rejectUpdate(uint256)",
  "function setWhitelistedExecutor(address,bool)",
  "function setRiskParameterConfig(string,address,uint256,uint256)",
  "function updates(uint256) view returns (uint256 updateId, uint256 unlockTime, uint8 status, address executor, uint256 executedAt)",
];
const RISK_ORACLE_ABI = [
  "function addAuthorizedSender(address)",
  "function addUpdateType(string)",
  "function getLatestUpdateIdByTypeAndMarket(string,address) view returns (uint256)",
];
const ORACLE_ADMIN_ABI = [
  "function tokenConfigs(address) view returns (address asset, address feed, uint256 maxStalePeriod)",
  "function setTokenConfig((address asset, address feed, uint256 maxStalePeriod))",
  "function setTokenConfig((address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
  "function boundValidator() view returns (address)",
  "function getTokenConfig(address) view returns ((address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
];

export interface Actors {
  admin: SignerWithAddress;
  timelock: Signer;
  team: SignerWithAddress;
  guardian: SignerWithAddress;
  keeper: SignerWithAddress;
  recoverer: SignerWithAddress;
  deployer: SignerWithAddress;
  attacker: SignerWithAddress;
  secondDeployer: SignerWithAddress;
  supplier: SignerWithAddress;
  borrower: SignerWithAddress;
  liquidator: SignerWithAddress;
  hubDepositor: SignerWithAddress;
  outsider: SignerWithAddress;
}

export interface OpenSpokeFixture extends Actors {
  acm: AccessControlManager;
  governor: Contract;
  poolRegistry: PoolRegistry;
  manager: SpokePoolManager;
  builder: SpokePoolProposalBuilder;
  policyRegistry: SpokePoolPolicyRegistry;
  bondManager: SpokeBondManager;
  shortfall: SpokePoolShortfall;
  riskOracle: Contract;
  receiver: Contract;
  supplyPauseSteward: Contract;
  hub: Contract;
  yieldGroup: Contract;
  adapter: Contract;
  xvsVault: Contract;
  xvs: IERC20;
  usdt: IERC20;
  usdtFeed: Contract;
  xvsFeed: Contract;
  chainlinkOracle: Contract;
  redStoneOracle: Contract;
  thirdOracle: Contract;
  collateralInterestRateModel: JumpRateModelV2;
  loanInterestRateModel: JumpRateModelV2;
  feeds: Contract[];
  // The MockTokens tests deploy, which mint on `faucet`
  testTokens: Set<string>;
}

const feedPrice = (usd: string) => ethers.utils.parseUnits(usd, FEED_DECIMALS);

export async function deployMockFeed(f: Pick<OpenSpokeFixture, "admin" | "feeds">, usd: string): Promise<Contract> {
  const artifact = require(MOCK_FEED_ARTIFACT); // eslint-disable-line @typescript-eslint/no-var-requires
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, f.admin);
  const feed = await factory.deploy(FEED_DECIMALS, feedPrice(usd));
  f.feeds.push(feed);
  return feed;
}

export async function setPrice(feed: Contract, usd: string) {
  await feed.updateAnswer(feedPrice(usd));
}

/// Prices a live asset from a mock feed on the ChainlinkOracle only, so each move is explicit and time jumps never
/// fail a pivot check
export async function pinLivePrice(
  f: Pick<OpenSpokeFixture, "admin" | "feeds" | "timelock">,
  asset: string,
  usd: string,
) {
  const feed = await deployMockFeed(f, usd);
  const chainlink = new ethers.Contract(bscmainnet.CHAINLINK_ORACLE, ORACLE_ADMIN_ABI, f.timelock);
  await chainlink["setTokenConfig((address,address,uint256))"]({
    asset,
    feed: feed.address,
    maxStalePeriod: LONG_STALE_PERIOD,
  });
  const resilient = new ethers.Contract(bscmainnet.RESILIENT_ORACLE, ORACLE_ADMIN_ABI, f.timelock);
  await resilient["setTokenConfig((address,address[3],bool[3],bool))"]({
    asset,
    oracles: [bscmainnet.CHAINLINK_ORACLE, ethers.constants.AddressZero, ethers.constants.AddressZero],
    enableFlagsForOracles: [true, false, false],
    cachingEnabled: false,
  });
  return feed;
}

export async function fundXvs(xvs: IERC20, to: string, amount: BigNumber) {
  let left = amount;
  for (const whale of XVS_WHALES) {
    const balance = await xvs.balanceOf(whale);
    const take = balance.lt(left) ? balance : left;
    await fundFrom(xvs, whale, to, take);
    left = left.sub(take);
    if (left.isZero()) return;
  }
  throw new Error("Not enough XVS in the whales");
}

export async function fundUsdt(usdt: IERC20, to: string, amount: BigNumber) {
  await fundFrom(usdt, bscmainnet.USDT_HOLDER, to, amount);
}

async function deployProxy(admin: SignerWithAddress, name: string, args: unknown[], libraries = {}) {
  const implementation = await (await ethers.getContractFactory(name, { signer: admin, libraries })).deploy(...args);
  const proxy = await (
    await ethers.getContractFactory(
      "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol:OptimizedTransparentUpgradeableProxy",
      admin,
    )
  ).deploy(
    implementation.address,
    bscmainnet.DEFAULT_PROXY_ADMIN,
    implementation.interface.encodeFunctionData("initialize", [bscmainnet.ACM]),
  );
  return implementation.attach(proxy.address);
}

async function deployArtifactProxy(admin: SignerWithAddress, artifactPath: string, args: unknown[]) {
  const artifact = require(artifactPath); // eslint-disable-line @typescript-eslint/no-var-requires
  const implementation = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin).deploy(...args);
  const proxy = await (
    await ethers.getContractFactory(
      "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol:OptimizedTransparentUpgradeableProxy",
      admin,
    )
  ).deploy(
    implementation.address,
    bscmainnet.DEFAULT_PROXY_ADMIN,
    implementation.interface.encodeFunctionData("initialize", [bscmainnet.ACM]),
  );
  return new ethers.Contract(proxy.address, artifact.abi, admin);
}

async function deployInterestRateModel(admin: SignerWithAddress, multiplierPerYear: string) {
  const factory = await ethers.getContractFactory("JumpRateModelV2", admin);
  return (await factory.deploy(
    0,
    e18(multiplierPerYear),
    e18("2"),
    e18("0.8"),
    bscmainnet.ACM,
    false,
    BLOCKS_PER_YEAR,
  )) as JumpRateModelV2;
}

/// The setup VIP's grants: every manager, builder-VIP, steward and recovery role, to the holder that runs it
async function grantSetupRoles(f: OpenSpokeFixture) {
  const { acm, timelock } = f;
  const timelockAddress = bscmainnet.NORMAL_TIMELOCK;
  const give = (target: string, signature: string, who: string) => grant(acm, timelock, target, signature, who);

  const teamManagerRoles = [
    "setOracleFeeds(uint256,address,OracleFeed[3],uint256)",
    "setDeviationBoundedOracleParams(uint256,address,uint64,uint256,uint256)",
    "buildRequestProposal(uint256,string)",
    "rejectRequest(uint256)",
    "buildExitProposal(address,uint256[],string)",
    "buildForceCloseProposal(address,string)",
    "closePool(address)",
    "rejectExit(address)",
    "pauseDeployer(address)",
    "unpauseDeployer(address)",
  ];
  for (const signature of teamManagerRoles) await give(f.manager.address, signature, f.team.address);
  await give(f.manager.address, "pauseDeployer(address)", f.guardian.address);

  const timelockManagerRoles = [
    "settleRequest(uint256)",
    "releaseBond(address)",
    "startWindDown(address)",
    "handoverPoolToGovernance(address)",
    "setProposalBuilder(address)",
    "setBondManager(address)",
    "setHubYieldGroup(address,address)",
    "setSupportedOracles(address[3])",
    "setWindDownPeriod(uint256)",
    "setMaxResidualPoolDebtUsd(uint256)",
    "sweepToken(address,address,uint256)",
  ];
  for (const signature of timelockManagerRoles) await give(f.manager.address, signature, timelockAddress);
  await give(f.manager.address, "seizeBond(address,uint256,address)", f.shortfall.address);

  await give(f.shortfall.address, "recoverBadDebt(address,uint256)", f.recoverer.address);
  await give(f.shortfall.address, "repayBadDebt(address,uint256)", timelockAddress);

  for (const signature of [
    "depositInSource(address)",
    "setAccountImplementation(uint8,address)",
    "setAssetConfig(address,AssetConfig)",
  ]) {
    await give(f.bondManager.address, signature, timelockAddress);
  }
  for (const signature of [
    "setTier(uint256,Tier)",
    "setLoanAssetConfig(address,LoanAssetConfig)",
    "setLoanAssetFactor(address,uint256)",
    "addInterestRateModel(address,address)",
    "setBondAssetFactor(address,uint256)",
    "setPoolParams(PoolParams)",
    "setMarketParams(ProtocolMarketParams)",
    "setOracleParams(OracleParams)",
  ]) {
    await give(f.policyRegistry.address, signature, timelockAddress);
  }

  // Pool VIPs grant no roles: the Normal Timelock, the registry and the stewards act on every comptroller the builder
  // deploys through wildcard grants
  const wildcard = ethers.constants.AddressZero;
  for (const signature of Object.values(SPOKE_ROLES)) await give(wildcard, signature, timelockAddress);
  await give(wildcard, "setReduceReservesBlockDelta(uint256)", timelockAddress);
  for (const signature of REGISTRY_DRIVEN_ROLES) await give(wildcard, signature, f.poolRegistry.address);
  await give(wildcard, SPOKE_ROLES.setCollateralFactor, COLLATERAL_FACTORS_STEWARD);
  await give(wildcard, SPOKE_ROLES.setMarketSupplyCaps, MARKET_CAPS_STEWARD);
  await give(wildcard, SPOKE_ROLES.setCollateralFactor, f.supplyPauseSteward.address);
  await give(wildcard, SPOKE_ROLES.setActionsPaused, f.supplyPauseSteward.address);
  await give(wildcard, SPOKE_ROLES.setActionsPaused, f.guardian.address);
  await give(wildcard, SPOKE_ROLES.setMarketSupplyCaps, f.guardian.address);
  await give(wildcard, SPOKE_ROLES.setCollateralFactor, f.guardian.address);

  // New collateral assets' oracle configs, set by the pool VIPs
  for (const oracle of [bscmainnet.CHAINLINK_ORACLE, bscmainnet.REDSTONE_ORACLE, f.thirdOracle.address]) {
    await give(oracle, "setTokenConfig(TokenConfig)", timelockAddress);
  }
  await give(bscmainnet.RESILIENT_ORACLE, "setTokenConfig(TokenConfig)", timelockAddress);
  await give(bscmainnet.RESILIENT_ORACLE, "enableOracle(address,uint8,bool)", timelockAddress);
  const boundValidator = await new ethers.Contract(
    bscmainnet.RESILIENT_ORACLE,
    ORACLE_ADMIN_ABI,
    f.admin,
  ).boundValidator();
  await give(boundValidator, "setValidateConfig(ValidateConfig)", timelockAddress);
  await give(
    bscmainnet.DEVIATION_BOUNDED_ORACLE,
    "setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])",
    timelockAddress,
  );

  // Deployer updates: the manager publishes, the keeper processes, the stewards apply
  for (const signature of ["addAuthorizedSender(address)", "addUpdateType(string)"]) {
    await give(RISK_ORACLE, signature, timelockAddress);
  }
  for (const signature of [
    "setWhitelistedExecutor(address,bool)",
    "setRiskParameterConfig(string,address,uint256,uint256)",
  ]) {
    await give(RISK_STEWARD_RECEIVER, signature, timelockAddress);
  }
}

async function configurePolicy(f: OpenSpokeFixture) {
  const registry = f.policyRegistry.connect(f.timelock);
  await registry.setPoolParams(POOL_PARAMS);
  await registry.setMarketParams({
    collateralInterestRateModel: f.collateralInterestRateModel.address,
    reserveFactor: e18("0.1"),
    reduceReservesBlockDelta: 100,
  });
  await registry.setOracleParams({
    deviationBoundedOracleEnabled: true,
    cooldownPeriod: 3600,
    triggerThreshold: e18("0.1"),
    resetThreshold: e18("0.05"),
    boundDeviation: e18("0.05"),
  });
  await registry.setTier(TIER_ONE, {
    enabled: true,
    minTierBondUsd: TIER_ONE_BOND_USD,
    limits: TIER_ONE_LIMITS,
  });
  await registry.setTier(TIER_TWO, {
    enabled: true,
    minTierBondUsd: TIER_TWO_BOND_USD,
    limits: TIER_TWO_LIMITS,
  });
  // USDT is pinned at $1, so a tier's USD loan cap is also its USDT cap
  await registry.setLoanAssetConfig(bscmainnet.USDT, {
    factor: e18("1"),
    interestRateModels: [f.loanInterestRateModel.address],
  });
  await registry.setBondAssetFactor(XVS, XVS_BOND_FACTOR);
  await registry.setBondAssetFactor(bscmainnet.USDT, USDT_BOND_FACTOR);

  const bondManager = f.bondManager.connect(f.timelock);
  const accounts: [number, string, unknown[]][] = [
    [SourceType.Idle, "BondAccount", [f.bondManager.address]],
    [SourceType.LiquidityHub, "LiquidityHubBondAccount", [f.bondManager.address]],
  ];
  for (const [sourceType, name, args] of accounts) {
    const implementation = await (await ethers.getContractFactory(name, f.admin)).deploy(...args);
    await bondManager.setAccountImplementation(sourceType, implementation.address);
  }
  await bondManager.setAssetConfig(XVS, { sourceType: SourceType.Idle, source: ethers.constants.AddressZero });
  await bondManager.setAssetConfig(bscmainnet.USDT, {
    sourceType: SourceType.Idle,
    source: ethers.constants.AddressZero,
  });

  const manager = f.manager.connect(f.timelock);
  await manager.setBondManager(f.bondManager.address);
  await manager.setProposalBuilder(f.builder.address);
  await manager.setHubYieldGroup(bscmainnet.USDT, f.yieldGroup.address);
  await manager.setSupportedOracles([bscmainnet.CHAINLINK_ORACLE, bscmainnet.REDSTONE_ORACLE, f.thirdOracle.address]);
  await manager.setWindDownPeriod(WIND_DOWN_PERIOD);
  await manager.setMaxResidualPoolDebtUsd(MAX_RESIDUAL_POOL_DEBT_USD);

  await f.riskOracle.connect(f.timelock).addAuthorizedSender(f.manager.address);
  await f.riskOracle.connect(f.timelock).addUpdateType(UpdateType.supplyPause);
  await f.receiver.connect(f.timelock).setWhitelistedExecutor(f.keeper.address, true);
  await f.receiver
    .connect(f.timelock)
    .setRiskParameterConfig(UpdateType.supplyPause, f.supplyPauseSteward.address, 1, 0);
}

/// The team proposes VIPs: it stakes and self-delegates enough XVS for the proposal threshold and quorum
async function giveTeamVotingPower(f: OpenSpokeFixture) {
  const stake = e18("1600000");
  await fundXvs(f.xvs, f.team.address, stake);
  await f.xvs.connect(f.team).approve(XVS_VAULT, stake);
  await f.xvsVault.connect(f.team).deposit(XVS, XVS_POOL_ID, stake);
  await f.xvsVault.connect(f.team).delegate(f.team.address);
  await mine(1);
}

/// A snapshot that also forgets the mock feeds and test tokens deployed after it: `advanceTime` only refreshes live
/// feeds, and a later contract deployed at a forgotten token's address is not taken for it
export async function snapshotFixture(f: OpenSpokeFixture) {
  const feedCount = f.feeds.length;
  const testTokens = [...f.testTokens];
  const snapshot = await takeSnapshot();
  return {
    restore: async () => {
      await snapshot.restore();
      f.feeds.length = feedCount;
      f.testTokens = new Set(testTokens);
    },
  };
}

let deployed: { fixture: OpenSpokeFixture; snapshot: { restore: () => Promise<void> } } | undefined;

/// The stack is deployed once per process and every later suite rewinds to it. A suite that resets the fork in
/// between invalidates the snapshot, and the stack is deployed again
export async function loadOpenSpokeFixture(): Promise<OpenSpokeFixture> {
  if (deployed) {
    try {
      await deployed.snapshot.restore();
      return deployed.fixture;
    } catch {
      deployed = undefined;
    }
  }
  const fixture = await deployOpenSpokeFixture();
  deployed = { fixture, snapshot: await snapshotFixture(fixture) };
  return fixture;
}

/// The whole Open Spoke Pool stack on a bscmainnet fork, configured as the setup VIP leaves it, with no pool yet
async function deployOpenSpokeFixture(): Promise<OpenSpokeFixture> {
  const stack = await deploySpokeStack(false);
  // ponytail: every transaction would otherwise run twice on the fork, once to estimate its gas; a revert still
  // surfaces when it is mined
  const blockGasLimit = (await ethers.provider.getBlock("latest")).gasLimit.toHexString();
  const hardhatProvider = network.provider as unknown as {
    send: (method: string, params?: unknown[]) => Promise<unknown>;
  };
  const send = hardhatProvider.send.bind(hardhatProvider);
  hardhatProvider.send = (method, params) =>
    method === "eth_estimateGas" ? Promise.resolve(blockGasLimit) : send(method, params);

  const signers = await ethers.getSigners();
  const [, , , , , team, guardian, keeper, recoverer, deployer, attacker, secondDeployer, hubDepositor] = signers;
  const { timelock, acm, registry: poolRegistry } = stack;

  await poolRegistry.connect(timelock).acceptOwnership();
  for (const signature of Object.values(REGISTRY_ROLES)) {
    await grant(acm, timelock, poolRegistry.address, signature, bscmainnet.NORMAL_TIMELOCK);
  }
  await pointProtocolShareReserveAtSpokeRegistry(stack);
  const hubSide = await deployHubSide(stack);
  await registerOnHub({ ...stack, ...hubSide } as never, HUB_YIELD_GROUP_CAP);

  const admin = stack.deployer;
  const feeds: Contract[] = [];
  await grant(acm, timelock, bscmainnet.CHAINLINK_ORACLE, "setTokenConfig(TokenConfig)", bscmainnet.NORMAL_TIMELOCK);
  await grant(acm, timelock, bscmainnet.RESILIENT_ORACLE, "setTokenConfig(TokenConfig)", bscmainnet.NORMAL_TIMELOCK);
  const usdtFeed = await pinLivePrice({ admin, feeds, timelock }, bscmainnet.USDT, "1");
  const xvsFeed = await pinLivePrice({ admin, feeds, timelock }, XVS, "5");

  const policyRegistry = (await deployProxy(admin, "SpokePoolPolicyRegistry", [])) as SpokePoolPolicyRegistry;
  const libraries = {
    SpokePoolValidationLib: (await (await ethers.getContractFactory("SpokePoolValidationLib", admin)).deploy()).address,
    SpokePoolGovernanceLib: (await (await ethers.getContractFactory("SpokePoolGovernanceLib", admin)).deploy()).address,
  };
  const manager = (await deployProxy(
    admin,
    "SpokePoolManager",
    [bscmainnet.RESILIENT_ORACLE, RISK_STEWARD_RECEIVER, policyRegistry.address],
    libraries,
  )) as SpokePoolManager;
  const shortfall = (await deployProxy(admin, "SpokePoolShortfall", [manager.address])) as SpokePoolShortfall;
  const bondManager = (await deployProxy(admin, "SpokeBondManager", [manager.address])) as SpokeBondManager;
  const builder = (await (
    await ethers.getContractFactory("SpokePoolProposalBuilder", admin)
  ).deploy(
    manager.address,
    GOVERNOR_BRAVO,
    poolRegistry.address,
    bscmainnet.DEVIATION_BOUNDED_ORACLE,
    hubSide.adapter.address,
    stack.spokeBeacon.address,
    stack.vTokenBeacon.address,
    bscmainnet.PSR,
    shortfall.address,
    9,
  )) as SpokePoolProposalBuilder;
  const supplyPauseSteward = await deployArtifactProxy(admin, SUPPLY_PAUSE_STEWARD_ARTIFACT, [
    CORE_POOL_COMPTROLLER,
    RISK_STEWARD_RECEIVER,
  ]);
  const thirdOracle = await deployArtifactProxy(admin, CHAINLINK_ORACLE_ARTIFACT, []);

  const fixture: OpenSpokeFixture = {
    admin,
    timelock,
    team,
    guardian,
    keeper,
    recoverer,
    deployer,
    attacker,
    secondDeployer,
    supplier: stack.supplier,
    borrower: stack.borrower,
    liquidator: stack.liquidator,
    hubDepositor,
    outsider: stack.outsider,
    acm,
    governor: new ethers.Contract(GOVERNOR_BRAVO, GOVERNOR_ABI, team),
    poolRegistry,
    manager,
    builder,
    policyRegistry,
    bondManager,
    shortfall,
    riskOracle: new ethers.Contract(RISK_ORACLE, RISK_ORACLE_ABI, admin),
    receiver: new ethers.Contract(RISK_STEWARD_RECEIVER, RECEIVER_ABI, admin),
    supplyPauseSteward,
    hub: hubSide.hub,
    yieldGroup: hubSide.spokeSource,
    adapter: hubSide.adapter,
    xvsVault: new ethers.Contract(XVS_VAULT, XVS_VAULT_ABI, admin),
    xvs: IERC20__factory.connect(XVS, admin),
    usdt: IERC20__factory.connect(bscmainnet.USDT, admin),
    usdtFeed,
    xvsFeed,
    chainlinkOracle: new ethers.Contract(bscmainnet.CHAINLINK_ORACLE, ORACLE_ADMIN_ABI, admin),
    redStoneOracle: new ethers.Contract(bscmainnet.REDSTONE_ORACLE, ORACLE_ADMIN_ABI, admin),
    thirdOracle,
    collateralInterestRateModel: await deployInterestRateModel(admin, "0.05"),
    loanInterestRateModel: await deployInterestRateModel(admin, "0.1"),
    feeds,
    testTokens: new Set(),
  };

  await grantSetupRoles(fixture);
  await configurePolicy(fixture);
  await giveTeamVotingPower(fixture);
  return fixture;
}

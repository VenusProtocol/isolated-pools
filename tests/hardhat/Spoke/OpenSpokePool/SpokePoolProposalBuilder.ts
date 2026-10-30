import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { defaultAbiCoder, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  IDeviationBoundedOracle,
  IGovernorBravo,
  IGovernorBravo__factory,
  IResilientOracle,
  IYieldGroup,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  SpokeComptroller,
  SpokeComptroller__factory,
  SpokePoolManager,
  SpokePoolPolicyRegistry,
  SpokePoolPolicyRegistry__factory,
  SpokePoolProposalBuilder,
  SpokePoolProposalBuilder__factory,
  VToken,
  VToken__factory,
  WhitePaperInterestRateModel,
  WhitePaperInterestRateModel__factory,
} from "../../../../typechain";
import { RequestStatus, RequestType, deployProxy, e18, resetFakes } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const MAX_OPERATIONS = 100;
const MAX_POOL_MARKETS = 5;
/// A new pool's VIP actions besides its markets': acceptOwnership, addPool and settleRequest
const POOL_CREATION_ACTIONS = 3;
/// One batch per supported oracle, the BoundValidator, the ResilientOracle and the DeviationBoundedOracle
const ORACLE_CONFIG_ACTIONS = 6;
/// A loan market's four listing actions and four Hub registration actions
const MAX_ACTIONS_PER_MARKET = 8;
const BLOCKS_PER_YEAR = 42_048_000;
const TIER_ID = 1;
const UPGRADE_TIER_ID = 2;
const REQUEST_ID = 1230;
const DESCRIPTION = "# Open spoke pool";
const NEW_POOL = { name: "Spoke Pool 1230", symbolSuffix: "SpokePool1230" };
const LOAN_CAP = e18("500000");
const UPGRADE_CAP = e18("1000000");
/// The manager holds a seed of this many units of each asset, which mints as many vTokens whatever its decimals
const SEED_UNITS = "100";
const SEED_VTOKENS = parseUnits(SEED_UNITS, 8);
const RESERVE_FACTOR = e18("0.1");
const REDUCE_RESERVES_BLOCK_DELTA = 28800;
const MAX_STALE_PERIOD = 86400;
const COOLDOWN_PERIOD = 3600;
const TRIGGER_THRESHOLD = e18("0.1");
const RESET_THRESHOLD = e18("0.05");
const BOUND_DEVIATION = e18("0.05");
/// One vToken of 8 decimals per unit of an 18-decimal underlying
const EXCHANGE_RATE = parseUnits("1", 28);
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 2,
  maxCollateralSupplyCapUsd: e18("1000000"),
};
/// `ComptrollerInterface.Action` values the exit VIP pauses: MINT, BORROW and ENTER_MARKET
const EXIT_PAUSED_ACTIONS = [0, 2, 7];

/// An action as [target, signature, argument types, arguments]
type Action = [string, string, string[], unknown[]];
type Feed = { oracle: string; feed: string; maxStalePeriod: number };
type CollateralMarket = {
  asset: string;
  collateralFactor: BigNumber;
  liquidationThreshold: BigNumber;
  supplyCap: BigNumber;
  feeds: Feed[];
};
type Pool = { name: string; symbolSuffix: string };
type BuilderAddresses = [string, string, string, string, string, string, string, string, string];

describe("SpokePoolProposalBuilder", () => {
  let deployer: SignerWithAddress;
  let timelock: SignerWithAddress;
  let spokeAdapter: SignerWithAddress;
  let protocolShareReserve: SignerWithAddress;
  let shortfall: SignerWithAddress;
  let unlistedMarket: SignerWithAddress;
  let chainlinkOracle: SignerWithAddress;
  let redstoneOracle: SignerWithAddress;
  let binanceOracle: SignerWithAddress;
  let boundValidator: SignerWithAddress;
  let mainFeed: SignerWithAddress;
  let pivotFeed: SignerWithAddress;
  let fallbackFeed: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let manager: FakeContract<SpokePoolManager>;
  let governor: FakeContract<IGovernorBravo>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let resilientOracle: FakeContract<IResilientOracle>;
  let yieldGroup: FakeContract<IYieldGroup>;
  /// Fakes that `fakeComptroller` and `fakeVToken` hand out, created once for every test
  let spareComptroller: FakeContract<SpokeComptroller>;
  let spareVTokens: FakeContract<VToken>[];
  let usedVTokens: number;
  let policyRegistry: SpokePoolPolicyRegistry;
  let usdt: MockToken;
  let usdc: MockToken;
  let wbtc: MockToken;
  let dai: MockToken;
  let colA: MockToken;
  let colB: MockToken;
  /// Every token's decimals, by address
  let tokenDecimals: Map<string, number>;
  let loanIrm: WhitePaperInterestRateModel;
  let collateralIrm: WhitePaperInterestRateModel;
  let comptrollerBeacon: string;
  let vTokenBeacon: string;
  let builder: SpokePoolProposalBuilder;

  const tier = (loanSupplyCapUsd: BigNumberish = LOAN_CAP) => ({
    enabled: true,
    minTierBondUsd: e18("100000"),
    limits: { ...LIMITS, loanSupplyCapUsd },
  });

  /// Lists `asset` as a loan asset at a factor of 1, so its supply cap is the tier's USD cap at its price
  const listLoanAsset = (asset: MockToken) =>
    policyRegistry.setLoanAssetConfig(asset.address, { factor: e18("1"), interestRateModels: [loanIrm.address] });

  const noFeed = (): Feed => ({ oracle: constants.AddressZero, feed: constants.AddressZero, maxStalePeriod: 0 });
  const feedOn = (oracle: string, feed: string): Feed => ({ oracle, feed, maxStalePeriod: MAX_STALE_PERIOD });

  const loanMarket = (asset: MockToken = usdt) => ({ asset: asset.address, interestRateModel: loanIrm.address });

  const collateralMarket = (
    asset: MockToken,
    feeds: Feed[] = [feedOn(chainlinkOracle.address, mainFeed.address), noFeed(), noFeed()],
  ): CollateralMarket => ({
    asset: asset.address,
    collateralFactor: e18("0.4"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("1000"),
    feeds,
  });

  const request = ({
    collateralMarkets = [],
    loanMarkets = [],
    ...overrides
  }: { collateralMarkets?: object[]; loanMarkets?: object[]; [key: string]: unknown } = {}) => ({
    requestType: RequestType.Pool,
    status: RequestStatus.Pending,
    deployer: deployer.address,
    comptroller: constants.AddressZero,
    tierId: TIER_ID,
    bondAsset: constants.AddressZero,
    bondAmount: 0,
    collateralMarkets,
    loanMarkets,
    ...overrides,
  });

  const builderAddresses = (): BuilderAddresses => [
    manager.address,
    governor.address,
    poolRegistry.address,
    boundedOracle.address,
    spokeAdapter.address,
    comptrollerBeacon,
    vTokenBeacon,
    protocolShareReserve.address,
    shortfall.address,
  ];

  const seedOf = (asset: string) => parseUnits(SEED_UNITS, tokenDecimals.get(asset));

  /// Returns the build's comptroller, vTokens and payload, then builds it for real so later reads see its contracts
  const buildRequest = async (requestToBuild: object, proposalBuilder = builder) => {
    manager.getRequest.returns(requestToBuild);
    const caller = proposalBuilder.connect(manager.wallet);
    const result = await caller.callStatic.buildRequestProposal(REQUEST_ID, DESCRIPTION);
    await caller.buildRequestProposal(REQUEST_ID, DESCRIPTION);
    return result;
  };

  /// Checks a payload is a Normal-route `propose` of exactly these actions
  const expectActions = (proposal: string, actions: Action[]) => {
    const [targets, values, signatures, calldatas, description, proposalType] =
      IGovernorBravo__factory.createInterface().decodeFunctionData("propose", proposal);
    expect(description).to.equal(DESCRIPTION);
    expect(proposalType).to.equal(0);
    expect(signatures).to.deep.equal(actions.map(([, signature]) => signature));
    expect(targets).to.deep.equal(actions.map(([target]) => target));
    expect(values.map(String)).to.deep.equal(actions.map(() => "0"));
    actions.forEach(([, signature, types, args], i) =>
      expect(calldatas[i], `${i}: ${signature}`).to.equal(defaultAbiCoder.encode(types, args)),
    );
  };

  /// Checks each new market's state in `pool`
  const expectMarkets = async (
    comptroller: string,
    pool: Pool,
    markets: {
      vToken: string;
      asset: string;
      symbol: string;
      interestRateModel: string;
      exchangeRate?: BigNumberish;
    }[],
  ) => {
    for (const { vToken: address, asset, symbol, interestRateModel, exchangeRate = EXCHANGE_RATE } of markets) {
      const vToken = VToken__factory.connect(address, deployer);
      expect(await vToken.underlying()).to.equal(asset);
      expect(await vToken.comptroller()).to.equal(comptroller);
      expect(await vToken.interestRateModel()).to.equal(interestRateModel);
      expect(await vToken.name()).to.equal(`Venus ${symbol} (${pool.name})`);
      expect(await vToken.symbol()).to.equal(`v${symbol}_${pool.symbolSuffix}`);
      expect(await vToken.decimals()).to.equal(8);
      expect(await vToken.exchangeRateStored()).to.equal(exchangeRate);
      expect(await vToken.reserveFactorMantissa()).to.equal(RESERVE_FACTOR);
      expect(await vToken.owner()).to.equal(timelock.address);
      expect(await vToken.accessControlManager()).to.equal(acm.address);
      expect(await vToken.shortfall()).to.equal(shortfall.address);
      expect(await vToken.protocolShareReserve()).to.equal(protocolShareReserve.address);
    }
  };

  /// A new pool's `acceptOwnership` and `addPool`
  const poolCreation = (comptroller: string): Action[] => [
    [comptroller, "acceptOwnership()", [], []],
    [
      poolRegistry.address,
      "addPool(string,address,uint256,uint256,uint256)",
      ["string", "address", "uint256", "uint256", "uint256"],
      [
        NEW_POOL.name,
        comptroller,
        POOL_PARAMS.closeFactor,
        POOL_PARAMS.liquidationIncentive,
        POOL_PARAMS.minLiquidatableCollateral,
      ],
    ],
  ];

  /// The four actions that list a market with its seed, which defaults to the manager's seed of its asset
  const listing = ({
    asset,
    vToken,
    seed = seedOf(asset),
    seedVTokens = SEED_VTOKENS,
    collateralFactor = 0,
    liquidationThreshold = 0,
    supplyCap,
    borrowCap = 0,
  }: {
    asset: string;
    vToken: string;
    seed?: BigNumberish;
    seedVTokens?: BigNumberish;
    collateralFactor?: BigNumberish;
    liquidationThreshold?: BigNumberish;
    supplyCap: BigNumberish;
    borrowCap?: BigNumberish;
  }): Action[] => [
    [asset, "approve(address,uint256)", ["address", "uint256"], [poolRegistry.address, seed]],
    [
      poolRegistry.address,
      "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
      ["tuple(address,uint256,uint256,uint256,address,uint256,uint256)"],
      [[vToken, collateralFactor, liquidationThreshold, seed, timelock.address, supplyCap, borrowCap]],
    ],
    [vToken, "transfer(address,uint256)", ["address", "uint256"], [constants.AddressZero, seedVTokens]],
    [vToken, "setReduceReservesBlockDelta(uint256)", ["uint256"], [REDUCE_RESERVES_BLOCK_DELTA]],
  ];

  const collateralListing = (
    { asset, collateralFactor, liquidationThreshold, supplyCap }: CollateralMarket,
    vToken: string,
    seeds: { seed?: BigNumberish; seedVTokens?: BigNumberish } = {},
  ) => listing({ asset, vToken, collateralFactor, liquidationThreshold, supplyCap, ...seeds });

  /// A loan market's listing, then its registration with its Hub YieldGroup
  const loanListing = (comptroller: string, vToken: string, cap: BigNumberish, asset = usdt.address): Action[] => [
    ...listing({ asset, vToken, supplyCap: cap, borrowCap: cap }),
    [comptroller, "setSupplyAllowlistEnabled(address,bool)", ["address", "bool"], [vToken, true]],
    [
      comptroller,
      "setAllowedSupplier(address,address,bool)",
      ["address", "address", "bool"],
      [vToken, yieldGroup.address, true],
    ],
    [yieldGroup.address, "addResource(address,address)", ["address", "address"], [vToken, spokeAdapter.address]],
    [yieldGroup.address, "lowerResourceCap(address,uint256)", ["address", "uint256"], [vToken, cap]],
  ];

  /// An oracle's batch of feeds, each as [asset, feed] or [asset, feed, staleness limit]
  const feedConfigs = (feedOracle: string, feeds: ([string, string] | [string, string, number])[]): Action => [
    feedOracle,
    "setTokenConfigs((address,address,uint256)[])",
    ["tuple(address,address,uint256)[]"],
    [feeds.map(([asset, feed, maxStalePeriod = MAX_STALE_PERIOD]) => [asset, feed, maxStalePeriod])],
  ];

  const boundConfigs = (assets: string[], deviation = BOUND_DEVIATION): Action => [
    boundValidator.address,
    "setValidateConfigs((address,uint256,uint256)[])",
    ["tuple(address,uint256,uint256)[]"],
    [assets.map(asset => [asset, e18("1").add(deviation), e18("1").sub(deviation)])],
  ];

  /// The ResilientOracle's batch, each market's config enabling the oracle of each of its set feeds
  const resilientConfigs = (markets: CollateralMarket[]): Action => [
    resilientOracle.address,
    "setTokenConfigs((address,address[3],bool[3],bool)[])",
    ["tuple(address,address[3],bool[3],bool)[]"],
    [
      markets.map(({ asset, feeds }) => [
        asset,
        feeds.map(({ oracle }) => oracle),
        feeds.map(({ feed }) => feed !== constants.AddressZero),
        false,
      ]),
    ],
  ];

  /// The DeviationBoundedOracle's batch, with the registry's config unless each asset is given [asset, config]
  const boundedConfigs = (assets: (string | [string, BigNumberish[]])[]): Action => [
    boundedOracle.address,
    "setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])",
    ["tuple(address,uint64,uint256,uint256,bool,bool)[]"],
    [
      assets.map(entry => {
        const [asset, config] =
          typeof entry === "string" ? [entry, [COOLDOWN_PERIOD, TRIGGER_THRESHOLD, RESET_THRESHOLD]] : entry;
        return [asset, ...config, true, false];
      }),
    ],
  ];

  /// The oracle configs of new collateral markets each with only a main feed on the Chainlink oracle
  const mainFeedConfigs = (markets: CollateralMarket[]): Action[] => [
    feedConfigs(
      chainlinkOracle.address,
      markets.map(({ asset }) => [asset, mainFeed.address]),
    ),
    resilientConfigs(markets),
    boundedConfigs(markets.map(({ asset }) => asset)),
  ];

  const settlement = (): Action => [manager.address, "settleRequest(uint256)", ["uint256"], [REQUEST_ID]];

  /// The markets' supply and borrow caps, in one batch each
  const capActions = (comptroller: string, vTokens: string[], caps: BigNumberish[]): Action[] => [
    [comptroller, "setMarketSupplyCaps(address[],uint256[])", ["address[]", "uint256[]"], [vTokens, caps]],
    [comptroller, "setMarketBorrowCaps(address[],uint256[])", ["address[]", "uint256[]"], [vTokens, caps]],
  ];

  /// Zeroes a market's collateral factor and sets its liquidation threshold
  const collateralFactorAction = (comptroller: string, vToken: string, liquidationThreshold: BigNumberish): Action => [
    comptroller,
    "setCollateralFactor(address,uint256,uint256)",
    ["address", "uint256", "uint256"],
    [vToken, 0, liquidationThreshold],
  ];

  const windDown = (comptroller: string): Action => [
    manager.address,
    "startWindDown(address)",
    ["address"],
    [comptroller],
  ];

  /// Lists `comptroller` in the fake registry under `name`
  const registerPool = (comptroller: string, name = NEW_POOL.name) =>
    poolRegistry.getPoolByComptroller.whenCalledWith(comptroller).returns({
      name,
      creator: timelock.address,
      comptroller,
      blockPosted: 0,
      timestampPosted: 0,
    });

  /// A fake comptroller whose `getAllMarkets` is `markets`, of which `unlisted` are not listed
  const fakeComptroller = (markets: string[], unlisted: string[] = []) => {
    const comptroller = spareComptroller;
    comptroller.getAllMarkets.returns(markets);
    comptroller.isComptroller.returns(true);
    comptroller.isMarketListed.returns(true);
    for (const vToken of unlisted) {
      comptroller.isMarketListed.whenCalledWith(vToken).returns(false);
    }
    return comptroller;
  };

  /// Makes `vToken` a loan market of `comptroller`: its supply allowlist is on
  const makeLoanMarket = (comptroller: FakeContract<SpokeComptroller>, vToken: string) =>
    comptroller.isSupplyAllowlistEnabled.whenCalledWith(vToken).returns(true);

  const fakeVToken = (underlying: string = usdt.address) => {
    const vToken = spareVTokens[usedVTokens++];
    vToken.underlying.returns(underlying);
    return vToken;
  };

  /// The shared fakes' default behaviour, reapplied before every test
  const programFakes = () => {
    acm.isAllowedToCall.returns(true);
    governor.proposalMaxOperations.returns(MAX_OPERATIONS);
    governor.proposalTimelocks.whenCalledWith(0).returns(timelock.address);
    resilientOracle.boundValidator.returns(boundValidator.address);
    resilientOracle.getPrice.returns(e18("1"));
    manager.POLICY_REGISTRY.returns(policyRegistry.address);
    manager.RESILIENT_ORACLE.returns(resilientOracle.address);
    manager.accessControlManager.returns(acm.address);
    for (const asset of [usdt, usdc, wbtc, dai]) {
      manager.hubYieldGroups.whenCalledWith(asset.address).returns(yieldGroup.address);
    }
    for (const asset of tokenDecimals.keys()) {
      manager.requestSeeds.whenCalledWith(REQUEST_ID, asset).returns(seedOf(asset));
    }
    for (const [i, supported] of [chainlinkOracle, redstoneOracle, binanceOracle].entries()) {
      manager.supportedOracles.whenCalledWith(i).returns(supported.address);
    }
  };

  const deployFixture = async () => {
    [
      deployer,
      timelock,
      spokeAdapter,
      protocolShareReserve,
      shortfall,
      unlistedMarket,
      chainlinkOracle,
      redstoneOracle,
      binanceOracle,
      boundValidator,
      mainFeed,
      pivotFeed,
      fallbackFeed,
    ] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    governor = await smock.fake<IGovernorBravo>("IGovernorBravo");
    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    resilientOracle = await smock.fake<IResilientOracle>("IResilientOracle");
    yieldGroup = await smock.fake<IYieldGroup>("IYieldGroup");
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    spareComptroller = await smock.fake<SpokeComptroller>("contracts/Spoke/SpokeComptroller.sol:SpokeComptroller");
    spareVTokens = [];
    for (let i = 0; i < 4; i++) {
      spareVTokens.push(await smock.fake<VToken>("contracts/VToken.sol:VToken"));
    }

    const tokenFactory = new MockToken__factory(deployer);
    usdt = await tokenFactory.deploy("Tether", "USDT", 18);
    usdc = await tokenFactory.deploy("USD Coin", "USDC", 6);
    wbtc = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    dai = await tokenFactory.deploy("Dai", "DAI", 18);
    colA = await tokenFactory.deploy("Collateral A", "COLA", 18);
    colB = await tokenFactory.deploy("Collateral B", "COLB", 18);
    tokenDecimals = new Map(
      [usdt, usdc, wbtc, dai, colA, colB].map((token, i) => [token.address, [18, 6, 8, 18, 18, 18][i]]),
    );
    const irmFactory = new WhitePaperInterestRateModel__factory(deployer);
    loanIrm = await irmFactory.deploy(0, e18("0.1"), false, BLOCKS_PER_YEAR);
    collateralIrm = await irmFactory.deploy(0, 0, false, BLOCKS_PER_YEAR);

    policyRegistry = await deployProxy(await new SpokePoolPolicyRegistry__factory(deployer).deploy(), acm.address);
    programFakes();
    await policyRegistry.setTier(TIER_ID, tier());
    await listLoanAsset(usdt);
    await policyRegistry.setMarketParams({
      collateralInterestRateModel: collateralIrm.address,
      reserveFactor: RESERVE_FACTOR,
      reduceReservesBlockDelta: REDUCE_RESERVES_BLOCK_DELTA,
    });
    await policyRegistry.setOracleParams({
      deviationBoundedOracleEnabled: true,
      cooldownPeriod: COOLDOWN_PERIOD,
      triggerThreshold: TRIGGER_THRESHOLD,
      resetThreshold: RESET_THRESHOLD,
      boundDeviation: BOUND_DEVIATION,
    });
    await policyRegistry.setPoolParams(POOL_PARAMS);
    await setBalance(manager.address, e18("100"));

    const beaconFactory = await ethers.getContractFactory("UpgradeableBeacon");
    const comptrollerImplementation = await new SpokeComptroller__factory(deployer).deploy(poolRegistry.address);
    comptrollerBeacon = (await beaconFactory.deploy(comptrollerImplementation.address)).address;
    const vTokenImplementation = await new VToken__factory(deployer).deploy(false, BLOCKS_PER_YEAR, e18("0.000005"));
    vTokenBeacon = (await beaconFactory.deploy(vTokenImplementation.address)).address;

    builder = await new SpokePoolProposalBuilder__factory(deployer).deploy(...builderAddresses(), MAX_POOL_MARKETS);
  };

  beforeEach(async () => {
    await loadFixture(deployFixture);
    resetFakes(
      acm,
      governor,
      poolRegistry,
      boundedOracle,
      resilientOracle,
      yieldGroup,
      manager,
      spareComptroller,
      ...spareVTokens,
    );
    programFakes();
    usedVTokens = 0;
  });

  describe("constructor", () => {
    it("reverts when any address is zero", async () => {
      const factory = new SpokePoolProposalBuilder__factory(deployer);
      const addresses = builderAddresses();
      for (let i = 0; i < addresses.length; i++) {
        const zeroed = [...addresses] as BuilderAddresses;
        zeroed[i] = constants.AddressZero;
        await expect(factory.deploy(...zeroed, MAX_POOL_MARKETS)).to.be.revertedWithCustomError(
          factory,
          "ZeroAddressNotAllowed",
        );
      }
    });

    it("rejects more markets per pool than a new pool's VIP can hold", async () => {
      const factory = new SpokePoolProposalBuilder__factory(deployer);
      const largest = Math.floor(
        (MAX_OPERATIONS - POOL_CREATION_ACTIONS - ORACLE_CONFIG_ACTIONS) / MAX_ACTIONS_PER_MARKET,
      );
      await expect(factory.deploy(...builderAddresses(), largest + 1))
        .to.be.revertedWithCustomError(factory, "TooManyMarkets")
        .withArgs(largest + 1, largest);
      const largestBuilder = await factory.deploy(...builderAddresses(), largest);
      expect(await largestBuilder.MAX_POOL_MARKETS()).to.equal(largest);
    });

    it("stores its dependencies", async () => {
      expect(await builder.SPOKE_POOL_MANAGER()).to.equal(manager.address);
      expect(await builder.POLICY_REGISTRY()).to.equal(policyRegistry.address);
      expect(await builder.GOVERNOR_BRAVO()).to.equal(governor.address);
      expect(await builder.POOL_REGISTRY()).to.equal(poolRegistry.address);
      expect(await builder.DEVIATION_BOUNDED_ORACLE()).to.equal(boundedOracle.address);
      expect(await builder.SPOKE_ADAPTER()).to.equal(spokeAdapter.address);
      expect(await builder.COMPTROLLER_BEACON()).to.equal(comptrollerBeacon);
      expect(await builder.VTOKEN_BEACON()).to.equal(vTokenBeacon);
      expect(await builder.PROTOCOL_SHARE_RESERVE()).to.equal(protocolShareReserve.address);
      expect(await builder.SHORTFALL()).to.equal(shortfall.address);
      expect(await builder.MAX_POOL_MARKETS()).to.equal(MAX_POOL_MARKETS);
    });
  });

  describe("buildRequestProposal", () => {
    it("can only be called by the manager", async () => {
      await expect(builder.connect(deployer).buildRequestProposal(REQUEST_ID, DESCRIPTION))
        .to.be.revertedWithCustomError(builder, "NotSpokePoolManager")
        .withArgs(deployer.address);
    });

    describe("pool and markets requests", () => {
      it("deploys a new pool's comptroller and markets, named after the request, and builds its listing VIP", async () => {
        const loan = loanMarket();
        const collateral = collateralMarket(colA);
        const [comptroller, vTokens, proposal] = await buildRequest(
          request({ collateralMarkets: [collateral], loanMarkets: [loan] }),
        );

        const spoke = SpokeComptroller__factory.connect(comptroller, deployer);
        expect(await spoke.owner()).to.equal(builder.address);
        expect(await spoke.pendingOwner()).to.equal(timelock.address);
        expect(await spoke.oracle()).to.equal(resilientOracle.address);
        expect(await spoke.deviationBoundedOracle()).to.equal(boundedOracle.address);
        expect(await spoke.accessControlManager()).to.equal(acm.address);
        expect(await spoke.maxLoopsLimit()).to.equal(100);
        expect(await spoke.getAllMarkets()).to.deep.equal([]);

        expect(vTokens).to.have.length(2);
        await expectMarkets(comptroller, NEW_POOL, [
          { vToken: vTokens[0], asset: colA.address, symbol: "COLA", interestRateModel: collateralIrm.address },
          { vToken: vTokens[1], asset: usdt.address, symbol: "USDT", interestRateModel: loanIrm.address },
        ]);

        expectActions(proposal, [
          ...poolCreation(comptroller),
          settlement(),
          ...mainFeedConfigs([collateral]),
          ...collateralListing(collateral, vTokens[0]),
          ...loanListing(comptroller, vTokens[1], LOAN_CAP),
        ]);
      });

      it("lists each market with its own seed from the manager, burning the vTokens it mints at its decimals' exchange rate", async () => {
        const markets = [collateralMarket(colA), collateralMarket(usdc), collateralMarket(wbtc)];
        const seeds = [
          { seed: e18("200"), seedVTokens: parseUnits("200", 8) },
          { seed: parseUnits("250", 6), seedVTokens: parseUnits("250", 8) },
          { seed: parseUnits("0.5", 8), seedVTokens: parseUnits("0.5", 8) },
        ];
        for (const [i, { asset }] of markets.entries()) {
          manager.requestSeeds.whenCalledWith(REQUEST_ID, asset).returns(seeds[i].seed);
        }

        const [comptroller, vTokens, proposal] = await buildRequest(request({ collateralMarkets: markets }));
        await expectMarkets(comptroller, NEW_POOL, [
          { vToken: vTokens[0], asset: colA.address, symbol: "COLA", interestRateModel: collateralIrm.address },
          {
            vToken: vTokens[1],
            asset: usdc.address,
            symbol: "USDC",
            interestRateModel: collateralIrm.address,
            exchangeRate: parseUnits("1", 16),
          },
          {
            vToken: vTokens[2],
            asset: wbtc.address,
            symbol: "WBTC",
            interestRateModel: collateralIrm.address,
            exchangeRate: parseUnits("1", 18),
          },
        ]);
        expectActions(proposal, [
          ...poolCreation(comptroller),
          settlement(),
          ...mainFeedConfigs(markets),
          ...markets.flatMap((market, i) => collateralListing(market, vTokens[i], seeds[i])),
        ]);
      });

      it("fits a request of the most markets with the most actions in a VIP limit that only just allows that many", async () => {
        const actionLimit = POOL_CREATION_ACTIONS + ORACLE_CONFIG_ACTIONS + MAX_ACTIONS_PER_MARKET * MAX_POOL_MARKETS;
        governor.proposalMaxOperations.returns(actionLimit);
        const tightBuilder = await new SpokePoolProposalBuilder__factory(deployer).deploy(
          ...builderAddresses(),
          MAX_POOL_MARKETS,
        );
        const loanAssets = [usdt, usdc, wbtc, dai];
        for (const asset of loanAssets) {
          await listLoanAsset(asset);
        }
        const collateral = collateralMarket(colA, [
          feedOn(chainlinkOracle.address, mainFeed.address),
          feedOn(redstoneOracle.address, pivotFeed.address),
          feedOn(binanceOracle.address, fallbackFeed.address),
        ]);

        const [comptroller, vTokens, proposal] = await buildRequest(
          request({ collateralMarkets: [collateral], loanMarkets: loanAssets.map(asset => loanMarket(asset)) }),
          tightBuilder,
        );
        expect(vTokens).to.have.length(MAX_POOL_MARKETS);
        const actions: Action[] = [
          ...poolCreation(comptroller),
          settlement(),
          feedConfigs(chainlinkOracle.address, [[colA.address, mainFeed.address]]),
          feedConfigs(redstoneOracle.address, [[colA.address, pivotFeed.address]]),
          feedConfigs(binanceOracle.address, [[colA.address, fallbackFeed.address]]),
          boundConfigs([colA.address]),
          resilientConfigs([collateral]),
          boundedConfigs([colA.address]),
          ...collateralListing(collateral, vTokens[0]),
          ...loanAssets.flatMap((asset, i) => loanListing(comptroller, vTokens[i + 1], LOAN_CAP, asset.address)),
        ];
        expect(actions.length).to.be.at.most(actionLimit);
        expectActions(proposal, actions);
      });

      describe("oracle configs", () => {
        let comptroller: FakeContract<SpokeComptroller>;

        const marketsRequest = (collateralMarkets: object[]) =>
          request({ requestType: RequestType.NewMarkets, comptroller: comptroller.address, collateralMarkets });

        beforeEach(async () => {
          comptroller = fakeComptroller([]);
          registerPool(comptroller.address);
        });

        it("batches every new asset's feeds per oracle, bounds those with a pivot, then the ResilientOracle and bounded configs", async () => {
          const marketA = collateralMarket(colA, [
            feedOn(chainlinkOracle.address, mainFeed.address),
            feedOn(redstoneOracle.address, pivotFeed.address),
            noFeed(),
          ]);
          const marketB = collateralMarket(colB, [
            feedOn(redstoneOracle.address, mainFeed.address),
            { ...feedOn(binanceOracle.address, pivotFeed.address), maxStalePeriod: 3600 },
            feedOn(chainlinkOracle.address, fallbackFeed.address),
          ]);
          const marketC = collateralMarket(usdt);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([marketA, marketB, marketC]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(chainlinkOracle.address, [
              [colA.address, mainFeed.address],
              [colB.address, fallbackFeed.address],
              [usdt.address, mainFeed.address],
            ]),
            feedConfigs(redstoneOracle.address, [
              [colA.address, pivotFeed.address],
              [colB.address, mainFeed.address],
            ]),
            feedConfigs(binanceOracle.address, [[colB.address, pivotFeed.address, 3600]]),
            boundConfigs([colA.address, colB.address]),
            resilientConfigs([marketA, marketB, marketC]),
            boundedConfigs([colA.address, colB.address, usdt.address]),
            ...collateralListing(marketA, vTokens[0]),
            ...collateralListing(marketB, vTokens[1]),
            ...collateralListing(marketC, vTokens[2]),
          ]);
        });

        it("skips an unset supported oracle and an oracle no new feed is on", async () => {
          manager.supportedOracles.whenCalledWith(0).returns(constants.AddressZero);
          const market = collateralMarket(colA, [feedOn(redstoneOracle.address, mainFeed.address), noFeed(), noFeed()]);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([market]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(redstoneOracle.address, [[colA.address, mainFeed.address]]),
            resilientConfigs([market]),
            boundedConfigs([colA.address]),
            ...collateralListing(market, vTokens[0]),
          ]);
        });

        it("skips every oracle config of an asset the ResilientOracle prices", async () => {
          resilientOracle.getTokenConfig.whenCalledWith(colA.address).returns({
            asset: colA.address,
            oracles: [chainlinkOracle.address, constants.AddressZero, constants.AddressZero],
            enableFlagsForOracles: [true, false, false],
            cachingEnabled: false,
          });
          const priced = collateralMarket(colA, [
            feedOn(chainlinkOracle.address, mainFeed.address),
            feedOn(redstoneOracle.address, pivotFeed.address),
            noFeed(),
          ]);
          const unpriced = collateralMarket(colB);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([priced, unpriced]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(chainlinkOracle.address, [[colB.address, mainFeed.address]]),
            resilientConfigs([unpriced]),
            boundedConfigs([colB.address]),
            ...collateralListing(priced, vTokens[0]),
            ...collateralListing(unpriced, vTokens[1]),
          ]);
        });

        it("skips the bounded config of an asset the DeviationBoundedOracle has", async () => {
          boundedOracle.assetProtectionConfig
            .whenCalledWith(colA.address)
            .returns([0, 0, false, true, 0, COOLDOWN_PERIOD, colA.address, 0, 0, false]);
          const market = collateralMarket(colA);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([market]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(chainlinkOracle.address, [[colA.address, mainFeed.address]]),
            resilientConfigs([market]),
            ...collateralListing(market, vTokens[0]),
          ]);
        });

        it("uses the Venus team's oracle bounds for the request over the registry's", async () => {
          const teamConfig = [600, e18("0.2"), e18("0.1")];
          manager.requestOracleOverrides.whenCalledWith(REQUEST_ID, colA.address).returns([e18("0.02"), ...teamConfig]);
          const feeds = [
            feedOn(chainlinkOracle.address, mainFeed.address),
            feedOn(redstoneOracle.address, pivotFeed.address),
            noFeed(),
          ];
          const marketA = collateralMarket(colA, feeds);
          const marketB = collateralMarket(colB, feeds);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([marketA, marketB]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(chainlinkOracle.address, [
              [colA.address, mainFeed.address],
              [colB.address, mainFeed.address],
            ]),
            feedConfigs(redstoneOracle.address, [
              [colA.address, pivotFeed.address],
              [colB.address, pivotFeed.address],
            ]),
            [
              boundValidator.address,
              "setValidateConfigs((address,uint256,uint256)[])",
              ["tuple(address,uint256,uint256)[]"],
              [
                [
                  [colA.address, e18("1.02"), e18("0.98")],
                  [colB.address, e18("1").add(BOUND_DEVIATION), e18("1").sub(BOUND_DEVIATION)],
                ],
              ],
            ],
            resilientConfigs([marketA, marketB]),
            boundedConfigs([[colA.address, teamConfig], colB.address]),
            ...collateralListing(marketA, vTokens[0]),
            ...collateralListing(marketB, vTokens[1]),
          ]);
        });

        it("sets only the Venus team's bounded configs while the registry's are disabled", async () => {
          await policyRegistry.setOracleParams({
            deviationBoundedOracleEnabled: false,
            cooldownPeriod: COOLDOWN_PERIOD,
            triggerThreshold: TRIGGER_THRESHOLD,
            resetThreshold: RESET_THRESHOLD,
            boundDeviation: BOUND_DEVIATION,
          });
          const teamConfig = [600, e18("0.2"), e18("0.1")];
          manager.requestOracleOverrides.whenCalledWith(REQUEST_ID, colB.address).returns([0, ...teamConfig]);
          const marketA = collateralMarket(colA);
          const marketB = collateralMarket(colB);
          const [, vTokens, proposal] = await buildRequest(marketsRequest([marketA, marketB]));
          expectActions(proposal, [
            settlement(),
            feedConfigs(chainlinkOracle.address, [
              [colA.address, mainFeed.address],
              [colB.address, mainFeed.address],
            ]),
            resilientConfigs([marketA, marketB]),
            boundedConfigs([[colB.address, teamConfig]]),
            ...collateralListing(marketA, vTokens[0]),
            ...collateralListing(marketB, vTokens[1]),
          ]);
        });

        it("adds no oracle config for a request of only loan markets", async () => {
          const [, vTokens, proposal] = await buildRequest(
            request({
              requestType: RequestType.NewMarkets,
              comptroller: comptroller.address,
              loanMarkets: [loanMarket()],
            }),
          );
          expectActions(proposal, [settlement(), ...loanListing(comptroller.address, vTokens[0], LOAN_CAP)]);
        });
      });

      it("lists a markets request's markets in the live pool, named after its registered name", async () => {
        const [comptroller] = await buildRequest(request({ collateralMarkets: [collateralMarket(colA)] }));
        const renamedPool = { name: "Renamed Pool", symbolSuffix: "RenamedPool" };
        registerPool(comptroller, renamedPool.name);

        const collateral = collateralMarket(colB);
        const [marketsComptroller, vTokens, proposal] = await buildRequest(
          request({
            requestType: RequestType.NewMarkets,
            comptroller,
            collateralMarkets: [collateral],
            loanMarkets: [loanMarket()],
          }),
        );
        expect(marketsComptroller).to.equal(comptroller);
        expect(vTokens).to.have.length(2);
        await expectMarkets(comptroller, renamedPool, [
          { vToken: vTokens[0], asset: colB.address, symbol: "COLB", interestRateModel: collateralIrm.address },
          { vToken: vTokens[1], asset: usdt.address, symbol: "USDT", interestRateModel: loanIrm.address },
        ]);
        expectActions(proposal, [
          settlement(),
          ...mainFeedConfigs([collateral]),
          ...collateralListing(collateral, vTokens[0]),
          ...loanListing(comptroller, vTokens[1], LOAN_CAP),
        ]);
      });
    });

    describe("tier requests", () => {
      let comptroller: FakeContract<SpokeComptroller>;
      let loanVToken: FakeContract<VToken>;
      let collateralVToken: FakeContract<VToken>;

      const buildTier = (tierId = UPGRADE_TIER_ID) =>
        buildRequest(request({ requestType: RequestType.TierUpgrade, comptroller: comptroller.address, tierId }));

      const hubCapAction = (signature: string, cap: BigNumberish, vToken = loanVToken.address): Action => [
        yieldGroup.address,
        signature,
        ["address", "uint256"],
        [vToken, cap],
      ];

      beforeEach(async () => {
        loanVToken = fakeVToken();
        collateralVToken = fakeVToken(colA.address);
        const unlistedLoanVToken = fakeVToken();
        comptroller = fakeComptroller(
          [loanVToken.address, unlistedLoanVToken.address, collateralVToken.address],
          [unlistedLoanVToken.address],
        );
        makeLoanMarket(comptroller, loanVToken.address);
        makeLoanMarket(comptroller, unlistedLoanVToken.address);
        yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(LOAN_CAP);
        await policyRegistry.setTier(UPGRADE_TIER_ID, tier(UPGRADE_CAP));
      });

      it("settles, then sets each listed loan market's caps to the new tier's and raises its Hub cap", async () => {
        const [builtComptroller, vTokens, proposal] = await buildTier();
        expect(builtComptroller).to.equal(comptroller.address);
        expect(vTokens).to.deep.equal([]);
        expectActions(proposal, [
          settlement(),
          hubCapAction("raiseResourceCap(address,uint256)", UPGRADE_CAP),
          ...capActions(comptroller.address, [loanVToken.address], [UPGRADE_CAP]),
        ]);
      });

      it("lowers a Hub cap above the new tier's or uncapped, and leaves an equal one", async () => {
        for (const liveCap of [UPGRADE_CAP.add(1), 0]) {
          yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(liveCap);
          const [, , proposal] = await buildTier();
          expectActions(proposal, [
            settlement(),
            hubCapAction("lowerResourceCap(address,uint256)", UPGRADE_CAP),
            ...capActions(comptroller.address, [loanVToken.address], [UPGRADE_CAP]),
          ]);
        }

        yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(UPGRADE_CAP);
        const [, , proposal] = await buildTier();
        expectActions(proposal, [
          settlement(),
          ...capActions(comptroller.address, [loanVToken.address], [UPGRADE_CAP]),
        ]);
      });

      it("sets every loan market's Hub cap, then all their caps in one batch", async () => {
        const usdcCap = parseUnits("200", 6);
        const usdcVToken = fakeVToken(usdc.address);
        comptroller.getAllMarkets.returns([loanVToken.address, collateralVToken.address, usdcVToken.address]);
        makeLoanMarket(comptroller, usdcVToken.address);
        yieldGroup.resourceCap.whenCalledWith(usdcVToken.address).returns(parseUnits("300", 6));
        await listLoanAsset(usdc);
        // The tier's 1,000,000 USD cap at 5,000 USD per USDC, scaled to its 6 decimals
        resilientOracle.getPrice.whenCalledWith(usdc.address).returns(parseUnits("5000", 30));

        const [, , proposal] = await buildTier();
        expectActions(proposal, [
          settlement(),
          hubCapAction("raiseResourceCap(address,uint256)", UPGRADE_CAP),
          hubCapAction("lowerResourceCap(address,uint256)", usdcCap, usdcVToken.address),
          ...capActions(comptroller.address, [loanVToken.address, usdcVToken.address], [UPGRADE_CAP, usdcCap]),
        ]);
      });

      it("only settles a pool without loan markets", async () => {
        comptroller.getAllMarkets.returns([collateralVToken.address]);
        const [, , proposal] = await buildTier();
        expectActions(proposal, [settlement()]);
      });

      it("rejects a pool with a market of an asset no longer lent", async () => {
        await policyRegistry.setLoanAssetConfig(usdt.address, { factor: 0, interestRateModels: [] });
        await expect(buildTier()).to.be.revertedWithCustomError(builder, "LoanAssetNotAllowed").withArgs(usdt.address);
      });
    });
  });

  describe("buildExitProposal", () => {
    let comptroller: FakeContract<SpokeComptroller>;
    let colAVToken: FakeContract<VToken>;
    let loanVToken: FakeContract<VToken>;
    let colBVToken: FakeContract<VToken>;

    beforeEach(async () => {
      colAVToken = fakeVToken(colA.address);
      loanVToken = fakeVToken();
      colBVToken = fakeVToken(colB.address);
      comptroller = fakeComptroller(
        [colAVToken.address, unlistedMarket.address, loanVToken.address, colBVToken.address],
        [unlistedMarket.address],
      );
      makeLoanMarket(comptroller, loanVToken.address);
    });

    it("pauses and zeroes the caps of every listed market, raises each collateral market's threshold and starts the wind-down", async () => {
      const [colAThreshold, colBThreshold] = [e18("0.9"), e18("0.8")];
      const listed = [colAVToken.address, loanVToken.address, colBVToken.address];
      const proposal = await builder.buildExitProposal(
        comptroller.address,
        [colAThreshold, e18("0.7"), colBThreshold],
        DESCRIPTION,
      );
      expectActions(proposal, [
        [
          comptroller.address,
          "setActionsPaused(address[],uint8[],bool)",
          ["address[]", "uint8[]", "bool"],
          [listed, EXIT_PAUSED_ACTIONS, true],
        ],
        ...capActions(comptroller.address, listed, [0, 0, 0]),
        collateralFactorAction(comptroller.address, colAVToken.address, colAThreshold),
        collateralFactorAction(comptroller.address, colBVToken.address, colBThreshold),
        windDown(comptroller.address),
      ]);
    });

    it("only starts the wind-down of a pool without listed markets", async () => {
      comptroller.getAllMarkets.returns([unlistedMarket.address]);
      const proposal = await builder.buildExitProposal(comptroller.address, [], DESCRIPTION);
      expectActions(proposal, [windDown(comptroller.address)]);
    });

    it("rejects thresholds that do not match the listed markets", async () => {
      for (const thresholds of [
        [0, 0],
        [0, 0, 0, 0],
      ]) {
        await expect(
          builder.buildExitProposal(comptroller.address, thresholds, DESCRIPTION),
        ).to.be.revertedWithCustomError(builder, "InvalidArrayLength");
      }
    });
  });

  describe("buildForceCloseProposal", () => {
    it("zeroes every collateral market's factors, borrowed or not, and forces liquidations on loan markets with borrows", async () => {
      const collateralVToken = fakeVToken(colA.address);
      const borrowedLoanVToken = fakeVToken();
      borrowedLoanVToken.totalBorrows.returns(1);
      const borrowedCollateralVToken = fakeVToken(colB.address);
      borrowedCollateralVToken.totalBorrows.returns(1);
      const repaidLoanVToken = fakeVToken();
      const comptroller = fakeComptroller(
        [
          collateralVToken.address,
          borrowedLoanVToken.address,
          unlistedMarket.address,
          borrowedCollateralVToken.address,
          repaidLoanVToken.address,
        ],
        [unlistedMarket.address],
      );
      makeLoanMarket(comptroller, borrowedLoanVToken.address);
      makeLoanMarket(comptroller, repaidLoanVToken.address);

      const proposal = await builder.buildForceCloseProposal(comptroller.address, DESCRIPTION);
      expectActions(proposal, [
        collateralFactorAction(comptroller.address, collateralVToken.address, 0),
        [
          comptroller.address,
          "setForcedLiquidation(address,bool)",
          ["address", "bool"],
          [borrowedLoanVToken.address, true],
        ],
        collateralFactorAction(comptroller.address, borrowedCollateralVToken.address, 0),
      ]);
    });

    it("builds an empty VIP for a pool without listed markets", async () => {
      const comptroller = fakeComptroller([unlistedMarket.address], [unlistedMarket.address]);
      expectActions(await builder.buildForceCloseProposal(comptroller.address, DESCRIPTION), []);
    });
  });
});

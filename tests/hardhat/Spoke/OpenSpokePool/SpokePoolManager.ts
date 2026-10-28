import { FakeContract, smock } from "@defi-wonderland/smock";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  AccessControlManager,
  FaucetTokenReEntrantHarness__factory,
  FeeToken__factory,
  IBondAccount,
  IChainlinkFeed,
  IResilientOracle,
  IResilientOracle__factory,
  IRiskOracle,
  IRiskStewardReceiver,
  ISpokeBondManager,
  ISpokePoolProposalBuilder,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
  SpokeComptroller,
  SpokePoolManager,
  SpokePoolPolicyRegistry,
  SpokePoolPolicyRegistry__factory,
  VToken,
} from "../../../../typechain";
import { NO_ESTIMATE, PoolStatus, RequestStatus, RequestType, deployProxy, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const DESCRIPTION = "# VIP";
const PROPOSAL = "0x1234";
const EXIT_PROPOSAL = "0xabcd";
const FORCE_CLOSE_PROPOSAL = "0xef01";
const BOND = e18("1000");
/// $10 of an asset priced at $1
const SEED = e18("10");
const LOAN_CAP = e18("500000");
const MAX_POOL_MARKETS = 5;
const WIND_DOWN_PERIOD = 7 * 24 * 60 * 60;
const MAX_STALE_PERIOD = 24 * 60 * 60;
/// Mirrors `IRiskStewardReceiver.UpdateStatus`, in declaration order
const UpdateStatus = { None: 0, Pending: 1, Executed: 2, Rejected: 3, Expired: 4 };
/// The receiver's `UPDATE_EXPIRATION_TIME`
const UPDATE_EXPIRATION_TIME = 2 * 24 * 60 * 60;
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const MARKET_PARAMS = (irm: string) => ({
  collateralInterestRateModel: irm,
  reserveFactor: e18("0.1"),
  reduceReservesBlockDelta: 28800,
});
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
};

type Feed = { oracle: string; feed: string; maxStalePeriod: number };

/// Checks each field of `expected` against the struct `actual`.
const expectFields = (actual: object, expected: object) => {
  for (const [key, value] of Object.entries(expected)) {
    expect((actual as Record<string, unknown>)[key], key).to.equal(value);
  }
};

describe("SpokePoolManager", () => {
  let owner: SignerWithAddress;
  let deployer: SignerWithAddress;
  let timelock: SignerWithAddress;
  let other: SignerWithAddress;
  let irm: SignerWithAddress;
  let yieldGroup: SignerWithAddress;
  let chainlinkOracle: SignerWithAddress;
  let redstoneOracle: SignerWithAddress;
  let binanceOracle: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let oracle: FakeContract<ResilientOracleInterface & IResilientOracle>;
  let riskOracle: FakeContract<IRiskOracle>;
  let receiver: FakeContract<IRiskStewardReceiver>;
  let builder: FakeContract<ISpokePoolProposalBuilder>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let bondManager: FakeContract<ISpokeBondManager>;
  let bondAccount: FakeContract<IBondAccount>;
  let comptroller: FakeContract<SpokeComptroller>;
  let mainFeed: FakeContract<IChainlinkFeed>;
  let pivotFeed: FakeContract<IChainlinkFeed>;
  let fallbackFeed: FakeContract<IChainlinkFeed>;
  let vTokenA: FakeContract<VToken>;
  let vTokenB: FakeContract<VToken>;
  let vTokenC: FakeContract<VToken>;
  let policyRegistry: SpokePoolPolicyRegistry;
  let bondToken: MockToken;
  let collateralAsset: MockToken;
  let loanAsset: MockToken;
  let manager: SpokePoolManager;

  const noFeed = (): Feed => ({ oracle: constants.AddressZero, feed: constants.AddressZero, maxStalePeriod: 0 });
  const feedOn = (oracle: string, feed: string): Feed => ({ oracle, feed, maxStalePeriod: MAX_STALE_PERIOD });

  /// A main feed on the Chainlink oracle, with no pivot or fallback
  const mainFeedOnly = (): [Feed, Feed, Feed] => [
    feedOn(chainlinkOracle.address, mainFeed.address),
    noFeed(),
    noFeed(),
  ];

  /// Main, pivot and fallback feeds, each on its own supported oracle
  const allFeeds = (): [Feed, Feed, Feed] => [
    feedOn(chainlinkOracle.address, mainFeed.address),
    feedOn(redstoneOracle.address, pivotFeed.address),
    feedOn(binanceOracle.address, fallbackFeed.address),
  ];

  const collateralMarket = (overrides: object = {}) => ({
    asset: collateralAsset.address,
    collateralFactor: e18("0.4"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("1000"),
    feeds: mainFeedOnly(),
    ...overrides,
  });

  const loanMarket = (overrides: object = {}) => ({
    asset: loanAsset.address,
    interestRateModel: irm.address,
    ...overrides,
  });

  /// `requestPool`'s tier and bond arguments, to spread into the call
  const poolOf = (overrides: object = {}) => {
    const { tierId, bondAsset, bondAmount } = {
      tierId: 1,
      bondAsset: bondToken.address,
      bondAmount: BOND,
      ...overrides,
    };
    return [tierId, bondAsset, bondAmount] as const;
  };

  /// The ResilientOracle's config of an asset; a zero asset means the oracle does not price it
  const tokenConfig = (asset: string) => ({
    asset,
    oracles: [constants.AddressZero, constants.AddressZero, constants.AddressZero],
    enableFlagsForOracles: [false, false, false],
    cachingEnabled: false,
  });

  const tier = (minTierBondUsd: BigNumberish, loanCap: BigNumberish, limits: object = {}) => ({
    enabled: true,
    minTierBondUsd,
    limits: { ...LIMITS, loanSupplyCapUsd: loanCap, ...limits },
  });

  /// The manager's linked libraries, deployed once for every test
  const libraries: Record<string, string> = {};

  const managerFactory = () => ethers.getContractFactory("SpokePoolManager", { libraries });

  before(async () => {
    for (const name of ["SpokePoolValidationLib", "SpokePoolGovernanceLib"]) {
      libraries[name] = (await (await ethers.getContractFactory(name)).deploy()).address;
    }
  });

  const deployManager = async () => {
    const implementation = await (
      await managerFactory()
    ).deploy(oracle.address, receiver.address, policyRegistry.address);
    return deployProxy(implementation as SpokePoolManager, acm.address);
  };

  const feedTuples = (feeds: Feed[]) =>
    feeds.map(({ oracle: feedOracle, feed, maxStalePeriod }) => [
      feedOracle,
      feed,
      BigNumber.from(maxStalePeriod).toNumber(),
    ]);

  const expectCollateralMarkets = (actual: { feeds: Feed[] }[], expected: ReturnType<typeof collateralMarket>[]) => {
    expect(actual.length).to.equal(expected.length);
    actual.forEach((market, i) => {
      const { feeds, ...fields } = expected[i];
      expectFields(market, fields);
      expect(feedTuples(market.feeds)).to.deep.equal(feedTuples(feeds as Feed[]));
    });
  };

  const requestPool = async (
    collateralMarkets: object[] = [collateralMarket()],
    loanMarkets: object[] = [loanMarket()],
    pool = poolOf(),
  ) => {
    await manager.connect(deployer).requestPool(...pool, collateralMarkets, loanMarkets);
    return manager.requestCount();
  };

  const requestNewMarkets = async (collateralMarkets: object[] = [], loanMarkets: object[] = []) => {
    await manager.connect(deployer).requestNewMarkets(comptroller.address, collateralMarkets, loanMarkets);
    return manager.requestCount();
  };

  /// Sets what the live pool's bond holds
  const setBond = (amount: BigNumberish) => bondAccount.currentBondAmount.returns(amount);

  /// Builds a request's VIP, with the builder returning `vTokens`
  const build = (requestId: BigNumberish, vTokens: string[] = [vTokenA.address, vTokenB.address]) => {
    builder.buildRequestProposal.returns([comptroller.address, vTokens, PROPOSAL]);
    return manager.buildRequestProposal(requestId, DESCRIPTION);
  };

  const settle = (requestId: BigNumberish) => manager.connect(timelock).settleRequest(requestId);

  /// Takes a pool request through build and settle: pool Live, vTokenA collateral and vTokenB loan
  const activatePool = async () => {
    const requestId = await requestPool();
    await build(requestId);
    await settle(requestId);
  };

  const buildExit = () => manager.buildExitProposal(comptroller.address, [e18("0.7"), 0], DESCRIPTION);

  const startWindDown = async () => {
    await buildExit();
    await manager.connect(timelock).startWindDown(comptroller.address);
  };

  const setPrice = (asset: string, price: BigNumberish) => oracle.getPrice.whenCalledWith(asset).returns(price);

  /// Makes `asset` unpriced by the ResilientOracle, so its main feed prices it
  const unpriced = (asset: string) =>
    oracle.getTokenConfig.whenCalledWith(asset).returns(tokenConfig(constants.AddressZero));

  /// Sets a feed's latest answer and its age
  const setAnswer = async (feed: FakeContract<IChainlinkFeed>, answer: BigNumberish, age = 0) =>
    feed.latestRoundData.returns([1, answer, 0, (await time.latest()) - age, 1]);

  const expectUnauthorized = async (signature: string, call: () => Promise<unknown>) => {
    acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
    await expect(call())
      .to.be.revertedWithCustomError(manager, "Unauthorized")
      .withArgs(other.address, manager.address, signature);
  };

  /// Makes `updateId` the latest RiskOracle update of every market, published at `publishedAt` with receiver `status`
  const latestUpdate = (updateId: number, status: number, publishedAt: number) => {
    riskOracle.getLatestUpdateIdByTypeAndMarket.returns(updateId);
    receiver.updates
      .whenCalledWith(updateId)
      .returns({ updateId, unlockTime: 0, status, executor: constants.AddressZero, executedAt: 0 });
    riskOracle.getUpdateById.whenCalledWith(updateId).returns({
      referenceId: "",
      updateId,
      market: constants.AddressZero,
      updateType: "",
      updateTypeKey: constants.HashZero,
      newValue: "0x",
      previousValue: "0x",
      timestamp: publishedAt,
      publisher: constants.AddressZero,
      poolId: 0,
      destLzEid: 0,
      additionalData: "0x",
    });
  };

  beforeEach(async () => {
    [owner, deployer, timelock, other, irm, yieldGroup, chainlinkOracle, redstoneOracle, binanceOracle] =
      await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    oracle = await smock.fake<ResilientOracleInterface & IResilientOracle>([
      ...ResilientOracleInterface__factory.abi,
      ...IResilientOracle__factory.abi,
    ]);
    oracle.getPrice.returns(e18("1"));
    oracle.getUnderlyingPrice.returns(e18("1"));
    // Every asset is priced by the ResilientOracle unless a test makes it unpriced
    oracle.getTokenConfig.returns(([asset]: string[]) => tokenConfig(asset));
    riskOracle = await smock.fake<IRiskOracle>("IRiskOracle");
    receiver = await smock.fake<IRiskStewardReceiver>("IRiskStewardReceiver");
    receiver.RISK_ORACLE.returns(riskOracle.address);
    receiver.UPDATE_EXPIRATION_TIME.returns(UPDATE_EXPIRATION_TIME);
    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    builder = await smock.fake<ISpokePoolProposalBuilder>("ISpokePoolProposalBuilder");
    builder.buildExitProposal.returns(EXIT_PROPOSAL);
    builder.buildForceCloseProposal.returns(FORCE_CLOSE_PROPOSAL);
    builder.MAX_POOL_MARKETS.returns(MAX_POOL_MARKETS);
    builder.POOL_REGISTRY.returns(poolRegistry.address);
    bondManager = await smock.fake<ISpokeBondManager>("ISpokeBondManager");
    bondAccount = await smock.fake<IBondAccount>("IBondAccount");
    comptroller = await smock.fake<SpokeComptroller>("contracts/Spoke/SpokeComptroller.sol:SpokeComptroller");
    vTokenA = await smock.fake<VToken>("contracts/VToken.sol:VToken");
    vTokenB = await smock.fake<VToken>("contracts/VToken.sol:VToken");
    vTokenC = await smock.fake<VToken>("contracts/VToken.sol:VToken");
    mainFeed = await smock.fake<IChainlinkFeed>("IChainlinkFeed");
    pivotFeed = await smock.fake<IChainlinkFeed>("IChainlinkFeed");
    fallbackFeed = await smock.fake<IChainlinkFeed>("IChainlinkFeed");
    mainFeed.decimals.returns(8);

    bondToken = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    collateralAsset = await new MockToken__factory(owner).deploy("Collateral", "COL", 18);
    loanAsset = await new MockToken__factory(owner).deploy("Loan", "LOAN", 18);
    for (const token of [bondToken, collateralAsset, loanAsset]) {
      await token.connect(deployer).faucet(e18("100000"));
    }

    policyRegistry = await deployProxy(await new SpokePoolPolicyRegistry__factory(owner).deploy(), acm.address);
    await policyRegistry.setLoanAssetConfig(loanAsset.address, { factor: e18("1"), interestRateModels: [irm.address] });
    await policyRegistry.setTier(1, tier(e18("1000"), LOAN_CAP));
    await policyRegistry.setTier(
      2,
      tier(e18("2000"), e18("600000"), { maxCollateralFactor: e18("0.6"), maxLiquidationThreshold: e18("0.7") }),
    );

    manager = await deployManager();
    for (const token of [bondToken, collateralAsset, loanAsset]) {
      await token.connect(deployer).approve(manager.address, constants.MaxUint256);
    }
    await policyRegistry.setBondAssetFactor(bondToken.address, e18("1"));
    bondManager.bondAccounts.returns(bondAccount.address);
    bondAccount.asset.returns(bondToken.address);
    setBond(BOND);
    comptroller.isMarketListed.returns(true);
    comptroller.markets.returns([true, e18("0.4"), e18("0.6")]);
    comptroller.getAllMarkets.returns([vTokenA.address, vTokenB.address]);
    comptroller.isSupplyAllowlistEnabled.whenCalledWith(vTokenB.address).returns(true);

    await manager.setProposalBuilder(builder.address);
    await manager.setBondManager(bondManager.address);
    await policyRegistry.setPoolParams(POOL_PARAMS);
    await policyRegistry.setMarketParams(MARKET_PARAMS(irm.address));
    await manager.setWindDownPeriod(WIND_DOWN_PERIOD);
    await manager.setSupportedOracles([chainlinkOracle.address, redstoneOracle.address, binanceOracle.address]);
  });

  describe("constructor and initialize", () => {
    it("stores the immutables, the RiskOracle the receiver reads and the access control manager", async () => {
      expect(await manager.RESILIENT_ORACLE()).to.equal(oracle.address);
      expect(await manager.RISK_ORACLE()).to.equal(riskOracle.address);
      expect(await manager.RISK_STEWARD_RECEIVER()).to.equal(receiver.address);
      expect(await manager.POLICY_REGISTRY()).to.equal(policyRegistry.address);
      expect(await manager.accessControlManager()).to.equal(acm.address);
      expect(await manager.owner()).to.equal(owner.address);
    });

    it("reverts when any address is zero", async () => {
      const factory = await managerFactory();
      const args = [oracle.address, receiver.address, policyRegistry.address];
      for (let i = 0; i < args.length; i++) {
        const zeroed = [...args];
        zeroed[i] = constants.AddressZero;
        await expect(factory.deploy(...zeroed)).to.be.revertedWithCustomError(factory, "ZeroAddressNotAllowed");
      }
    });

    it("cannot be initialized twice, nor its implementation", async () => {
      await expect(manager.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
      const implementation = await (
        await managerFactory()
      ).deploy(oracle.address, receiver.address, policyRegistry.address);
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("access control", () => {
    it("needs the ACM role for every governance function", async () => {
      const m = () => manager.connect(other);
      const calls: [string, () => Promise<unknown>][] = [
        [
          "setOracleFeeds(uint256,address,OracleFeed[3])",
          () => m().setOracleFeeds(1, collateralAsset.address, mainFeedOnly()),
        ],
        ["buildRequestProposal(uint256,string)", () => m().buildRequestProposal(1, DESCRIPTION)],
        ["settleRequest(uint256)", () => m().settleRequest(1)],
        ["rejectRequest(uint256)", () => m().rejectRequest(1)],
        ["seizeBond(address,uint256,address)", () => m().seizeBond(comptroller.address, 1, other.address)],
        ["releaseBond(address)", () => m().releaseBond(comptroller.address)],
        [
          "buildExitProposal(address,uint256[],string)",
          () => m().buildExitProposal(comptroller.address, [], DESCRIPTION),
        ],
        ["startWindDown(address)", () => m().startWindDown(comptroller.address)],
        [
          "buildForceCloseProposal(address,string)",
          () => m().buildForceCloseProposal(comptroller.address, DESCRIPTION),
        ],
        ["closePool(address)", () => m().closePool(comptroller.address)],
        ["rejectExit(address)", () => m().rejectExit(comptroller.address)],
        ["handoverPoolToGovernance(address)", () => m().handoverPoolToGovernance(comptroller.address)],
        ["pauseDeployer(address)", () => m().pauseDeployer(comptroller.address)],
        ["unpauseDeployer(address)", () => m().unpauseDeployer(comptroller.address)],
        ["setProposalBuilder(address)", () => m().setProposalBuilder(builder.address)],
        ["setBondManager(address)", () => m().setBondManager(bondManager.address)],
        ["setHubYieldGroup(address,address)", () => m().setHubYieldGroup(loanAsset.address, yieldGroup.address)],
        [
          "setSupportedOracles(address[3])",
          () => m().setSupportedOracles([other.address, other.address, other.address]),
        ],
        ["setWindDownPeriod(uint256)", () => m().setWindDownPeriod(1)],
        ["setMaxResidualPoolDebtUsd(uint256)", () => m().setMaxResidualPoolDebtUsd(1)],
        ["sweepToken(address,address,uint256)", () => m().sweepToken(bondToken.address, other.address, 1)],
      ];
      for (const [signature, call] of calls) {
        await expectUnauthorized(signature, call);
      }
    });
  });

  describe("requestPool", () => {
    it("stores the request, escrows only the bond and emits RequestSubmitted", async () => {
      const collateralMarkets = [collateralMarket()];
      const loanMarkets = [loanMarket()];
      const tx = manager.connect(deployer).requestPool(...poolOf(), collateralMarkets, loanMarkets);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(1, RequestType.Pool, deployer.address, constants.AddressZero);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND.mul(-1), BOND]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [0, 0]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [0, 0]);

      const request = await manager.getRequest(1);
      expectFields(request, {
        requestType: RequestType.Pool,
        status: RequestStatus.Pending,
        deployer: deployer.address,
        comptroller: constants.AddressZero,
        tierId: 1,
        bondAsset: bondToken.address,
        bondAmount: BOND,
      });
      expectCollateralMarkets(request.collateralMarkets, collateralMarkets);
      expect(request.loanMarkets.map(m => [m.asset, m.interestRateModel])).to.deep.equal([
        [loanAsset.address, irm.address],
      ]);
      expect(await manager.requestCount()).to.equal(1);
      expect(await manager.latestRequestIds(deployer.address)).to.equal(1);
      expect(await manager.requestSeeds(1, collateralAsset.address)).to.equal(0);
      expect(await manager.requestSeeds(1, loanAsset.address)).to.equal(0);
    });

    it("stores a pool with only collateral markets or only loan markets", async () => {
      expect(await requestPool([collateralMarket()], [])).to.equal(1);
      await manager.connect(deployer).cancelRequest(1);
      expect(await requestPool([], [loanMarket()])).to.equal(2);
    });

    it("reverts while the caller has an active pool", async () => {
      await activatePool();
      await expect(requestPool()).to.be.revertedWithCustomError(manager, "ActivePoolExists").withArgs(deployer.address);
    });

    it("reverts while the caller has an open request, and allows a new one once it closes", async () => {
      await requestPool();
      await expect(requestPool()).to.be.revertedWithCustomError(manager, "OpenRequestExists").withArgs(1);

      await build(1);
      await expect(requestPool()).to.be.revertedWithCustomError(manager, "OpenRequestExists").withArgs(1);

      await manager.rejectRequest(1);
      expect(await requestPool()).to.equal(2);
    });

    it("reverts on a disabled or unset tier", async () => {
      await policyRegistry.setTier(1, { ...tier(e18("1000"), LOAN_CAP), enabled: false });
      for (const tierId of [1, 9]) {
        await expect(requestPool(undefined, undefined, poolOf({ tierId })))
          .to.be.revertedWithCustomError(manager, "TierDisabled")
          .withArgs(tierId);
      }
    });

    it("reverts on a bond asset the policy registry gives no factor", async () => {
      await policyRegistry.setBondAssetFactor(bondToken.address, 0);
      await expect(requestPool())
        .to.be.revertedWithCustomError(policyRegistry, "BondAssetNotAllowed")
        .withArgs(bondToken.address);
    });

    it("reverts when the bond is worth less than the tier's minimum times the asset's factor", async () => {
      await policyRegistry.setBondAssetFactor(bondToken.address, e18("1.5"));
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(BOND, e18("1500"));
      expect(await requestPool(undefined, undefined, poolOf({ bondAmount: e18("1500") }))).to.equal(1);
    });

    it("prices the bond with the ResilientOracle", async () => {
      setPrice(bondToken.address, e18("0.999"));
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(e18("999"), e18("1000"));
    });
  });

  describe("requestNewMarkets", () => {
    beforeEach(activatePool);

    it("stores a markets request on the pool's tier, escrowing nothing", async () => {
      const markets = [collateralMarket({ asset: bondToken.address })];
      const tx = manager.connect(deployer).requestNewMarkets(comptroller.address, markets, []);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.NewMarkets, deployer.address, comptroller.address);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [0, 0]);

      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.NewMarkets,
        status: RequestStatus.Pending,
        deployer: deployer.address,
        comptroller: comptroller.address,
        tierId: 1,
        bondAsset: constants.AddressZero,
        bondAmount: 0,
      });
      expectCollateralMarkets(request.collateralMarkets, markets);
      expect(request.loanMarkets.length).to.equal(0);
    });

    it("reverts for anyone but the pool's deployer", async () => {
      await expect(manager.connect(other).requestNewMarkets(comptroller.address, [collateralMarket()], []))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
    });

    it("reverts while the deployer is paused or the pool is not live", async () => {
      await manager.pauseDeployer(comptroller.address);
      await expect(requestNewMarkets([collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);

      await manager.unpauseDeployer(comptroller.address);
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(requestNewMarkets([collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts while the deployer has an open request", async () => {
      await requestNewMarkets([collateralMarket()]);
      await expect(requestNewMarkets([collateralMarket({ asset: bondToken.address })]))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);
    });

    it("reverts when the bond no longer pays for the tier, as after a seizure or loss", async () => {
      setBond(e18("999"));
      await expect(requestNewMarkets([collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(e18("999"), e18("1000"));

      setBond(BOND);
      expect(await requestNewMarkets([collateralMarket()])).to.equal(2);
    });
  });

  describe("requestTierUpgrade", () => {
    beforeEach(activatePool);

    it("stores a tier request once the bond pays for the target tier", async () => {
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(BOND, e18("2000"));

      setBond(e18("2000"));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.TierUpgrade, deployer.address, comptroller.address);
      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.TierUpgrade,
        status: RequestStatus.Pending,
        deployer: deployer.address,
        comptroller: comptroller.address,
        tierId: 2,
      });
      expect(request.collateralMarkets.length).to.equal(0);
      expect(request.loanMarkets.length).to.equal(0);
    });

    it("reverts when the target is not an upgrade", async () => {
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 1))
        .to.be.revertedWithCustomError(manager, "InvalidTierUpgrade")
        .withArgs(1, 1);
      await policyRegistry.setTier(2, tier(e18("2000"), e18("100")));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InvalidTierUpgrade")
        .withArgs(1, 2);
    });

    it("reverts for anyone but an active deployer of a live pool", async () => {
      await expect(manager.connect(other).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await manager.pauseDeployer(comptroller.address);
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);
      await manager.unpauseDeployer(comptroller.address);
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts while the deployer has an open request", async () => {
      setBond(e18("2000"));
      await requestNewMarkets([collateralMarket()]);
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);
    });
  });

  describe("cancelRequest", () => {
    it("refunds a pending pool request's bond and emits RequestCanceled", async () => {
      await requestPool();
      const tx = manager.connect(deployer).cancelRequest(1);

      await expect(tx).to.emit(manager, "RequestCanceled").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Canceled);
    });

    it("cancels a pending markets request, which escrowed nothing", async () => {
      await activatePool();
      await requestNewMarkets([collateralMarket()]);
      const tx = manager.connect(deployer).cancelRequest(2);
      await expect(tx).to.emit(manager, "RequestCanceled").withArgs(2);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [0, 0]);
      expect((await manager.getRequest(2)).status).to.equal(RequestStatus.Canceled);
    });

    it("reverts for anyone but the request's deployer", async () => {
      await requestPool();
      await expect(manager.connect(other).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await expect(manager.connect(other).cancelRequest(9))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
    });

    it("reverts once the request is built or closed", async () => {
      await requestPool();
      await build(1);
      await expect(manager.connect(deployer).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);

      await settle(1);
      await expect(manager.connect(deployer).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);
    });

    it("reverts on a canceled or rejected request", async () => {
      await requestPool();
      await manager.connect(deployer).cancelRequest(1);
      await expect(manager.connect(deployer).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);

      await requestPool();
      await manager.rejectRequest(2);
      await expect(manager.connect(deployer).cancelRequest(2))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(2);
    });
  });

  describe("setOracleFeeds", () => {
    it("replaces a pending collateral market's feeds and emits OracleFeedsUpdated", async () => {
      await requestPool();
      const feeds = allFeeds();
      const receipt = await (await manager.setOracleFeeds(1, collateralAsset.address, feeds)).wait();
      const [event] = receipt.events ?? [];
      expect(event.event).to.equal("OracleFeedsUpdated");
      expect(event.args?.requestId).to.equal(1);
      expect(event.args?.asset).to.equal(collateralAsset.address);
      expect(feedTuples(event.args?.feeds)).to.deep.equal(feedTuples(feeds));
      const [market] = (await manager.getRequest(1)).collateralMarkets;
      expect(feedTuples(market.feeds)).to.deep.equal(feedTuples(feeds));
    });

    it("updates the right market of several", async () => {
      await requestPool([collateralMarket({ asset: bondToken.address }), collateralMarket()], []);
      await manager.setOracleFeeds(1, collateralAsset.address, allFeeds());
      const [first, second] = (await manager.getRequest(1)).collateralMarkets;
      expect(feedTuples(first.feeds)).to.deep.equal(feedTuples(mainFeedOnly()));
      expect(feedTuples(second.feeds)).to.deep.equal(feedTuples(allFeeds()));
    });

    it("checks an unpriced asset's new feeds and its supply cap at their price", async () => {
      unpriced(collateralAsset.address);
      await setAnswer(mainFeed, 1e8);
      await requestPool();

      await expect(manager.setOracleFeeds(1, collateralAsset.address, [noFeed(), noFeed(), noFeed()]))
        .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
        .withArgs(collateralAsset.address);

      // 1,000 units at $1,000.01 is above the tier's $1,000,000
      const pricier = await smock.fake<IChainlinkFeed>("IChainlinkFeed");
      pricier.decimals.returns(8);
      await setAnswer(pricier, 1000_01000000);
      await expect(
        manager.setOracleFeeds(1, collateralAsset.address, [
          feedOn(chainlinkOracle.address, pricier.address),
          noFeed(),
          noFeed(),
        ]),
      )
        .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
        .withArgs(collateralAsset.address);
    });

    it("reverts on an asset that is not one of the request's collateral markets", async () => {
      await requestPool();
      for (const asset of [loanAsset.address, other.address]) {
        await expect(manager.setOracleFeeds(1, asset, mainFeedOnly()))
          .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
          .withArgs(asset);
      }
    });

    it("reverts unless the request is pending", async () => {
      await expect(manager.setOracleFeeds(1, collateralAsset.address, mainFeedOnly()))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);

      await requestPool();
      await build(1);
      await expect(manager.setOracleFeeds(1, collateralAsset.address, mainFeedOnly()))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);

      await manager.rejectRequest(1);
      await expect(manager.setOracleFeeds(1, collateralAsset.address, mainFeedOnly()))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);
    });
  });

  describe("market checks", () => {
    const collateralOf = (...tokens: MockToken[]) => tokens.map(token => collateralMarket({ asset: token.address }));

    it("reject an empty market list", async () => {
      await expect(requestPool([], [])).to.be.revertedWithCustomError(manager, "InvalidArrayLength");
      await activatePool();
      await expect(requestNewMarkets()).to.be.revertedWithCustomError(manager, "InvalidArrayLength");
    });

    it("cap a pool's markets at the builder's maximum, counting its listed ones", async () => {
      await expect(requestPool([], Array(MAX_POOL_MARKETS + 1).fill(loanMarket())))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(MAX_POOL_MARKETS + 1, MAX_POOL_MARKETS);

      await activatePool();
      comptroller.getAllMarkets.returns([vTokenA.address, vTokenB.address, vTokenC.address, other.address]);
      comptroller.isSupplyAllowlistEnabled.whenCalledWith(vTokenC.address).returns(true);
      comptroller.isSupplyAllowlistEnabled.whenCalledWith(other.address).returns(true);
      await expect(requestNewMarkets([collateralMarket()], [loanMarket()]))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(MAX_POOL_MARKETS + 1, MAX_POOL_MARKETS);
    });

    it("cap a pool's collateral markets at its tier's, counting its listed ones but not its loan markets", async () => {
      const extra = await new MockToken__factory(owner).deploy("Extra", "EXT", 18);
      await expect(requestPool(collateralOf(collateralAsset, bondToken, loanAsset, extra), []))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(4, LIMITS.maxCollateralMarkets);

      // The pool lists vTokenA as a collateral market and vTokenB as a loan market
      await activatePool();
      await expect(requestNewMarkets(collateralOf(bondToken, loanAsset, extra)))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(4, LIMITS.maxCollateralMarkets);
      expect(await requestNewMarkets(collateralOf(bondToken, extra))).to.equal(2);
    });

    it("reject an asset listed twice, across both kinds, or already in the pool", async () => {
      await expect(requestPool([collateralMarket(), collateralMarket()], []))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(collateralAsset.address);
      await expect(requestPool([], [loanMarket(), loanMarket()]))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(loanAsset.address);
      await expect(requestPool([collateralMarket({ asset: loanAsset.address })], [loanMarket()]))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(loanAsset.address);

      await activatePool();
      poolRegistry.getVTokenForAsset
        .whenCalledWith(comptroller.address, collateralAsset.address)
        .returns(vTokenA.address);
      await expect(requestNewMarkets([collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(collateralAsset.address);
    });

    it("reject a collateral factor above the liquidation threshold", async () => {
      await expect(requestPool([collateralMarket({ collateralFactor: e18("0.5"), liquidationThreshold: e18("0.4") })]))
        .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
        .withArgs(collateralAsset.address);
    });

    it("reject a collateral factor or liquidation threshold above the tier's", async () => {
      for (const overrides of [
        { collateralFactor: e18("0.51"), liquidationThreshold: e18("0.6") },
        { liquidationThreshold: e18("0.66") },
      ]) {
        await expect(requestPool([collateralMarket(overrides)]))
          .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
          .withArgs(collateralAsset.address);
      }
    });

    it("rejects an asset with no interest rate model, or a model not among its asset's", async () => {
      await expect(requestPool([], [loanMarket({ asset: collateralAsset.address })]))
        .to.be.revertedWithCustomError(manager, "LoanAssetNotAllowed")
        .withArgs(collateralAsset.address);
      await expect(requestPool([], [loanMarket({ interestRateModel: other.address })]))
        .to.be.revertedWithCustomError(manager, "InterestRateModelNotAllowed")
        .withArgs(other.address);
    });

    it("reject a collateral supply cap worth more than the tier allows", async () => {
      setPrice(collateralAsset.address, e18("1000.001"));
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
        .withArgs(collateralAsset.address);

      // 1,000 units at $1,000 is exactly the tier's $1,000,000
      setPrice(collateralAsset.address, e18("1000"));
      expect(await requestPool()).to.equal(1);
    });
  });

  describe("oracle feeds of an unpriced collateral asset", () => {
    beforeEach(async () => {
      unpriced(collateralAsset.address);
      await setAnswer(mainFeed, 2e8);
    });

    const requestWith = (feeds: Feed[]) => requestPool([collateralMarket({ feeds })], []);

    it("price the asset with the main feed, scaled to the asset's decimals", async () => {
      // 600 units at $2,000 is above the tier's $1,000,000, 500 units is exactly it
      await setAnswer(mainFeed, 2000e8);
      await expect(requestPool([collateralMarket({ supplyCap: e18("500.000000000000000001") })], []))
        .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
        .withArgs(collateralAsset.address);
      expect(await requestPool([collateralMarket({ supplyCap: e18("500") })], [])).to.equal(1);
    });

    it("accept the main feed alone, or with a pivot, or with a pivot and a fallback", async () => {
      const [main, pivot, fallback] = allFeeds();
      for (const feeds of [
        [main, noFeed(), noFeed()],
        [main, pivot, noFeed()],
        [main, pivot, fallback],
      ]) {
        const requestId = await requestWith(feeds);
        await manager.connect(deployer).cancelRequest(requestId);
      }
    });

    it("ignore a slot whose feed is unset, even when its oracle repeats", async () => {
      const [main] = allFeeds();
      expect(await requestWith([main, feedOn(chainlinkOracle.address, constants.AddressZero), noFeed()])).to.equal(1);
    });

    it("reject a missing main feed", async () => {
      const [, pivot] = allFeeds();
      for (const feeds of [
        [noFeed(), noFeed(), noFeed()],
        [feedOn(chainlinkOracle.address, constants.AddressZero), pivot, noFeed()],
      ]) {
        await expect(requestWith(feeds))
          .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
          .withArgs(collateralAsset.address);
      }
    });

    it("reject a set feed without a staleness limit", async () => {
      const [main, pivot] = allFeeds();
      for (const feeds of [
        [{ ...main, maxStalePeriod: 0 }, noFeed(), noFeed()],
        [main, { ...pivot, maxStalePeriod: 0 }, noFeed()],
      ]) {
        await expect(requestWith(feeds))
          .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
          .withArgs(collateralAsset.address);
      }
    });

    it("reject a fallback feed without a pivot feed", async () => {
      const [main, , fallback] = allFeeds();
      await expect(requestWith([main, noFeed(), fallback]))
        .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
        .withArgs(collateralAsset.address);
    });

    it("reject two feeds on the same oracle", async () => {
      const [main, pivot] = allFeeds();
      for (const feeds of [
        [main, { ...pivot, oracle: chainlinkOracle.address }, noFeed()],
        [main, pivot, feedOn(redstoneOracle.address, fallbackFeed.address)],
        [main, pivot, feedOn(chainlinkOracle.address, fallbackFeed.address)],
      ]) {
        await expect(requestWith(feeds))
          .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
          .withArgs(collateralAsset.address);
      }
    });

    it("reject a feed on a zero or unsupported oracle", async () => {
      const [main, pivot] = allFeeds();
      const cases: [Feed[], string][] = [
        [[{ ...main, oracle: constants.AddressZero }, noFeed(), noFeed()], constants.AddressZero],
        [[{ ...main, oracle: other.address }, noFeed(), noFeed()], other.address],
        [[main, { ...pivot, oracle: other.address }, noFeed()], other.address],
      ];
      for (const [feeds, unsupported] of cases) {
        await expect(requestWith(feeds))
          .to.be.revertedWithCustomError(manager, "UnsupportedOracle")
          .withArgs(unsupported);
      }
    });

    it("reject a main feed whose answer is not positive", async () => {
      for (const answer of [0, -1]) {
        await setAnswer(mainFeed, answer);
        await expect(requestWith(mainFeedOnly()))
          .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
          .withArgs(collateralAsset.address);
      }
    });

    it("reject a main feed older than the staleness limit", async () => {
      const updatedAt = (await time.latest()) + 10;
      mainFeed.latestRoundData.returns([1, 2e8, 0, updatedAt, 1]);
      await time.setNextBlockTimestamp(updatedAt + MAX_STALE_PERIOD + 1);
      await expect(manager.connect(deployer).requestPool(...poolOf(), [collateralMarket()], [], NO_ESTIMATE))
        .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
        .withArgs(collateralAsset.address);

      const latest = await time.latest();
      mainFeed.latestRoundData.returns([1, 2e8, 0, latest + 1 - MAX_STALE_PERIOD, 1]);
      await time.setNextBlockTimestamp(latest + 1);
      expect(await requestWith(mainFeedOnly())).to.equal(1);
    });

    it("are not checked once the ResilientOracle prices the asset", async () => {
      oracle.getTokenConfig.whenCalledWith(collateralAsset.address).returns(tokenConfig(collateralAsset.address));
      expect(await requestWith([noFeed(), noFeed(), feedOn(other.address, fallbackFeed.address)])).to.equal(1);
    });
  });

  describe("buildRequestProposal", () => {
    it("pulls each market's $10 seed, stores the build and emits RequestBuilt", async () => {
      await requestPool();
      builder.buildRequestProposal.returns([comptroller.address, [vTokenA.address, vTokenB.address], PROPOSAL]);
      const tx = manager.buildRequestProposal(1, DESCRIPTION, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "RequestBuilt").withArgs(1, [vTokenA.address, vTokenB.address]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED.mul(-1), SEED]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [SEED.mul(-1), SEED]);
      expect(builder.buildRequestProposal).to.have.been.calledOnceWith(1, DESCRIPTION);

      expectFields(await manager.getRequest(1), { status: RequestStatus.Built, comptroller: comptroller.address });
      expect(await manager.requestProposals(1)).to.equal(PROPOSAL);
      expect(await manager.requestSeeds(1, collateralAsset.address)).to.equal(SEED);
      expect(await manager.requestSeeds(1, loanAsset.address)).to.equal(SEED);
    });

    it("sizes a seed at the build-time price, rounded up", async () => {
      await requestPool();
      setPrice(collateralAsset.address, e18("3"));
      setPrice(loanAsset.address, e18("0.5"));
      await build(1);
      expect(await manager.requestSeeds(1, collateralAsset.address)).to.equal(BigNumber.from("3333333333333333334"));
      expect(await manager.requestSeeds(1, loanAsset.address)).to.equal(e18("20"));
    });

    it("prices an unpriced collateral asset's seed with its main feed", async () => {
      const usdc = await new MockToken__factory(owner).deploy("USD Coin", "USDC", 6);
      await usdc.connect(deployer).faucet(1e9);
      await usdc.connect(deployer).approve(manager.address, constants.MaxUint256);
      unpriced(usdc.address);
      await setAnswer(mainFeed, 1e8);
      await requestPool([collateralMarket({ asset: usdc.address, supplyCap: 1e10 })], []);

      await expect(build(1)).to.changeTokenBalances(usdc, [deployer, manager], [-10e6, 10e6]);
      expect(await manager.requestSeeds(1, usdc.address)).to.equal(10e6);
    });

    it("reverts when a seed does not fit its market's supply cap", async () => {
      await requestPool([collateralMarket({ supplyCap: SEED.sub(1) })], []);
      await expect(build(1))
        .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
        .withArgs(collateralAsset.address);
      await manager.connect(deployer).cancelRequest(1);

      await requestPool([], [loanMarket()]);
      await policyRegistry.setTier(1, tier(e18("1000"), SEED.sub(1)));
      await expect(build(2)).to.be.revertedWithCustomError(manager, "InvalidMarketParams").withArgs(loanAsset.address);

      await policyRegistry.setTier(1, tier(e18("1000"), SEED));
      await expect(build(2)).to.emit(manager, "RequestBuilt");
    });

    it("reverts when a seed transfer delivers a different amount", async () => {
      const feeToken = await new FeeToken__factory(owner).deploy(0, "Fee", 18, "FEE", 100, owner.address);
      await feeToken.allocateTo(deployer.address, e18("10000"));
      await feeToken.connect(deployer).approve(manager.address, constants.MaxUint256);
      await requestPool([collateralMarket({ asset: feeToken.address })], []);

      await expect(build(1))
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
    });

    it("checks the markets against the tier's current terms again", async () => {
      await requestPool();
      await policyRegistry.setLoanAssetConfig(loanAsset.address, { factor: 0, interestRateModels: [] });
      await expect(build(1)).to.be.revertedWithCustomError(manager, "LoanAssetNotAllowed").withArgs(loanAsset.address);
    });

    it("checks a collateral supply cap's worth again at the build-time price", async () => {
      await requestPool();
      setPrice(collateralAsset.address, e18("1000.001"));
      await expect(build(1))
        .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
        .withArgs(collateralAsset.address);
    });

    it("checks an unpriced asset's main feed again", async () => {
      unpriced(collateralAsset.address);
      await setAnswer(mainFeed, 1e8);
      await requestPool();
      await setAnswer(mainFeed, 1e8, MAX_STALE_PERIOD + 1);
      await expect(build(1))
        .to.be.revertedWithCustomError(manager, "InvalidOracleFeed")
        .withArgs(collateralAsset.address);
    });

    it("builds a pool request without checking its bond or tier again", async () => {
      await requestPool();
      await policyRegistry.setBondAssetFactor(bondToken.address, 0);
      setPrice(bondToken.address, e18("0.5"));
      await policyRegistry.setTier(1, { ...tier(e18("1000"), LOAN_CAP), enabled: false });

      await build(1);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Built);
    });

    it("pulls a markets request's seeds and needs a live pool", async () => {
      await activatePool();
      await requestNewMarkets([collateralMarket({ asset: bondToken.address })]);
      await buildExit();
      await expect(build(2, [vTokenC.address]))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);

      await manager.rejectExit(comptroller.address);
      await expect(build(2, [vTokenC.address])).to.changeTokenBalances(
        bondToken,
        [deployer, manager],
        [SEED.mul(-1), SEED],
      );
      expect(await manager.requestSeeds(2, bondToken.address)).to.equal(SEED);
    });

    it("builds a tier request without markets, seeds or upgrade and bond checks", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      setBond(BOND);
      setPrice(bondToken.address, e18("0.5"));
      await policyRegistry.setTier(2, { ...tier(e18("2000"), e18("600000")), enabled: false });

      await expect(build(2, [])).to.emit(manager, "RequestBuilt").withArgs(2, []);
      expect((await manager.getRequest(2)).status).to.equal(RequestStatus.Built);
    });

    it("needs a live pool for a tier request", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      await buildExit();
      await expect(build(2, []))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("builds a request once", async () => {
      await requestPool();
      await build(1);
      await expect(build(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
    });

    it("reverts on an unknown or closed request", async () => {
      await expect(build(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
      await requestPool();
      await manager.connect(deployer).cancelRequest(1);
      await expect(build(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
    });

    it("reverts with the builder's error", async () => {
      await requestPool();
      builder.buildRequestProposal.reverts("builder failed");
      await expect(manager.buildRequestProposal(1, DESCRIPTION)).to.be.revertedWith("builder failed");
    });
  });

  describe("settleRequest", () => {
    it("activates a pool request's pool, creates its bond and sends the seeds to the caller", async () => {
      const requestId = await requestPool();
      await build(requestId);
      const tx = manager.connect(timelock).settleRequest(requestId, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "PoolActivated").withArgs(requestId, comptroller.address, deployer.address);
      await expect(tx).to.emit(manager, "RequestSettled").withArgs(requestId, comptroller.address);
      await expect(tx).to.changeTokenBalances(collateralAsset, [manager, timelock], [SEED.mul(-1), SEED]);
      await expect(tx).to.changeTokenBalances(loanAsset, [manager, timelock], [SEED.mul(-1), SEED]);
      expect(bondManager.createBond).to.have.been.calledOnceWith(
        comptroller.address,
        deployer.address,
        bondToken.address,
        BOND,
      );
      expect(await bondToken.allowance(manager.address, bondManager.address)).to.equal(BOND);

      expect((await manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
      expectFields(await manager.getPool(comptroller.address), {
        deployer: deployer.address,
        status: PoolStatus.Live,
        deployerPaused: false,
        windDownStartedAt: 0,
        tierId: 1,
      });
      expect(await manager.activePools(deployer.address)).to.equal(comptroller.address);
    });

    it("sends a markets request's seeds to the caller", async () => {
      await activatePool();
      await requestNewMarkets([collateralMarket({ asset: bondToken.address })]);
      await build(2, [vTokenC.address]);

      const tx = settle(2);
      await expect(tx).to.emit(manager, "RequestSettled").withArgs(2, comptroller.address);
      await expect(tx).to.not.emit(manager, "PoolActivated");
      await expect(tx).to.changeTokenBalances(bondToken, [manager, timelock], [SEED.mul(-1), SEED]);
      expect((await manager.getRequest(2)).status).to.equal(RequestStatus.Settled);
    });

    it("moves a tier request's pool to its tier", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      await build(2, []);

      await expect(settle(2))
        .to.emit(manager, "PoolTierUpgraded")
        .withArgs(comptroller.address, 1, 2)
        .and.to.emit(manager, "RequestSettled")
        .withArgs(2, comptroller.address);
      expect((await manager.getPool(comptroller.address)).tierId).to.equal(2);
      expect((await manager.getRequest(2)).status).to.equal(RequestStatus.Settled);
    });

    it("reverts unless the request is built", async () => {
      await expect(settle(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
      const requestId = await requestPool();
      await expect(settle(requestId)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
      await build(requestId);
      await settle(requestId);
      await expect(settle(requestId)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
    });

    it("reverts on a request rejected after its build", async () => {
      const requestId = await requestPool();
      await build(requestId);
      await manager.rejectRequest(requestId);
      await expect(settle(requestId)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
    });

    it("needs a live pool for a markets or tier request", async () => {
      await activatePool();
      await requestNewMarkets([collateralMarket({ asset: bondToken.address })]);
      await build(2, [vTokenC.address]);
      await buildExit();
      await expect(settle(2)).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(comptroller.address);
    });
  });

  describe("rejectRequest", () => {
    it("refunds a pending pool request's bond", async () => {
      await requestPool();
      const tx = manager.rejectRequest(1);

      await expect(tx).to.emit(manager, "RequestRejected").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [0, 0]);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Rejected);
    });

    it("refunds a built pool request's bond and seeds", async () => {
      await requestPool();
      await build(1);
      const tx = manager.rejectRequest(1);

      await expect(tx).to.emit(manager, "RequestRejected").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
    });

    it("refunds a built markets request's seeds, and its VIP then fails to settle", async () => {
      await activatePool();
      await requestNewMarkets([collateralMarket({ asset: bondToken.address })]);
      await build(2, [vTokenC.address]);

      const tx = manager.rejectRequest(2);
      await expect(tx).to.emit(manager, "RequestRejected").withArgs(2);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [SEED, SEED.mul(-1)]);
      await expect(settle(2)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(2);
    });

    it("rejects a tier request, which escrowed nothing", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      await build(2, []);
      await expect(manager.rejectRequest(2)).to.emit(manager, "RequestRejected").withArgs(2);
    });

    it("reverts on an unknown, settled, canceled or rejected request", async () => {
      await expect(manager.rejectRequest(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);

      await requestPool();
      await manager.connect(deployer).cancelRequest(1);
      await expect(manager.rejectRequest(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);

      await requestPool();
      await manager.rejectRequest(2);
      await expect(manager.rejectRequest(2)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(2);

      await requestPool();
      await build(3);
      await settle(3);
      await expect(manager.rejectRequest(3)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(3);
    });
  });

  describe("deployer controls", () => {
    beforeEach(activatePool);

    const publishedWith = (updateType: string, vToken: string, newValue: string) =>
      expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnceWith(
        "",
        newValue,
        updateType,
        vToken,
        0,
        0,
        "0x",
      );

    describe("setCollateralFactor", () => {
      const set = (signer: SignerWithAddress, cf: BigNumberish, lt: BigNumberish, vToken = vTokenA.address) =>
        manager.connect(signer).setCollateralFactor(comptroller.address, vToken, cf, lt, NO_ESTIMATE);

      it("publishes the collateral factor and liquidation threshold", async () => {
        await set(deployer, e18("0.45"), e18("0.62"));
        publishedWith(
          "collateralFactors",
          vTokenA.address,
          defaultAbiCoder.encode(["uint256", "uint256"], [e18("0.45"), e18("0.62")]),
        );
      });

      it("stops once the deployer asks to exit, and works again after Venus rejects the exit", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(set(deployer, e18("0.3"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);

        await manager.rejectExit(comptroller.address);
        await set(deployer, e18("0.3"), e18("0.6"));
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnce;
      });

      it("reverts when the factor is above the threshold or the threshold goes down", async () => {
        for (const [cf, lt] of [
          [e18("0.5"), e18("0.45")],
          [e18("0.3"), e18("0.59")],
        ]) {
          await expect(set(deployer, cf, lt))
            .to.be.revertedWithCustomError(manager, "InvalidCollateralFactors")
            .withArgs(vTokenA.address);
        }
      });

      it("reverts when both values equal the applied ones", async () => {
        await expect(set(deployer, e18("0.4"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "RedundantUpdate")
          .withArgs(vTokenA.address);
        await set(deployer, e18("0.4"), e18("0.61"));
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnce;
      });

      it("reverts above the tier's limits", async () => {
        for (const [cf, lt] of [
          [e18("0.51"), e18("0.6")],
          [e18("0.4"), e18("0.66")],
        ]) {
          await expect(set(deployer, cf, lt))
            .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
            .withArgs(vTokenA.address);
        }
      });

      it("reverts when the bond's coverage is below the tier's minimum, with the asset's factor", async () => {
        bondAccount.currentBondAmount.returns(e18("799"));
        await expect(set(deployer, e18("0.45"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "CoverageTooLow")
          .withArgs(e18("0.799"), e18("0.8"));

        bondAccount.currentBondAmount.returns(BOND);
        await policyRegistry.setBondAssetFactor(bondToken.address, e18("2"));
        await expect(set(deployer, e18("0.45"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "CoverageTooLow")
          .withArgs(e18("0.5"), e18("0.8"));
      });

      it("reverts only while the latest update can still be applied", async () => {
        const now = await time.latest();
        const expired = now - UPDATE_EXPIRATION_TIME - 10;
        const cases: [number, number, boolean][] = [
          [UpdateStatus.None, now, true],
          [UpdateStatus.Pending, now, true],
          [UpdateStatus.None, expired, false],
          [UpdateStatus.Pending, expired, false],
          [UpdateStatus.Executed, now, false],
          [UpdateStatus.Rejected, now, false],
          [UpdateStatus.Expired, now, false],
        ];
        for (const [status, publishedAt, blocked] of cases) {
          latestUpdate(5, status, publishedAt);
          if (blocked) {
            await expect(set(deployer, e18("0.45"), e18("0.62")))
              .to.be.revertedWithCustomError(manager, "PreviousUpdatePending")
              .withArgs(vTokenA.address);
          } else {
            await set(deployer, e18("0.45"), e18("0.62"));
          }
        }
        expect(riskOracle.publishRiskParameterUpdate).to.have.callCount(5);
      });

      it("blocks until the update's expiration time has passed", async () => {
        const publishedAt = (await time.latest()) + 10;
        latestUpdate(5, UpdateStatus.Pending, publishedAt);
        await time.setNextBlockTimestamp(publishedAt + UPDATE_EXPIRATION_TIME);
        await expect(set(deployer, e18("0.45"), e18("0.62")))
          .to.be.revertedWithCustomError(manager, "PreviousUpdatePending")
          .withArgs(vTokenA.address);
        await time.setNextBlockTimestamp(publishedAt + UPDATE_EXPIRATION_TIME + 1);
        await set(deployer, e18("0.45"), e18("0.62"));
      });

      it("reverts on an unlisted or loan market", async () => {
        await expect(set(deployer, e18("0.4"), e18("0.6"), vTokenB.address))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
        comptroller.markets.returns([false, 0, 0]);
        await expect(set(deployer, e18("0.4"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "MarketNotListed")
          .withArgs(vTokenA.address);
      });

      it("reverts for anyone but an active deployer", async () => {
        await expect(set(other, e18("0.4"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
        await manager.pauseDeployer(comptroller.address);
        await expect(set(deployer, e18("0.4"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "DeployerPaused")
          .withArgs(comptroller.address);
      });
    });

    describe("setCollateralSupplyCap", () => {
      const set = (cap: BigNumberish, signer = deployer, vToken = vTokenA.address) =>
        manager.connect(signer).setCollateralSupplyCap(comptroller.address, vToken, cap, NO_ESTIMATE);

      it("publishes the supply cap", async () => {
        await set(e18("2000"));
        publishedWith("supplyCap", vTokenA.address, defaultAbiCoder.encode(["uint256"], [e18("2000")]));
      });

      it("reverts when the cap is worth more than the tier allows", async () => {
        oracle.getUnderlyingPrice.whenCalledWith(vTokenA.address).returns(e18("2"));
        await expect(set(e18("500001")))
          .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
          .withArgs(vTokenA.address);
        await set(e18("500000"));
      });

      it("reverts when the cap equals the applied one", async () => {
        comptroller.supplyCaps.whenCalledWith(vTokenA.address).returns(e18("2000"));
        await expect(set(e18("2000")))
          .to.be.revertedWithCustomError(manager, "RedundantUpdate")
          .withArgs(vTokenA.address);
      });

      it("reverts when the bond's coverage is below the tier's minimum", async () => {
        bondAccount.currentBondAmount.returns(e18("799"));
        await expect(set(e18("1")))
          .to.be.revertedWithCustomError(manager, "CoverageTooLow")
          .withArgs(e18("0.799"), e18("0.8"));
      });

      it("reverts while the latest update can still be applied", async () => {
        latestUpdate(1, UpdateStatus.None, await time.latest());
        await expect(set(e18("1")))
          .to.be.revertedWithCustomError(manager, "PreviousUpdatePending")
          .withArgs(vTokenA.address);
      });

      it("reverts on an unlisted or loan market", async () => {
        await expect(set(1, deployer, vTokenB.address))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
        comptroller.isMarketListed.whenCalledWith(vTokenC.address).returns(false);
        await expect(set(1, deployer, vTokenC.address))
          .to.be.revertedWithCustomError(manager, "MarketNotListed")
          .withArgs(vTokenC.address);
      });

      it("reverts for anyone but an active deployer of a live pool", async () => {
        await expect(set(1, other)).to.be.revertedWithCustomError(manager, "NotDeployer").withArgs(other.address);
        await manager.pauseDeployer(comptroller.address);
        await expect(set(1)).to.be.revertedWithCustomError(manager, "DeployerPaused").withArgs(comptroller.address);
        await manager.unpauseDeployer(comptroller.address);
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(set(1)).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(comptroller.address);
      });
    });

    describe("pauseCollateralSupply", () => {
      const pause = (signer = deployer, vToken = vTokenA.address) =>
        manager.connect(signer).pauseCollateralSupply(comptroller.address, vToken, NO_ESTIMATE);

      it("publishes a supply pause without checking coverage or pending updates", async () => {
        bondAccount.currentBondAmount.returns(0);
        latestUpdate(1, UpdateStatus.None, await time.latest());
        await pause();
        publishedWith("supplyPause", vTokenA.address, "0x");
      });

      it("reverts on an unlisted or loan market", async () => {
        await expect(pause(deployer, vTokenB.address))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
        comptroller.isMarketListed.whenCalledWith(vTokenC.address).returns(false);
        await expect(pause(deployer, vTokenC.address))
          .to.be.revertedWithCustomError(manager, "MarketNotListed")
          .withArgs(vTokenC.address);
      });

      it("reverts for anyone but an active deployer of a live pool", async () => {
        await expect(pause(other)).to.be.revertedWithCustomError(manager, "NotDeployer").withArgs(other.address);
        await manager.pauseDeployer(comptroller.address);
        await expect(pause()).to.be.revertedWithCustomError(manager, "DeployerPaused").withArgs(comptroller.address);
        await manager.unpauseDeployer(comptroller.address);
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(pause()).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(comptroller.address);
      });
    });
  });

  describe("bond functions", () => {
    beforeEach(activatePool);

    describe("withdrawBondExcess", () => {
      it("withdraws the bond's excess, even while exiting or paused", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await manager.pauseDeployer(comptroller.address);
        await manager.connect(deployer).withdrawBondExcess(comptroller.address, NO_ESTIMATE);
        expect(bondManager.withdrawExcess).to.have.been.calledOnceWith(comptroller.address, e18("1000"));
      });

      it("keeps the tier's required bond, at the current price and rounded up, in the bond", async () => {
        await policyRegistry.setBondAssetFactor(bondToken.address, e18("1.5"));
        setPrice(bondToken.address, e18("3"));
        await manager.connect(deployer).withdrawBondExcess(comptroller.address, NO_ESTIMATE);
        expect(bondManager.withdrawExcess).to.have.been.calledOnceWith(comptroller.address, e18("500"));

        setPrice(bondToken.address, e18("7"));
        await manager.connect(deployer).withdrawBondExcess(comptroller.address, NO_ESTIMATE);
        expect(bondManager.withdrawExcess).to.have.been.calledWith(
          comptroller.address,
          e18("1500").mul(e18("1")).div(e18("7")).add(1),
        );
      });

      it("reverts for anyone but the pool's deployer", async () => {
        for (const pool of [comptroller.address, other.address]) {
          await expect(manager.connect(other).withdrawBondExcess(pool))
            .to.be.revertedWithCustomError(manager, "NotDeployer")
            .withArgs(other.address);
        }
      });
    });

    describe("getExcessBondAmount", () => {
      it("returns what the bond holds beyond the tier's required bond, and zero below it", async () => {
        bondManager.getCurrentBondAmount.returns(e18("1200"));
        expect(await manager.getExcessBondAmount(comptroller.address)).to.equal(e18("200"));

        bondManager.getCurrentBondAmount.returns(e18("900"));
        expect(await manager.getExcessBondAmount(comptroller.address)).to.equal(0);
      });
    });

    describe("topUpBond", () => {
      it("pulls the amount and tops the bond up with it, even while exiting or paused", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await manager.pauseDeployer(comptroller.address);
        await expect(
          manager.connect(deployer).topUpBond(comptroller.address, e18("50"), NO_ESTIMATE),
        ).to.changeTokenBalances(bondToken, [deployer, manager], [e18("50").mul(-1), e18("50")]);
        expect(bondManager.topUp).to.have.been.calledOnceWith(comptroller.address, e18("50"));
        expect(await bondToken.allowance(manager.address, bondManager.address)).to.equal(e18("50"));
      });

      it("reverts for anyone but the pool's deployer", async () => {
        await expect(manager.connect(other).topUpBond(comptroller.address, 1))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
      });
    });

    describe("seizeBond", () => {
      it("seizes from the pool's bond to the receiver", async () => {
        await manager.seizeBond(comptroller.address, e18("7"), other.address, NO_ESTIMATE);
        expect(bondManager.seize).to.have.been.calledOnceWith(comptroller.address, e18("7"), other.address);
      });
    });

    describe("releaseBond", () => {
      it("releases the bond of a closed pool", async () => {
        await startWindDown();
        await manager.closePool(comptroller.address);
        await manager.releaseBond(comptroller.address, NO_ESTIMATE);
        expect(bondManager.release).to.have.been.calledOnceWith(comptroller.address);
      });

      it("releases the bond of a handed-over pool", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await manager.handoverPoolToGovernance(comptroller.address);
        await manager.releaseBond(comptroller.address, NO_ESTIMATE);
        expect(bondManager.release).to.have.been.calledOnceWith(comptroller.address);
      });

      it("reverts for a pool that is neither closed nor handed over", async () => {
        const check = () =>
          expect(manager.releaseBond(comptroller.address))
            .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
            .withArgs(comptroller.address);
        await check();
        await manager.connect(deployer).requestExit(comptroller.address);
        await check();
        await buildExit();
        await check();
        await manager.connect(timelock).startWindDown(comptroller.address);
        await check();
        await expect(manager.releaseBond(other.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(other.address);
      });
    });
  });

  describe("pauseDeployer and unpauseDeployer", () => {
    it("pauses and unpauses a pool's deployer", async () => {
      await activatePool();
      await expect(manager.pauseDeployer(comptroller.address))
        .to.emit(manager, "DeployerPausedUpdated")
        .withArgs(comptroller.address, true);
      expect((await manager.getPool(comptroller.address)).deployerPaused).to.equal(true);

      await expect(manager.unpauseDeployer(comptroller.address))
        .to.emit(manager, "DeployerPausedUpdated")
        .withArgs(comptroller.address, false);
      expect((await manager.getPool(comptroller.address)).deployerPaused).to.equal(false);
    });

    it("reverts for an unknown pool", async () => {
      for (const call of [() => manager.pauseDeployer(other.address), () => manager.unpauseDeployer(other.address)]) {
        await expect(call()).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(other.address);
      }
    });
  });

  describe("exit", () => {
    beforeEach(activatePool);

    describe("requestExit", () => {
      it("marks the pool and emits ExitRequested", async () => {
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.emit(manager, "ExitRequested")
          .withArgs(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitRequested);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts for anyone but an active deployer", async () => {
        await expect(manager.connect(other).requestExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
        await manager.pauseDeployer(comptroller.address);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "DeployerPaused")
          .withArgs(comptroller.address);
      });

      it("waits for the deployer's pending request to close", async () => {
        await requestNewMarkets([collateralMarket({ asset: bondToken.address })]);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "OpenRequestExists")
          .withArgs(2);

        await manager.connect(deployer).cancelRequest(2);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.emit(manager, "ExitRequested")
          .withArgs(comptroller.address);
      });

      it("waits for the deployer's built request to close", async () => {
        setBond(e18("2000"));
        await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
        await build(2, []);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "OpenRequestExists")
          .withArgs(2);

        await manager.rejectRequest(2);
        await expect(manager.connect(deployer).requestExit(comptroller.address))
          .to.emit(manager, "ExitRequested")
          .withArgs(comptroller.address);
      });
    });

    describe("buildExitProposal", () => {
      it("builds an exit from a live pool, stores its VIP and emits ExitBuilt", async () => {
        await expect(manager.buildExitProposal(comptroller.address, [e18("0.7"), 0], DESCRIPTION, NO_ESTIMATE))
          .to.emit(manager, "ExitBuilt")
          .withArgs(comptroller.address);
        expect(builder.buildExitProposal).to.have.been.calledOnceWith(
          comptroller.address,
          [e18("0.7"), 0],
          DESCRIPTION,
        );
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitProposed);
        expect(await manager.exitProposals(comptroller.address)).to.equal(EXIT_PROPOSAL);
      });

      it("builds an exit the deployer requested", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(buildExit()).to.emit(manager, "ExitBuilt").withArgs(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitProposed);
      });

      it("rebuilds a proposed exit, storing the latest VIP", async () => {
        await buildExit();
        builder.buildExitProposal.returns("0x5678");
        await expect(buildExit()).to.emit(manager, "ExitBuilt").withArgs(comptroller.address);
        expect(await manager.exitProposals(comptroller.address)).to.equal("0x5678");
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitProposed);
      });

      it("reverts on an unknown, winding-down, closed or handed-over pool", async () => {
        await expect(manager.buildExitProposal(other.address, [], DESCRIPTION))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(other.address);
        await startWindDown();
        await expect(buildExit())
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
        await manager.closePool(comptroller.address);
        await expect(buildExit())
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts with the builder's error", async () => {
        builder.buildExitProposal.reverts("builder failed");
        await expect(buildExit()).to.be.revertedWith("builder failed");
      });
    });

    describe("startWindDown", () => {
      it("starts the wind-down of a proposed exit", async () => {
        await buildExit();
        await expect(manager.connect(timelock).startWindDown(comptroller.address))
          .to.emit(manager, "WindDownStarted")
          .withArgs(comptroller.address);
        expectFields(await manager.getPool(comptroller.address), {
          status: PoolStatus.WindingDown,
          windDownStartedAt: await time.latest(),
        });
      });

      it("lets only the first of several built exit VIPs start the wind-down", async () => {
        await buildExit();
        await buildExit();
        await manager.connect(timelock).startWindDown(comptroller.address);
        await expect(manager.connect(timelock).startWindDown(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts unless the exit is proposed", async () => {
        const check = () =>
          expect(manager.connect(timelock).startWindDown(comptroller.address))
            .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
            .withArgs(comptroller.address);
        await check();
        await manager.connect(deployer).requestExit(comptroller.address);
        await check();
        await buildExit();
        await manager.rejectExit(comptroller.address);
        await check();
      });
    });

    describe("buildForceCloseProposal", () => {
      beforeEach(startWindDown);

      it("builds the force close once the wind-down period ends, in place of the exit VIP", async () => {
        const startedAt = (await manager.getPool(comptroller.address)).windDownStartedAt.toNumber();
        await time.setNextBlockTimestamp(startedAt + WIND_DOWN_PERIOD - 1);
        await expect(
          manager.buildForceCloseProposal(comptroller.address, DESCRIPTION, NO_ESTIMATE),
        ).to.be.revertedWithCustomError(manager, "WindDownPeriodNotElapsed");

        await time.setNextBlockTimestamp(startedAt + WIND_DOWN_PERIOD);
        await expect(manager.buildForceCloseProposal(comptroller.address, DESCRIPTION, NO_ESTIMATE))
          .to.emit(manager, "ForceCloseBuilt")
          .withArgs(comptroller.address);
        expect(builder.buildForceCloseProposal).to.have.been.calledOnceWith(comptroller.address, DESCRIPTION);
        expect(await manager.exitProposals(comptroller.address)).to.equal(FORCE_CLOSE_PROPOSAL);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.WindingDown);
      });

      it("reverts unless the pool is winding down", async () => {
        await expect(manager.buildForceCloseProposal(other.address, DESCRIPTION))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(other.address);
        await manager.closePool(comptroller.address);
        await time.increase(WIND_DOWN_PERIOD);
        await expect(manager.buildForceCloseProposal(comptroller.address, DESCRIPTION))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });
    });

    describe("closePool", () => {
      it("accrues the pool's interest and closes it once its borrows and bad debt are low enough", async () => {
        await startWindDown();
        vTokenA.totalBorrowsCurrent.returns(e18("3"));
        vTokenA.badDebt.returns(e18("1"));
        vTokenB.totalBorrowsCurrent.returns(0);
        vTokenB.badDebt.returns(0);
        oracle.getUnderlyingPrice.whenCalledWith(vTokenA.address).returns(e18("2"));
        await manager.setMaxResidualPoolDebtUsd(e18("7.99"));
        await expect(manager.closePool(comptroller.address))
          .to.be.revertedWithCustomError(manager, "ResidualDebtExceeded")
          .withArgs(e18("8"));

        await manager.setMaxResidualPoolDebtUsd(e18("8"));
        oracle.getUnderlyingPrice.reset();
        oracle.getUnderlyingPrice.returns(e18("1"));
        oracle.getUnderlyingPrice.whenCalledWith(vTokenA.address).returns(e18("2"));
        await expect(manager.closePool(comptroller.address, NO_ESTIMATE))
          .to.emit(manager, "PoolClosed")
          .withArgs(comptroller.address);
        expect(vTokenA.totalBorrowsCurrent).to.have.been.called;
        expect(vTokenB.totalBorrowsCurrent).to.have.been.called;
        expect(oracle.getUnderlyingPrice).to.not.have.been.calledWith(vTokenB.address);
        expect(bondManager.release).to.not.have.been.called;
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Closed);
        expect(await manager.activePools(deployer.address)).to.equal(constants.AddressZero);
      });

      it("lets the deployer request a new pool after the close", async () => {
        await startWindDown();
        await manager.closePool(comptroller.address);
        expect(await requestPool()).to.equal(2);
      });

      it("reverts unless the pool is winding down", async () => {
        const check = () =>
          expect(manager.closePool(comptroller.address))
            .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
            .withArgs(comptroller.address);
        await check();
        await buildExit();
        await check();
        await manager.connect(timelock).startWindDown(comptroller.address);
        await manager.closePool(comptroller.address);
        await check();
      });
    });

    describe("rejectExit", () => {
      it("returns a pool whose exit is requested to live", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(manager.rejectExit(comptroller.address))
          .to.emit(manager, "ExitRejected")
          .withArgs(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Live);
      });

      it("returns a pool whose exit is proposed to live, and its VIP then fails to start the wind-down", async () => {
        await buildExit();
        await expect(manager.rejectExit(comptroller.address))
          .to.emit(manager, "ExitRejected")
          .withArgs(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Live);
        await expect(manager.connect(timelock).startWindDown(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts on a live, winding-down or unknown pool", async () => {
        await expect(manager.rejectExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
        await expect(manager.rejectExit(other.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(other.address);
        await startWindDown();
        await expect(manager.rejectExit(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });
    });

    describe("handoverPoolToGovernance", () => {
      it("hands over a pool whose exit is requested, keeping its bond", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await expect(manager.handoverPoolToGovernance(comptroller.address, NO_ESTIMATE))
          .to.emit(manager, "PoolHandedOver")
          .withArgs(comptroller.address);
        expect(bondManager.release).to.not.have.been.called;
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.HandedOver);
        expect(await manager.activePools(deployer.address)).to.equal(constants.AddressZero);
      });

      it("hands over a pool whose exit VIP is built, which then fails to start the wind-down", async () => {
        await buildExit();
        await manager.handoverPoolToGovernance(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.HandedOver);
        await expect(manager.connect(timelock).startWindDown(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts before the exit or once the wind-down starts", async () => {
        await expect(manager.handoverPoolToGovernance(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
        await startWindDown();
        await expect(manager.handoverPoolToGovernance(comptroller.address))
          .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });
    });
  });

  describe("governance setters", () => {
    it("setProposalBuilder replaces the builder", async () => {
      await expect(manager.setProposalBuilder(other.address))
        .to.emit(manager, "ProposalBuilderUpdated")
        .withArgs(builder.address, other.address);
      expect(await manager.proposalBuilder()).to.equal(other.address);
      await expect(manager.setProposalBuilder(constants.AddressZero)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });

    it("setBondManager sets the bond manager once", async () => {
      expect(await manager.bondManager()).to.equal(bondManager.address);
      await expect(manager.setBondManager(bondManager.address)).to.be.revertedWithCustomError(
        manager,
        "BondManagerAlreadySet",
      );

      const fresh = await deployManager();
      await expect(fresh.setBondManager(bondManager.address))
        .to.emit(fresh, "BondManagerSet")
        .withArgs(bondManager.address);
      expect(await fresh.bondManager()).to.equal(bondManager.address);
    });

    it("setHubYieldGroup sets an asset's YieldGroup", async () => {
      await expect(manager.setHubYieldGroup(loanAsset.address, yieldGroup.address))
        .to.emit(manager, "HubYieldGroupUpdated")
        .withArgs(loanAsset.address, constants.AddressZero, yieldGroup.address);
      expect(await manager.hubYieldGroups(loanAsset.address)).to.equal(yieldGroup.address);
      await expect(manager.setHubYieldGroup(loanAsset.address, constants.AddressZero))
        .to.emit(manager, "HubYieldGroupUpdated")
        .withArgs(loanAsset.address, yieldGroup.address, constants.AddressZero);
      await expect(manager.setHubYieldGroup(constants.AddressZero, yieldGroup.address)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });

    it("setSupportedOracles replaces the supported oracles", async () => {
      const oracles: [string, string, string] = [other.address, constants.AddressZero, chainlinkOracle.address];
      await expect(manager.setSupportedOracles(oracles))
        .to.emit(manager, "SupportedOraclesUpdated")
        .withArgs([chainlinkOracle.address, redstoneOracle.address, binanceOracle.address], oracles);
      for (const [i, supported] of oracles.entries()) {
        expect(await manager.supportedOracles(i)).to.equal(supported);
      }
    });

    it("setSupportedOracles decides which oracles a new request's feeds may use", async () => {
      unpriced(collateralAsset.address);
      await setAnswer(mainFeed, 1e8);
      await manager.setSupportedOracles([redstoneOracle.address, binanceOracle.address, constants.AddressZero]);
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "UnsupportedOracle")
        .withArgs(chainlinkOracle.address);
    });

    it("setWindDownPeriod sets a non-zero wind-down period", async () => {
      await expect(manager.setWindDownPeriod(100))
        .to.emit(manager, "WindDownPeriodUpdated")
        .withArgs(WIND_DOWN_PERIOD, 100);
      expect(await manager.windDownPeriod()).to.equal(100);
      await expect(manager.setWindDownPeriod(0)).to.be.revertedWithCustomError(manager, "ZeroValueNotAllowed");
    });

    it("setMaxResidualPoolDebtUsd sets the debt a pool may close with", async () => {
      await expect(manager.setMaxResidualPoolDebtUsd(e18("10")))
        .to.emit(manager, "MaxResidualPoolDebtUsdUpdated")
        .withArgs(0, e18("10"));
      expect(await manager.maxResidualPoolDebtUsd()).to.equal(e18("10"));
    });
  });

  describe("sweepToken", () => {
    it("sends any amount of a token, escrowed or not", async () => {
      await requestPool();
      await expect(manager.sweepToken(bondToken.address, other.address, BOND))
        .to.emit(manager, "SweepToken")
        .withArgs(bondToken.address, other.address, BOND);
      expect(await bondToken.balanceOf(other.address)).to.equal(BOND);
      expect(await bondToken.balanceOf(manager.address)).to.equal(0);
    });

    it("reverts on a zero receiver", async () => {
      await expect(manager.sweepToken(bondToken.address, constants.AddressZero, 0)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("request lifecycle", () => {
    it("takes a pool request Pending, Built, Settled", async () => {
      const status = async () => (await manager.getRequest(1)).status;
      expect(await status()).to.equal(RequestStatus.None);
      await requestPool();
      expect(await status()).to.equal(RequestStatus.Pending);
      await build(1);
      expect(await status()).to.equal(RequestStatus.Built);
      await settle(1);
      expect(await status()).to.equal(RequestStatus.Settled);
    });

    it("escrows the bond at request and the seeds at build, then moves them out at settle", async () => {
      const balances = async () =>
        (await Promise.all([bondToken, collateralAsset, loanAsset].map(token => token.balanceOf(manager.address)))).map(
          String,
        );
      await requestPool();
      expect(await balances()).to.deep.equal([BOND, 0, 0].map(String));
      await build(1);
      expect(await balances()).to.deep.equal([BOND, SEED, SEED].map(String));
      await settle(1);
      // The fake bond manager pulls nothing; the bond is approved to it
      expect(await balances()).to.deep.equal([BOND, 0, 0].map(String));
      expect(await bondToken.allowance(manager.address, bondManager.address)).to.equal(BOND);
    });
  });

  describe("reentrancy", () => {
    const reEntries: [string, () => string][] = [
      ["requestPool", () => manager.interface.encodeFunctionData("requestPool", [...poolOf(), [], []])],
      ["cancelRequest", () => manager.interface.encodeFunctionData("cancelRequest", [1])],
      ["buildRequestProposal", () => manager.interface.encodeFunctionData("buildRequestProposal", [1, DESCRIPTION])],
      ["settleRequest", () => manager.interface.encodeFunctionData("settleRequest", [1])],
      ["rejectRequest", () => manager.interface.encodeFunctionData("rejectRequest", [1])],
      ["withdrawBondExcess", () => manager.interface.encodeFunctionData("withdrawBondExcess", [comptroller.address])],
      ["topUpBond", () => manager.interface.encodeFunctionData("topUpBond", [comptroller.address, 1])],
      ["seizeBond", () => manager.interface.encodeFunctionData("seizeBond", [comptroller.address, 1, other.address])],
      ["releaseBond", () => manager.interface.encodeFunctionData("releaseBond", [comptroller.address])],
      ["sweepToken", () => manager.interface.encodeFunctionData("sweepToken", [bondToken.address, other.address, 1])],
    ];

    for (const [name, callData] of reEntries) {
      it(`rejects re-entry into ${name}`, async () => {
        // A bond token that calls back into the manager while the manager pulls it
        const token = await new FaucetTokenReEntrantHarness__factory(owner).deploy(
          0,
          "Re-entrant",
          18,
          "RE",
          callData(),
          "transferFrom",
        );
        await token.allocateTo(deployer.address, BOND);
        await token.connect(deployer).approve(manager.address, BOND);
        await policyRegistry.setBondAssetFactor(token.address, e18("1"));

        await expect(requestPool(undefined, undefined, poolOf({ bondAsset: token.address }))).to.be.revertedWith(
          "ReentrancyGuard: reentrant call",
        );
      });
    }
  });
});

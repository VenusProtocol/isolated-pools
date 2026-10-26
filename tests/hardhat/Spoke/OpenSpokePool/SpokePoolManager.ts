import { FakeContract, smock } from "@defi-wonderland/smock";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  FaucetTokenReEntrantHarness__factory,
  FeeToken__factory,
  IBondAccount,
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
  SpokePoolManager__factory,
  TierRegistry,
  VToken,
} from "../../../../typechain";
import { NO_ESTIMATE, PoolStatus, RequestStatus, RequestType, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const POOL_NAME = "Open Pool";
const DESCRIPTION = "# VIP";
const PROPOSAL = "0x1234";
const EXIT_PROPOSAL = "0xabcd";
const FORCE_CLOSE_PROPOSAL = "0xef01";
const BOND = e18("1000");
const SEED = e18("10");
const LOAN_CAP = e18("500000");
const MAX_POOL_MARKETS = 5;
const WIND_DOWN_PERIOD = 7 * 24 * 60 * 60;
/// Mirrors `IRiskStewardReceiver.UpdateStatus`, in declaration order
const UpdateStatus = { None: 0, Pending: 1, Executed: 2, Rejected: 3, Expired: 4 };
/// The receiver's `UPDATE_EXPIRATION_TIME`
const UPDATE_EXPIRATION_TIME = 2 * 24 * 60 * 60;
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const NEW_POOL_PARAMS = {
  closeFactor: e18("0.4"),
  liquidationIncentive: e18("1.2"),
  minLiquidatableCollateral: e18("50"),
};
const MARKET_PARAMS = (irm: string) => ({
  collateralInterestRateModel: irm,
  reserveFactor: e18("0.1"),
  reduceReservesBlockDelta: 28800,
  maxStalePeriod: 24 * 60 * 60,
  cooldownPeriod: 60 * 60,
  triggerThreshold: e18("0.1"),
  resetThreshold: e18("0.05"),
});
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
};

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
  let feed: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let oracle: FakeContract<ResilientOracleInterface & IResilientOracle>;
  let riskOracle: FakeContract<IRiskOracle>;
  let receiver: FakeContract<IRiskStewardReceiver>;
  let builder: FakeContract<ISpokePoolProposalBuilder>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let bondManager: FakeContract<ISpokeBondManager>;
  let bondAccount: FakeContract<IBondAccount>;
  let comptroller: FakeContract<SpokeComptroller>;
  let vTokenA: FakeContract<VToken>;
  let vTokenB: FakeContract<VToken>;
  let vTokenC: FakeContract<VToken>;
  let tierRegistry: TierRegistry;
  let bondToken: MockToken;
  let collateralAsset: MockToken;
  let loanAsset: MockToken;
  let manager: SpokePoolManager;

  const collateralMarket = (overrides: object = {}) => ({
    asset: collateralAsset.address,
    collateralFactor: e18("0.4"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("1000"),
    feed: feed.address,
    ...overrides,
  });

  const loanMarket = (overrides: object = {}) => ({
    asset: loanAsset.address,
    interestRateModel: irm.address,
    ...overrides,
  });

  const marketsOf = (collateralMarkets: object[] = [], loanMarkets: object[] = []) => ({
    collateralMarkets,
    loanMarkets,
  });

  const poolOf = (overrides: object = {}) => ({
    tierId: 1,
    poolName: POOL_NAME,
    bondAsset: bondToken.address,
    bondAmount: BOND,
    ...overrides,
  });

  /// The ResilientOracle's config of an asset it prices
  const tokenConfig = (asset: string) => ({
    asset,
    oracles: [constants.AddressZero, constants.AddressZero, constants.AddressZero],
    enableFlagsForOracles: [false, false, false],
    cachingEnabled: false,
  });

  const tier = (minBondUsd: BigNumberish, loanCap: BigNumberish, limits: object = {}) => ({
    enabled: true,
    minBondUsd,
    limits: { ...LIMITS, ...limits },
    loanAssets: [{ asset: loanAsset.address, supplyCap: loanCap, interestRateModels: [irm.address] }],
  });

  const managerFactory = async () => {
    const library = await (await ethers.getContractFactory("SpokePoolManagerLib")).deploy();
    return ethers.getContractFactory<SpokePoolManager__factory>("SpokePoolManager", {
      libraries: { SpokePoolManagerLib: library.address },
    });
  };

  const deployManager = async () =>
    (await upgrades.deployProxy(await managerFactory(), [acm.address], {
      constructorArgs: [oracle.address, riskOracle.address, receiver.address, tierRegistry.address],
      unsafeAllowLinkedLibraries: true,
    })) as SpokePoolManager;

  const expectMarkets = (actual: object[], expected: object[]) => {
    expect(actual.length).to.equal(expected.length);
    actual.forEach((market, i) => expectFields(market, expected[i]));
  };

  const requestPool = async (
    markets = marketsOf([collateralMarket()], [loanMarket()]),
    bondAmount: BigNumberish = BOND,
  ) => {
    await manager.connect(deployer).requestPool(poolOf({ bondAmount }), markets);
    return manager.requestCount();
  };

  /// Sets the live pool's bond principal and value
  const setBond = (amount: BigNumberish) => {
    bondAccount.principal.returns(amount);
    bondAccount.value.returns(amount);
  };

  /// Builds a request's VIP, with the builder returning `vTokens`, and returns the build id
  const build = async (requestId: BigNumberish, vTokens: string[] = [vTokenA.address, vTokenB.address]) => {
    builder.buildRequestProposal.returns([comptroller.address, vTokens, PROPOSAL]);
    await manager.buildRequestProposal(requestId, DESCRIPTION);
    return manager.buildCount();
  };

  const settle = (requestId: BigNumberish, buildId: BigNumberish) =>
    manager.connect(timelock).settleRequest(requestId, buildId);

  /// Takes a pool request through build and settle: pool Live, vTokenA collateral and vTokenB loan
  const activatePool = async () => {
    const requestId = await requestPool();
    await settle(requestId, await build(requestId));
  };

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
    [owner, deployer, timelock, other, irm, yieldGroup, feed] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    oracle = await smock.fake<ResilientOracleInterface & IResilientOracle>([
      ...ResilientOracleInterface__factory.abi,
      ...IResilientOracle__factory.abi,
    ]);
    oracle.getPrice.returns(e18("1"));
    oracle.getUnderlyingPrice.returns(e18("1"));
    // Every asset is priced by the ResilientOracle, so no market's feed is read
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

    bondToken = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    collateralAsset = await new MockToken__factory(owner).deploy("Collateral", "COL", 18);
    loanAsset = await new MockToken__factory(owner).deploy("Loan", "LOAN", 18);
    for (const token of [bondToken, collateralAsset, loanAsset]) {
      await token.connect(deployer).faucet(e18("100000"));
    }

    tierRegistry = (await upgrades.deployProxy(await ethers.getContractFactory("TierRegistry"), [
      acm.address,
    ])) as TierRegistry;
    await tierRegistry.setTier(1, tier(e18("1000"), LOAN_CAP));
    await tierRegistry.setTier(
      2,
      tier(e18("2000"), e18("600000"), { maxCollateralFactor: e18("0.6"), maxLiquidationThreshold: e18("0.7") }),
    );

    manager = await deployManager();
    for (const token of [bondToken, collateralAsset, loanAsset]) {
      await token.connect(deployer).approve(manager.address, constants.MaxUint256);
    }
    bondManager.SPOKE_POOL_MANAGER.returns(manager.address);
    bondManager.assetConfigs.returns([2, yieldGroup.address, true, e18("1")]);
    bondManager.bondAccounts.returns(bondAccount.address);
    bondAccount.value.returns(BOND);
    bondAccount.asset.returns(bondToken.address);
    bondAccount.principal.returns(BOND);
    comptroller.isMarketListed.returns(true);
    comptroller.markets.returns([true, e18("0.4"), e18("0.6")]);
    comptroller.getAllMarkets.returns([vTokenA.address, vTokenB.address]);

    await manager.setProposalBuilder(builder.address);
    await manager.setBondManager(bondManager.address);
    await manager.setPoolParams(POOL_PARAMS);
    await manager.setMarketParams(MARKET_PARAMS(irm.address));
    await manager.setWindDownPeriod(WIND_DOWN_PERIOD);
  });

  describe("constructor and initialize", () => {
    it("stores the immutables and the access control manager", async () => {
      expect(await manager.RESILIENT_ORACLE()).to.equal(oracle.address);
      expect(await manager.RISK_ORACLE()).to.equal(riskOracle.address);
      expect(await manager.RISK_STEWARD_RECEIVER()).to.equal(receiver.address);
      expect(await manager.TIER_REGISTRY()).to.equal(tierRegistry.address);
      expect(await manager.accessControlManager()).to.equal(acm.address);
      expect(await manager.owner()).to.equal(owner.address);
    });

    it("reverts when any address is zero", async () => {
      const factory = await managerFactory();
      const args: [string, string, string, string] = [
        oracle.address,
        riskOracle.address,
        receiver.address,
        tierRegistry.address,
      ];
      for (let i = 0; i < args.length; i++) {
        const zeroed = [...args] as [string, string, string, string];
        zeroed[i] = constants.AddressZero;
        await expect(factory.deploy(...zeroed)).to.be.revertedWithCustomError(factory, "ZeroAddressNotAllowed");
      }
    });

    it("reverts when the receiver reads another RiskOracle", async () => {
      receiver.RISK_ORACLE.returns(other.address);
      const factory = await managerFactory();
      await expect(factory.deploy(oracle.address, riskOracle.address, receiver.address, tierRegistry.address))
        .to.be.revertedWithCustomError(factory, "InvalidRiskStewardReceiver")
        .withArgs(receiver.address);
    });

    it("cannot be initialized twice", async () => {
      await expect(manager.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("access control", () => {
    it("needs the ACM role for every governance function", async () => {
      const m = () => manager.connect(other);
      const calls: [string, () => Promise<unknown>][] = [
        ["setOracleFeed(uint256,address,address)", () => m().setOracleFeed(1, collateralAsset.address, feed.address)],
        ["buildRequestProposal(uint256,string)", () => m().buildRequestProposal(1, DESCRIPTION)],
        ["rejectRequest(uint256)", () => m().rejectRequest(1)],
        ["pauseDeployer(address)", () => m().pauseDeployer(comptroller.address)],
        ["unpauseDeployer(address)", () => m().unpauseDeployer(comptroller.address)],
        [
          "buildExitProposal(address,uint256[],string)",
          () => m().buildExitProposal(comptroller.address, [], DESCRIPTION),
        ],
        [
          "buildForceCloseProposal(address,string)",
          () => m().buildForceCloseProposal(comptroller.address, DESCRIPTION),
        ],
        ["rejectExit(address)", () => m().rejectExit(comptroller.address)],
        ["closePool(address)", () => m().closePool(comptroller.address)],
        ["settleRequest(uint256,uint256)", () => m().settleRequest(1, 1)],
        ["startWindDown(address,uint256)", () => m().startWindDown(comptroller.address, 1)],
        ["handoverPoolToGovernance(address)", () => m().handoverPoolToGovernance(comptroller.address)],
        ["seizeBond(address,uint256,address)", () => m().seizeBond(comptroller.address, 1, other.address)],
        ["setProposalBuilder(address)", () => m().setProposalBuilder(builder.address)],
        ["setBondManager(address)", () => m().setBondManager(bondManager.address)],
        ["setHubYieldGroup(address,address)", () => m().setHubYieldGroup(loanAsset.address, yieldGroup.address)],
        ["setPoolParams(PoolParams)", () => m().setPoolParams(POOL_PARAMS)],
        ["setMarketParams(ProtocolMarketParams)", () => m().setMarketParams(MARKET_PARAMS(irm.address))],
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
    it("stores the request, pulls the bond and seeds and emits RequestSubmitted", async () => {
      const markets = marketsOf([collateralMarket()], [loanMarket()]);
      const tx = manager.connect(deployer).requestPool(poolOf(), markets);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(1, RequestType.Pool, deployer.address, constants.AddressZero);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND.mul(-1), BOND]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED.mul(-1), SEED]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [SEED.mul(-1), SEED]);

      const request = await manager.getRequest(1);
      expectFields(request, {
        requestType: RequestType.Pool,
        status: RequestStatus.Pending,
        deployer: deployer.address,
        comptroller: constants.AddressZero,
        tierId: 1,
        buildId: 0,
        poolName: POOL_NAME,
        bondAsset: bondToken.address,
        bondAmount: BOND,
      });
      expectMarkets(request.collateralMarkets, markets.collateralMarkets);
      expectMarkets(request.loanMarkets, markets.loanMarkets);
      expect(request.seeds).to.deep.equal([SEED, SEED]);
      expect(await manager.requestCount()).to.equal(1);
      expect(await manager.latestRequestIds(deployer.address)).to.equal(1);
      expect(await manager.escrowedAmounts(bondToken.address)).to.equal(BOND);
      expect(await manager.escrowedAmounts(collateralAsset.address)).to.equal(SEED);
    });

    it("reverts while the caller has an active pool", async () => {
      await activatePool();
      await expect(requestPool()).to.be.revertedWithCustomError(manager, "ActivePoolExists").withArgs(deployer.address);
    });

    it("reverts while the caller has an open request, and allows a new one once it closes", async () => {
      await requestPool();
      await expect(requestPool()).to.be.revertedWithCustomError(manager, "OpenRequestExists").withArgs(1);

      await manager.connect(deployer).cancelRequest(1);
      expect(await requestPool()).to.equal(2);
    });

    it("reverts on a disabled or unset tier", async () => {
      await tierRegistry.setTier(1, { ...tier(e18("1000"), e18("500000")), enabled: false });
      for (const tierId of [1, 9]) {
        await expect(manager.connect(deployer).requestPool(poolOf({ tierId }), marketsOf()))
          .to.be.revertedWithCustomError(manager, "TierDisabled")
          .withArgs(tierId);
      }
    });

    it("reverts on a bond asset the bond manager does not allow", async () => {
      bondManager.assetConfigs.returns([2, yieldGroup.address, false, e18("1")]);
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "InvalidBondAsset")
        .withArgs(bondToken.address);
    });

    it("reverts when the bond is worth less than the tier's minimum times the asset's factor", async () => {
      bondManager.assetConfigs.returns([2, yieldGroup.address, true, e18("1.5")]);
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(BOND, e18("1500"));
      expect(await requestPool(undefined, e18("1500"))).to.equal(1);
    });

    it("reverts when a transfer delivers a different amount", async () => {
      const feeToken = await new FeeToken__factory(owner).deploy(0, "Fee", 18, "FEE", 100, owner.address);
      await feeToken.allocateTo(deployer.address, e18("10000"));
      await feeToken.connect(deployer).approve(manager.address, constants.MaxUint256);

      await expect(requestPool(marketsOf([collateralMarket({ asset: feeToken.address })])))
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
      await expect(
        manager.connect(deployer).requestPool(poolOf({ bondAsset: feeToken.address }), marketsOf([collateralMarket()])),
      )
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
    });
  });

  describe("requestNewMarkets", () => {
    beforeEach(activatePool);

    it("stores a markets request on the pool's tier and pulls the seeds", async () => {
      const markets = marketsOf([collateralMarket({ asset: bondToken.address })]);
      const tx = manager.connect(deployer).requestNewMarkets(comptroller.address, markets);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Markets, deployer.address, comptroller.address);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [SEED.mul(-1), SEED]);

      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.Markets,
        status: RequestStatus.Pending,
        deployer: deployer.address,
        comptroller: comptroller.address,
        tierId: 1,
        bondAmount: 0,
      });
      expectMarkets(request.collateralMarkets, markets.collateralMarkets);
      expect(request.seeds).to.deep.equal([SEED]);
    });

    it("reverts for anyone but the pool's deployer", async () => {
      await expect(manager.connect(other).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()])))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
    });

    it("reverts while the deployer is paused or the pool is not live", async () => {
      await manager.pauseDeployer(comptroller.address);
      await expect(manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()])))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);

      await manager.unpauseDeployer(comptroller.address);
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()])))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts while the deployer has an open request", async () => {
      setBond(e18("2000"));
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);
    });
  });

  describe("requestTierUpgrade", () => {
    beforeEach(activatePool);

    it("stores a tier request once the bond's principal pays for the target tier", async () => {
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InsufficientBondValue")
        .withArgs(BOND, e18("2000"));

      setBond(e18("2000"));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Tier, deployer.address, comptroller.address);
      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.Tier,
        status: RequestStatus.Pending,
        comptroller: comptroller.address,
        tierId: 2,
      });
      expect(request.collateralMarkets.length).to.equal(0);
      expect(request.loanMarkets.length).to.equal(0);
    });

    it("reverts when the target is not an upgrade", async () => {
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 1))
        .to.be.revertedWithCustomError(manager, "NotAnUpgrade")
        .withArgs(1, 1);
      await tierRegistry.setTier(2, tier(e18("2000"), e18("100")));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "NotAnUpgrade")
        .withArgs(1, 2);
    });

    it("reverts for anyone but an active deployer of a live pool", async () => {
      await expect(manager.connect(other).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("cancelRequest and rejectRequest", () => {
    it("cancel refunds the bond and seeds", async () => {
      await requestPool();
      const tx = manager.connect(deployer).cancelRequest(1);

      await expect(tx).to.emit(manager, "RequestCanceled").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Canceled);
      expect(await manager.escrowedAmounts(bondToken.address)).to.equal(0);
    });

    it("reject refunds the bond and seeds", async () => {
      await requestPool();
      const tx = manager.rejectRequest(1);

      await expect(tx).to.emit(manager, "RequestRejected").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Rejected);
    });

    it("reject refunds a markets request's seeds, and its built VIP then reverts", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      const buildId = await build(2, [vTokenC.address]);

      await expect(manager.rejectRequest(2)).to.changeTokenBalances(
        collateralAsset,
        [deployer, manager],
        [SEED, SEED.mul(-1)],
      );
      await expect(settle(2, buildId)).to.be.revertedWithCustomError(manager, "InvalidBuild").withArgs(buildId);
    });

    it("cancel works only before the build; a feed update makes the request cancelable again", async () => {
      const requestId = await requestPool();
      await build(requestId);
      await expect(manager.connect(other).cancelRequest(requestId))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await expect(manager.connect(deployer).cancelRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);

      await manager.setOracleFeed(requestId, collateralAsset.address, feed.address);
      const tx = manager.connect(deployer).cancelRequest(requestId);
      await expect(tx).to.emit(manager, "RequestCanceled").withArgs(requestId);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
    });

    it("reverts for anyone but the deployer, or on a closed request", async () => {
      await requestPool();
      await expect(manager.connect(other).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await manager.rejectRequest(1);
      await expect(manager.connect(deployer).cancelRequest(1))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);
      await expect(manager.rejectRequest(1)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(1);
    });
  });

  describe("buildRequestProposal", () => {
    it("stores the build, records loan markets and emits RequestBuilt", async () => {
      await requestPool();
      builder.buildRequestProposal.returns([comptroller.address, [vTokenA.address, vTokenB.address], PROPOSAL]);

      await expect(manager.buildRequestProposal(1, DESCRIPTION, NO_ESTIMATE))
        .to.emit(manager, "RequestBuilt")
        .withArgs(1, 1, [vTokenA.address, vTokenB.address]);
      expect(builder.buildRequestProposal).to.have.been.calledOnceWith(1, 1, DESCRIPTION);

      const request = await manager.getRequest(1);
      expectFields(request, {
        status: RequestStatus.Built,
        buildId: 1,
        comptroller: comptroller.address,
      });
      expect(await manager.requestProposals(1)).to.equal(PROPOSAL);
      expect(await manager.isLoanMarket(vTokenA.address)).to.equal(false);
      expect(await manager.isLoanMarket(vTokenB.address)).to.equal(true);
      expect(await manager.buildCount()).to.equal(1);
    });

    it("rebuilds, and only the latest build settles", async () => {
      const requestId = await requestPool();
      const firstBuildId = await build(requestId);
      const secondBuildId = await build(requestId);

      expect(secondBuildId).to.equal(firstBuildId.add(1));
      await expect(settle(requestId, firstBuildId))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(firstBuildId);
      await expect(settle(requestId, secondBuildId)).to.emit(manager, "RequestSettled");
    });

    it("builds a pool request without checking its bond or tier again", async () => {
      await requestPool();
      bondManager.assetConfigs.returns([2, yieldGroup.address, false, e18("1")]);
      oracle.getPrice.whenCalledWith(bondToken.address).returns(e18("0.5"));
      await tierRegistry.setTier(1, { ...tier(e18("1000"), e18("500000")), enabled: false });

      await build(1);
      expectFields(await manager.getRequest(1), { status: RequestStatus.Built, buildId: 1 });
    });

    it("needs a live pool for a markets request", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      await manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION);
      await expect(manager.buildRequestProposal(2, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("builds a tier request without checking the upgrade or the bond again", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      setBond(BOND);
      oracle.getPrice.returns(e18("0.5"));
      await tierRegistry.setTier(2, { ...tier(e18("2000"), e18("600000")), enabled: false });

      await build(2, []);
      expectFields(await manager.getRequest(2), { status: RequestStatus.Built, buildId: 2 });
    });

    it("reverts on a closed request", async () => {
      await requestPool();
      await manager.connect(deployer).cancelRequest(1);
      await expect(manager.buildRequestProposal(1, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);
    });
  });

  describe("market checks", () => {
    const collateralOf = (...tokens: MockToken[]) =>
      marketsOf(tokens.map(token => collateralMarket({ asset: token.address })));

    it("reject an empty market list", async () => {
      await expect(requestPool(marketsOf())).to.be.revertedWithCustomError(manager, "InvalidArrayLength");
    });

    it("cap a pool's markets at the builder's maximum, counting its listed ones", async () => {
      await expect(requestPool(marketsOf([], Array(MAX_POOL_MARKETS + 1).fill(loanMarket()))))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(MAX_POOL_MARKETS + 1, MAX_POOL_MARKETS);

      await activatePool();
      comptroller.getAllMarkets.returns([vTokenA.address, vTokenB.address, vTokenC.address, other.address]);
      await expect(
        manager
          .connect(deployer)
          .requestNewMarkets(comptroller.address, marketsOf([collateralMarket()], [loanMarket()])),
      )
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(MAX_POOL_MARKETS + 1, MAX_POOL_MARKETS);
    });

    it("cap a pool's collateral markets at its tier's, counting its listed ones but not its loan markets", async () => {
      const extra = await new MockToken__factory(owner).deploy("Extra", "EXT", 18);
      await expect(requestPool(collateralOf(collateralAsset, bondToken, loanAsset, extra)))
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(4, LIMITS.maxCollateralMarkets);

      // The pool lists vTokenA as a collateral market and vTokenB as a loan market
      await activatePool();
      await expect(
        manager.connect(deployer).requestNewMarkets(comptroller.address, collateralOf(bondToken, loanAsset, extra)),
      )
        .to.be.revertedWithCustomError(manager, "TooManyMarkets")
        .withArgs(4, LIMITS.maxCollateralMarkets);
      await manager.connect(deployer).requestNewMarkets(comptroller.address, collateralOf(bondToken, loanAsset));
    });

    it("reject an asset listed twice or already in the pool", async () => {
      await expect(requestPool(marketsOf([collateralMarket(), collateralMarket()])))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(collateralAsset.address);

      await activatePool();
      poolRegistry.getVTokenForAsset
        .whenCalledWith(comptroller.address, collateralAsset.address)
        .returns(vTokenA.address);
      await expect(manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()])))
        .to.be.revertedWithCustomError(manager, "DuplicateAsset")
        .withArgs(collateralAsset.address);
    });

    it("reject a collateral factor above the threshold or a seed above the market's supply cap", async () => {
      await expect(
        requestPool(marketsOf([collateralMarket({ collateralFactor: e18("0.5"), liquidationThreshold: e18("0.4") })])),
      )
        .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
        .withArgs(collateralAsset.address);
      await expect(requestPool(marketsOf([collateralMarket({ supplyCap: SEED.sub(1) })])))
        .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
        .withArgs(collateralAsset.address);

      await tierRegistry.setTier(1, tier(e18("1000"), SEED.sub(1)));
      await expect(requestPool(marketsOf([], [loanMarket()])))
        .to.be.revertedWithCustomError(manager, "InvalidMarketParams")
        .withArgs(loanAsset.address);
    });

    it("reject a loan asset the tier does not offer or an interest rate model it does not allow", async () => {
      await expect(requestPool(marketsOf([], [loanMarket({ asset: collateralAsset.address })])))
        .to.be.revertedWithCustomError(manager, "LoanAssetNotAllowed")
        .withArgs(collateralAsset.address);
      await expect(requestPool(marketsOf([], [loanMarket({ interestRateModel: other.address })])))
        .to.be.revertedWithCustomError(manager, "InterestRateModelNotAllowed")
        .withArgs(other.address);
    });

    it("reject a collateral factor or liquidation threshold above the tier's", async () => {
      for (const overrides of [
        { collateralFactor: e18("0.51"), liquidationThreshold: e18("0.6") },
        { liquidationThreshold: e18("0.66") },
      ]) {
        await expect(requestPool(marketsOf([collateralMarket(overrides)])))
          .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
          .withArgs(collateralAsset.address);
      }
    });

    it("reject a collateral supply cap worth more than the tier allows", async () => {
      oracle.getPrice.whenCalledWith(collateralAsset.address).returns(e18("1000.001"));
      await expect(requestPool())
        .to.be.revertedWithCustomError(manager, "ExceedsTierLimit")
        .withArgs(collateralAsset.address);

      // 1,000 units at $1,000 is exactly the tier's $1,000,000
      oracle.getPrice.whenCalledWith(collateralAsset.address).returns(e18("1000"));
      await requestPool();
    });

    describe("at build", () => {
      beforeEach(async () => {
        await requestPool();
      });

      it("top a seed now worth less than $10 up from the deployer", async () => {
        oracle.getPrice.whenCalledWith(loanAsset.address).returns(e18("0.5"));
        builder.buildRequestProposal.returns([comptroller.address, [vTokenA.address, vTokenB.address], PROPOSAL]);
        await expect(manager.buildRequestProposal(1, DESCRIPTION)).to.changeTokenBalances(
          loanAsset,
          [deployer, manager],
          [SEED.mul(-1), SEED],
        );
        expect((await manager.getRequest(1)).seeds).to.deep.equal([SEED, SEED.mul(2)]);
      });

      it("check the markets against the tier's current terms again", async () => {
        await tierRegistry.setTier(1, { ...tier(e18("1000"), LOAN_CAP), loanAssets: [] });
        await expect(manager.buildRequestProposal(1, DESCRIPTION))
          .to.be.revertedWithCustomError(manager, "LoanAssetNotAllowed")
          .withArgs(loanAsset.address);
      });
    });
  });

  describe("settleRequest", () => {
    it("activates a pool request's pool, creates its bond and sends the seeds to the timelock", async () => {
      const requestId = await requestPool();
      const buildId = await build(requestId);
      const tx = settle(requestId, buildId);

      await expect(tx).to.emit(manager, "PoolActivated").withArgs(requestId, comptroller.address, deployer.address);
      await expect(tx).to.emit(manager, "RequestSettled").withArgs(requestId, comptroller.address);
      await expect(tx).to.changeTokenBalances(collateralAsset, [manager, timelock], [SEED.mul(-1), SEED]);
      await expect(tx).to.changeTokenBalances(loanAsset, [manager, timelock], [SEED.mul(-1), SEED]);
      expect(bondManager.createBond).to.have.been.calledWith(
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
        tierId: 1,
        exitBuildId: 0,
      });
      expect(await manager.activePools(deployer.address)).to.equal(comptroller.address);
      for (const token of [bondToken, collateralAsset, loanAsset]) {
        expect(await manager.escrowedAmounts(token.address)).to.equal(0);
      }
    });

    it("settles a markets request's seeds to the timelock", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      const buildId = await build(2, [vTokenC.address]);

      await expect(settle(2, buildId)).to.changeTokenBalances(
        collateralAsset,
        [manager, timelock],
        [SEED.mul(-1), SEED],
      );
      expect((await manager.getRequest(2)).status).to.equal(RequestStatus.Settled);
    });

    it("moves a tier request's pool to its tier", async () => {
      await activatePool();
      setBond(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      const buildId = await build(2, []);

      await expect(settle(2, buildId)).to.emit(manager, "PoolTierUpgraded").withArgs(comptroller.address, 1, 2);
      expect((await manager.getPool(comptroller.address)).tierId).to.equal(2);
    });

    it("reverts on a request that is not built with this build", async () => {
      const requestId = await requestPool();
      await expect(settle(requestId, 0)).to.be.revertedWithCustomError(manager, "InvalidBuild").withArgs(0);
      const buildId = await build(requestId);
      await expect(settle(requestId, buildId.add(1)))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(buildId.add(1));
      await settle(requestId, buildId);
      await expect(settle(requestId, buildId)).to.be.revertedWithCustomError(manager, "InvalidBuild").withArgs(buildId);
    });

    it("needs a live pool for a markets or tier request", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      const buildId = await build(2, [vTokenC.address]);
      await manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION);
      await expect(settle(2, buildId))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
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
        await set(deployer, e18("0.45"), e18("0.6"));
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

      it("reverts when the bond's coverage is below the tier's minimum", async () => {
        bondAccount.value.returns(e18("700"));
        await expect(set(deployer, e18("0.45"), e18("0.6")))
          .to.be.revertedWithCustomError(manager, "CoverageTooLow")
          .withArgs(e18("0.7"), e18("0.8"));
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
      const set = (cap: BigNumberish) =>
        manager.connect(deployer).setCollateralSupplyCap(comptroller.address, vTokenA.address, cap, NO_ESTIMATE);

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

      it("reverts on low coverage, a pending update or a loan market", async () => {
        bondAccount.value.returns(e18("799"));
        await expect(set(e18("1"))).to.be.revertedWithCustomError(manager, "CoverageTooLow");

        bondAccount.value.returns(BOND);
        latestUpdate(1, UpdateStatus.None, await time.latest());
        await expect(set(e18("1")))
          .to.be.revertedWithCustomError(manager, "PreviousUpdatePending")
          .withArgs(vTokenA.address);

        await expect(manager.connect(deployer).setCollateralSupplyCap(comptroller.address, vTokenB.address, 1))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
      });
    });

    describe("pauseCollateralSupply", () => {
      it("publishes a supply pause without checking coverage", async () => {
        bondAccount.value.returns(0);
        await manager.connect(deployer).pauseCollateralSupply(comptroller.address, vTokenA.address, NO_ESTIMATE);
        publishedWith("supplyPause", vTokenA.address, "0x");
      });

      it("reverts on a loan market or for anyone but an active deployer", async () => {
        await expect(manager.connect(deployer).pauseCollateralSupply(comptroller.address, vTokenB.address))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
        await expect(manager.connect(other).pauseCollateralSupply(comptroller.address, vTokenA.address))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
      });
    });

    it("the supply cap and supply pause stop once the deployer asks to exit", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      for (const call of [
        () => manager.connect(deployer).setCollateralSupplyCap(comptroller.address, vTokenA.address, e18("2000")),
        () => manager.connect(deployer).pauseCollateralSupply(comptroller.address, vTokenA.address),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(comptroller.address);
      }
    });

    describe("claimBondYield and topUpBond", () => {
      it("claims the yield and tops up the bond, even while the deployer is paused", async () => {
        await manager.pauseDeployer(comptroller.address);
        await manager.connect(deployer).claimBondYield(comptroller.address);
        expect(bondManager.claimYield).to.have.been.calledWith(comptroller.address);

        await expect(manager.connect(deployer).topUpBond(comptroller.address, e18("50"))).to.changeTokenBalances(
          bondToken,
          [deployer, manager],
          [e18("50").mul(-1), e18("50")],
        );
        expect(bondManager.topUp).to.have.been.calledWith(comptroller.address, e18("50"));
        expect(await bondToken.allowance(manager.address, bondManager.address)).to.equal(e18("50"));
        expect(await manager.escrowedAmounts(bondToken.address)).to.equal(0);
      });

      it("keep working after the deployer asks to exit", async () => {
        await manager.connect(deployer).requestExit(comptroller.address);
        await manager.connect(deployer).claimBondYield(comptroller.address);
        await manager.connect(deployer).topUpBond(comptroller.address, e18("50"));
        expect(bondManager.claimYield).to.have.been.calledOnceWith(comptroller.address);
        expect(bondManager.topUp).to.have.been.calledOnceWith(comptroller.address, e18("50"));
      });

      it("reverts for anyone but the deployer", async () => {
        await expect(manager.connect(other).claimBondYield(comptroller.address))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
        await expect(manager.connect(other).topUpBond(comptroller.address, 1))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
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

    const buildExit = async () => {
      await manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION);
      return manager.buildCount();
    };

    it("requestExit marks the pool and needs a live pool and an active deployer", async () => {
      await expect(manager.connect(other).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.emit(manager, "ExitRequested")
        .withArgs(comptroller.address);
      expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.ExitRequested);
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("requestExit waits for the deployer's pending request to close", async () => {
      await manager.connect(deployer).requestNewMarkets(comptroller.address, marketsOf([collateralMarket()]));
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);

      await manager.connect(deployer).cancelRequest(2);
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.emit(manager, "ExitRequested")
        .withArgs(comptroller.address);
    });

    it("requestExit waits for the deployer's built request to close", async () => {
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

    it("builds an exit from a live pool or a requested or built exit", async () => {
      await expect(manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION, NO_ESTIMATE))
        .to.emit(manager, "ExitBuilt")
        .withArgs(comptroller.address, 2);
      expect(builder.buildExitProposal).to.have.been.calledOnceWith(comptroller.address, 2, [e18("0.7")], DESCRIPTION);
      expectFields(await manager.getPool(comptroller.address), { status: PoolStatus.ExitProposed, exitBuildId: 2 });
      expect(await manager.exitProposals(comptroller.address)).to.equal(EXIT_PROPOSAL);

      expect(await buildExit()).to.equal(3);
      expect((await manager.getPool(comptroller.address)).exitBuildId).to.equal(3);
    });

    it("startWindDown accepts only the latest exit build", async () => {
      const firstBuildId = await buildExit();
      const secondBuildId = await buildExit();
      await expect(manager.connect(timelock).startWindDown(comptroller.address, firstBuildId))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(firstBuildId);

      await expect(manager.connect(timelock).startWindDown(comptroller.address, secondBuildId))
        .to.emit(manager, "WindDownStarted")
        .withArgs(comptroller.address);
      expectFields(await manager.getPool(comptroller.address), {
        status: PoolStatus.WindingDown,
        windDownStartedAt: await time.latest(),
      });
      await expect(manager.buildExitProposal(comptroller.address, [], DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("rejectExit returns the pool to live and voids its exit VIP", async () => {
      const buildId = await buildExit();
      await expect(manager.rejectExit(comptroller.address))
        .to.emit(manager, "ExitRejected")
        .withArgs(comptroller.address);
      expectFields(await manager.getPool(comptroller.address), { status: PoolStatus.Live, exitBuildId: 0 });
      await expect(manager.connect(timelock).startWindDown(comptroller.address, buildId))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(buildId);
      await expect(manager.rejectExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    describe("after the wind-down starts", () => {
      beforeEach(async () => {
        await manager.connect(timelock).startWindDown(comptroller.address, await buildExit());
      });

      it("builds the force close only after the wind-down period", async () => {
        await expect(manager.buildForceCloseProposal(comptroller.address, DESCRIPTION)).to.be.revertedWithCustomError(
          manager,
          "WindDownPeriodNotElapsed",
        );
        await time.increase(WIND_DOWN_PERIOD);
        await expect(manager.buildForceCloseProposal(comptroller.address, DESCRIPTION, NO_ESTIMATE))
          .to.emit(manager, "ForceCloseBuilt")
          .withArgs(comptroller.address);
        expect(builder.buildForceCloseProposal).to.have.been.calledOnceWith(comptroller.address, DESCRIPTION);
        expect(await manager.exitProposals(comptroller.address)).to.equal(FORCE_CLOSE_PROPOSAL);
      });

      it("closePool accrues the pool's interest and closes it once its borrows and bad debt are low enough", async () => {
        vTokenA.totalBorrowsCurrent.returns(e18("3"));
        vTokenA.badDebt.returns(e18("1"));
        oracle.getUnderlyingPrice.whenCalledWith(vTokenA.address).returns(e18("2"));
        await manager.setMaxResidualPoolDebtUsd(e18("7.99"));
        await expect(manager.closePool(comptroller.address))
          .to.be.revertedWithCustomError(manager, "ResidualDebtExceeded")
          .withArgs(e18("8"));

        await manager.setMaxResidualPoolDebtUsd(e18("8"));
        await expect(manager.closePool(comptroller.address))
          .to.emit(manager, "PoolClosed")
          .withArgs(comptroller.address);
        expect(vTokenA.totalBorrowsCurrent).to.have.been.called;
        expect(vTokenB.totalBorrowsCurrent).to.have.been.called;
        expect(oracle.getUnderlyingPrice).to.not.have.been.calledWith(vTokenB.address);
        expect(bondManager.release).to.have.been.calledWith(comptroller.address);
        expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.Closed);
        expect(await manager.activePools(deployer.address)).to.equal(constants.AddressZero);
        expect(await requestPool()).to.equal(2);
      });
    });

    it("closePool and buildForceCloseProposal need a winding-down pool", async () => {
      for (const call of [
        () => manager.closePool(comptroller.address),
        () => manager.buildForceCloseProposal(comptroller.address, DESCRIPTION),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(manager, "InvalidPoolStatus").withArgs(comptroller.address);
      }
    });
  });

  describe("handoverPoolToGovernance", () => {
    beforeEach(activatePool);

    it("hands over a pool whose exit is requested and releases its bond", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.handoverPoolToGovernance(comptroller.address))
        .to.emit(manager, "PoolHandedOver")
        .withArgs(comptroller.address);
      expect(bondManager.release).to.have.been.calledWith(comptroller.address);
      expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.HandedOver);
      expect(await manager.activePools(deployer.address)).to.equal(constants.AddressZero);
    });

    it("hands over a pool whose exit VIP is built, which then fails to start the wind-down", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION);
      await manager.handoverPoolToGovernance(comptroller.address);
      expect((await manager.getPool(comptroller.address)).status).to.equal(PoolStatus.HandedOver);
      await expect(manager.startWindDown(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(2);
    });

    it("reverts while a market has bad debt or before the deployer asks to exit", async () => {
      await expect(manager.handoverPoolToGovernance(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);

      await manager.connect(deployer).requestExit(comptroller.address);
      vTokenB.badDebt.returns(1);
      await expect(manager.handoverPoolToGovernance(comptroller.address))
        .to.be.revertedWithCustomError(manager, "BadDebtOutstanding")
        .withArgs(vTokenB.address);
    });
  });

  describe("seizeBond", () => {
    it("seizes from the pool's bond to the receiver", async () => {
      bondManager.seize.returns(e18("5"));
      expect(await manager.callStatic.seizeBond(comptroller.address, e18("7"), other.address)).to.equal(e18("5"));
      await manager.seizeBond(comptroller.address, e18("7"), other.address);
      expect(bondManager.seize).to.have.been.calledWith(comptroller.address, e18("7"), other.address);
    });

    it("reverts on a zero receiver", async () => {
      await expect(manager.seizeBond(comptroller.address, 1, constants.AddressZero)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
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

    it("setBondManager sets a bond manager of this manager once", async () => {
      expect(await manager.bondManager()).to.equal(bondManager.address);
      await expect(manager.setBondManager(bondManager.address)).to.be.revertedWithCustomError(
        manager,
        "BondManagerAlreadySet",
      );

      const fresh = await deployManager();
      await expect(fresh.setBondManager(bondManager.address))
        .to.be.revertedWithCustomError(fresh, "InvalidBondManager")
        .withArgs(bondManager.address);
      bondManager.SPOKE_POOL_MANAGER.returns(fresh.address);
      await expect(fresh.setBondManager(bondManager.address))
        .to.emit(fresh, "BondManagerSet")
        .withArgs(bondManager.address);
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

    it("setPoolParams sets new pools' params within the comptroller's bounds", async () => {
      await expect(manager.setPoolParams(NEW_POOL_PARAMS)).to.emit(manager, "PoolParamsUpdated");
      expectFields(await manager.poolParams(), NEW_POOL_PARAMS);
      for (const params of [
        { ...POOL_PARAMS, closeFactor: e18("0.049") },
        { ...POOL_PARAMS, closeFactor: e18("0.91") },
        { ...POOL_PARAMS, liquidationIncentive: e18("1.049") },
      ]) {
        await expect(manager.setPoolParams(params)).to.be.revertedWithCustomError(manager, "InvalidPoolParams");
      }
    });

    it("setMarketParams sets new markets' params", async () => {
      const params = { ...MARKET_PARAMS(other.address), reserveFactor: e18("1") };
      await expect(manager.setMarketParams(params)).to.emit(manager, "MarketParamsUpdated");
      expectFields(await manager.marketParams(), params);
      for (const invalid of [
        MARKET_PARAMS(constants.AddressZero),
        { ...params, reserveFactor: e18("1").add(1) },
        { ...params, reduceReservesBlockDelta: 0 },
        { ...params, maxStalePeriod: 0 },
      ]) {
        await expect(manager.setMarketParams(invalid)).to.be.revertedWithCustomError(
          manager,
          "InvalidProtocolMarketParams",
        );
      }
    });

    it("setWindDownPeriod and setMaxResidualPoolDebtUsd set the exit parameters", async () => {
      await expect(manager.setWindDownPeriod(100))
        .to.emit(manager, "WindDownPeriodUpdated")
        .withArgs(WIND_DOWN_PERIOD, 100);
      expect(await manager.windDownPeriod()).to.equal(100);
      await expect(manager.setWindDownPeriod(0)).to.be.revertedWithCustomError(manager, "ZeroValueNotAllowed");

      await expect(manager.setMaxResidualPoolDebtUsd(e18("10")))
        .to.emit(manager, "MaxResidualPoolDebtUsdUpdated")
        .withArgs(0, e18("10"));
      expect(await manager.maxResidualPoolDebtUsd()).to.equal(e18("10"));
    });
  });

  describe("sweepToken", () => {
    it("sweeps what is not escrowed", async () => {
      await requestPool();
      await collateralAsset.connect(deployer).transfer(manager.address, e18("3"));

      await expect(manager.sweepToken(collateralAsset.address, other.address, e18("3")))
        .to.emit(manager, "SweepToken")
        .withArgs(collateralAsset.address, other.address, e18("3"));
      expect(await collateralAsset.balanceOf(other.address)).to.equal(e18("3"));
      await expect(manager.sweepToken(collateralAsset.address, other.address, 1))
        .to.be.revertedWithCustomError(manager, "InsufficientAmount")
        .withArgs(collateralAsset.address, 1);
    });

    it("reverts on a zero receiver", async () => {
      await expect(manager.sweepToken(bondToken.address, constants.AddressZero, 0)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("reentrancy", () => {
    const reEntries: [string, () => string][] = [
      ["requestPool", () => manager.interface.encodeFunctionData("requestPool", [poolOf(), marketsOf()])],
      [
        "requestNewMarkets",
        () => manager.interface.encodeFunctionData("requestNewMarkets", [comptroller.address, marketsOf()]),
      ],
      ["cancelRequest", () => manager.interface.encodeFunctionData("cancelRequest", [1])],
      ["rejectRequest", () => manager.interface.encodeFunctionData("rejectRequest", [1])],
      ["settleRequest", () => manager.interface.encodeFunctionData("settleRequest", [1, 1])],
    ];

    for (const [name, callData] of reEntries) {
      it(`rejects re-entry into ${name}`, async () => {
        // A seed token that calls back into the manager while the manager pulls it
        const token = await new FaucetTokenReEntrantHarness__factory(owner).deploy(
          0,
          "Re-entrant",
          18,
          "RE",
          callData(),
          "transferFrom",
        );
        await token.allocateTo(deployer.address, SEED);
        await token.connect(deployer).approve(manager.address, SEED);

        await expect(requestPool(marketsOf([collateralMarket({ asset: token.address })]))).to.be.revertedWith(
          "ReentrancyGuard: reentrant call",
        );
      });
    }
  });
});

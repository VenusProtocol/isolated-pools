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
  IRiskOracle,
  IRiskStewardReceiver,
  ISpokeBondManager,
  ISpokePoolBuilder,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
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
const WIND_DOWN_PERIOD = 7 * 24 * 60 * 60;
/// Mirrors `IRiskStewardReceiver.UpdateStatus`, in declaration order
const UpdateStatus = { None: 0, Pending: 1, Executed: 2, Rejected: 3, Expired: 4 };
/// The receiver's `UPDATE_EXPIRATION_TIME`
const UPDATE_EXPIRATION_TIME = 2 * 24 * 60 * 60;
const POOL_DEFAULTS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const NEW_POOL_PARAMS = {
  closeFactor: e18("0.4"),
  liquidationIncentive: e18("1.2"),
  minLiquidatableCollateral: e18("50"),
};
const ZERO_POOL_PARAMS = { closeFactor: 0, liquidationIncentive: 0, minLiquidatableCollateral: 0 };
const MARKET_DEFAULTS = (irm: string) => ({
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
  let acm: FakeContract<AccessControlManager>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let riskOracle: FakeContract<IRiskOracle>;
  let receiver: FakeContract<IRiskStewardReceiver>;
  let builder: FakeContract<ISpokePoolBuilder>;
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
    isLoanMarket: false,
    name: "Venus Collateral",
    symbol: "vCOL",
    collateralFactor: e18("0.4"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("1000"),
    interestRateModel: constants.AddressZero,
    seed: SEED,
    ...overrides,
  });

  const loanMarket = (overrides: object = {}) => ({
    asset: loanAsset.address,
    isLoanMarket: true,
    name: "Venus Loan",
    symbol: "vLOAN",
    collateralFactor: 0,
    liquidationThreshold: 0,
    supplyCap: 0,
    interestRateModel: irm.address,
    seed: SEED,
    ...overrides,
  });

  const tier = (minBondUsd: BigNumberish, loanCap: BigNumberish, limits: object = {}) => ({
    enabled: true,
    minBondUsd,
    limits: { ...LIMITS, ...limits },
    loanAssets: [{ asset: loanAsset.address, supplyCap: loanCap, interestRateModels: [irm.address] }],
  });

  const deployManager = async () =>
    (await upgrades.deployProxy(await ethers.getContractFactory("SpokePoolManager"), [acm.address], {
      constructorArgs: [oracle.address, riskOracle.address, receiver.address, tierRegistry.address],
    })) as SpokePoolManager;

  const expectMarkets = (actual: object[], expected: object[]) => {
    expect(actual.length).to.equal(expected.length);
    actual.forEach((market, i) => expectFields(market, expected[i]));
  };

  const requestPool = async (markets: object[] = [collateralMarket(), loanMarket()], bondAmount = BOND) => {
    await manager.connect(deployer).requestPool(1, POOL_NAME, bondToken.address, bondAmount, markets);
    return manager.requestCount();
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

  /// Checks the builder's first `validateMarkets` call since its last reset
  const expectValidated = (comptrollerAddress: string, tierId: number, marketCount: number) => {
    const { args } = builder.validateMarkets.getCall(0);
    expect(args[0]).to.equal(comptrollerAddress);
    expect(args[1]).to.equal(tierId);
    expect(args[2].length).to.equal(marketCount);
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
    [owner, deployer, timelock, other, irm, yieldGroup] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    oracle.getPrice.returns(e18("1"));
    oracle.getUnderlyingPrice.returns(e18("1"));
    riskOracle = await smock.fake<IRiskOracle>("IRiskOracle");
    receiver = await smock.fake<IRiskStewardReceiver>("IRiskStewardReceiver");
    receiver.RISK_ORACLE.returns(riskOracle.address);
    receiver.UPDATE_EXPIRATION_TIME.returns(UPDATE_EXPIRATION_TIME);
    builder = await smock.fake<ISpokePoolBuilder>("ISpokePoolBuilder");
    builder.buildExitProposal.returns(EXIT_PROPOSAL);
    builder.buildForceCloseProposal.returns(FORCE_CLOSE_PROPOSAL);
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
    await tierRegistry.setTier(1, tier(e18("1000"), e18("500000")));
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
    bondManager.getBondValueUsd.returns(BOND);
    bondAccount.asset.returns(bondToken.address);
    bondAccount.principal.returns(BOND);
    comptroller.isMarketListed.returns(true);
    comptroller.markets.returns([true, e18("0.4"), e18("0.6")]);
    comptroller.getAllMarkets.returns([vTokenA.address, vTokenB.address]);

    await manager.setPoolBuilder(builder.address);
    await manager.setBondManager(bondManager.address);
    await manager.setPoolDefaults(POOL_DEFAULTS);
    await manager.setMarketDefaults(MARKET_DEFAULTS(irm.address));
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
      const factory = await ethers.getContractFactory<SpokePoolManager__factory>("SpokePoolManager");
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
      const factory = await ethers.getContractFactory<SpokePoolManager__factory>("SpokePoolManager");
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
        [
          "editRequest(uint256,PoolParams,DeployerMarketParams[])",
          () => m().editRequest(1, POOL_DEFAULTS, [collateralMarket()]),
        ],
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
        ["setPoolBuilder(address)", () => m().setPoolBuilder(builder.address)],
        ["setBondManager(address)", () => m().setBondManager(bondManager.address)],
        ["setHubYieldGroup(address,address)", () => m().setHubYieldGroup(loanAsset.address, yieldGroup.address)],
        ["setPoolDefaults(PoolParams)", () => m().setPoolDefaults(POOL_DEFAULTS)],
        ["setMarketDefaults(ProtocolMarketParams)", () => m().setMarketDefaults(MARKET_DEFAULTS(irm.address))],
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
      const markets = [collateralMarket(), loanMarket()];
      const tx = manager.connect(deployer).requestPool(1, POOL_NAME, bondToken.address, BOND, markets);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(1, RequestType.Pool, deployer.address, constants.AddressZero);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND.mul(-1), BOND]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED.mul(-1), SEED]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [SEED.mul(-1), SEED]);
      expectValidated(constants.AddressZero, 1, 2);

      const request = await manager.getRequest(1);
      expectFields(request, {
        requestType: RequestType.Pool,
        status: RequestStatus.Pending,
        approved: true,
        deployer: deployer.address,
        comptroller: constants.AddressZero,
        tierId: 1,
        buildId: 0,
        poolName: POOL_NAME,
        bondAsset: bondToken.address,
        bondAmount: BOND,
      });
      expectFields(request.params, POOL_DEFAULTS);
      expectMarkets(request.markets, markets);
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
        await expect(manager.connect(deployer).requestPool(tierId, POOL_NAME, bondToken.address, BOND, []))
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

    it("reverts when the builder rejects the markets", async () => {
      builder.validateMarkets.reverts("invalid markets");
      await expect(requestPool()).to.be.revertedWith("invalid markets");
    });

    it("reverts when a transfer delivers a different amount", async () => {
      const feeToken = await new FeeToken__factory(owner).deploy(0, "Fee", 18, "FEE", 100, owner.address);
      await feeToken.allocateTo(deployer.address, e18("10000"));
      await feeToken.connect(deployer).approve(manager.address, constants.MaxUint256);

      await expect(requestPool([collateralMarket({ asset: feeToken.address })]))
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
      await expect(manager.connect(deployer).requestPool(1, POOL_NAME, feeToken.address, BOND, []))
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
    });
  });

  describe("requestNewMarkets", () => {
    beforeEach(activatePool);

    it("stores a markets request on the pool's tier and pulls the seeds", async () => {
      const markets = [collateralMarket({ asset: bondToken.address })];
      builder.validateMarkets.reset();
      const tx = manager.connect(deployer).requestNewMarkets(comptroller.address, markets);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Markets, deployer.address, comptroller.address);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [SEED.mul(-1), SEED]);
      expectValidated(comptroller.address, 1, 1);

      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.Markets,
        status: RequestStatus.Pending,
        approved: true,
        deployer: deployer.address,
        comptroller: comptroller.address,
        tierId: 1,
        bondAmount: 0,
      });
      expectMarkets(request.markets, markets);
    });

    it("reverts for anyone but the pool's deployer", async () => {
      await expect(manager.connect(other).requestNewMarkets(comptroller.address, [collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
    });

    it("reverts while the deployer is paused or the pool is not live", async () => {
      await manager.pauseDeployer(comptroller.address);
      await expect(manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);

      await manager.unpauseDeployer(comptroller.address);
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts while the deployer has an open request", async () => {
      bondAccount.principal.returns(e18("2000"));
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
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

      bondAccount.principal.returns(e18("2000"));
      await expect(manager.connect(deployer).requestTierUpgrade(comptroller.address, 2))
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Tier, deployer.address, comptroller.address);
      const request = await manager.getRequest(2);
      expectFields(request, {
        requestType: RequestType.Tier,
        status: RequestStatus.Pending,
        approved: true,
        comptroller: comptroller.address,
        tierId: 2,
      });
      expect(request.markets.length).to.equal(0);
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

  describe("editRequest", () => {
    it("replaces the markets and params, refunds the seeds and clears approval", async () => {
      await requestPool();
      const markets = [loanMarket({ seed: e18("20") }), collateralMarket({ asset: bondToken.address })];
      builder.validateMarkets.reset();
      const tx = manager.editRequest(1, NEW_POOL_PARAMS, markets);

      await expect(tx).to.emit(manager, "RequestEdited").withArgs(1);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
      await expect(tx).to.changeTokenBalances(loanAsset, [deployer, manager], [SEED, SEED.mul(-1)]);
      expectValidated(constants.AddressZero, 1, 2);

      const request = await manager.getRequest(1);
      expectFields(request, { status: RequestStatus.Pending, approved: false, buildId: 0, bondAmount: BOND });
      expectFields(request.params, NEW_POOL_PARAMS);
      expectMarkets(request.markets, markets);
      expect(await manager.escrowedAmounts(collateralAsset.address)).to.equal(0);
      expect(await manager.escrowedAmounts(loanAsset.address)).to.equal(0);
      expect(await manager.escrowedAmounts(bondToken.address)).to.equal(BOND);
    });

    it("refunds nothing more on a second edit before approval", async () => {
      await requestPool();
      await manager.editRequest(1, POOL_DEFAULTS, [collateralMarket()]);
      await expect(manager.editRequest(1, POOL_DEFAULTS, [loanMarket()])).to.changeTokenBalances(
        collateralAsset,
        [deployer, manager],
        [0, 0],
      );
      expectMarkets((await manager.getRequest(1)).markets, [loanMarket()]);
    });

    it("voids a built request's VIP", async () => {
      const requestId = await requestPool();
      const buildId = await build(requestId);
      await manager.editRequest(requestId, POOL_DEFAULTS, [collateralMarket()]);

      expectFields(await manager.getRequest(requestId), { status: RequestStatus.Pending, buildId: 0 });
      await expect(settle(requestId, buildId)).to.be.revertedWithCustomError(manager, "InvalidBuild").withArgs(buildId);
    });

    it("leaves a markets request's params unset", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
      await manager.editRequest(2, ZERO_POOL_PARAMS, [collateralMarket({ seed: e18("1") })]);
      expectFields((await manager.getRequest(2)).params, ZERO_POOL_PARAMS);
    });

    it("reverts on a tier request, invalid pool params or a closed request", async () => {
      await requestPool();
      await expect(
        manager.editRequest(1, { ...POOL_DEFAULTS, closeFactor: e18("0.01") }, [collateralMarket()]),
      ).to.be.revertedWithCustomError(manager, "InvalidPoolParams");

      await manager.connect(deployer).cancelRequest(1);
      await expect(manager.editRequest(1, POOL_DEFAULTS, [collateralMarket()]))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);

      await activatePool();
      bondAccount.principal.returns(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      await expect(manager.editRequest(3, POOL_DEFAULTS, []))
        .to.be.revertedWithCustomError(manager, "InvalidRequestType")
        .withArgs(3);
    });
  });

  describe("approveRequest", () => {
    it("pulls the edited request's seeds again", async () => {
      await requestPool();
      await manager.editRequest(1, POOL_DEFAULTS, [collateralMarket({ seed: e18("20") })]);

      const tx = manager.connect(deployer).approveRequest(1);
      await expect(tx).to.emit(manager, "RequestApproved").withArgs(1);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [e18("20").mul(-1), e18("20")]);
      expect((await manager.getRequest(1)).approved).to.equal(true);
      expect(await manager.escrowedAmounts(collateralAsset.address)).to.equal(e18("20"));
    });

    it("pulls nothing when the request is already approved", async () => {
      await requestPool();
      await expect(manager.connect(deployer).approveRequest(1)).to.changeTokenBalances(
        collateralAsset,
        [deployer, manager],
        [0, 0],
      );
    });

    it("reverts for anyone but the deployer, or on a closed request", async () => {
      await requestPool();
      await expect(manager.connect(other).approveRequest(1))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await manager.connect(deployer).cancelRequest(1);
      await expect(manager.connect(deployer).approveRequest(1))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(1);
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

    it("reject refunds only the bond of an unapproved request", async () => {
      await requestPool();
      await manager.editRequest(1, POOL_DEFAULTS, [collateralMarket()]);
      const tx = manager.rejectRequest(1);

      await expect(tx).to.emit(manager, "RequestRejected").withArgs(1);
      await expect(tx).to.changeTokenBalances(bondToken, [deployer, manager], [BOND, BOND.mul(-1)]);
      await expect(tx).to.changeTokenBalances(collateralAsset, [deployer, manager], [0, 0]);
      expect((await manager.getRequest(1)).status).to.equal(RequestStatus.Rejected);
    });

    it("reject refunds a markets request's seeds, and its built VIP then reverts", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
      const buildId = await build(2, [vTokenC.address]);

      await expect(manager.rejectRequest(2)).to.changeTokenBalances(
        collateralAsset,
        [deployer, manager],
        [SEED, SEED.mul(-1)],
      );
      await expect(settle(2, buildId)).to.be.revertedWithCustomError(manager, "InvalidBuild").withArgs(buildId);
    });

    it("cancel works only before the build; an edit makes the request cancelable again", async () => {
      const requestId = await requestPool();
      await build(requestId);
      await expect(manager.connect(other).cancelRequest(requestId))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(other.address);
      await expect(manager.connect(deployer).cancelRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);

      await manager.editRequest(requestId, POOL_DEFAULTS, [collateralMarket()]);
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
        approved: true,
        buildId: 1,
        comptroller: comptroller.address,
      });
      expect(request.vTokens).to.deep.equal([vTokenA.address, vTokenB.address]);
      expect(await manager.getRequestProposal(1)).to.equal(PROPOSAL);
      expect(await manager.isLoanMarket(vTokenA.address)).to.equal(false);
      expect(await manager.isLoanMarket(vTokenB.address)).to.equal(true);
      expect(await manager.buildCount()).to.equal(1);
    });

    it("rebuilds without a new approval, and only the latest build settles", async () => {
      const requestId = await requestPool();
      const firstBuildId = await build(requestId);
      const secondBuildId = await build(requestId);

      expect(secondBuildId).to.equal(firstBuildId.add(1));
      await expect(settle(requestId, firstBuildId))
        .to.be.revertedWithCustomError(manager, "InvalidBuild")
        .withArgs(firstBuildId);
      await expect(settle(requestId, secondBuildId)).to.emit(manager, "RequestSettled");
    });

    it("reverts on an unapproved request", async () => {
      await requestPool();
      await manager.editRequest(1, POOL_DEFAULTS, [collateralMarket()]);
      await expect(manager.buildRequestProposal(1, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "RequestNotApproved")
        .withArgs(1);
    });

    it("builds a pool request without checking its bond or tier again", async () => {
      await requestPool();
      bondManager.assetConfigs.returns([2, yieldGroup.address, false, e18("1")]);
      oracle.getPrice.returns(e18("0.5"));
      await tierRegistry.setTier(1, { ...tier(e18("1000"), e18("500000")), enabled: false });

      await build(1);
      expectFields(await manager.getRequest(1), { status: RequestStatus.Built, buildId: 1 });
    });

    it("needs a live pool for a markets request", async () => {
      await activatePool();
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
      await manager.buildExitProposal(comptroller.address, [e18("0.7")], DESCRIPTION);
      await expect(manager.buildRequestProposal(2, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("builds a tier request without checking the upgrade or the bond again", async () => {
      await activatePool();
      bondAccount.principal.returns(e18("2000"));
      await manager.connect(deployer).requestTierUpgrade(comptroller.address, 2);
      bondAccount.principal.returns(BOND);
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
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
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
      bondAccount.principal.returns(e18("2000"));
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
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
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
        bondManager.getBondValueUsd.returns(e18("700"));
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
        comptroller.isMarketListed.returns(false);
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
        bondManager.getBondValueUsd.returns(e18("799"));
        await expect(set(e18("1"))).to.be.revertedWithCustomError(manager, "CoverageTooLow");

        bondManager.getBondValueUsd.returns(BOND);
        latestUpdate(1, UpdateStatus.None, await time.latest());
        await expect(set(e18("1")))
          .to.be.revertedWithCustomError(manager, "PreviousUpdatePending")
          .withArgs(vTokenA.address);

        await expect(manager.connect(deployer).setCollateralSupplyCap(comptroller.address, vTokenB.address, 1))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
      });
    });

    describe("pauseCollateralMint", () => {
      it("publishes a MINT pause without checking coverage", async () => {
        bondManager.getBondValueUsd.returns(0);
        await manager.connect(deployer).pauseCollateralMint(comptroller.address, vTokenA.address, NO_ESTIMATE);
        publishedWith("pauseActions", vTokenA.address, defaultAbiCoder.encode(["uint8[]"], [[0]]));
      });

      it("reverts on a loan market or for anyone but an active deployer", async () => {
        await expect(manager.connect(deployer).pauseCollateralMint(comptroller.address, vTokenB.address))
          .to.be.revertedWithCustomError(manager, "InvalidMarketType")
          .withArgs(vTokenB.address);
        await expect(manager.connect(other).pauseCollateralMint(comptroller.address, vTokenA.address))
          .to.be.revertedWithCustomError(manager, "NotDeployer")
          .withArgs(other.address);
      });
    });

    it("the supply cap and mint pause stop once the deployer asks to exit", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      for (const call of [
        () => manager.connect(deployer).setCollateralSupplyCap(comptroller.address, vTokenA.address, e18("2000")),
        () => manager.connect(deployer).pauseCollateralMint(comptroller.address, vTokenA.address),
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
      await manager.connect(deployer).requestNewMarkets(comptroller.address, [collateralMarket()]);
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);

      await manager.connect(deployer).cancelRequest(2);
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.emit(manager, "ExitRequested")
        .withArgs(comptroller.address);
    });

    it("requestExit waits for the deployer's built request to close", async () => {
      bondAccount.principal.returns(e18("2000"));
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
      expect(await manager.getExitProposal(comptroller.address)).to.equal(EXIT_PROPOSAL);

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
        expect(await manager.getExitProposal(comptroller.address)).to.equal(FORCE_CLOSE_PROPOSAL);
      });

      it("closePool closes the pool once its residual debt is low enough", async () => {
        builder.accrueAndCheckResidualDebt.reverts("residual debt");
        await expect(manager.closePool(comptroller.address)).to.be.revertedWith("residual debt");

        builder.accrueAndCheckResidualDebt.reset();
        await expect(manager.closePool(comptroller.address))
          .to.emit(manager, "PoolClosed")
          .withArgs(comptroller.address);
        expect(builder.accrueAndCheckResidualDebt).to.have.been.calledWith(comptroller.address);
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
    it("setPoolBuilder replaces the builder", async () => {
      await expect(manager.setPoolBuilder(other.address))
        .to.emit(manager, "PoolBuilderUpdated")
        .withArgs(builder.address, other.address);
      expect(await manager.poolBuilder()).to.equal(other.address);
      await expect(manager.setPoolBuilder(constants.AddressZero)).to.be.revertedWithCustomError(
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

    it("setPoolDefaults sets new pools' params within the comptroller's bounds", async () => {
      await expect(manager.setPoolDefaults(NEW_POOL_PARAMS)).to.emit(manager, "PoolDefaultsUpdated");
      expectFields(await manager.poolDefaults(), NEW_POOL_PARAMS);
      for (const params of [
        { ...POOL_DEFAULTS, closeFactor: e18("0.049") },
        { ...POOL_DEFAULTS, closeFactor: e18("0.91") },
        { ...POOL_DEFAULTS, liquidationIncentive: e18("1.049") },
      ]) {
        await expect(manager.setPoolDefaults(params)).to.be.revertedWithCustomError(manager, "InvalidPoolParams");
      }
    });

    it("setMarketDefaults sets new markets' params", async () => {
      const defaults = { ...MARKET_DEFAULTS(other.address), reserveFactor: e18("1") };
      await expect(manager.setMarketDefaults(defaults)).to.emit(manager, "MarketDefaultsUpdated");
      expectFields(await manager.marketDefaults(), defaults);
      for (const params of [
        MARKET_DEFAULTS(constants.AddressZero),
        { ...defaults, reserveFactor: e18("1").add(1) },
        { ...defaults, reduceReservesBlockDelta: 0 },
      ]) {
        await expect(manager.setMarketDefaults(params)).to.be.revertedWithCustomError(manager, "InvalidMarketDefaults");
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
      [
        "requestPool",
        () => manager.interface.encodeFunctionData("requestPool", [1, POOL_NAME, bondToken.address, BOND, []]),
      ],
      ["requestNewMarkets", () => manager.interface.encodeFunctionData("requestNewMarkets", [comptroller.address, []])],
      ["approveRequest", () => manager.interface.encodeFunctionData("approveRequest", [1])],
      ["cancelRequest", () => manager.interface.encodeFunctionData("cancelRequest", [1])],
      ["editRequest", () => manager.interface.encodeFunctionData("editRequest", [1, POOL_DEFAULTS, []])],
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

        await expect(requestPool([collateralMarket({ asset: token.address })])).to.be.revertedWith(
          "ReentrancyGuard: reentrant call",
        );
      });
    }
  });
});

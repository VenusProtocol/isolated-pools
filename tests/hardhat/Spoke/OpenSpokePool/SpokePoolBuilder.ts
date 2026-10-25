import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { defaultAbiCoder, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  IDeviationBoundedOracle,
  IGovernorBravo,
  IGovernorBravo__factory,
  IYieldGroup,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokeComptroller__factory,
  SpokePoolBuilder,
  SpokePoolBuilder__factory,
  SpokePoolManager,
  TierRegistry,
  VToken,
  VToken__factory,
  WhitePaperInterestRateModel,
  WhitePaperInterestRateModel__factory,
} from "../../../../typechain";
import { NO_ESTIMATE, RequestStatus, RequestType, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const MAX_OPERATIONS = 100;
const MAX_POOL_MARKETS = 5;
const BLOCKS_PER_YEAR = 42_048_000;
const TIER_ID = 1;
const UPGRADE_TIER_ID = 2;
const REQUEST_ID = 7;
const BUILD_ID = 11;
const DESCRIPTION = "# Open spoke pool";
const POOL_NAME = "Open Pool";
const LOAN_CAP = e18("500000");
const UPGRADE_CAP = e18("1000000");
const SEED = e18("100");
const RESERVE_FACTOR = e18("0.1");
const REDUCE_RESERVES_BLOCK_DELTA = 28800;
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

describe("SpokePoolBuilder", () => {
  let deployer: SignerWithAddress;
  let timelock: SignerWithAddress;
  let spokeAdapter: SignerWithAddress;
  let protocolShareReserve: SignerWithAddress;
  let shortfall: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let manager: FakeContract<SpokePoolManager>;
  let governor: FakeContract<IGovernorBravo>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let yieldGroup: FakeContract<IYieldGroup>;
  let registry: TierRegistry;
  let usdt: MockToken;
  let colA: MockToken;
  let colB: MockToken;
  let colC: MockToken;
  let loanIrm: WhitePaperInterestRateModel;
  let otherIrm: WhitePaperInterestRateModel;
  let collateralIrm: WhitePaperInterestRateModel;
  let comptrollerBeacon: string;
  let vTokenBeacon: string;
  let builder: SpokePoolBuilder;

  const tier = (loanAssets: object[]) => ({ enabled: true, minBondUsd: e18("100000"), limits: LIMITS, loanAssets });
  const usdtLoanAsset = (supplyCap: BigNumberish = LOAN_CAP) => ({
    asset: usdt.address,
    supplyCap,
    interestRateModels: [loanIrm.address],
  });

  const loanMarket = (overrides: object = {}) => ({
    asset: usdt.address,
    isLoanMarket: true,
    name: "Venus USDT",
    symbol: "vUSDT",
    collateralFactor: 0,
    liquidationThreshold: 0,
    supplyCap: 0,
    interestRateModel: loanIrm.address,
    seed: SEED,
    ...overrides,
  });

  const collateralMarket = (asset: MockToken, overrides: object = {}) => ({
    asset: asset.address,
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

  const request = (overrides: object = {}) => ({
    requestType: RequestType.Pool,
    status: RequestStatus.Pending,
    approved: true,
    deployer: deployer.address,
    comptroller: constants.AddressZero,
    tierId: TIER_ID,
    buildId: 0,
    poolName: POOL_NAME,
    params: POOL_PARAMS,
    bondAsset: constants.AddressZero,
    bondAmount: 0,
    markets: [],
    vTokens: [],
    ...overrides,
  });

  const builderArgs = (): [string, string, string, string, string, string, string, string, string, number] => [
    manager.address,
    governor.address,
    poolRegistry.address,
    boundedOracle.address,
    spokeAdapter.address,
    comptrollerBeacon,
    vTokenBeacon,
    protocolShareReserve.address,
    shortfall.address,
    MAX_POOL_MARKETS,
  ];

  /// Returns the build's comptroller, vTokens and payload, then builds it for real so later reads see its contracts
  const build = async (requestToBuild: object) => {
    manager.getRequest.returns(requestToBuild);
    const caller = builder.connect(manager.wallet);
    const result = await caller.callStatic.buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION);
    await caller.buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION);
    return result;
  };

  const buildReverts = (requestToBuild: object) => {
    manager.getRequest.returns(requestToBuild);
    return expect(builder.connect(manager.wallet).buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION));
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

  /// The four actions that list a market with its seed
  const listing = (market: ReturnType<typeof loanMarket>, vToken: string, supplyCap: BigNumberish): Action[] => [
    [market.asset, "approve(address,uint256)", ["address", "uint256"], [poolRegistry.address, market.seed]],
    [
      poolRegistry.address,
      "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
      ["tuple(address,uint256,uint256,uint256,address,uint256,uint256)"],
      [
        [
          vToken,
          market.collateralFactor,
          market.liquidationThreshold,
          market.seed,
          timelock.address,
          supplyCap,
          market.isLoanMarket ? supplyCap : 0,
        ],
      ],
    ],
    [
      vToken,
      "transfer(address,uint256)",
      ["address", "uint256"],
      [constants.AddressZero, e18("1").mul(market.seed).div(EXCHANGE_RATE)],
    ],
    [vToken, "setReduceReservesBlockDelta(uint256)", ["uint256"], [REDUCE_RESERVES_BLOCK_DELTA]],
  ];

  /// The four actions that register a loan market with its Hub YieldGroup
  const hubRegistration = (comptroller: string, vToken: string, supplyCap: BigNumberish): Action[] => [
    [comptroller, "setSupplyAllowlistEnabled(address,bool)", ["address", "bool"], [vToken, true]],
    [
      comptroller,
      "setAllowedSupplier(address,address,bool)",
      ["address", "address", "bool"],
      [vToken, yieldGroup.address, true],
    ],
    [yieldGroup.address, "addResource(address,address)", ["address", "address"], [vToken, spokeAdapter.address]],
    [yieldGroup.address, "lowerResourceCap(address,uint256)", ["address", "uint256"], [vToken, supplyCap]],
  ];

  const settlement = (): Action => [
    manager.address,
    "settleRequest(uint256,uint256)",
    ["uint256", "uint256"],
    [REQUEST_ID, BUILD_ID],
  ];

  /// A fake comptroller listing `vTokens`; `unlisted` ones are in `getAllMarkets` but not listed
  const fakeComptroller = async (vTokens: string[], unlisted: string[] = []) => {
    const comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
    comptroller.getAllMarkets.returns([...vTokens, ...unlisted]);
    comptroller.isMarketListed.returns(true);
    for (const vToken of unlisted) {
      comptroller.isMarketListed.whenCalledWith(vToken).returns(false);
    }
    return comptroller;
  };

  const fakeLoanVToken = async (underlying: string) => {
    const vToken = await smock.fake<VToken>("VToken");
    vToken.underlying.returns(underlying);
    manager.isLoanMarket.whenCalledWith(vToken.address).returns(true);
    return vToken;
  };

  beforeEach(async () => {
    [deployer, timelock, spokeAdapter, protocolShareReserve, shortfall, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    governor = await smock.fake<IGovernorBravo>("IGovernorBravo");
    governor.proposalMaxOperations.returns(MAX_OPERATIONS);
    governor.proposalTimelocks.returns(timelock.address);
    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    boundedOracle.isBoundedPricingEnabled.returns(true);
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    oracle.getPrice.returns(e18("1"));
    yieldGroup = await smock.fake<IYieldGroup>("IYieldGroup");

    const tokenFactory = new MockToken__factory(deployer);
    usdt = await tokenFactory.deploy("Tether", "USDT", 18);
    colA = await tokenFactory.deploy("Collateral A", "COLA", 18);
    colB = await tokenFactory.deploy("Collateral B", "COLB", 18);
    colC = await tokenFactory.deploy("Collateral C", "COLC", 18);
    const irmFactory = new WhitePaperInterestRateModel__factory(deployer);
    loanIrm = await irmFactory.deploy(0, e18("0.1"), false, BLOCKS_PER_YEAR);
    otherIrm = await irmFactory.deploy(0, e18("0.2"), false, BLOCKS_PER_YEAR);
    collateralIrm = await irmFactory.deploy(0, 0, false, BLOCKS_PER_YEAR);

    registry = (await upgrades.deployProxy(await ethers.getContractFactory("TierRegistry"), [
      acm.address,
    ])) as TierRegistry;
    await registry.setTier(TIER_ID, tier([usdtLoanAsset()]));

    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    manager.TIER_REGISTRY.returns(registry.address);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.accessControlManager.returns(acm.address);
    manager.marketDefaults.returns([collateralIrm.address, RESERVE_FACTOR, REDUCE_RESERVES_BLOCK_DELTA]);
    manager.hubYieldGroups.returns(yieldGroup.address);
    await setBalance(manager.address, e18("100"));

    const beaconFactory = await ethers.getContractFactory("UpgradeableBeacon");
    const comptrollerImplementation = await new SpokeComptroller__factory(deployer).deploy(poolRegistry.address);
    comptrollerBeacon = (await beaconFactory.deploy(comptrollerImplementation.address)).address;
    const vTokenImplementation = await new VToken__factory(deployer).deploy(false, BLOCKS_PER_YEAR, e18("0.000005"));
    vTokenBeacon = (await beaconFactory.deploy(vTokenImplementation.address)).address;

    builder = await new SpokePoolBuilder__factory(deployer).deploy(...builderArgs());
  });

  describe("constructor", () => {
    it("reverts when any address is zero", async () => {
      const factory = new SpokePoolBuilder__factory(deployer);
      const args = builderArgs();
      for (let i = 0; i < args.length - 1; i++) {
        const zeroed = [...args] as typeof args;
        zeroed[i] = constants.AddressZero;
        await expect(factory.deploy(...zeroed)).to.be.revertedWithCustomError(factory, "ZeroAddressNotAllowed");
      }
    });

    it("rejects more markets per pool than a new pool's VIP can hold", async () => {
      const factory = new SpokePoolBuilder__factory(deployer);
      const args = builderArgs();
      // (100 - 3 pool creation actions) / 8 actions per market
      await expect(factory.deploy(...args.slice(0, -1), 13))
        .to.be.revertedWithCustomError(factory, "TooManyMarkets")
        .withArgs(13, 12);
      const largest = await factory.deploy(...args.slice(0, -1), 12);
      expect(await largest.MAX_POOL_MARKETS()).to.equal(12);
    });

    it("stores its dependencies", async () => {
      expect(await builder.SPOKE_POOL_MANAGER()).to.equal(manager.address);
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

  describe("validateMarkets", () => {
    const validate = (markets: object[], comptroller = constants.AddressZero) =>
      builder.validateMarkets(comptroller, TIER_ID, markets as Parameters<SpokePoolBuilder["validateMarkets"]>[2]);

    it("accepts markets that fit the tier", async () => {
      await validate([loanMarket(), collateralMarket(colA), collateralMarket(colB)]);
    });

    it("rejects an empty market list", async () => {
      await expect(validate([])).to.be.revertedWithCustomError(builder, "InvalidArrayLength");
    });

    it("caps a pool's markets, counting its listed ones", async () => {
      const markets = Array(MAX_POOL_MARKETS + 1).fill(loanMarket());
      await expect(validate(markets))
        .to.be.revertedWithCustomError(builder, "TooManyMarkets")
        .withArgs(MAX_POOL_MARKETS + 1, MAX_POOL_MARKETS);

      const comptroller = await fakeComptroller([other.address, timelock.address, shortfall.address, deployer.address]);
      await expect(validate([loanMarket(), collateralMarket(colA)], comptroller.address))
        .to.be.revertedWithCustomError(builder, "TooManyMarkets")
        .withArgs(6, MAX_POOL_MARKETS);
    });

    it("caps a pool's collateral markets at its tier's, counting its listed ones but not its loan markets", async () => {
      await expect(validate([collateralMarket(colA), collateralMarket(colB), collateralMarket(colC)]))
        .to.be.revertedWithCustomError(builder, "TooManyMarkets")
        .withArgs(3, LIMITS.maxCollateralMarkets);

      const listedCollateral = await fakeComptroller([other.address]);
      await expect(validate([collateralMarket(colA), collateralMarket(colB)], listedCollateral.address))
        .to.be.revertedWithCustomError(builder, "TooManyMarkets")
        .withArgs(3, LIMITS.maxCollateralMarkets);

      const listedLoan = await fakeComptroller([other.address]);
      manager.isLoanMarket.whenCalledWith(other.address).returns(true);
      await validate([collateralMarket(colA), collateralMarket(colB)], listedLoan.address);
    });

    it("rejects an asset listed twice or already in the pool", async () => {
      await expect(validate([collateralMarket(colA), collateralMarket(colA)]))
        .to.be.revertedWithCustomError(builder, "DuplicateAsset")
        .withArgs(colA.address);

      const comptroller = await fakeComptroller([]);
      poolRegistry.getVTokenForAsset.whenCalledWith(comptroller.address, colA.address).returns(other.address);
      await expect(validate([collateralMarket(colA)], comptroller.address))
        .to.be.revertedWithCustomError(builder, "DuplicateAsset")
        .withArgs(colA.address);
    });

    it("rejects missing parameters and parameters that do not fit the market's type or seed", async () => {
      const invalid = [
        loanMarket({ name: "" }),
        loanMarket({ symbol: "" }),
        loanMarket({ seed: 0 }),
        loanMarket({ collateralFactor: 1 }),
        loanMarket({ liquidationThreshold: 1 }),
        loanMarket({ supplyCap: 1 }),
        loanMarket({ seed: LOAN_CAP.add(1) }),
        collateralMarket(colA, { interestRateModel: loanIrm.address }),
        collateralMarket(colA, { collateralFactor: e18("0.5"), liquidationThreshold: e18("0.4") }),
        collateralMarket(colA, { seed: e18("1001") }),
      ];
      for (const market of invalid) {
        await expect(validate([market]))
          .to.be.revertedWithCustomError(builder, "InvalidMarketParams")
          .withArgs(market.asset);
      }
    });

    it("rejects a loan market of an asset the tier does not offer", async () => {
      await expect(validate([loanMarket({ asset: colA.address })]))
        .to.be.revertedWithCustomError(builder, "LoanAssetNotAllowed")
        .withArgs(colA.address);
    });

    it("rejects an interest rate model the tier does not allow for the loan market's asset", async () => {
      await registry.setTier(
        TIER_ID,
        tier([usdtLoanAsset(), { asset: colA.address, supplyCap: LOAN_CAP, interestRateModels: [otherIrm.address] }]),
      );
      await expect(validate([loanMarket({ interestRateModel: otherIrm.address })]))
        .to.be.revertedWithCustomError(builder, "InterestRateModelNotAllowed")
        .withArgs(otherIrm.address);
      await validate([loanMarket({ asset: colA.address, interestRateModel: otherIrm.address })]);
    });

    it("rejects a collateral factor or liquidation threshold above the tier's", async () => {
      for (const overrides of [
        { collateralFactor: e18("0.51"), liquidationThreshold: e18("0.6") },
        { liquidationThreshold: e18("0.66") },
      ]) {
        await expect(validate([collateralMarket(colA, overrides)]))
          .to.be.revertedWithCustomError(builder, "ExceedsTierLimit")
          .withArgs(colA.address);
      }
    });
  });

  describe("buildRequestProposal", () => {
    it("can only be called by the manager", async () => {
      await expect(builder.connect(other).buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION))
        .to.be.revertedWithCustomError(builder, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    describe("pool and markets requests", () => {
      it("deploys a new pool's comptroller and markets and builds its listing VIP", async () => {
        // A loan market needs no bounded pricing
        boundedOracle.isBoundedPricingEnabled.whenCalledWith(usdt.address).returns(false);
        const loan = loanMarket();
        const collateral = collateralMarket(colA);
        const [comptroller, vTokens, proposal] = await build(request({ markets: [loan, collateral] }));

        const spoke = SpokeComptroller__factory.connect(comptroller, deployer);
        expect(await spoke.owner()).to.equal(builder.address);
        expect(await spoke.pendingOwner()).to.equal(timelock.address);
        expect(await spoke.oracle()).to.equal(oracle.address);
        expect(await spoke.deviationBoundedOracle()).to.equal(boundedOracle.address);
        expect(await spoke.accessControlManager()).to.equal(acm.address);
        expect(await spoke.maxLoopsLimit()).to.equal(100);

        expect(vTokens).to.have.length(2);
        const expectedMarkets: [typeof loan, string][] = [
          [loan, loanIrm.address],
          [collateral, collateralIrm.address],
        ];
        for (const [i, [market, interestRateModel]] of expectedMarkets.entries()) {
          const vToken = VToken__factory.connect(vTokens[i], deployer);
          expect(await vToken.underlying()).to.equal(market.asset);
          expect(await vToken.comptroller()).to.equal(comptroller);
          expect(await vToken.interestRateModel()).to.equal(interestRateModel);
          expect(await vToken.name()).to.equal(market.name);
          expect(await vToken.symbol()).to.equal(market.symbol);
          expect(await vToken.decimals()).to.equal(8);
          expect(await vToken.exchangeRateStored()).to.equal(EXCHANGE_RATE);
          expect(await vToken.reserveFactorMantissa()).to.equal(RESERVE_FACTOR);
          expect(await vToken.owner()).to.equal(timelock.address);
          expect(await vToken.accessControlManager()).to.equal(acm.address);
          expect(await vToken.shortfall()).to.equal(shortfall.address);
          expect(await vToken.protocolShareReserve()).to.equal(protocolShareReserve.address);
        }

        expectActions(proposal, [
          [comptroller, "acceptOwnership()", [], []],
          [
            poolRegistry.address,
            "addPool(string,address,uint256,uint256,uint256)",
            ["string", "address", "uint256", "uint256", "uint256"],
            [
              POOL_NAME,
              comptroller,
              POOL_PARAMS.closeFactor,
              POOL_PARAMS.liquidationIncentive,
              POOL_PARAMS.minLiquidatableCollateral,
            ],
          ],
          settlement(),
          ...listing(loan, vTokens[0], LOAN_CAP),
          ...hubRegistration(comptroller, vTokens[0], LOAN_CAP),
          ...listing(collateral, vTokens[1], collateral.supplyCap),
        ]);
      });

      it("reuses the pool's comptroller on a rebuild and on a markets request", async () => {
        const [comptroller] = await build(request({ markets: [collateralMarket(colA)] }));

        const [rebuiltComptroller, rebuiltVTokens, rebuilt] = await build(
          request({ comptroller, markets: [collateralMarket(colA)] }),
        );
        expect(rebuiltComptroller).to.equal(comptroller);
        const [, , rebuiltSignatures] = IGovernorBravo__factory.createInterface().decodeFunctionData(
          "propose",
          rebuilt,
        );
        expect(rebuiltSignatures.slice(0, 3)).to.deep.equal([
          "acceptOwnership()",
          "addPool(string,address,uint256,uint256,uint256)",
          "settleRequest(uint256,uint256)",
        ]);
        expect(await VToken__factory.connect(rebuiltVTokens[0], deployer).comptroller()).to.equal(comptroller);

        const collateral = collateralMarket(colB);
        const [marketsComptroller, vTokens, proposal] = await build(
          request({ requestType: RequestType.Markets, comptroller, markets: [collateral] }),
        );
        expect(marketsComptroller).to.equal(comptroller);
        expectActions(proposal, [settlement(), ...listing(collateral, vTokens[0], collateral.supplyCap)]);
      });

      it("rejects a seed worth less than $10", async () => {
        oracle.getPrice.whenCalledWith(usdt.address).returns(e18("0.1"));
        await build(request({ markets: [loanMarket()] }));

        oracle.getPrice.whenCalledWith(usdt.address).returns(e18("0.0999"));
        await buildReverts(request({ markets: [loanMarket()] }))
          .to.be.revertedWithCustomError(builder, "InsufficientSeed")
          .withArgs(usdt.address);
      });

      it("rejects a collateral supply cap worth more than the tier allows", async () => {
        oracle.getPrice.whenCalledWith(colA.address).returns(e18("1000"));
        await build(request({ markets: [collateralMarket(colA)] }));

        oracle.getPrice.whenCalledWith(colA.address).returns(e18("1000.001"));
        await buildReverts(request({ markets: [collateralMarket(colA)] }))
          .to.be.revertedWithCustomError(builder, "ExceedsTierLimit")
          .withArgs(colA.address);
      });

      it("rejects a collateral asset without bounded pricing", async () => {
        boundedOracle.isBoundedPricingEnabled.whenCalledWith(colA.address).returns(false);
        await buildReverts(request({ markets: [collateralMarket(colA)] }))
          .to.be.revertedWithCustomError(builder, "DeviationBoundedOracleNotSet")
          .withArgs(colA.address);
      });

      it("checks the markets against the tier", async () => {
        await buildReverts(request({ markets: [loanMarket({ asset: colA.address })] }))
          .to.be.revertedWithCustomError(builder, "LoanAssetNotAllowed")
          .withArgs(colA.address);
      });
    });

    describe("tier requests", () => {
      let comptroller: FakeContract<SpokeComptroller>;
      let loanVToken: FakeContract<VToken>;
      let collateralVToken: FakeContract<VToken>;

      const tierRequest = (tierId = UPGRADE_TIER_ID) =>
        request({ requestType: RequestType.Tier, comptroller: comptroller.address, tierId });

      const buildTier = async (tierId = UPGRADE_TIER_ID) => {
        manager.getRequest.returns(tierRequest(tierId));
        return builder.connect(manager.wallet).callStatic.buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION);
      };

      const capActions = (cap: BigNumberish): Action[] => [
        [
          comptroller.address,
          "setMarketSupplyCaps(address[],uint256[])",
          ["address[]", "uint256[]"],
          [[loanVToken.address], [cap]],
        ],
        [
          comptroller.address,
          "setMarketBorrowCaps(address[],uint256[])",
          ["address[]", "uint256[]"],
          [[loanVToken.address], [cap]],
        ],
      ];

      const hubCapAction = (signature: string, cap: BigNumberish): Action => [
        yieldGroup.address,
        signature,
        ["address", "uint256"],
        [loanVToken.address, cap],
      ];

      beforeEach(async () => {
        loanVToken = await fakeLoanVToken(usdt.address);
        collateralVToken = await smock.fake<VToken>("VToken");
        const unlistedLoanVToken = await fakeLoanVToken(usdt.address);
        comptroller = await fakeComptroller(
          [loanVToken.address, collateralVToken.address],
          [unlistedLoanVToken.address],
        );
        yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(LOAN_CAP);
        await registry.setTier(UPGRADE_TIER_ID, tier([usdtLoanAsset(UPGRADE_CAP)]));
      });

      it("settles, then sets each listed loan market's caps to the new tier's and raises its Hub cap", async () => {
        const [builtComptroller, vTokens, proposal] = await buildTier();
        expect(builtComptroller).to.equal(comptroller.address);
        expect(vTokens).to.deep.equal([]);
        expectActions(proposal, [
          settlement(),
          ...capActions(UPGRADE_CAP),
          hubCapAction("raiseResourceCap(address,uint256)", UPGRADE_CAP),
        ]);
      });

      it("lowers a Hub cap above the new tier's or uncapped, and leaves an equal one", async () => {
        for (const liveCap of [UPGRADE_CAP.add(1), 0]) {
          yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(liveCap);
          const [, , proposal] = await buildTier();
          expectActions(proposal, [
            settlement(),
            ...capActions(UPGRADE_CAP),
            hubCapAction("lowerResourceCap(address,uint256)", UPGRADE_CAP),
          ]);
        }

        yieldGroup.resourceCap.whenCalledWith(loanVToken.address).returns(UPGRADE_CAP);
        const [, , proposal] = await buildTier();
        expectActions(proposal, [settlement(), ...capActions(UPGRADE_CAP)]);
      });

      it("only settles a pool without loan markets", async () => {
        comptroller.getAllMarkets.returns([collateralVToken.address]);
        const [, , proposal] = await buildTier();
        expectActions(proposal, [settlement()]);
      });

      it("rejects a tier that does not offer one of the pool's loan assets", async () => {
        await registry.setTier(
          3,
          tier([{ asset: colA.address, supplyCap: UPGRADE_CAP, interestRateModels: [loanIrm.address] }]),
        );
        manager.getRequest.returns(tierRequest(3));
        await expect(builder.connect(manager.wallet).buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION))
          .to.be.revertedWithCustomError(builder, "LoanAssetNotAllowed")
          .withArgs(usdt.address);
      });
    });
  });

  describe("buildExitProposal", () => {
    let comptroller: FakeContract<SpokeComptroller>;
    let loanVToken: FakeContract<VToken>;
    let collateralVToken: FakeContract<VToken>;

    beforeEach(async () => {
      loanVToken = await fakeLoanVToken(usdt.address);
      collateralVToken = await smock.fake<VToken>("VToken");
      comptroller = await fakeComptroller([loanVToken.address, collateralVToken.address], [other.address]);
    });

    it("pauses and zeroes the caps of every listed market, raises the collateral thresholds and starts the wind-down", async () => {
      const threshold = e18("0.9");
      const listed = [loanVToken.address, collateralVToken.address];
      const proposal = await builder.buildExitProposal(comptroller.address, BUILD_ID, [0, threshold], DESCRIPTION);
      expectActions(proposal, [
        [
          comptroller.address,
          "setActionsPaused(address[],uint8[],bool)",
          ["address[]", "uint8[]", "bool"],
          [listed, EXIT_PAUSED_ACTIONS, true],
        ],
        [comptroller.address, "setMarketSupplyCaps(address[],uint256[])", ["address[]", "uint256[]"], [listed, [0, 0]]],
        [comptroller.address, "setMarketBorrowCaps(address[],uint256[])", ["address[]", "uint256[]"], [listed, [0, 0]]],
        [
          comptroller.address,
          "setCollateralFactor(address,uint256,uint256)",
          ["address", "uint256", "uint256"],
          [collateralVToken.address, 0, threshold],
        ],
        [manager.address, "startWindDown(address,uint256)", ["address", "uint256"], [comptroller.address, BUILD_ID]],
      ]);
    });

    it("only starts the wind-down of a pool without listed markets", async () => {
      comptroller.getAllMarkets.returns([other.address]);
      const proposal = await builder.buildExitProposal(comptroller.address, BUILD_ID, [], DESCRIPTION);
      expectActions(proposal, [
        [manager.address, "startWindDown(address,uint256)", ["address", "uint256"], [comptroller.address, BUILD_ID]],
      ]);
    });

    it("rejects thresholds that do not match the listed markets", async () => {
      await expect(
        builder.buildExitProposal(comptroller.address, BUILD_ID, [0, 0, 0], DESCRIPTION),
      ).to.be.revertedWithCustomError(builder, "InvalidArrayLength");
    });
  });

  describe("buildForceCloseProposal", () => {
    it("zeroes the collateral factors and forces liquidations on loan markets with borrows", async () => {
      const collateralVToken = await smock.fake<VToken>("VToken");
      const borrowedVToken = await fakeLoanVToken(usdt.address);
      borrowedVToken.totalBorrows.returns(1);
      const repaidVToken = await fakeLoanVToken(usdt.address);
      const comptroller = await fakeComptroller(
        [collateralVToken.address, borrowedVToken.address, repaidVToken.address],
        [other.address],
      );

      const proposal = await builder.buildForceCloseProposal(comptroller.address, DESCRIPTION);
      expectActions(proposal, [
        [
          comptroller.address,
          "setCollateralFactor(address,uint256,uint256)",
          ["address", "uint256", "uint256"],
          [collateralVToken.address, 0, 0],
        ],
        [
          comptroller.address,
          "setForcedLiquidation(address,bool)",
          ["address", "bool"],
          [borrowedVToken.address, true],
        ],
      ]);
    });
  });

  describe("accrueAndCheckResidualDebt", () => {
    let comptroller: FakeContract<SpokeComptroller>;
    let indebtedVToken: FakeContract<VToken>;
    let clearVToken: FakeContract<VToken>;

    beforeEach(async () => {
      indebtedVToken = await smock.fake<VToken>("VToken");
      indebtedVToken.totalBorrowsCurrent.returns(e18("3"));
      indebtedVToken.badDebt.returns(e18("1"));
      clearVToken = await smock.fake<VToken>("VToken");
      comptroller = await fakeComptroller([indebtedVToken.address, clearVToken.address]);
      oracle.getUnderlyingPrice.whenCalledWith(indebtedVToken.address).returns(e18("2"));
    });

    it("accepts borrows and bad debt worth up to the manager's maximum, pricing only markets with debt", async () => {
      manager.maxResidualPoolDebtUsd.returns(e18("8"));
      await builder.accrueAndCheckResidualDebt(comptroller.address, NO_ESTIMATE);
      expect(indebtedVToken.totalBorrowsCurrent).to.have.been.calledOnce;
      expect(clearVToken.totalBorrowsCurrent).to.have.been.calledOnce;
      expect(oracle.getUnderlyingPrice).to.have.been.calledOnceWith(indebtedVToken.address);
    });

    it("rejects borrows and bad debt worth more than the manager's maximum", async () => {
      manager.maxResidualPoolDebtUsd.returns(e18("7.99"));
      await expect(builder.accrueAndCheckResidualDebt(comptroller.address))
        .to.be.revertedWithCustomError(builder, "ResidualDebtExceeded")
        .withArgs(e18("8"));
    });
  });
});

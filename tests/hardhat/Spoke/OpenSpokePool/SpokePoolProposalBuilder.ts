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
  IResilientOracle,
  IYieldGroup,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  SpokeComptroller,
  SpokeComptroller__factory,
  SpokePoolManager,
  SpokePoolProposalBuilder,
  SpokePoolProposalBuilder__factory,
  TierRegistry,
  VToken,
  VToken__factory,
  WhitePaperInterestRateModel,
  WhitePaperInterestRateModel__factory,
} from "../../../../typechain";
import { RequestStatus, RequestType, e18 } from "./utils";

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
const MAX_STALE_PERIOD = 86400;
const COOLDOWN_PERIOD = 3600;
const TRIGGER_THRESHOLD = e18("0.1");
const RESET_THRESHOLD = e18("0.05");
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

describe("SpokePoolProposalBuilder", () => {
  let deployer: SignerWithAddress;
  let timelock: SignerWithAddress;
  let spokeAdapter: SignerWithAddress;
  let protocolShareReserve: SignerWithAddress;
  let shortfall: SignerWithAddress;
  let other: SignerWithAddress;
  let chainlinkOracle: SignerWithAddress;
  let feed: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let manager: FakeContract<SpokePoolManager>;
  let governor: FakeContract<IGovernorBravo>;
  let poolRegistry: FakeContract<PoolRegistry>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let oracle: FakeContract<IResilientOracle>;
  let yieldGroup: FakeContract<IYieldGroup>;
  let registry: TierRegistry;
  let usdt: MockToken;
  let colA: MockToken;
  let colB: MockToken;
  let loanIrm: WhitePaperInterestRateModel;
  let collateralIrm: WhitePaperInterestRateModel;
  let comptrollerBeacon: string;
  let vTokenBeacon: string;
  let builder: SpokePoolProposalBuilder;

  const tier = (loanAssets: object[]) => ({ enabled: true, minBondUsd: e18("100000"), limits: LIMITS, loanAssets });
  const usdtLoanAsset = (supplyCap: BigNumberish = LOAN_CAP) => ({
    asset: usdt.address,
    supplyCap,
    interestRateModels: [loanIrm.address],
  });

  const loanMarket = () => ({ asset: usdt.address, interestRateModel: loanIrm.address });

  const collateralMarket = (asset: MockToken) => ({
    asset: asset.address,
    collateralFactor: e18("0.4"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("1000"),
    feed: feed.address,
  });

  /// A request whose every new market is seeded with `SEED`
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
    buildId: 0,
    poolName: POOL_NAME,
    bondAsset: constants.AddressZero,
    bondAmount: 0,
    collateralMarkets,
    loanMarkets,
    seeds: [...collateralMarkets, ...loanMarkets].map(() => SEED),
    ...overrides,
  });

  const builderArgs = (): [string, string, string, string, string, string, string, string, string, string, number] => [
    manager.address,
    governor.address,
    poolRegistry.address,
    boundedOracle.address,
    chainlinkOracle.address,
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

  /// The four actions that list a market with its seed, given its collateral factor, threshold and supply and borrow caps
  const listing = (asset: string, vToken: string, [cf, lt, supplyCap, borrowCap]: BigNumberish[]): Action[] => [
    [asset, "approve(address,uint256)", ["address", "uint256"], [poolRegistry.address, SEED]],
    [
      poolRegistry.address,
      "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
      ["tuple(address,uint256,uint256,uint256,address,uint256,uint256)"],
      [[vToken, cf, lt, SEED, timelock.address, supplyCap, borrowCap]],
    ],
    [
      vToken,
      "transfer(address,uint256)",
      ["address", "uint256"],
      [constants.AddressZero, e18("1").mul(SEED).div(EXCHANGE_RATE)],
    ],
    [vToken, "setReduceReservesBlockDelta(uint256)", ["uint256"], [REDUCE_RESERVES_BLOCK_DELTA]],
  ];

  /// A collateral market's oracle configs, which the fake oracles do not have yet, then its listing
  const collateralListing = (market: ReturnType<typeof collateralMarket>, vToken: string): Action[] => [
    [
      chainlinkOracle.address,
      "setTokenConfig((address,address,uint256))",
      ["tuple(address,address,uint256)"],
      [[market.asset, market.feed, MAX_STALE_PERIOD]],
    ],
    [
      oracle.address,
      "setTokenConfig((address,address[3],bool[3],bool))",
      ["tuple(address,address[3],bool[3],bool)"],
      [
        [
          market.asset,
          [chainlinkOracle.address, constants.AddressZero, constants.AddressZero],
          [true, false, false],
          false,
        ],
      ],
    ],
    [
      boundedOracle.address,
      "setTokenConfig((address,uint64,uint256,uint256,bool,bool))",
      ["tuple(address,uint64,uint256,uint256,bool,bool)"],
      [[market.asset, COOLDOWN_PERIOD, TRIGGER_THRESHOLD, RESET_THRESHOLD, true, false]],
    ],
    ...listing(market.asset, vToken, [market.collateralFactor, market.liquidationThreshold, market.supplyCap, 0]),
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
    [deployer, timelock, spokeAdapter, protocolShareReserve, shortfall, other, chainlinkOracle, feed] =
      await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    governor = await smock.fake<IGovernorBravo>("IGovernorBravo");
    governor.proposalMaxOperations.returns(MAX_OPERATIONS);
    governor.proposalTimelocks.returns(timelock.address);
    poolRegistry = await smock.fake<PoolRegistry>("PoolRegistry");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    oracle = await smock.fake<IResilientOracle>("IResilientOracle");
    yieldGroup = await smock.fake<IYieldGroup>("IYieldGroup");

    const tokenFactory = new MockToken__factory(deployer);
    usdt = await tokenFactory.deploy("Tether", "USDT", 18);
    colA = await tokenFactory.deploy("Collateral A", "COLA", 18);
    colB = await tokenFactory.deploy("Collateral B", "COLB", 18);
    const irmFactory = new WhitePaperInterestRateModel__factory(deployer);
    loanIrm = await irmFactory.deploy(0, e18("0.1"), false, BLOCKS_PER_YEAR);
    collateralIrm = await irmFactory.deploy(0, 0, false, BLOCKS_PER_YEAR);

    registry = (await upgrades.deployProxy(await ethers.getContractFactory("TierRegistry"), [
      acm.address,
    ])) as TierRegistry;
    await registry.setTier(TIER_ID, tier([usdtLoanAsset()]));

    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    manager.TIER_REGISTRY.returns(registry.address);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.accessControlManager.returns(acm.address);
    manager.marketParams.returns([
      collateralIrm.address,
      RESERVE_FACTOR,
      REDUCE_RESERVES_BLOCK_DELTA,
      MAX_STALE_PERIOD,
      COOLDOWN_PERIOD,
      TRIGGER_THRESHOLD,
      RESET_THRESHOLD,
    ]);
    manager.poolParams.returns([
      POOL_PARAMS.closeFactor,
      POOL_PARAMS.liquidationIncentive,
      POOL_PARAMS.minLiquidatableCollateral,
    ]);
    manager.hubYieldGroups.returns(yieldGroup.address);
    await setBalance(manager.address, e18("100"));

    const beaconFactory = await ethers.getContractFactory("UpgradeableBeacon");
    const comptrollerImplementation = await new SpokeComptroller__factory(deployer).deploy(poolRegistry.address);
    comptrollerBeacon = (await beaconFactory.deploy(comptrollerImplementation.address)).address;
    const vTokenImplementation = await new VToken__factory(deployer).deploy(false, BLOCKS_PER_YEAR, e18("0.000005"));
    vTokenBeacon = (await beaconFactory.deploy(vTokenImplementation.address)).address;

    builder = await new SpokePoolProposalBuilder__factory(deployer).deploy(...builderArgs());
  });

  describe("constructor", () => {
    it("reverts when any address is zero", async () => {
      const factory = new SpokePoolProposalBuilder__factory(deployer);
      const args = builderArgs();
      for (let i = 0; i < args.length - 1; i++) {
        const zeroed = [...args] as typeof args;
        zeroed[i] = constants.AddressZero;
        await expect(factory.deploy(...zeroed)).to.be.revertedWithCustomError(factory, "ZeroAddressNotAllowed");
      }
    });

    it("rejects more markets per pool than a new pool's VIP can hold", async () => {
      const factory = new SpokePoolProposalBuilder__factory(deployer);
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
      expect(await builder.CHAINLINK_ORACLE()).to.equal(chainlinkOracle.address);
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
      await expect(builder.connect(other).buildRequestProposal(REQUEST_ID, BUILD_ID, DESCRIPTION))
        .to.be.revertedWithCustomError(builder, "NotSpokePoolManager")
        .withArgs(other.address);
    });

    describe("pool and markets requests", () => {
      it("deploys a new pool's comptroller and markets and builds its listing VIP", async () => {
        const loan = loanMarket();
        const collateral = collateralMarket(colA);
        const [comptroller, vTokens, proposal] = await build(
          request({ collateralMarkets: [collateral], loanMarkets: [loan] }),
        );

        const spoke = SpokeComptroller__factory.connect(comptroller, deployer);
        expect(await spoke.owner()).to.equal(builder.address);
        expect(await spoke.pendingOwner()).to.equal(timelock.address);
        expect(await spoke.oracle()).to.equal(oracle.address);
        expect(await spoke.deviationBoundedOracle()).to.equal(boundedOracle.address);
        expect(await spoke.accessControlManager()).to.equal(acm.address);
        expect(await spoke.maxLoopsLimit()).to.equal(100);

        expect(vTokens).to.have.length(2);
        const expectedMarkets: [string, string, string][] = [
          [collateral.asset, collateralIrm.address, "COLA"],
          [loan.asset, loanIrm.address, "USDT"],
        ];
        for (const [i, [asset, interestRateModel, symbol]] of expectedMarkets.entries()) {
          const vToken = VToken__factory.connect(vTokens[i], deployer);
          expect(await vToken.underlying()).to.equal(asset);
          expect(await vToken.comptroller()).to.equal(comptroller);
          expect(await vToken.interestRateModel()).to.equal(interestRateModel);
          expect(await vToken.name()).to.equal(`Venus ${symbol} (${POOL_NAME})`);
          expect(await vToken.symbol()).to.equal(`v${symbol}_${POOL_NAME}`);
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
          ...collateralListing(collateral, vTokens[0]),
          ...listing(loan.asset, vTokens[1], [0, 0, LOAN_CAP, LOAN_CAP]),
          ...hubRegistration(comptroller, vTokens[1], LOAN_CAP),
        ]);
      });

      it("reuses the pool's comptroller on a rebuild and on a markets request", async () => {
        const [comptroller] = await build(request({ collateralMarkets: [collateralMarket(colA)] }));

        const [rebuiltComptroller, rebuiltVTokens, rebuilt] = await build(
          request({ comptroller, collateralMarkets: [collateralMarket(colA)] }),
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
          request({ requestType: RequestType.Markets, comptroller, collateralMarkets: [collateral] }),
        );
        expect(marketsComptroller).to.equal(comptroller);
        expectActions(proposal, [settlement(), ...collateralListing(collateral, vTokens[0])]);
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
});

import { FakeContract, smock } from "@defi-wonderland/smock";
import { setStorageAt, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish, ContractTransaction, constants } from "ethers";
import { defaultAbiCoder, keccak256, parseUnits } from "ethers/lib/utils";
import { artifacts, ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  FaucetTokenReEntrantHarness__factory,
  FeeToken__factory,
  IDeviationBoundedOracle,
  IGovernorBravo,
  IGovernorBravo__factory,
  IRiskOracle,
  ISpokePoolProposer,
  ISpokePoolValidator,
  IXVSVault,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  SpokePoolManager,
  SpokePoolManager__factory,
} from "../../../../typechain";
import { NO_ESTIMATE, PoolStatus, RequestStatus, RequestType, TIER, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const MAX_POOL_MARKETS = 5;
const POOL_NAME = "Open Pool";
const DESCRIPTION = "# Proposal";
const PROPOSAL_ID = 42;
const WIND_DOWN_PERIOD = 7 * 24 * 60 * 60;
const STAKE = TIER.stakeAmount;
/// Tier 0 is every test pool's; tier 1 stakes more and tier 2 less
const TIERS = [TIER, { ...TIER, stakeAmount: e18("2000") }, { ...TIER, stakeAmount: e18("500") }];
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
/// $100,000 per BTC of 8 decimals, scaled as ResilientOracle scales it
const BTC_PRICE = parseUnits("1", 33);
/// One vToken of 8 decimals per unit of an 18- and an 8-decimal underlying
const RATE_18_DECIMALS = parseUnits("1", 28);
const RATE_8_DECIMALS = parseUnits("1", 18);
/// GovernorBravo `ProposalState`, in declaration order
const ProposalState = {
  Pending: 0,
  Active: 1,
  Canceled: 2,
  Defeated: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7,
};

type Tier = typeof TIER;
const tierTuple = (tier: Tier) => [
  tier.stakeAmount,
  tier.maxLiquidityUsd,
  tier.maxCollateralFactor,
  tier.maxLiquidationThreshold,
  tier.minLiquidationThreshold,
];
const termsHash = (tierId: number, tier: Tier) =>
  keccak256(
    defaultAbiCoder.encode(["uint256", "tuple(uint256,uint256,uint256,uint256,uint256)"], [tierId, tierTuple(tier)]),
  );
const poolParamsTuple = (params: typeof POOL_DEFAULTS) => [
  params.closeFactor,
  params.liquidationIncentive,
  params.minLiquidatableCollateral,
];

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
  let stranger: SignerWithAddress;
  let poolRegistry: SignerWithAddress;
  let comptroller: SignerWithAddress;
  let otherComptroller: SignerWithAddress;
  let vTokenA: SignerWithAddress;
  let vTokenB: SignerWithAddress;
  let interestRateModel: SignerWithAddress;
  let otherInterestRateModel: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let vault: FakeContract<IXVSVault>;
  let governor: FakeContract<IGovernorBravo>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let riskOracle: FakeContract<IRiskOracle>;
  let validator: FakeContract<ISpokePoolValidator>;
  let proposer: FakeContract<ISpokePoolProposer>;
  let usdt: MockToken;
  let btc: MockToken;
  let manager: SpokePoolManager;
  let proposal: string;
  let marketDefaults: { interestRateModel: string; reserveFactor: BigNumberish; seedBurnPercent: BigNumberish };

  /// A collateral market's deployer parameters, with a $100 seed
  const usdtMarket = (overrides: object = {}) => ({
    asset: usdt.address,
    isLoanMarket: false,
    name: "Venus USDT",
    symbol: "vUSDT",
    collateralFactor: e18("0.6"),
    liquidationThreshold: e18("0.75"),
    supplyCap: e18("1000"),
    borrowCap: 0,
    seed: e18("100"),
    ...overrides,
  });

  /// A loan market's deployer parameters, with a $100 seed
  const btcMarket = (overrides: object = {}) => ({
    asset: btc.address,
    isLoanMarket: true,
    name: "Venus BTC",
    symbol: "vBTC",
    collateralFactor: 0,
    liquidationThreshold: 0,
    supplyCap: parseUnits("1", 8),
    borrowCap: parseUnits("0.5", 8),
    seed: parseUnits("0.001", 8),
    ...overrides,
  });

  /// A deployer market as the manager stores it, with Venus's defaults
  const storedMarket = (market: object, initialExchangeRate: BigNumberish, overrides: object = {}) => ({
    ...market,
    ...marketDefaults,
    decimals: 8,
    initialExchangeRate,
    ...overrides,
  });

  const deployManager = async () =>
    (await upgrades.deployProxy(await ethers.getContractFactory("SpokePoolManager"), [acm.address], {
      constructorArgs: [
        vault.address,
        governor.address,
        poolRegistry.address,
        oracle.address,
        boundedOracle.address,
        riskOracle.address,
        MAX_POOL_MARKETS,
      ],
    })) as SpokePoolManager;

  /// Clears the fakes' call history and programs the proposals the governor and proposer return
  const resetFakes = () => {
    const fakes: { reset: () => void }[] = [
      vault.lock,
      vault.unlock,
      vault.seizeLocked,
      validator.verifyRequest,
      validator.checkPoolFitsTier,
      validator.checkCollateralFactor,
      validator.checkSupplyCap,
      validator.checkLoanMarket,
      validator.accrueAndCheckResidualDebt,
      proposer.buildRequestProposal,
      proposer.buildExitProposal,
      proposer.buildForceCloseProposal,
      governor.propose,
      governor.state,
      riskOracle.publishRiskParameterUpdate,
    ];
    fakes.forEach(fake => fake.reset());
    governor.propose.returns(PROPOSAL_ID);
    proposer.buildRequestProposal.returns([comptroller.address, [vTokenA.address], proposal]);
    proposer.buildExitProposal.returns(proposal);
    proposer.buildForceCloseProposal.returns(proposal);
  };

  const requestPool = async (markets: object[] = [usdtMarket()]) => {
    await manager.connect(deployer).requestPool(0, POOL_NAME, markets);
    resetFakes();
    return (await manager.requestCount()).toNumber();
  };

  const proposeRequest = async (requestId: number, pool = comptroller.address, vTokens = [vTokenA.address]) => {
    proposer.buildRequestProposal.returns([pool, vTokens, proposal]);
    await manager.proposeRequest(requestId, DESCRIPTION);
    resetFakes();
  };

  const settleRequest = async (requestId: number) => {
    await manager.connect(timelock).settleRequest(requestId);
    resetFakes();
  };

  /// Requests, proposes and settles a pool of tier 0 with one collateral market
  const activatePool = async (pool = comptroller.address) => {
    const requestId = await requestPool();
    await proposeRequest(requestId, pool);
    await settleRequest(requestId);
    return requestId;
  };

  const proposeExit = async () => {
    await manager.proposeExit(comptroller.address, [], DESCRIPTION);
    resetFakes();
  };

  const startWindDown = async () => {
    await proposeExit();
    await manager.startWindDown(comptroller.address);
    return (await manager.getPool(comptroller.address)).windDownStartedAt.toNumber();
  };

  const expectPool = async (pool: string, expected: object) => expectFields(await manager.getPool(pool), expected);

  beforeEach(async () => {
    [
      owner,
      deployer,
      timelock,
      stranger,
      poolRegistry,
      comptroller,
      otherComptroller,
      vTokenA,
      vTokenB,
      interestRateModel,
      otherInterestRateModel,
    ] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    vault = await smock.fake<IXVSVault>("contracts/Spoke/interfaces/external/IXVSVault.sol:IXVSVault");
    governor = await smock.fake<IGovernorBravo>("IGovernorBravo");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    riskOracle = await smock.fake<IRiskOracle>("IRiskOracle");
    validator = await smock.fake<ISpokePoolValidator>("ISpokePoolValidator");
    proposer = await smock.fake<ISpokePoolProposer>("ISpokePoolProposer");
    usdt = await new MockToken__factory(owner).deploy("Tether", "USDT", 18);
    btc = await new MockToken__factory(owner).deploy("Bitcoin", "BTC", 8);
    proposal = IGovernorBravo__factory.createInterface().encodeFunctionData("propose", [
      [comptroller.address],
      [0],
      ["acceptOwnership()"],
      ["0x"],
      DESCRIPTION,
      0,
    ]);
    marketDefaults = {
      interestRateModel: interestRateModel.address,
      reserveFactor: e18("0.1"),
      seedBurnPercent: e18("0.5"),
    };

    acm.isAllowedToCall.returns(true);
    oracle.getPrice.returns(e18("1"));
    oracle.getPrice.whenCalledWith(btc.address).returns(BTC_PRICE);

    manager = await deployManager();
    await manager.setProposer(proposer.address);
    await manager.setValidator(validator.address);
    for (const [tierId, tier] of TIERS.entries()) {
      await manager.setTier(tierId, tier);
    }
    await manager.setPoolDefaults(POOL_DEFAULTS);
    await manager.setMarketDefaults(marketDefaults);
    await manager.setWindDownPeriod(WIND_DOWN_PERIOD);

    for (const token of [usdt, btc]) {
      await token.connect(deployer).faucet(parseUnits("1000000", await token.decimals()));
      await token.connect(deployer).approve(manager.address, constants.MaxUint256);
    }
    resetFakes();
  });

  describe("constructor and initialize", () => {
    const constructorArgs = () => [
      vault.address,
      governor.address,
      poolRegistry.address,
      oracle.address,
      boundedOracle.address,
      riskOracle.address,
      MAX_POOL_MARKETS,
    ];

    for (const [index, name] of [
      "XVS vault",
      "governor",
      "pool registry",
      "resilient oracle",
      "deviation bounded oracle",
      "risk oracle",
    ].entries()) {
      it(`reverts when the ${name} is the zero address`, async () => {
        const args = constructorArgs();
        args[index] = constants.AddressZero;
        const factory = await ethers.getContractFactory<SpokePoolManager__factory>("SpokePoolManager");
        await expect(
          factory.deploy(...(args as Parameters<SpokePoolManager__factory["deploy"]>)),
        ).to.be.revertedWithCustomError(manager, "ZeroAddressNotAllowed");
      });
    }

    it("stores its dependencies and constants", async () => {
      expect(await manager.XVS_VAULT()).to.equal(vault.address);
      expect(await manager.GOVERNOR_BRAVO()).to.equal(governor.address);
      expect(await manager.POOL_REGISTRY()).to.equal(poolRegistry.address);
      expect(await manager.RESILIENT_ORACLE()).to.equal(oracle.address);
      expect(await manager.DEVIATION_BOUNDED_ORACLE()).to.equal(boundedOracle.address);
      expect(await manager.RISK_ORACLE()).to.equal(riskOracle.address);
      expect(await manager.MAX_POOL_MARKETS()).to.equal(MAX_POOL_MARKETS);
      expect(await manager.VTOKEN_DECIMALS()).to.equal(8);
      expect(await manager.MIN_SEED_USD()).to.equal(e18("90"));
      expect(await manager.MAX_SEED_USD()).to.equal(e18("150"));
    });

    it("initializes the owner and access control manager once", async () => {
      expect(await manager.owner()).to.equal(owner.address);
      expect(await manager.accessControlManager()).to.equal(acm.address);
      await expect(manager.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("cannot initialize the implementation", async () => {
      const factory = await ethers.getContractFactory<SpokePoolManager__factory>("SpokePoolManager");
      const implementation = await factory.deploy(
        ...(constructorArgs() as Parameters<SpokePoolManager__factory["deploy"]>),
      );
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("access control", () => {
    const gated: [string, () => Promise<ContractTransaction>][] = [
      [
        "updateRequest(uint256,PoolParams,MarketParams[])",
        () => manager.connect(stranger).updateRequest(1, POOL_DEFAULTS, []),
      ],
      ["proposeRequest(uint256,string)", () => manager.connect(stranger).proposeRequest(1, DESCRIPTION)],
      ["settleRequest(uint256)", () => manager.connect(stranger).settleRequest(1)],
      ["setPoolTier(uint256)", () => manager.connect(stranger).setPoolTier(1)],
      ["rejectRequest(uint256)", () => manager.connect(stranger).rejectRequest(1)],
      ["setDeployerPaused(address,bool)", () => manager.connect(stranger).setDeployerPaused(comptroller.address, true)],
      [
        "seizeStake(address,uint256,address)",
        () => manager.connect(stranger).seizeStake(comptroller.address, 0, stranger.address),
      ],
      [
        "proposeExit(address,uint256[],string)",
        () => manager.connect(stranger).proposeExit(comptroller.address, [], DESCRIPTION),
      ],
      ["startWindDown(address)", () => manager.connect(stranger).startWindDown(comptroller.address)],
      [
        "proposeForceClose(address,string)",
        () => manager.connect(stranger).proposeForceClose(comptroller.address, DESCRIPTION),
      ],
      ["releaseStake(address)", () => manager.connect(stranger).releaseStake(comptroller.address)],
      ["rejectExit(address)", () => manager.connect(stranger).rejectExit(comptroller.address)],
      ["takeOverByGovernance(address)", () => manager.connect(stranger).takeOverByGovernance(comptroller.address)],
      ["setProposer(address)", () => manager.connect(stranger).setProposer(proposer.address)],
      ["setValidator(address)", () => manager.connect(stranger).setValidator(validator.address)],
      ["setTier(uint256,Tier)", () => manager.connect(stranger).setTier(0, TIER)],
      [
        "setSpokeSource(address,address)",
        () => manager.connect(stranger).setSpokeSource(usdt.address, stranger.address),
      ],
      ["setPoolDefaults(PoolParams)", () => manager.connect(stranger).setPoolDefaults(POOL_DEFAULTS)],
      ["setMarketDefaults(ProtocolMarketParams)", () => manager.connect(stranger).setMarketDefaults(marketDefaults)],
      ["setWindDownPeriod(uint256)", () => manager.connect(stranger).setWindDownPeriod(1)],
      ["setMaxResidualPoolDebtUsd(uint256)", () => manager.connect(stranger).setMaxResidualPoolDebtUsd(1)],
      [
        "sweepToken(address,address,uint256)",
        () => manager.connect(stranger).sweepToken(usdt.address, stranger.address, 0),
      ],
    ];

    for (const [signature, call] of gated) {
      it(`checks ${signature.split("(")[0]} with the ACM`, async () => {
        acm.isAllowedToCall.whenCalledWith(stranger.address, signature).returns(false);
        await expect(call())
          .to.be.revertedWithCustomError(manager, "Unauthorized")
          .withArgs(stranger.address, manager.address, signature);
      });
    }
  });

  describe("requestPool", () => {
    it("stores a pending pool request with Venus's defaults, pulls the seeds and locks the tier's stake", async () => {
      const markets = [usdtMarket(), btcMarket()];
      expect(await manager.connect(deployer).callStatic.requestPool(0, POOL_NAME, markets)).to.equal(1);
      resetFakes();

      const tx = manager.connect(deployer).requestPool(0, POOL_NAME, markets, NO_ESTIMATE);

      await expect(tx)
        .to.emit(manager, "RequestSubmitted")
        .withArgs(1, RequestType.Pool, deployer.address, constants.AddressZero);
      await expect(tx).to.changeTokenBalances(usdt, [deployer, manager], [e18("-100"), e18("100")]);
      await expect(tx).to.changeTokenBalances(btc, [deployer, manager], [-100_000, 100_000]);
      expect(validator.verifyRequest).to.have.been.calledOnceWith(1);
      expect(vault.lock).to.have.been.calledOnceWith(deployer.address, STAKE);
      expect(await manager.requestCount()).to.equal(1);
      expect(await manager.latestRequestIds(deployer.address)).to.equal(1);

      const request = await manager.getRequest(1);
      expectFields(request, {
        requestType: RequestType.Pool,
        status: RequestStatus.Pending,
        approved: true,
        deployer: deployer.address,
        comptroller: constants.AddressZero,
        proposalId: 0,
      });
      expectFields(request.pool, { tierId: 0, stake: STAKE, name: POOL_NAME });
      expectFields(request.pool.params, POOL_DEFAULTS);
      expect(request.markets).to.have.length(2);
      expectFields(request.markets[0], storedMarket(usdtMarket(), RATE_18_DECIMALS));
      expectFields(request.markets[1], storedMarket(btcMarket(), RATE_8_DECIMALS));
    });

    it("reverts on a tier without stake", async () => {
      await expect(manager.connect(deployer).requestPool(TIERS.length, POOL_NAME, [usdtMarket()]))
        .to.be.revertedWithCustomError(manager, "InvalidTier")
        .withArgs(TIERS.length);
    });

    it("accepts seeds worth exactly the lowest and highest USD values", async () => {
      const markets = [usdtMarket({ seed: e18("90") }), btcMarket({ seed: parseUnits("0.0015", 8) })];
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, markets)).to.not.be.reverted;
    });

    it("reverts on a seed worth less than the lowest USD value", async () => {
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket({ seed: e18("90").sub(1) })]))
        .to.be.revertedWithCustomError(manager, "InvalidSeed")
        .withArgs(usdt.address);
    });

    it("reverts on a seed worth more than the highest USD value", async () => {
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket({ seed: e18("150").add(1) })]))
        .to.be.revertedWithCustomError(manager, "InvalidSeed")
        .withArgs(usdt.address);
    });

    it("reverts when the manager receives less than the seed", async () => {
      const feeToken = await new FeeToken__factory(owner).deploy(0, "Fee", 18, "FEE", 100, owner.address);
      await feeToken.allocateTo(deployer.address, e18("100"));
      await feeToken.connect(deployer).approve(manager.address, e18("100"));

      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket({ asset: feeToken.address })]))
        .to.be.revertedWithCustomError(manager, "TransferAmountMismatch")
        .withArgs(feeToken.address);
    });

    it("reverts when the validator rejects the request", async () => {
      validator.verifyRequest.reverts("rejected");
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket()])).to.be.revertedWith("rejected");
    });

    it("reverts when the vault cannot lock the stake", async () => {
      vault.lock.reverts("insufficient free stake");
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket()])).to.be.revertedWith(
        "insufficient free stake",
      );
    });

    it("reverts while the deployer's latest request is pending", async () => {
      await requestPool();
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket()]))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(1);
    });

    it("reverts while the deployer's latest request is proposed", async () => {
      await proposeRequest(await requestPool());
      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket()]))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(1);
    });

    it("accepts another request once the latest is closed", async () => {
      await manager.connect(deployer).cancelRequest(await requestPool());

      await expect(manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket()]))
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Pool, deployer.address, constants.AddressZero);
    });
  });

  describe("reentrancy", () => {
    const reEntries: [string, () => string][] = [
      ["requestPool", () => manager.interface.encodeFunctionData("requestPool", [0, POOL_NAME, []])],
      ["requestMarkets", () => manager.interface.encodeFunctionData("requestMarkets", [comptroller.address, []])],
      ["settleRequest", () => manager.interface.encodeFunctionData("settleRequest", [1])],
      ["cancelRequest", () => manager.interface.encodeFunctionData("cancelRequest", [1])],
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
        await token.allocateTo(deployer.address, e18("100"));
        await token.connect(deployer).approve(manager.address, e18("100"));

        await expect(
          manager.connect(deployer).requestPool(0, POOL_NAME, [usdtMarket({ asset: token.address })]),
        ).to.be.revertedWith("ReentrancyGuard: reentrant call");
      });
    }
  });

  describe("deployer actions on a live pool", () => {
    const actions: [string, (signer: SignerWithAddress) => Promise<ContractTransaction>][] = [
      [
        "requestMarkets",
        signer => manager.connect(signer).requestMarkets(comptroller.address, [btcMarket()], NO_ESTIMATE),
      ],
      [
        "updateInterestRateModel",
        signer =>
          manager
            .connect(signer)
            .updateInterestRateModel(comptroller.address, vTokenA.address, otherInterestRateModel.address, NO_ESTIMATE),
      ],
      [
        "updateCollateralFactor",
        signer =>
          manager
            .connect(signer)
            .updateCollateralFactor(comptroller.address, vTokenA.address, e18("0.5"), e18("0.6"), NO_ESTIMATE),
      ],
      [
        "updateSupplyCap",
        signer => manager.connect(signer).updateSupplyCap(comptroller.address, vTokenA.address, 1, NO_ESTIMATE),
      ],
      [
        "updateBorrowCap",
        signer => manager.connect(signer).updateBorrowCap(comptroller.address, vTokenA.address, 1, NO_ESTIMATE),
      ],
    ];

    beforeEach(async () => {
      await activatePool();
    });

    for (const [name, call] of actions) {
      describe(name, () => {
        it("reverts unless the pool's deployer calls", async () => {
          await expect(call(stranger)).to.be.revertedWithCustomError(manager, "NotDeployer").withArgs(stranger.address);
        });

        it("reverts once the pool's exit is proposed", async () => {
          await proposeExit();
          await expect(call(deployer))
            .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
            .withArgs(comptroller.address);
        });

        it("is allowed while the pool's exit is requested", async () => {
          await manager.connect(deployer).requestExit(comptroller.address);
          await expect(call(deployer)).to.not.be.reverted;
        });

        it("reverts while the deployer is paused", async () => {
          await manager.setDeployerPaused(comptroller.address, true);
          await expect(call(deployer))
            .to.be.revertedWithCustomError(manager, "DeployerPaused")
            .withArgs(comptroller.address);
        });

        it("locks a raise of the tier's stake first", async () => {
          await manager.setTier(0, { ...TIER, stakeAmount: e18("1500") });

          await expect(call(deployer))
            .to.emit(manager, "LockedStakeUpdated")
            .withArgs(comptroller.address, STAKE, e18("1500"));
          expect(vault.lock).to.have.been.calledOnceWith(deployer.address, e18("500"));
          expect(vault.unlock).to.not.have.been.called;
          await expectPool(comptroller.address, { lockedStake: e18("1500") });
        });

        it("unlocks a cut of the tier's stake first", async () => {
          await manager.setTier(0, { ...TIER, stakeAmount: e18("600") });

          await expect(call(deployer))
            .to.emit(manager, "LockedStakeUpdated")
            .withArgs(comptroller.address, STAKE, e18("600"));
          expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, e18("400"));
          expect(vault.lock).to.not.have.been.called;
          await expectPool(comptroller.address, { lockedStake: e18("600") });
        });

        it("leaves a stake that matches the tier's", async () => {
          await expect(call(deployer)).to.not.emit(manager, "LockedStakeUpdated");
          expect(vault.lock).to.not.have.been.called;
          expect(vault.unlock).to.not.have.been.called;
        });

        it("reverts when the vault cannot lock a raise", async () => {
          await manager.setTier(0, { ...TIER, stakeAmount: e18("1500") });
          vault.lock.reverts("insufficient free stake");
          await expect(call(deployer)).to.be.revertedWith("insufficient free stake");
        });
      });
    }

    describe("requestMarkets", () => {
      it("stores a pending markets request and pulls the seeds", async () => {
        const tx = manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()], NO_ESTIMATE);

        await expect(tx)
          .to.emit(manager, "RequestSubmitted")
          .withArgs(2, RequestType.Markets, deployer.address, comptroller.address);
        await expect(tx).to.changeTokenBalances(btc, [deployer, manager], [-100_000, 100_000]);
        expect(validator.verifyRequest).to.have.been.calledOnceWith(2);

        const request = await manager.getRequest(2);
        expectFields(request, {
          requestType: RequestType.Markets,
          status: RequestStatus.Pending,
          approved: true,
          deployer: deployer.address,
          comptroller: comptroller.address,
        });
        expectFields(request.pool, { tierId: 0, stake: 0, name: "" });
        expect(request.markets).to.have.length(1);
        expectFields(request.markets[0], storedMarket(btcMarket(), RATE_8_DECIMALS));
      });

      it("reverts when the validator rejects the request", async () => {
        validator.verifyRequest.reverts("rejected");
        await expect(manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()])).to.be.revertedWith(
          "rejected",
        );
      });
    });

    describe("risk parameter updates", () => {
      it("publishes a checked collateral factor and liquidation threshold", async () => {
        await manager
          .connect(deployer)
          .updateCollateralFactor(comptroller.address, vTokenA.address, e18("0.5"), e18("0.6"), NO_ESTIMATE);

        expect(validator.checkCollateralFactor).to.have.been.calledOnceWith(
          comptroller.address,
          vTokenA.address,
          e18("0.5"),
          e18("0.6"),
        );
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnceWith(
          "",
          defaultAbiCoder.encode(["uint256", "uint256"], [e18("0.5"), e18("0.6")]),
          "collateralFactors",
          vTokenA.address,
          0,
          0,
          "0x",
        );
      });

      it("publishes a checked supply cap", async () => {
        await manager.connect(deployer).updateSupplyCap(comptroller.address, vTokenA.address, e18("2000"), NO_ESTIMATE);

        expect(validator.checkSupplyCap).to.have.been.calledOnceWith(comptroller.address, vTokenA.address, e18("2000"));
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnceWith(
          "",
          defaultAbiCoder.encode(["uint256"], [e18("2000")]),
          "supplyCap",
          vTokenA.address,
          0,
          0,
          "0x",
        );
      });

      it("publishes a borrow cap of a loan market", async () => {
        await manager.connect(deployer).updateBorrowCap(comptroller.address, vTokenA.address, e18("700"), NO_ESTIMATE);

        expect(validator.checkLoanMarket).to.have.been.calledOnceWith(comptroller.address, vTokenA.address);
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnceWith(
          "",
          defaultAbiCoder.encode(["uint256"], [e18("700")]),
          "borrowCap",
          vTokenA.address,
          0,
          0,
          "0x",
        );
      });

      it("publishes a loan market's interest rate model", async () => {
        await manager
          .connect(deployer)
          .updateInterestRateModel(comptroller.address, vTokenA.address, otherInterestRateModel.address, NO_ESTIMATE);

        expect(validator.checkLoanMarket).to.have.been.calledOnceWith(comptroller.address, vTokenA.address);
        expect(riskOracle.publishRiskParameterUpdate).to.have.been.calledOnceWith(
          "",
          defaultAbiCoder.encode(["address"], [otherInterestRateModel.address]),
          "interestRateModel",
          vTokenA.address,
          0,
          0,
          "0x",
        );
      });

      it("reverts on a zero interest rate model", async () => {
        await expect(
          manager
            .connect(deployer)
            .updateInterestRateModel(comptroller.address, vTokenA.address, constants.AddressZero),
        ).to.be.revertedWithCustomError(manager, "ZeroAddressNotAllowed");
      });

      it("reverts when the validator rejects a collateral factor", async () => {
        validator.checkCollateralFactor.reverts("exceeds tier");
        await expect(
          manager.connect(deployer).updateCollateralFactor(comptroller.address, vTokenA.address, 1, 1),
        ).to.be.revertedWith("exceeds tier");
      });

      it("reverts when the validator rejects a supply cap", async () => {
        validator.checkSupplyCap.reverts("exceeds tier");
        await expect(
          manager.connect(deployer).updateSupplyCap(comptroller.address, vTokenA.address, 1),
        ).to.be.revertedWith("exceeds tier");
      });

      it("reverts when the validator rejects a borrow cap", async () => {
        validator.checkLoanMarket.reverts("not a loan market");
        await expect(
          manager.connect(deployer).updateBorrowCap(comptroller.address, vTokenA.address, 1),
        ).to.be.revertedWith("not a loan market");
      });

      it("reverts when the validator rejects an interest rate model", async () => {
        validator.checkLoanMarket.reverts("not a loan market");
        await expect(
          manager
            .connect(deployer)
            .updateInterestRateModel(comptroller.address, vTokenA.address, otherInterestRateModel.address),
        ).to.be.revertedWith("not a loan market");
      });
    });
  });

  describe("requestTier", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("stores a pending tier request with the tier's terms, without syncing the stake", async () => {
      await manager.setTier(0, { ...TIER, stakeAmount: e18("1500") });

      await expect(manager.connect(deployer).requestTier(comptroller.address, 1, NO_ESTIMATE))
        .to.emit(manager, "RequestSubmitted")
        .withArgs(2, RequestType.Tier, deployer.address, comptroller.address);
      expect(vault.lock).to.not.have.been.called;
      expect(validator.verifyRequest).to.not.have.been.called;

      const request = await manager.getRequest(2);
      expectFields(request, { requestType: RequestType.Tier, status: RequestStatus.Pending, approved: true });
      expectFields(request.tier, { tierId: 1, termsHash: termsHash(1, TIERS[1]) });
    });

    it("reverts unless the pool's deployer calls", async () => {
      await expect(manager.connect(stranger).requestTier(comptroller.address, 1))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(stranger.address);
    });

    it("reverts while the deployer is paused", async () => {
      await manager.setDeployerPaused(comptroller.address, true);
      await expect(manager.connect(deployer).requestTier(comptroller.address, 1))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);
    });

    it("reverts while the pool's exit is requested", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.connect(deployer).requestTier(comptroller.address, 1))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts on a tier without stake", async () => {
      await expect(manager.connect(deployer).requestTier(comptroller.address, TIERS.length))
        .to.be.revertedWithCustomError(manager, "InvalidTier")
        .withArgs(TIERS.length);
    });

    it("reverts on the pool's own tier", async () => {
      await expect(manager.connect(deployer).requestTier(comptroller.address, 0))
        .to.be.revertedWithCustomError(manager, "InvalidTier")
        .withArgs(0);
    });

    it("reverts while the deployer's latest request is open", async () => {
      await manager.connect(deployer).requestTier(comptroller.address, 1);
      await expect(manager.connect(deployer).requestTier(comptroller.address, 2))
        .to.be.revertedWithCustomError(manager, "OpenRequestExists")
        .withArgs(2);
    });
  });

  describe("editable requests", () => {
    let requestId: number;

    beforeEach(async () => {
      requestId = await requestPool();
    });

    it("reverts on an unknown request", async () => {
      await expect(manager.connect(deployer).approveRequest(99))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(99);
    });

    for (const [name, state] of Object.entries(ProposalState)) {
      const editable = ["Canceled", "Defeated", "Expired"].includes(name);
      it(`${
        editable ? "accepts" : "reverts on"
      } a proposed request whose proposal is ${name.toLowerCase()}`, async () => {
        await proposeRequest(requestId);
        governor.state.whenCalledWith(PROPOSAL_ID).returns(state);

        const approve = manager.connect(deployer).approveRequest(requestId);
        if (editable) {
          await expect(approve).to.emit(manager, "RequestApproved").withArgs(requestId);
        } else {
          await expect(approve).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(requestId);
        }
      });
    }

    it("reverts on a rejected request", async () => {
      await manager.rejectRequest(requestId);
      await expect(manager.connect(deployer).approveRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);
    });

    it("reverts on a canceled request", async () => {
      await manager.connect(deployer).cancelRequest(requestId);
      await expect(manager.connect(deployer).approveRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);
    });

    it("reverts on a settled request", async () => {
      await proposeRequest(requestId);
      await settleRequest(requestId);
      governor.state.returns(ProposalState.Defeated);

      for (const call of [
        () => manager.connect(deployer).approveRequest(requestId),
        () => manager.updateRequest(requestId, POOL_DEFAULTS, []),
        () => manager.proposeRequest(requestId, DESCRIPTION),
        () => manager.rejectRequest(requestId),
        () => manager.connect(deployer).cancelRequest(requestId),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(requestId);
      }
    });
  });

  describe("updateRequest", () => {
    it("replaces a pool request's parameters and markets and clears its approval", async () => {
      const requestId = await requestPool([usdtMarket(), btcMarket()]);
      const markets = [
        storedMarket(usdtMarket({ name: "Venus Tether", collateralFactor: e18("0.5") }), RATE_18_DECIMALS, {
          interestRateModel: otherInterestRateModel.address,
          reserveFactor: e18("0.2"),
          seedBurnPercent: e18("1"),
        }),
        storedMarket(btcMarket({ supplyCap: parseUnits("2", 8) }), RATE_8_DECIMALS),
      ];

      await expect(manager.updateRequest(requestId, NEW_POOL_PARAMS, markets, NO_ESTIMATE))
        .to.emit(manager, "RequestUpdated")
        .withArgs(requestId);
      expect(validator.verifyRequest).to.have.been.calledOnceWith(requestId);

      const request = await manager.getRequest(requestId);
      expect(request.approved).to.equal(false);
      expectFields(request.pool.params, NEW_POOL_PARAMS);
      expectFields(request.markets[0], markets[0]);
      expectFields(request.markets[1], markets[1]);
    });

    it("replaces a markets request's markets and ignores the pool parameters", async () => {
      await activatePool();
      await manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()]);
      const market = storedMarket(btcMarket({ borrowCap: parseUnits("0.2", 8) }), RATE_8_DECIMALS);

      await manager.updateRequest(2, NEW_POOL_PARAMS, [market]);

      const request = await manager.getRequest(2);
      expectFields(request.markets[0], market);
      expectFields(request.pool.params, { closeFactor: 0, liquidationIncentive: 0, minLiquidatableCollateral: 0 });
    });

    it("only clears a tier request's approval, leaving the request to the validator", async () => {
      await activatePool();
      await manager.connect(deployer).requestTier(comptroller.address, 1);

      await manager.updateRequest(2, NEW_POOL_PARAMS, [], NO_ESTIMATE);

      expect(validator.verifyRequest).to.have.been.calledOnceWith(2);
      const request = await manager.getRequest(2);
      expect(request.approved).to.equal(false);
      expectFields(request.tier, { tierId: 1, termsHash: termsHash(1, TIERS[1]) });
      expectFields(request.pool.params, { closeFactor: 0, liquidationIncentive: 0, minLiquidatableCollateral: 0 });
    });

    it("reverts unless it keeps the request's market count", async () => {
      const requestId = await requestPool();
      const market = storedMarket(usdtMarket(), RATE_18_DECIMALS);

      for (const markets of [[], [market, market]]) {
        await expect(manager.updateRequest(requestId, POOL_DEFAULTS, markets)).to.be.revertedWithCustomError(
          manager,
          "InvalidArrayLength",
        );
      }
    });

    it("reverts on a market whose asset changed", async () => {
      const requestId = await requestPool();
      const market = storedMarket(usdtMarket({ asset: btc.address }), RATE_18_DECIMALS);

      await expect(manager.updateRequest(requestId, POOL_DEFAULTS, [market]))
        .to.be.revertedWithCustomError(manager, "InvalidSeed")
        .withArgs(usdt.address);
    });

    it("reverts on a market whose seed changed", async () => {
      const requestId = await requestPool();
      const market = storedMarket(usdtMarket({ seed: e18("101") }), RATE_18_DECIMALS);

      await expect(manager.updateRequest(requestId, POOL_DEFAULTS, [market]))
        .to.be.revertedWithCustomError(manager, "InvalidSeed")
        .withArgs(usdt.address);
    });

    it("reverts when the validator rejects the update", async () => {
      const requestId = await requestPool();
      validator.verifyRequest.reverts("rejected");

      await expect(
        manager.updateRequest(requestId, POOL_DEFAULTS, [storedMarket(usdtMarket(), RATE_18_DECIMALS)]),
      ).to.be.revertedWith("rejected");
    });
  });

  describe("approveRequest", () => {
    it("reverts unless the request's deployer calls", async () => {
      const requestId = await requestPool();
      await expect(manager.connect(stranger).approveRequest(requestId))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(stranger.address);
    });

    it("approves an updated request", async () => {
      const requestId = await requestPool();
      await manager.updateRequest(requestId, POOL_DEFAULTS, [storedMarket(usdtMarket(), RATE_18_DECIMALS)]);

      await expect(manager.connect(deployer).approveRequest(requestId))
        .to.emit(manager, "RequestApproved")
        .withArgs(requestId);
      expect((await manager.getRequest(requestId)).approved).to.equal(true);
    });
  });

  describe("proposeRequest", () => {
    let requestId: number;

    beforeEach(async () => {
      requestId = await requestPool([usdtMarket(), btcMarket()]);
    });

    it("submits the proposer's proposal and records it with the request", async () => {
      const vTokens = [vTokenA.address, vTokenB.address];
      proposer.buildRequestProposal.returns([comptroller.address, vTokens, proposal]);
      expect(await manager.callStatic.proposeRequest(requestId, DESCRIPTION)).to.equal(PROPOSAL_ID);
      resetFakes();
      proposer.buildRequestProposal.returns([comptroller.address, vTokens, proposal]);

      await expect(manager.proposeRequest(requestId, DESCRIPTION, NO_ESTIMATE))
        .to.emit(manager, "RequestProposed")
        .withArgs(requestId, PROPOSAL_ID, vTokens);
      expect(validator.verifyRequest).to.have.been.calledOnceWith(requestId);
      expect(proposer.buildRequestProposal).to.have.been.calledOnceWith(requestId, DESCRIPTION);
      expect(governor.propose).to.have.been.calledOnceWith(
        [comptroller.address],
        [0],
        ["acceptOwnership()"],
        ["0x"],
        DESCRIPTION,
        0,
      );
      expectFields(await manager.getRequest(requestId), {
        status: RequestStatus.Proposed,
        comptroller: comptroller.address,
        proposalId: PROPOSAL_ID,
      });
      expect(await manager.isLoanMarket(vTokenA.address)).to.equal(false);
      expect(await manager.isLoanMarket(vTokenB.address)).to.equal(true);
    });

    it("reverts on a request its deployer has not approved", async () => {
      await manager.updateRequest(requestId, POOL_DEFAULTS, [
        storedMarket(usdtMarket(), RATE_18_DECIMALS),
        storedMarket(btcMarket(), RATE_8_DECIMALS),
      ]);
      await expect(manager.proposeRequest(requestId, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "RequestNotApproved")
        .withArgs(requestId);
    });

    it("reverts when the validator rejects the request", async () => {
      validator.verifyRequest.reverts("rejected");
      await expect(manager.proposeRequest(requestId, DESCRIPTION)).to.be.revertedWith("rejected");
    });

    it("reverts when the governor rejects the proposal", async () => {
      governor.propose.reverts("one live proposal per proposer");
      await expect(manager.proposeRequest(requestId, DESCRIPTION)).to.be.revertedWith("one live proposal per proposer");
    });

    it("proposes a request again once its proposal is defeated", async () => {
      await proposeRequest(requestId);
      governor.state.whenCalledWith(PROPOSAL_ID).returns(ProposalState.Defeated);
      governor.propose.returns(PROPOSAL_ID + 1);

      await expect(manager.proposeRequest(requestId, DESCRIPTION))
        .to.emit(manager, "RequestProposed")
        .withArgs(requestId, PROPOSAL_ID + 1, [vTokenA.address]);
      expectFields(await manager.getRequest(requestId), {
        status: RequestStatus.Proposed,
        proposalId: PROPOSAL_ID + 1,
      });
    });
  });

  describe("settleRequest", () => {
    it("starts the deployer's rights over a new pool and hands the seeds to the caller", async () => {
      const requestId = await requestPool();
      await proposeRequest(requestId);

      const tx = manager.connect(timelock).settleRequest(requestId, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "PoolActivated").withArgs(requestId, comptroller.address, deployer.address);
      await expect(tx).to.emit(manager, "RequestSettled").withArgs(requestId, comptroller.address);
      await expect(tx).to.changeTokenBalances(usdt, [manager, timelock], [e18("-100"), e18("100")]);
      expect(validator.verifyRequest).to.have.been.calledOnceWith(requestId);
      expect((await manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
      await expectPool(comptroller.address, {
        deployer: deployer.address,
        status: PoolStatus.Live,
        deployerPaused: false,
        tierId: 0,
        windDownStartedAt: 0,
        lockedStake: STAKE,
      });
      expect(await manager.getPools(deployer.address)).to.deep.equal([comptroller.address]);
    });

    it("hands a markets request's seeds to the caller without touching the pool", async () => {
      await activatePool();
      await manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()]);
      await proposeRequest(2);

      const tx = manager.connect(timelock).settleRequest(2);

      await expect(tx).to.emit(manager, "RequestSettled").withArgs(2, comptroller.address);
      await expect(tx).to.not.emit(manager, "PoolActivated");
      await expect(tx).to.changeTokenBalances(btc, [manager, timelock], [-100_000, 100_000]);
      expect(await manager.getPools(deployer.address)).to.deep.equal([comptroller.address]);
    });

    it("reverts unless the request is proposed", async () => {
      const requestId = await requestPool();
      await expect(manager.connect(timelock).settleRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);
    });

    it("reverts on a settled request", async () => {
      const requestId = await activatePool();
      await expect(manager.connect(timelock).settleRequest(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidRequestStatus")
        .withArgs(requestId);
    });

    it("reverts when the validator rejects the request", async () => {
      const requestId = await requestPool();
      await proposeRequest(requestId);
      validator.verifyRequest.reverts("rejected");

      await expect(manager.connect(timelock).settleRequest(requestId)).to.be.revertedWith("rejected");
    });
  });

  describe("setPoolTier", () => {
    const requestTier = async (tierId: number) => {
      await manager.connect(deployer).requestTier(comptroller.address, tierId);
      resetFakes();
      return (await manager.requestCount()).toNumber();
    };

    beforeEach(async () => {
      await activatePool();
    });

    it("moves the pool to a costlier tier and locks the difference", async () => {
      const requestId = await requestTier(1);

      const tx = manager.setPoolTier(requestId, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "PoolTierUpdated").withArgs(comptroller.address, 1);
      await expect(tx).to.emit(manager, "RequestSettled").withArgs(requestId, comptroller.address);
      await expect(tx).to.emit(manager, "LockedStakeUpdated").withArgs(comptroller.address, STAKE, e18("2000"));
      expect(validator.checkPoolFitsTier).to.have.been.calledOnceWith(comptroller.address, 1);
      expect(vault.lock).to.have.been.calledOnceWith(deployer.address, STAKE);
      expect((await manager.getRequest(requestId)).status).to.equal(RequestStatus.Settled);
      await expectPool(comptroller.address, { tierId: 1, lockedStake: e18("2000") });
    });

    it("moves the pool to a cheaper tier and unlocks the difference", async () => {
      const requestId = await requestTier(2);

      await manager.setPoolTier(requestId, NO_ESTIMATE);

      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, e18("500"));
      await expectPool(comptroller.address, { tierId: 2, lockedStake: e18("500") });
    });

    it("leaves the stake of a tier with the same stake", async () => {
      await manager.setTier(3, { ...TIER, maxLiquidityUsd: e18("20000") });
      const requestId = await requestTier(3);

      await expect(manager.setPoolTier(requestId, NO_ESTIMATE)).to.not.emit(manager, "LockedStakeUpdated");
      expect(vault.lock).to.not.have.been.called;
      expect(vault.unlock).to.not.have.been.called;
      await expectPool(comptroller.address, { tierId: 3, lockedStake: STAKE });
    });

    it("reverts unless the request is pending", async () => {
      await expect(manager.setPoolTier(99)).to.be.revertedWithCustomError(manager, "InvalidRequestStatus").withArgs(99);
    });

    it("reverts on a request of another type", async () => {
      await manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()]);
      await expect(manager.setPoolTier(2)).to.be.revertedWithCustomError(manager, "InvalidRequestType").withArgs(2);
    });

    it("reverts once the pool's exit is requested", async () => {
      const requestId = await requestTier(1);
      await manager.connect(deployer).requestExit(comptroller.address);

      await expect(manager.setPoolTier(requestId))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts when the tier's terms changed since the request", async () => {
      const requestId = await requestTier(1);
      await manager.setTier(1, { ...TIERS[1], maxLiquidityUsd: e18("9000") });

      await expect(manager.setPoolTier(requestId)).to.be.revertedWithCustomError(manager, "InvalidTier").withArgs(1);
    });

    it("reverts when the pool does not fit the tier", async () => {
      const requestId = await requestTier(1);
      validator.checkPoolFitsTier.reverts("exceeds tier");

      await expect(manager.setPoolTier(requestId)).to.be.revertedWith("exceeds tier");
    });
  });

  describe("rejectRequest and cancelRequest", () => {
    it("rejects a pool request and unlocks its stake, keeping the seeds", async () => {
      const requestId = await requestPool();

      const tx = manager.rejectRequest(requestId, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "RequestRejected").withArgs(requestId);
      await expect(tx).to.changeTokenBalance(usdt, manager, 0);
      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, STAKE);
      expect((await manager.getRequest(requestId)).status).to.equal(RequestStatus.Rejected);
    });

    it("rejects a request whose proposal expired", async () => {
      const requestId = await requestPool();
      await proposeRequest(requestId);
      governor.state.whenCalledWith(PROPOSAL_ID).returns(ProposalState.Expired);

      await expect(manager.rejectRequest(requestId)).to.emit(manager, "RequestRejected").withArgs(requestId);
    });

    it("rejects a markets request without unlocking any stake", async () => {
      await activatePool();
      await manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()]);
      resetFakes();

      await expect(manager.rejectRequest(2, NO_ESTIMATE)).to.emit(manager, "RequestRejected").withArgs(2);
      expect(vault.unlock).to.not.have.been.called;
    });

    it("cancels the deployer's pool request and unlocks its stake, keeping the seeds", async () => {
      const requestId = await requestPool();

      const tx = manager.connect(deployer).cancelRequest(requestId, NO_ESTIMATE);

      await expect(tx).to.emit(manager, "RequestCanceled").withArgs(requestId);
      await expect(tx).to.changeTokenBalance(usdt, manager, 0);
      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, STAKE);
      expect((await manager.getRequest(requestId)).status).to.equal(RequestStatus.Canceled);
    });

    it("cancels a markets request without unlocking any stake", async () => {
      await activatePool();
      await manager.connect(deployer).requestMarkets(comptroller.address, [btcMarket()]);
      resetFakes();

      await expect(manager.connect(deployer).cancelRequest(2, NO_ESTIMATE))
        .to.emit(manager, "RequestCanceled")
        .withArgs(2);
      expect(vault.unlock).to.not.have.been.called;
    });

    it("reverts a cancel unless the request's deployer calls", async () => {
      const requestId = await requestPool();
      await expect(manager.connect(stranger).cancelRequest(requestId))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(stranger.address);
    });
  });

  describe("syncLockedStake", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("lets anyone lock a raise of the tier's stake", async () => {
      await manager.setTier(0, { ...TIER, stakeAmount: e18("1500") });

      await expect(manager.connect(stranger).syncLockedStake(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "LockedStakeUpdated")
        .withArgs(comptroller.address, STAKE, e18("1500"));
      expect(vault.lock).to.have.been.calledOnceWith(deployer.address, e18("500"));
    });

    it("unlocks a cut of the tier's stake while the exit is requested", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await manager.setTier(0, { ...TIER, stakeAmount: e18("600") });

      await expect(manager.connect(stranger).syncLockedStake(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "LockedStakeUpdated")
        .withArgs(comptroller.address, STAKE, e18("600"));
      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, e18("400"));
    });

    it("locks again the stake a seizure took", async () => {
      await manager.seizeStake(comptroller.address, e18("100"), stranger.address);
      resetFakes();

      await manager.connect(stranger).syncLockedStake(comptroller.address, NO_ESTIMATE);

      expect(vault.lock).to.have.been.calledOnceWith(deployer.address, e18("100"));
      await expectPool(comptroller.address, { lockedStake: STAKE });
    });

    it("does nothing when the stake matches the tier's", async () => {
      await expect(manager.syncLockedStake(comptroller.address, NO_ESTIMATE)).to.not.emit(
        manager,
        "LockedStakeUpdated",
      );
      expect(vault.lock).to.not.have.been.called;
      expect(vault.unlock).to.not.have.been.called;
    });

    it("reverts on an unknown pool", async () => {
      await expect(manager.syncLockedStake(otherComptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(otherComptroller.address);
    });

    it("reverts once the pool's exit is proposed", async () => {
      await proposeExit();
      await expect(manager.syncLockedStake(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts while the deployer is paused", async () => {
      await manager.setDeployerPaused(comptroller.address, true);
      await expect(manager.syncLockedStake(comptroller.address))
        .to.be.revertedWithCustomError(manager, "DeployerPaused")
        .withArgs(comptroller.address);
    });
  });

  describe("setDeployerPaused", () => {
    it("pauses and unpauses a pool's deployer", async () => {
      await activatePool();

      await expect(manager.setDeployerPaused(comptroller.address, true))
        .to.emit(manager, "DeployerPausedUpdated")
        .withArgs(comptroller.address, true);
      await expectPool(comptroller.address, { deployerPaused: true });
      await expect(manager.setDeployerPaused(comptroller.address, false))
        .to.emit(manager, "DeployerPausedUpdated")
        .withArgs(comptroller.address, false);
      await expectPool(comptroller.address, { deployerPaused: false });
    });

    it("reverts on an unknown pool", async () => {
      await expect(manager.setDeployerPaused(otherComptroller.address, true))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(otherComptroller.address);
    });
  });

  describe("seizeStake", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("seizes the whole locked stake to the receiver", async () => {
      await expect(manager.seizeStake(comptroller.address, STAKE, stranger.address, NO_ESTIMATE))
        .to.emit(manager, "StakeSeized")
        .withArgs(comptroller.address, stranger.address, STAKE);
      expect(vault.seizeLocked).to.have.been.calledOnceWith(deployer.address, STAKE, stranger.address);
      await expectPool(comptroller.address, { lockedStake: 0 });
    });

    it("reverts above the locked stake", async () => {
      await expect(manager.seizeStake(comptroller.address, STAKE.add(1), stranger.address))
        .to.be.revertedWithCustomError(manager, "InsufficientLockedStake")
        .withArgs(STAKE.add(1), STAKE);
    });
  });

  describe("requestExit", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("records the deployer's exit request, even while paused", async () => {
      await manager.setDeployerPaused(comptroller.address, true);

      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.emit(manager, "ExitRequested")
        .withArgs(comptroller.address);
      await expectPool(comptroller.address, { status: PoolStatus.ExitRequested });
    });

    it("reverts unless the pool's deployer calls", async () => {
      await expect(manager.connect(stranger).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "NotDeployer")
        .withArgs(stranger.address);
    });

    it("reverts once the pool's exit is proposed", async () => {
      await proposeExit();
      await expect(manager.connect(deployer).requestExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("proposeExit", () => {
    const thresholds = [e18("0.7")];

    beforeEach(async () => {
      await activatePool();
    });

    it("submits the proposer's exit proposal", async () => {
      expect(await manager.callStatic.proposeExit(comptroller.address, thresholds, DESCRIPTION)).to.equal(PROPOSAL_ID);
      resetFakes();

      await expect(manager.proposeExit(comptroller.address, thresholds, DESCRIPTION, NO_ESTIMATE))
        .to.emit(manager, "ExitProposed")
        .withArgs(comptroller.address, PROPOSAL_ID);
      expect(proposer.buildExitProposal).to.have.been.calledOnceWith(comptroller.address, thresholds, DESCRIPTION);
      expect(governor.propose).to.have.been.calledOnceWith(
        [comptroller.address],
        [0],
        ["acceptOwnership()"],
        ["0x"],
        DESCRIPTION,
        0,
      );
      await expectPool(comptroller.address, { status: PoolStatus.ExitProposed });
    });

    it("proposes a requested exit", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.proposeExit(comptroller.address, thresholds, DESCRIPTION)).to.emit(manager, "ExitProposed");
    });

    it("proposes an exit again", async () => {
      await proposeExit();
      await expect(manager.proposeExit(comptroller.address, thresholds, DESCRIPTION)).to.emit(manager, "ExitProposed");
    });

    it("reverts on an unknown pool", async () => {
      await expect(manager.proposeExit(otherComptroller.address, thresholds, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(otherComptroller.address);
    });

    it("reverts once the pool is winding down", async () => {
      await startWindDown();
      await expect(manager.proposeExit(comptroller.address, thresholds, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("startWindDown", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("starts the wind-down of a pool whose exit is proposed", async () => {
      await proposeExit();

      const tx = manager.startWindDown(comptroller.address);

      await expect(tx).to.emit(manager, "WindDownStarted").withArgs(comptroller.address);
      const { timestamp } = await ethers.provider.getBlock((await (await tx).wait()).blockNumber);
      await expectPool(comptroller.address, { status: PoolStatus.WindingDown, windDownStartedAt: timestamp });
    });

    it("reverts unless the pool's exit is proposed", async () => {
      await expect(manager.startWindDown(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("proposeForceClose", () => {
    let windDownStartedAt: number;

    beforeEach(async () => {
      await activatePool();
      windDownStartedAt = await startWindDown();
      resetFakes();
    });

    it("submits the proposer's force close proposal once the wind-down period elapsed", async () => {
      await time.setNextBlockTimestamp(windDownStartedAt + WIND_DOWN_PERIOD);

      await expect(manager.proposeForceClose(comptroller.address, DESCRIPTION, NO_ESTIMATE))
        .to.emit(manager, "ForceCloseProposed")
        .withArgs(comptroller.address, PROPOSAL_ID);
      expect(proposer.buildForceCloseProposal).to.have.been.calledOnceWith(comptroller.address, DESCRIPTION);
      expect(governor.propose).to.have.been.calledOnce;
    });

    it("reverts before the wind-down period elapsed", async () => {
      await time.setNextBlockTimestamp(windDownStartedAt + WIND_DOWN_PERIOD - 1);

      await expect(
        manager.proposeForceClose(comptroller.address, DESCRIPTION, NO_ESTIMATE),
      ).to.be.revertedWithCustomError(manager, "WindDownPeriodNotElapsed");
    });

    it("reverts unless the pool is winding down", async () => {
      await expect(manager.proposeForceClose(otherComptroller.address, DESCRIPTION))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(otherComptroller.address);
    });
  });

  describe("releaseStake", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("closes a winding-down pool within the residual debt limit and unlocks its stake", async () => {
      await startWindDown();
      resetFakes();

      await expect(manager.releaseStake(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "StakeReleased")
        .withArgs(comptroller.address, deployer.address, STAKE);
      expect(validator.accrueAndCheckResidualDebt).to.have.been.calledOnceWith(comptroller.address);
      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, STAKE);
      await expectPool(comptroller.address, { status: PoolStatus.Closed, lockedStake: 0 });
    });

    it("closes a pool whose stake was all seized without unlocking anything", async () => {
      await manager.seizeStake(comptroller.address, STAKE, stranger.address);
      await startWindDown();
      resetFakes();

      await expect(manager.releaseStake(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "StakeReleased")
        .withArgs(comptroller.address, deployer.address, 0);
      expect(vault.unlock).to.not.have.been.called;
    });

    it("reverts when the pool holds too much debt", async () => {
      await startWindDown();
      validator.accrueAndCheckResidualDebt.reverts("residual debt");

      await expect(manager.releaseStake(comptroller.address)).to.be.revertedWith("residual debt");
    });

    it("reverts unless the pool is winding down", async () => {
      await expect(manager.releaseStake(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("rejectExit", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("returns a pool with a requested exit to live", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);

      await expect(manager.rejectExit(comptroller.address))
        .to.emit(manager, "ExitRejected")
        .withArgs(comptroller.address);
      await expectPool(comptroller.address, { status: PoolStatus.Live });
    });

    it("returns a pool with a proposed exit to live", async () => {
      await proposeExit();

      await expect(manager.rejectExit(comptroller.address))
        .to.emit(manager, "ExitRejected")
        .withArgs(comptroller.address);
      await expectPool(comptroller.address, { status: PoolStatus.Live });
    });

    it("reverts on a live pool", async () => {
      await expect(manager.rejectExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });

    it("reverts once the pool is winding down", async () => {
      await startWindDown();
      await expect(manager.rejectExit(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("takeOverByGovernance", () => {
    beforeEach(async () => {
      await activatePool();
    });

    it("takes over a live pool and unlocks its stake", async () => {
      await expect(manager.takeOverByGovernance(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "PoolTakenOverByGovernance")
        .withArgs(comptroller.address, deployer.address, STAKE);
      expect(vault.unlock).to.have.been.calledOnceWith(deployer.address, STAKE);
      await expectPool(comptroller.address, { status: PoolStatus.TakenOverByGovernance, lockedStake: 0 });
    });

    it("takes over a pool with a requested exit", async () => {
      await manager.connect(deployer).requestExit(comptroller.address);
      await expect(manager.takeOverByGovernance(comptroller.address)).to.emit(manager, "PoolTakenOverByGovernance");
    });

    it("takes over a pool whose stake was all seized without unlocking anything", async () => {
      await manager.seizeStake(comptroller.address, STAKE, stranger.address);
      resetFakes();

      await expect(manager.takeOverByGovernance(comptroller.address, NO_ESTIMATE))
        .to.emit(manager, "PoolTakenOverByGovernance")
        .withArgs(comptroller.address, deployer.address, 0);
      expect(vault.unlock).to.not.have.been.called;
    });

    it("reverts once the pool's exit is proposed", async () => {
      await proposeExit();
      await expect(manager.takeOverByGovernance(comptroller.address))
        .to.be.revertedWithCustomError(manager, "InvalidPoolStatus")
        .withArgs(comptroller.address);
    });
  });

  describe("setProposer and setValidator", () => {
    it("replaces the proposer", async () => {
      await expect(manager.setProposer(stranger.address))
        .to.emit(manager, "ProposerUpdated")
        .withArgs(proposer.address, stranger.address);
      expect(await manager.proposer()).to.equal(stranger.address);
    });

    it("reverts on a zero proposer", async () => {
      await expect(manager.setProposer(constants.AddressZero)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });

    it("replaces the validator", async () => {
      await expect(manager.setValidator(stranger.address))
        .to.emit(manager, "ValidatorUpdated")
        .withArgs(validator.address, stranger.address);
      expect(await manager.validator()).to.equal(stranger.address);
    });

    it("reverts on a zero validator", async () => {
      await expect(manager.setValidator(constants.AddressZero)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("setTier", () => {
    const newTier = { ...TIER, maxLiquidityUsd: e18("20000") };

    it("adds a tier at the next id", async () => {
      await expect(manager.setTier(TIERS.length, newTier))
        .to.emit(manager, "TierUpdated")
        .withArgs(TIERS.length, [0, 0, 0, 0, 0], tierTuple(newTier));
      expect(await manager.tierCount()).to.equal(TIERS.length + 1);
      expectFields(await manager.getTier(TIERS.length), newTier);
    });

    it("replaces an existing tier", async () => {
      await expect(manager.setTier(1, newTier))
        .to.emit(manager, "TierUpdated")
        .withArgs(1, tierTuple(TIERS[1]), tierTuple(newTier));
      expect(await manager.tierCount()).to.equal(TIERS.length);
      expectFields(await manager.getTier(1), newTier);
    });

    it("reverts on an id past the next one", async () => {
      await expect(manager.setTier(TIERS.length + 1, TIER))
        .to.be.revertedWithCustomError(manager, "InvalidTier")
        .withArgs(TIERS.length + 1);
    });

    it("accepts thresholds at their bounds", async () => {
      const tier = {
        ...TIER,
        maxCollateralFactor: e18("1"),
        maxLiquidationThreshold: e18("1"),
        minLiquidationThreshold: e18("1"),
      };
      await expect(manager.setTier(0, tier)).to.emit(manager, "TierUpdated");
    });

    const invalidTiers: [string, object][] = [
      ["a liquidation threshold above 100%", { maxLiquidationThreshold: e18("1").add(1) }],
      [
        "a collateral factor above the liquidation threshold",
        { maxCollateralFactor: TIER.maxLiquidationThreshold.add(1) },
      ],
      [
        "a minimum liquidation threshold above the maximum",
        { minLiquidationThreshold: TIER.maxLiquidationThreshold.add(1) },
      ],
    ];
    for (const [description, overrides] of invalidTiers) {
      it(`reverts on ${description}`, async () => {
        await expect(manager.setTier(0, { ...TIER, ...overrides }))
          .to.be.revertedWithCustomError(manager, "InvalidTier")
          .withArgs(0);
      });
    }

    it("keeps tier ids within uint16", async () => {
      const source = "contracts/Spoke/OpenSpokePool/SpokePoolManager.sol";
      const buildInfo = await artifacts.getBuildInfo(`${source}:SpokePoolManager`);
      if (!buildInfo) {
        throw new Error("no build info for SpokePoolManager; compile first");
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { storage } = (buildInfo.output.contracts as any)[source].SpokePoolManager.storageLayout;
      const slot = storage.find((entry: any) => entry.label === "tierCount").slot;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      await setStorageAt(manager.address, BigNumber.from(slot).toHexString(), 65535);

      await expect(manager.setTier(65535, TIER)).to.emit(manager, "TierUpdated");
      expect(await manager.tierCount()).to.equal(65536);
      await expect(manager.setTier(65536, TIER)).to.be.revertedWithCustomError(manager, "InvalidTier").withArgs(65536);
    });
  });

  describe("setSpokeSource", () => {
    it("sets and clears an asset's Hub source", async () => {
      await expect(manager.setSpokeSource(usdt.address, stranger.address))
        .to.emit(manager, "SpokeSourceUpdated")
        .withArgs(usdt.address, constants.AddressZero, stranger.address);
      expect(await manager.spokeSources(usdt.address)).to.equal(stranger.address);

      await expect(manager.setSpokeSource(usdt.address, constants.AddressZero))
        .to.emit(manager, "SpokeSourceUpdated")
        .withArgs(usdt.address, stranger.address, constants.AddressZero);
      expect(await manager.spokeSources(usdt.address)).to.equal(constants.AddressZero);
    });

    it("reverts on a zero asset", async () => {
      await expect(manager.setSpokeSource(constants.AddressZero, stranger.address)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("setPoolDefaults", () => {
    it("accepts parameters at their bounds", async () => {
      const params = { closeFactor: e18("0.05"), liquidationIncentive: e18("1.05"), minLiquidatableCollateral: 0 };

      await expect(manager.setPoolDefaults(params))
        .to.emit(manager, "PoolDefaultsUpdated")
        .withArgs(poolParamsTuple(POOL_DEFAULTS), poolParamsTuple(params));
      expectFields(await manager.poolDefaults(), params);
      await expect(manager.setPoolDefaults({ ...params, closeFactor: e18("0.9") })).to.emit(
        manager,
        "PoolDefaultsUpdated",
      );
    });

    const invalidParams: [string, object][] = [
      ["a close factor below the minimum", { closeFactor: e18("0.05").sub(1) }],
      ["a close factor above the maximum", { closeFactor: e18("0.9").add(1) }],
      ["a liquidation incentive below the minimum", { liquidationIncentive: e18("1.05").sub(1) }],
    ];
    for (const [description, overrides] of invalidParams) {
      it(`reverts on ${description}`, async () => {
        await expect(manager.setPoolDefaults({ ...POOL_DEFAULTS, ...overrides })).to.be.revertedWithCustomError(
          manager,
          "InvalidPoolParams",
        );
      });
    }
  });

  describe("setMarketDefaults", () => {
    it("accepts parameters at their bounds", async () => {
      const params = {
        interestRateModel: otherInterestRateModel.address,
        reserveFactor: e18("1"),
        seedBurnPercent: e18("1"),
      };

      await expect(manager.setMarketDefaults(params))
        .to.emit(manager, "MarketDefaultsUpdated")
        .withArgs(
          [marketDefaults.interestRateModel, marketDefaults.reserveFactor, marketDefaults.seedBurnPercent],
          [params.interestRateModel, params.reserveFactor, params.seedBurnPercent],
        );
      expectFields(await manager.marketDefaults(), params);
    });

    const invalidDefaults: [string, () => object][] = [
      ["a zero interest rate model", () => ({ interestRateModel: constants.AddressZero })],
      ["a reserve factor above 100%", () => ({ reserveFactor: e18("1").add(1) })],
      ["a zero seed burn share", () => ({ seedBurnPercent: 0 })],
      ["a seed burn share above 100%", () => ({ seedBurnPercent: e18("1").add(1) })],
    ];
    for (const [description, overrides] of invalidDefaults) {
      it(`reverts on ${description}`, async () => {
        await expect(manager.setMarketDefaults({ ...marketDefaults, ...overrides() })).to.be.revertedWithCustomError(
          manager,
          "InvalidMarketDefaults",
        );
      });
    }
  });

  describe("setWindDownPeriod and setMaxResidualPoolDebtUsd", () => {
    it("sets the wind-down period", async () => {
      await expect(manager.setWindDownPeriod(1))
        .to.emit(manager, "WindDownPeriodUpdated")
        .withArgs(WIND_DOWN_PERIOD, 1);
      expect(await manager.windDownPeriod()).to.equal(1);
    });

    it("reverts on a zero wind-down period", async () => {
      await expect(manager.setWindDownPeriod(0)).to.be.revertedWithCustomError(manager, "ZeroValueNotAllowed");
    });

    it("sets the residual debt limit, zero included", async () => {
      await expect(manager.setMaxResidualPoolDebtUsd(e18("10")))
        .to.emit(manager, "MaxResidualPoolDebtUsdUpdated")
        .withArgs(0, e18("10"));
      await expect(manager.setMaxResidualPoolDebtUsd(0))
        .to.emit(manager, "MaxResidualPoolDebtUsdUpdated")
        .withArgs(e18("10"), 0);
      expect(await manager.maxResidualPoolDebtUsd()).to.equal(0);
    });
  });

  describe("sweepToken", () => {
    it("sends the manager's tokens to the receiver", async () => {
      await requestPool();

      const tx = manager.sweepToken(usdt.address, stranger.address, e18("100"));

      await expect(tx).to.emit(manager, "SweepToken").withArgs(usdt.address, stranger.address, e18("100"));
      await expect(tx).to.changeTokenBalances(usdt, [manager, stranger], [e18("-100"), e18("100")]);
    });

    it("reverts on a zero receiver", async () => {
      await expect(manager.sweepToken(usdt.address, constants.AddressZero, 0)).to.be.revertedWithCustomError(
        manager,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("getPools", () => {
    it("lists a deployer's pools in activation order and keeps those taken over", async () => {
      await activatePool(comptroller.address);
      await activatePool(otherComptroller.address);
      await manager.takeOverByGovernance(comptroller.address);

      expect(await manager.getPools(deployer.address)).to.deep.equal([comptroller.address, otherComptroller.address]);
      expect(await manager.getPools(stranger.address)).to.deep.equal([]);
    });
  });
});

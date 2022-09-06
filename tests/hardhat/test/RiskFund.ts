import { ethers } from "hardhat";
import { expect } from "chai";
import {
  PoolRegistry,
  RiskFund,
  LiquidatedShareReserve,
  MockToken,
  Comptroller,
  CErc20Immutable,
  MockPriceOracle,
  Unitroller,
  CErc20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  AccessControlManager,
  IPancakeswapV2Router__factory,
  IPancakeswapV2Router,
  PancakeRouter__factory,
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { FakeContract, smock } from "@defi-wonderland/smock";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let mockDAI: MockToken;
let mockBUSD: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let unitroller1: Unitroller;
let unitroller2: Unitroller;
let cTokenFactory: CErc20ImmutableFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let liquidatedShareReserve: LiquidatedShareReserve;
let riskFund: RiskFund;

describe("Risk Fund: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    // const signers = await ethers.getSigners();
    const [, user] = await ethers.getSigners();
    const CErc20ImmutableFactory = await ethers.getContractFactory(
      "CErc20ImmutableFactory"
    );
    cTokenFactory = await CErc20ImmutableFactory.deploy();
    await cTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory(
      "JumpRateModelFactory"
    );
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModelFactory"
    );
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    const RiskFund = await ethers.getContractFactory("RiskFund");
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const LiquidatedShareReserve = await ethers.getContractFactory(
      "LiquidatedShareReserve"
    );
    liquidatedShareReserve = await LiquidatedShareReserve.deploy();
    await liquidatedShareReserve.deployed();

    await poolRegistry.initialize(
      cTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      riskFund.address,
      liquidatedShareReserve.address
    );

    fakeAccessControlManager = await smock.fake<AccessControlManager>(
      "AccessControlManager"
    );
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const Comptroller = await ethers.getContractFactory("Comptroller");

    comptroller1 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller1.deployed();

    comptroller2 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller2.deployed();

    // Deploy Mock Tokens
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const MockBUSD = await ethers.getContractFactory("MockToken");
    mockBUSD = await MockBUSD.deploy("MakerBUSD", "BUSD", 18);
    await mockBUSD.faucet(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller1.address,
      _closeFactor,
      _liquidationIncentive,
      priceOracle.address
    );

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptroller2.address,
      _closeFactor,
      _liquidationIncentive,
      priceOracle.address
    );

    // Setup Proxies
    const pools = await poolRegistry.callStatic.getAllPools();
    comptroller1Proxy = await ethers.getContractAt(
      "Comptroller",
      pools[0].comptroller
    );
    unitroller1 = await ethers.getContractAt(
      "Unitroller",
      pools[0].comptroller
    );

    await unitroller1._acceptAdmin();

    await ethers.getContractAt("Comptroller", pools[1].comptroller);
    unitroller2 = await ethers.getContractAt(
      "Unitroller",
      pools[1].comptroller
    );

    await unitroller2._acceptAdmin();

    // Deploy CTokens
    await poolRegistry.addMarket({
      poolId: 1,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Compound WBTC",
      symbol: "cWBTC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
    });

    await poolRegistry.addMarket({
      poolId: 1,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "cDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
    });

    const cWBTCAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockWBTC.address
    );
    const cDAIAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockDAI.address
    );

    cWBTC = await ethers.getContractAt("CErc20Immutable", cWBTCAddress);
    cDAI = await ethers.getContractAt("CErc20Immutable", cDAIAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([cDAI.address, cWBTC.address]);
    await comptroller1Proxy
      .connect(user)
      .enterMarkets([cDAI.address, cWBTC.address]);

    // Set Oracle
    await comptroller1Proxy._setPriceOracle(priceOracle.address);
  });

  it("Add to reserves", async function () {
    await comptroller1Proxy._setMarketSupplyCaps(
      [cDAI.address],
      [convertToUnit(2000, 18)]
    );
    await mockDAI.approve(cDAI.address, convertToUnit(1000, 18));
    await cDAI._addReserves(convertToUnit(200, 18));
    await cDAI._reduceReserves(convertToUnit(100, 18));

    const riskFundBalance = await mockDAI.balanceOf(riskFund.address);
    expect(riskFundBalance).equal(convertToUnit(30, 18));
  });
});

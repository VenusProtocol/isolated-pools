import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  SimplePriceOracle,
  CErc20Immutable,
  MockPriceOracle,
  Unitroller,
  CErc20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  AccessControlManager,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";
import { FakeContract, smock } from "@defi-wonderland/smock";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let unitroller1: Unitroller;
let comptroller2Proxy: Comptroller;
let unitroller2: Unitroller;
let cTokenFactory: CErc20ImmutableFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;

describe("PoolRegistry: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
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

    await poolRegistry.initialize(
      cTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address
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

    //Deploy Mock Tokens
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

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

    //Setup Proxies
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

    comptroller2Proxy = await ethers.getContractAt(
      "Comptroller",
      pools[1].comptroller
    );
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

    //Set Oracle
    await comptroller1Proxy._setPriceOracle(priceOracle.address);
  });

  it("Pools should have correct names", async function () {
    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");
  });
  it("Should get 2 pools", async function () {
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools.length).equal(2);
  });

  it("Should change pool name", async function () {
    await poolRegistry.setPoolName(1, "Pool 1 updated");
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1 updated");
    await poolRegistry.setPoolName(1, "Pool 1");
  });

  it("Bookmark pool and get the bookmarked pools", async function () {
    const pools = await poolRegistry.callStatic.getAllPools();
    await poolRegistry.bookmarkPool(pools[0].comptroller);

    const [owner] = await ethers.getSigners();

    const bookmarkedPools = await poolRegistry.getBookmarks(owner.address);

    expect(bookmarkedPools.length).equal(1);
    expect(bookmarkedPools[0]).equal(pools[0].comptroller);
  });

  it("Should get pool by pools index", async function () {
    const pool = await poolRegistry.getPoolByID(2);

    expect(pool.name).equal("Pool 2");
  });

  it("Get pool by comptroller", async function () {
    const pool1 = await poolRegistry.getPoolByComptroller(
      comptroller1Proxy.address
    );
    expect(pool1[0]).equal(1);
    expect(pool1[1]).equal("Pool 1");

    const pool2 = await poolRegistry.getPoolByComptroller(
      comptroller2Proxy.address
    );
    expect(pool2[0]).equal(2);
    expect(pool2[1]).equal("Pool 2");
  });

  it("Should get poolID by comptroller", async function () {
    const poolIndex1 = await poolRegistry.getPoolIDByComptroller(
      comptroller1Proxy.address
    );
    expect(poolIndex1).equal(1);

    const poolIndex2 = await poolRegistry.getPoolIDByComptroller(
      comptroller2Proxy.address
    );
    expect(poolIndex2).equal(2);
  });

  it("Should be correct balances in tokens", async function () {
    const [owner] = await ethers.getSigners();
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const btcBalance = await mockWBTC.balanceOf(owner.address);
    expect(btcBalance).equal(convertToUnit(1000, 8));
  });

  // Get all pools that support a given asset
  it("Get pools with asset", async function () {
    const pools = await poolRegistry.getPoolsSupportedByAsset(mockWBTC.address);
    expect(pools[0].toString()).equal("1");
  });

  it("Enter Market", async function () {
    const [owner, user] = await ethers.getSigners();
    const res = await comptroller1Proxy.getAssetsIn(owner.address);
    expect(res[0]).equal(cDAI.address);
    expect(res[1]).equal(cWBTC.address);
  });

  it("Metadata", async function () {
    await poolRegistry.updatePoolMetadata(0, {
      riskRating: 2,
      category: "Hign market cap",
      logoURL: "http://venis.io/pool1",
      description: "An sample description",
    });

    const metadata = await poolRegistry.metadata(0);
    expect(metadata.riskRating).equal(2);
  });
});

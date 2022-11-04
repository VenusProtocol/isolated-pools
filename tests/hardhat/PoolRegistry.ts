import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  VBep20Immutable,
  MockPriceOracle,
  VBep20ImmutableProxyFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  AccessControlManager,
  RiskFund,
  ProtocolShareReserve,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";
import { FakeContract, smock } from "@defi-wonderland/smock";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: VBep20Immutable;
let vWBTC: VBep20Immutable;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let comptroller2Proxy: Comptroller;
let cTokenFactory: VBep20ImmutableProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;

describe("PoolRegistry: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [, user, proxyAdmin] = await ethers.getSigners();
    const VBep20ImmutableProxyFactory = await ethers.getContractFactory(
      "VBep20ImmutableProxyFactory"
    );
    cTokenFactory = await VBep20ImmutableProxyFactory.deploy();
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

    const Shortfall = await ethers.getContractFactory("Shortfall");
    const shortfall = await Shortfall.deploy();

    await shortfall.initialize(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      convertToUnit("10000", 18)
    );
    const RiskFund = await ethers.getContractFactory("RiskFund");
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve = await ethers.getContractFactory(
      "ProtocolShareReserve"
    );
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    await poolRegistry.initialize(
      cTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      riskFund.address,
      protocolShareReserve.address
    );

    await shortfall.setPoolRegistry(poolRegistry.address);

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

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);
    const _minLiquidatableCollateral = convertToUnit(100, 18);

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
      proxyAdmin.address,
      comptroller1.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      priceOracle.address
    );

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      proxyAdmin.address,
      comptroller2.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      priceOracle.address
    );

    // Setup Proxies
    const pools = await poolRegistry.callStatic.getAllPools();
    comptroller1Proxy = await ethers.getContractAt(
      "Comptroller",
      pools[0].comptroller
    );
    await comptroller1Proxy.acceptAdmin();

    comptroller2Proxy = await ethers.getContractAt(
      "Comptroller",
      pools[1].comptroller
    );
    await comptroller2Proxy.acceptAdmin();

    const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    // Deploy VTokens
    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Compound WBTC",
      symbol: "vWBTC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "vDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(
      comptroller1Proxy.address,
      mockWBTC.address
    );
    const vDAIAddress = await poolRegistry.getVTokenForAsset(
      comptroller1Proxy.address,
      mockDAI.address
    );

    vWBTC = await ethers.getContractAt("VBep20Immutable", vWBTCAddress);
    vDAI = await ethers.getContractAt("VBep20Immutable", vDAIAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptroller1Proxy
      .connect(user)
      .enterMarkets([vDAI.address, vWBTC.address]);

    // Set Oracle
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
    await expect(poolRegistry.setPoolName(comptroller1Proxy.address, "Pool 1 updated"))
      .to.emit(poolRegistry, "PoolNameSet")
      .withArgs(comptroller1Proxy.address, "Pool 1 updated");
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1 updated");
    await poolRegistry.setPoolName(comptroller1Proxy.address, "Pool 1");
  });

  it("Bookmark pool and get the bookmarked pools", async function () {
    const pools = await poolRegistry.callStatic.getAllPools();
    await poolRegistry.bookmarkPool(pools[0].comptroller);

    const [owner] = await ethers.getSigners();

    const bookmarkedPools = await poolRegistry.getBookmarks(owner.address);

    expect(bookmarkedPools.length).equal(1);
    expect(bookmarkedPools[0]).equal(pools[0].comptroller);
  });

  it("Get pool by comptroller", async function () {
    const pool1 = await poolRegistry.getPoolByComptroller(
      comptroller1Proxy.address
    );
    expect(pool1[0]).equal("Pool 1");

    const pool2 = await poolRegistry.getPoolByComptroller(
      comptroller2Proxy.address
    );
    expect(pool2[0]).equal("Pool 2");
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
    expect(pools[0].toString()).equal(comptroller1Proxy.address);
  });

  it("Enter Market", async function () {
    const [owner] = await ethers.getSigners();
    const res = await comptroller1Proxy.getAssetsIn(owner.address);
    expect(res[0]).equal(vDAI.address);
    expect(res[1]).equal(vWBTC.address);
  });

  it("Metadata", async function () {
    const riskRating = 2;
    const category = "High market cap";
    const logoURL = "http://venus.io/pool1";
    const description = "An sample description";
    const oldMetadata = await poolRegistry.metadata(comptroller1Proxy.address);
    const newMetadata = {
      riskRating,
      category,
      logoURL,
      description,
    };

    await expect(poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata))
      .to.emit(poolRegistry, "PoolMetadataUpdated")
      .withArgs(comptroller1Proxy.address, oldMetadata, [riskRating, category, logoURL, description]);

    const metadata = await poolRegistry.metadata(comptroller1Proxy.address);
    expect(metadata.riskRating).equal(riskRating);
    expect(metadata.category).equal(category);
    expect(metadata.logoURL).equal(logoURL);
    expect(metadata.description).equal(description);
  });
});

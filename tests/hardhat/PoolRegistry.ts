import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  SimplePriceOracle,
  CErc20Immutable,
  DAIInterestRateModelV3,
  JumpRateModelV2,
  MockPotLike,
  MockJugLike,
  MockPriceOracle,
  Unitroller,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let simplePriceOracle1: SimplePriceOracle;
let simplePriceOracle2: SimplePriceOracle;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let daiInterest: DAIInterestRateModelV3;
let wbtcInterest: JumpRateModelV2;
let potLike: MockPotLike;
let jugLike: MockJugLike;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let unitroller1: Unitroller;
let comptroller2Proxy: Comptroller;
let unitroller2: Unitroller;

describe("PoolRegistry: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    await poolRegistry.initialize();

    const Comptroller = await ethers.getContractFactory("Comptroller");

    comptroller1 = await Comptroller.deploy();
    await comptroller1.deployed();

    comptroller2 = await Comptroller.deploy();
    await comptroller2.deployed();

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );

    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();

    simplePriceOracle2 = await SimplePriceOracle.deploy();
    await simplePriceOracle2.deployed();
  });

  // Register pools to the protocol
  it("Register pool", async function () {
    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller1.address,
      _closeFactor,
      _liquidationIncentive,
      simplePriceOracle1.address
    );

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptroller2.address,
      _closeFactor,
      _liquidationIncentive,
      simplePriceOracle2.address
    );

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");

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
  });

  // Get the list of all pools.
  it("Get all pools", async function () {
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools.length).equal(2);
  });

  // Chnage/updte pool name.
  it("Change pool name", async function () {
    await poolRegistry.setPoolName(0, "Pool 1 updated");
    const pools = await poolRegistry.callStatic.getAllPools();

    expect(pools[0].name).equal("Pool 1 updated");
    await poolRegistry.setPoolName(0, "Pool 1");
  });

  // Bookmark the pool anf get all of the bookmarked pools.
  it("Bookmark pool and get the bookmarked pools", async function () {
    const pools = await poolRegistry.callStatic.getAllPools();
    await poolRegistry.bookmarkPool(pools[0].comptroller);

    const [owner] = await ethers.getSigners();

    const bookmarkedPools = await poolRegistry.getBookmarks(owner.address);

    expect(bookmarkedPools.length).equal(1);
    expect(bookmarkedPools[0]).equal(pools[0].comptroller);
  });

  // Get pool data by pool's index.
  it("Get pool by index", async function () {
    const pool = await poolRegistry.getPoolByID(1);

    expect(pool.name).equal("Pool 2");
  });

  // Get all pools by account
  it("Get pools by account", async function () {
    const [owner] = await ethers.getSigners();
    const pools = await poolRegistry.getPoolsByAccount(owner.address);

    expect(pools[1].length).equal(2);
    expect(pools[1][0].name).equal("Pool 1");
  });

  // Get all pool by the comptroller address.
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

  it("Deploy CToken", async function () {
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const btcBalance = await mockWBTC.balanceOf(owner.address);

    expect(btcBalance).equal(convertToUnit(1000, 8));

    const MockPotLike = await ethers.getContractFactory("MockPotLike");
    potLike = await MockPotLike.deploy();

    const MockJugLike = await ethers.getContractFactory("MockJugLike");
    jugLike = await MockJugLike.deploy();

    const DAIInterestRateModelV3 = await ethers.getContractFactory(
      "DAIInterestRateModelV3"
    );
    daiInterest = await DAIInterestRateModelV3.deploy(
      "1090000000000000000",
      "800000000000000000",
      potLike.address,
      jugLike.address,
      owner.address
    );

    const CDAI = await ethers.getContractFactory("CErc20Immutable");
    cDAI = await CDAI.deploy(
      mockDAI.address,
      comptroller1Proxy.address,
      daiInterest.address,
      convertToUnit(1, 18),
      "Compound DAI",
      "cDAI",
      18,
      owner.address
    );

    const JumpRateModelV2 = await ethers.getContractFactory("JumpRateModelV2");
    wbtcInterest = await JumpRateModelV2.deploy(
      0,
      "40000000000000000",
      "1090000000000000000",
      "800000000000000000",
      owner.address
    );

    const CWBTC = await ethers.getContractFactory("CErc20Immutable");
    cWBTC = await CWBTC.deploy(
      mockWBTC.address,
      comptroller1Proxy.address,
      wbtcInterest.address,
      convertToUnit(1, 18),
      "Compound WBTC",
      "cWBTC",
      8,
      owner.address
    );
  });

  it("Deploy Price Oracle", async function () {
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(cDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(cWBTC.address, convertToUnit(btcPrice, 28));

    expect(
      (await priceOracle.getUnderlyingPrice(cDAI.address)).toString()
    ).equal(convertToUnit(daiPrice, 18));
    expect(
      (await priceOracle.getUnderlyingPrice(cWBTC.address)).toString()
    ).equal(convertToUnit(btcPrice, 28));

    await comptroller1Proxy._setPriceOracle(priceOracle.address);
  });

  it("Enter Market", async function () {
    await comptroller1Proxy._supportMarket(cDAI.address);
    await comptroller1Proxy._supportMarket(cWBTC.address);

    await comptroller1Proxy._setCollateralFactor(
      cDAI.address,
      convertToUnit(0.7, 18)
    );
    await comptroller1Proxy._setCollateralFactor(
      cWBTC.address,
      convertToUnit(0.7, 18)
    );

    const [owner, user] = await ethers.getSigners();
    await comptroller1Proxy.enterMarkets([cDAI.address, cWBTC.address]);
    await comptroller1Proxy
      .connect(user)
      .enterMarkets([cDAI.address, cWBTC.address]);
    const res = await comptroller1Proxy.getAssetsIn(owner.address);
    expect(res[0]).equal(cDAI.address);
    expect(res[1]).equal(cWBTC.address);
  });

  it("Lend and Borrow", async function () {
    const daiAmount = convertToUnit(31000, 18);
    await mockDAI.faucet(daiAmount);
    await mockDAI.approve(cDAI.address, daiAmount);
    await cDAI.mint(daiAmount);

    const [owner, user] = await ethers.getSigners();
    await mockWBTC.connect(user).faucet(convertToUnit(1000, 8));

    const btcAmount = convertToUnit(1000, 8);
    await mockWBTC.connect(user).approve(cWBTC.address, btcAmount);
    await cWBTC.connect(user).mint(btcAmount);

    // console.log((await comptroller1Proxy.callStatic.getAccountLiquidity(owner.address))[1].toString())
    // console.log((await comptroller1Proxy.callStatic.getAccountLiquidity(user.address))[1].toString())
    await cWBTC.borrow(convertToUnit(1, 8));
    await cDAI.connect(user).borrow(convertToUnit(100, 18));
  });
});

import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  SimplePriceOracle,
  MockPriceOracle,
  Unitroller,
  CErc20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  PoolLens,
  AccessControlManager,
  CErc20Immutable,
  RiskFund,
  LiquidatedShareReserve,
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { BigNumberish, Signer } from "ethers";
import { FakeContract, smock } from "@defi-wonderland/smock";

let poolRegistry: PoolRegistry;
let poolRegistryAddress: string;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let simplePriceOracle1: SimplePriceOracle;
let simplePriceOracle2: SimplePriceOracle;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let priceOracle: MockPriceOracle;
let unitroller1: Unitroller;
let comptroller1Proxy: Comptroller;
let unitroller2: Unitroller;
let comptroller2Proxy: Comptroller;
let cTokenFactory: CErc20ImmutableFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let poolLens: PoolLens;
let owner: Signer;
let ownerAddress: string;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let closeFactor1: BigNumberish,
  closeFactor2: BigNumberish,
  liquidationIncentive1: BigNumberish,
  liquidationIncentive2: BigNumberish;
let liquidatedShareReserve: LiquidatedShareReserve;
let riskFund: RiskFund;

describe("PoolLens - PoolView Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    [owner] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

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

    poolRegistryAddress = poolRegistry.address;

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

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );

    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();

    simplePriceOracle2 = await SimplePriceOracle.deploy();
    await simplePriceOracle2.deployed();

    closeFactor1 = convertToUnit(0.05, 18);
    liquidationIncentive1 = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller1.address,
      closeFactor1,
      liquidationIncentive1,
      simplePriceOracle1.address
    );

    closeFactor2 = convertToUnit(0.05, 18);
    liquidationIncentive2 = convertToUnit(1, 18);

    //Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptroller2.address,
      closeFactor2,
      liquidationIncentive2,
      simplePriceOracle2.address
    );

    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

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

    await poolRegistry.updatePoolMetadata(1, {
      riskRating: 2,
      category: "Hign market cap",
      logoURL: "http://venis.io/pool1",
      description: "Pool1 description",
    });

    await poolRegistry.updatePoolMetadata(2, {
      riskRating: 0,
      category: "Low market cap",
      logoURL: "http://highrisk.io/pool2",
      description: "Pool2 description",
    });

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
      .connect(owner)
      .enterMarkets([cDAI.address, cWBTC.address]);

    //Set Oracle
    await comptroller1Proxy._setPriceOracle(priceOracle.address);

    const PoolLens = await ethers.getContractFactory("PoolLens");
    poolLens = await PoolLens.deploy();
  });

  it("get All Pools", async function () {
    const poolData = await poolLens.getAllPools(poolRegistryAddress);

    expect(poolData.length).equal(2);

    const venusPool_1_Actual = poolData[0];

    expect(venusPool_1_Actual[0]).equal(1);
    expect(venusPool_1_Actual[1]).equal("Pool 1");
    expect(venusPool_1_Actual[2]).equal(ownerAddress);
    expect(venusPool_1_Actual[3]).equal(comptroller1Proxy.address);
    expect(venusPool_1_Actual[6]).equal(2);
    expect(venusPool_1_Actual[7]).equal("Hign market cap");
    expect(venusPool_1_Actual[8]).equal("http://venis.io/pool1");
    expect(venusPool_1_Actual[9]).equal("Pool1 description");
    expect(venusPool_1_Actual[10]).equal(priceOracle.address);
    expect(venusPool_1_Actual[11]).equal(ethers.constants.AddressZero);
    expect(venusPool_1_Actual[12]).equal(closeFactor1);
    expect(venusPool_1_Actual[13]).equal(liquidationIncentive1);
    expect(venusPool_1_Actual[14]).equal(0);

    const cTokens_Actual = venusPool_1_Actual[15];
    expect(cTokens_Actual.length).equal(2);

    // get CToken for Asset-1 : WBTC
    const cTokenAddress_WBTC = await poolRegistry.getCTokenForAsset(
      1,
      mockWBTC.address
    );
    const cTokenMetadata_WBTC_Expected = await poolLens.cTokenMetadata(
      cTokenAddress_WBTC
    );
    const cTokenMetadata_WBTC_Actual = cTokens_Actual[0];
    assertCTokenMetadata(
      cTokenMetadata_WBTC_Actual,
      cTokenMetadata_WBTC_Expected
    );

    // get CToken for Asset-2 : DAI
    const cTokenAddress_DAI = await poolRegistry.getCTokenForAsset(
      1,
      mockDAI.address
    );
    const cTokenMetadata_DAI_Expected = await poolLens.cTokenMetadata(
      cTokenAddress_DAI
    );
    const cTokenMetadata_DAI_Actual = cTokens_Actual[1];
    assertCTokenMetadata(
      cTokenMetadata_DAI_Actual,
      cTokenMetadata_DAI_Expected
    );

    const venusPool_2_Actual = poolData[1];
    expect(venusPool_2_Actual[0]).equal(2);
    expect(venusPool_2_Actual[1]).equal("Pool 2");
    expect(venusPool_2_Actual[2]).equal(ownerAddress);
    expect(venusPool_2_Actual[3]).equal(comptroller2Proxy.address);
    expect(venusPool_2_Actual[6]).equal(0);
    expect(venusPool_2_Actual[7]).equal("Low market cap");
    expect(venusPool_2_Actual[8]).equal("http://highrisk.io/pool2");
    expect(venusPool_2_Actual[9]).equal("Pool2 description");
    expect(venusPool_1_Actual[10]).equal(priceOracle.address);
    expect(venusPool_1_Actual[11]).equal(ethers.constants.AddressZero);
    expect(venusPool_1_Actual[12]).equal(closeFactor2);
    expect(venusPool_1_Actual[13]).equal(liquidationIncentive2);
    expect(venusPool_1_Actual[14]).equal(0);
  });

  it("getPoolData By Comptroller", async function () {
    const poolData = await poolLens.getPoolByComptroller(
      poolRegistryAddress,
      comptroller1Proxy.address
    );

    expect(poolData[0]).equal(1);
    expect(poolData[1]).equal("Pool 1");
    expect(poolData[2]).equal(ownerAddress);
    expect(poolData[3]).equal(comptroller1Proxy.address);
    expect(poolData[6]).equal(2);
    expect(poolData[7]).equal("Hign market cap");
    expect(poolData[8]).equal("http://venis.io/pool1");
    expect(poolData[9]).equal("Pool1 description");
    expect(poolData[10]).equal(priceOracle.address);
    expect(poolData[11]).equal(ethers.constants.AddressZero);
    expect(poolData[12]).equal(closeFactor1);
    expect(poolData[13]).equal(liquidationIncentive1);
    expect(poolData[14]).equal(0);

    const cTokens_Actual = poolData[15];
    expect(cTokens_Actual.length).equal(2);

    // get CToken for Asset-1 : WBTC
    const cTokenAddress_WBTC = await poolRegistry.getCTokenForAsset(
      1,
      mockWBTC.address
    );
    const cTokenMetadata_WBTC_Expected = await poolLens.cTokenMetadata(
      cTokenAddress_WBTC
    );
    const cTokenMetadata_WBTC_Actual = cTokens_Actual[0];
    assertCTokenMetadata(
      cTokenMetadata_WBTC_Actual,
      cTokenMetadata_WBTC_Expected
    );

    // get CToken for Asset-2 : DAI
    const cTokenAddress_DAI = await poolRegistry.getCTokenForAsset(
      1,
      mockDAI.address
    );
    const cTokenMetadata_DAI_Expected = await poolLens.cTokenMetadata(
      cTokenAddress_DAI
    );
    const cTokenMetadata_DAI_Actual = cTokens_Actual[1];
    assertCTokenMetadata(
      cTokenMetadata_DAI_Actual,
      cTokenMetadata_DAI_Expected
    );
  });
});

describe("PoolLens - CTokens Query Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    [owner] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

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

    poolRegistryAddress = poolRegistry.address;

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

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );

    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();

    simplePriceOracle2 = await SimplePriceOracle.deploy();
    await simplePriceOracle2.deployed();

    closeFactor1 = convertToUnit(0.05, 18);
    liquidationIncentive1 = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller1.address,
      closeFactor1,
      liquidationIncentive1,
      simplePriceOracle1.address
    );

    closeFactor2 = convertToUnit(0.05, 18);
    liquidationIncentive2 = convertToUnit(1, 18);

    //Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptroller2.address,
      closeFactor2,
      liquidationIncentive2,
      simplePriceOracle2.address
    );

    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

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

    await poolRegistry.updatePoolMetadata(1, {
      riskRating: 2,
      category: "Hign market cap",
      logoURL: "http://venis.io/pool1",
      description: "Pool1 description",
    });

    await poolRegistry.updatePoolMetadata(2, {
      riskRating: 0,
      category: "Low market cap",
      logoURL: "http://highrisk.io/pool2",
      description: "Pool2 description",
    });

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

    const PoolLens = await ethers.getContractFactory("PoolLens");
    poolLens = await PoolLens.deploy();
  });

  it("is correct for WBTC as underlyingAsset", async () => {
    // get CToken for Asset-1 : WBTC
    const cTokenAddress_WBTC = await poolRegistry.getCTokenForAsset(
      1,
      mockWBTC.address
    );
    const cTokenMetadata_Actual = await poolLens.cTokenMetadata(
      cTokenAddress_WBTC
    );

    const cTokenMetadata_Actual_Parsed: any = cullTuple(cTokenMetadata_Actual);
    expect(cTokenMetadata_Actual_Parsed["cToken"]).equal(cTokenAddress_WBTC);
    expect(cTokenMetadata_Actual_Parsed["exchangeRateCurrent"]).equal(
      "100000000"
    );
    expect(cTokenMetadata_Actual_Parsed["supplyRatePerBlock"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["borrowRatePerBlock"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["reserveFactorMantissa"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["totalBorrows"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["totalReserves"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["totalSupply"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["totalCash"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["isListed"]).equal("true");
    expect(cTokenMetadata_Actual_Parsed["collateralFactorMantissa"]).equal("0");
    expect(cTokenMetadata_Actual_Parsed["underlyingAssetAddress"]).equal(
      mockWBTC.address
    );
    expect(cTokenMetadata_Actual_Parsed["cTokenDecimals"]).equal("8");
    expect(cTokenMetadata_Actual_Parsed["underlyingDecimals"]).equal("8");
  });
});

const assertCTokenMetadata = (
  cTokenMetadata_Actual: any,
  cTokenMetadata_Expected: any
) => {
  expect(cTokenMetadata_Actual[0]).equal(cTokenMetadata_Expected[0]);
  expect(cTokenMetadata_Actual[1]).equal(cTokenMetadata_Expected[1]);
  expect(cTokenMetadata_Actual[2]).equal(cTokenMetadata_Expected[2]);
  expect(cTokenMetadata_Actual[3]).equal(cTokenMetadata_Expected[3]);
  expect(cTokenMetadata_Actual[4]).equal(cTokenMetadata_Expected[4]);
  expect(cTokenMetadata_Actual[5]).equal(cTokenMetadata_Expected[5]);
  expect(cTokenMetadata_Actual[6]).equal(cTokenMetadata_Expected[6]);
  expect(cTokenMetadata_Actual[7]).equal(cTokenMetadata_Expected[7]);
  expect(cTokenMetadata_Actual[8]).equal(cTokenMetadata_Expected[8]);
  expect(cTokenMetadata_Actual[9]).equal(cTokenMetadata_Expected[9]);
  expect(cTokenMetadata_Actual[10]).equal(cTokenMetadata_Expected[10]);
  expect(cTokenMetadata_Actual[11]).equal(cTokenMetadata_Expected[11]);
  expect(cTokenMetadata_Actual[12]).equal(cTokenMetadata_Expected[12]);
  expect(cTokenMetadata_Actual[13]).equal(cTokenMetadata_Expected[13]);
  expect(cTokenMetadata_Actual[14]).equal(cTokenMetadata_Expected[14]);
};

const cullTuple = (tuple: any) => {
  return Object.keys(tuple).reduce((acc, key) => {
    if (Number.isNaN(Number(key))) {
      return {
        ...acc,
        [key]: tuple[key].toString(),
      };
    } else {
      return acc;
    }
  }, {});
};

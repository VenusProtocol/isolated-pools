import { FakeContract, smock } from "@defi-wonderland/smock";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  JumpRateModelFactory,
  MockPriceOracle,
  MockToken,
  PoolLens,
  PoolRegistry,
  ProtocolShareReserve,
  RiskFund,
  VToken,
  VTokenProxyFactory,
  WhitePaperInterestRateModelFactory,
} from "../../../typechain";

let poolRegistry: PoolRegistry;
let poolRegistryAddress: string;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: VToken;
let vWBTC: VToken;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let comptroller2Proxy: Comptroller;
let vTokenFactory: VTokenProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let poolLens: PoolLens;
let ownerAddress: string;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let closeFactor1: BigNumberish,
  closeFactor2: BigNumberish,
  liquidationIncentive1: BigNumberish,
  liquidationIncentive2: BigNumberish;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;
const minLiquidatableCollateral = convertToUnit(100, 18);

describe("PoolLens - PoolView Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [owner, proxyAdmin] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

    const VTokenProxyFactory = await ethers.getContractFactory("VTokenProxyFactory");
    vTokenFactory = await VTokenProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelFactory");
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModelFactory");
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    const Shortfall = await ethers.getContractFactory("Shortfall");
    const shortfall = await Shortfall.deploy();

    await shortfall.initialize(ethers.constants.AddressZero, ethers.constants.AddressZero, convertToUnit("10000", 18));
    const RiskFund = await ethers.getContractFactory("RiskFund");
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    await poolRegistry.initialize(
      vTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      riskFund.address,
      protocolShareReserve.address,
    );

    await shortfall.setPoolRegistry(poolRegistry.address);

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    poolRegistryAddress = poolRegistry.address;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    comptroller1 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
    await comptroller1.deployed();
    comptroller2 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
    await comptroller2.deployed();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    closeFactor1 = convertToUnit(0.05, 18);
    liquidationIncentive1 = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      proxyAdmin.address,
      comptroller1.address,
      closeFactor1,
      liquidationIncentive1,
      minLiquidatableCollateral,
      priceOracle.address,
    );

    closeFactor2 = convertToUnit(0.05, 18);
    liquidationIncentive2 = convertToUnit(1, 18);

    //Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      proxyAdmin.address,
      comptroller2.address,
      closeFactor2,
      liquidationIncentive2,
      minLiquidatableCollateral,
      priceOracle.address,
    );

    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    const VToken = await ethers.getContractFactory("VToken");
    const tokenImplementation = await VToken.deploy();
    await tokenImplementation.deployed();

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");

    comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    await comptroller1Proxy.acceptAdmin();

    comptroller2Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
    await comptroller2Proxy.acceptAdmin();

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

    await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, {
      riskRating: 2,
      category: "Hign market cap",
      logoURL: "http://venis.io/pool1",
      description: "Pool1 description",
    });

    await poolRegistry.updatePoolMetadata(comptroller2Proxy.address, {
      riskRating: 0,
      category: "Low market cap",
      logoURL: "http://highrisk.io/pool2",
      description: "Pool2 description",
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
    const vDAIAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);

    vWBTC = await ethers.getContractAt("VToken", vWBTCAddress);
    vDAI = await ethers.getContractAt("VToken", vDAIAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptroller1Proxy.connect(owner).enterMarkets([vDAI.address, vWBTC.address]);

    //Set Oracle
    await comptroller1Proxy.setPriceOracle(priceOracle.address);

    const PoolLens = await ethers.getContractFactory("PoolLens");
    poolLens = await PoolLens.deploy();
  });

  it("get All Pools", async function () {
    const poolData = await poolLens.getAllPools(poolRegistryAddress);

    expect(poolData.length).equal(2);

    const venusPool_1_Actual = poolData[0];

    expect(venusPool_1_Actual[0]).equal("Pool 1");
    expect(venusPool_1_Actual[1]).equal(ownerAddress);
    expect(venusPool_1_Actual[2]).equal(comptroller1Proxy.address);
    expect(venusPool_1_Actual[5]).equal(2);
    expect(venusPool_1_Actual[6]).equal("Hign market cap");
    expect(venusPool_1_Actual[7]).equal("http://venis.io/pool1");
    expect(venusPool_1_Actual[8]).equal("Pool1 description");
    expect(venusPool_1_Actual[9]).equal(priceOracle.address);
    expect(venusPool_1_Actual[10]).equal(closeFactor1);
    expect(venusPool_1_Actual[11]).equal(liquidationIncentive1);
    expect(venusPool_1_Actual[12]).equal(minLiquidatableCollateral);
    expect(venusPool_1_Actual[13]).equal(0);

    const vTokens_Actual = venusPool_1_Actual[14];
    expect(vTokens_Actual.length).equal(2);

    // get VToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
    const vTokenMetadata_WBTC_Expected = await poolLens.vTokenMetadata(vTokenAddress_WBTC);
    const vTokenMetadata_WBTC_Actual = vTokens_Actual[0];
    assertVTokenMetadata(vTokenMetadata_WBTC_Actual, vTokenMetadata_WBTC_Expected);

    // get VToken for Asset-2 : DAI
    const vTokenAddress_DAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
    const vTokenMetadata_DAI_Expected = await poolLens.vTokenMetadata(vTokenAddress_DAI);
    const vTokenMetadata_DAI_Actual = vTokens_Actual[1];
    assertVTokenMetadata(vTokenMetadata_DAI_Actual, vTokenMetadata_DAI_Expected);

    const venusPool_2_Actual = poolData[1];
    // expect(venusPool_2_Actual[0]).equal(2);
    expect(venusPool_2_Actual[0]).equal("Pool 2");
    expect(venusPool_2_Actual[1]).equal(ownerAddress);
    expect(venusPool_2_Actual[2]).equal(comptroller2Proxy.address);
    expect(venusPool_2_Actual[5]).equal(0);
    expect(venusPool_2_Actual[6]).equal("Low market cap");
    expect(venusPool_2_Actual[7]).equal("http://highrisk.io/pool2");
    expect(venusPool_2_Actual[8]).equal("Pool2 description");
    expect(venusPool_1_Actual[9]).equal(priceOracle.address);
    expect(venusPool_1_Actual[10]).equal(closeFactor2);
    expect(venusPool_1_Actual[11]).equal(liquidationIncentive2);
    expect(venusPool_1_Actual[12]).equal(minLiquidatableCollateral);
    expect(venusPool_1_Actual[13]).equal(0);
  });

  it("getPoolData By Comptroller", async function () {
    const poolData = await poolLens.getPoolByComptroller(poolRegistryAddress, comptroller1Proxy.address);

    // expect(poolData[0]).equal(1);
    expect(poolData[0]).equal("Pool 1");
    expect(poolData[1]).equal(ownerAddress);
    expect(poolData[2]).equal(comptroller1Proxy.address);
    expect(poolData[5]).equal(2);
    expect(poolData[6]).equal("Hign market cap");
    expect(poolData[7]).equal("http://venis.io/pool1");
    expect(poolData[8]).equal("Pool1 description");
    expect(poolData[9]).equal(priceOracle.address);
    expect(poolData[10]).equal(closeFactor1);
    expect(poolData[11]).equal(liquidationIncentive1);
    expect(poolData[12]).equal(minLiquidatableCollateral);
    expect(poolData[13]).equal(0);

    const vTokens_Actual = poolData[14];
    expect(vTokens_Actual.length).equal(2);

    // get VToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
    const vTokenMetadata_WBTC_Expected = await poolLens.vTokenMetadata(vTokenAddress_WBTC);
    const vTokenMetadata_WBTC_Actual = vTokens_Actual[0];
    assertVTokenMetadata(vTokenMetadata_WBTC_Actual, vTokenMetadata_WBTC_Expected);

    // get VToken for Asset-2 : DAI
    const vTokenAddress_DAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
    const vTokenMetadata_DAI_Expected = await poolLens.vTokenMetadata(vTokenAddress_DAI);
    const vTokenMetadata_DAI_Actual = vTokens_Actual[1];
    assertVTokenMetadata(vTokenMetadata_DAI_Actual, vTokenMetadata_DAI_Expected);
  });
});

describe("PoolLens - VTokens Query Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [owner, proxyAdmin] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const VTokenProxyFactory = await ethers.getContractFactory("VTokenProxyFactory");
    vTokenFactory = await VTokenProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelFactory");
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModelFactory");
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    const Shortfall = await ethers.getContractFactory("Shortfall");
    const shortfall = await Shortfall.deploy();

    await shortfall.initialize(ethers.constants.AddressZero, ethers.constants.AddressZero, convertToUnit("10000", 18));
    const RiskFund = await ethers.getContractFactory("RiskFund");
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    await poolRegistry.initialize(
      vTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      riskFund.address,
      protocolShareReserve.address,
    );

    await shortfall.setPoolRegistry(poolRegistry.address);

    poolRegistryAddress = poolRegistry.address;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    comptroller1 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
    await comptroller1.deployed();
    comptroller2 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
    await comptroller2.deployed();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    closeFactor1 = convertToUnit(0.05, 18);
    liquidationIncentive1 = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      proxyAdmin.address,
      comptroller1.address,
      closeFactor1,
      liquidationIncentive1,
      minLiquidatableCollateral,
      priceOracle.address,
    );

    closeFactor2 = convertToUnit(0.05, 18);
    liquidationIncentive2 = convertToUnit(1, 18);

    //Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      proxyAdmin.address,
      comptroller2.address,
      closeFactor2,
      liquidationIncentive2,
      minLiquidatableCollateral,
      priceOracle.address,
    );

    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    const VToken = await ethers.getContractFactory("VToken");
    const tokenImplementation = await VToken.deploy();
    await tokenImplementation.deployed();

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");

    comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    await comptroller1Proxy.acceptAdmin();

    comptroller2Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
    await comptroller2Proxy.acceptAdmin();

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

    await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, {
      riskRating: 2,
      category: "Hign market cap",
      logoURL: "http://venis.io/pool1",
      description: "Pool1 description",
    });

    await poolRegistry.updatePoolMetadata(comptroller2Proxy.address, {
      riskRating: 0,
      category: "Low market cap",
      logoURL: "http://highrisk.io/pool2",
      description: "Pool2 description",
    });

    const PoolLens = await ethers.getContractFactory("PoolLens");
    poolLens = await PoolLens.deploy();
  });

  it("is correct for WBTC as underlyingAsset", async () => {
    // get CToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
    const vTokenMetadata_Actual = await poolLens.vTokenMetadata(vTokenAddress_WBTC);

    const vTokenMetadata_Actual_Parsed: any = cullTuple(vTokenMetadata_Actual);
    expect(vTokenMetadata_Actual_Parsed["vToken"]).equal(vTokenAddress_WBTC);
    expect(vTokenMetadata_Actual_Parsed["exchangeRateCurrent"]).equal("100000000");
    expect(vTokenMetadata_Actual_Parsed["supplyRatePerBlock"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["borrowRatePerBlock"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["reserveFactorMantissa"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["totalBorrows"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["totalReserves"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["totalSupply"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["totalCash"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["isListed"]).equal("true");
    expect(vTokenMetadata_Actual_Parsed["collateralFactorMantissa"]).equal("700000000000000000");
    expect(vTokenMetadata_Actual_Parsed["underlyingAssetAddress"]).equal(mockWBTC.address);
    expect(vTokenMetadata_Actual_Parsed["vTokenDecimals"]).equal("8");
    expect(vTokenMetadata_Actual_Parsed["underlyingDecimals"]).equal("8");
  });
});

const assertVTokenMetadata = (vTokenMetadata_Actual: any, vTokenMetadata_Expected: any) => {
  expect(vTokenMetadata_Actual[0]).equal(vTokenMetadata_Expected[0]);
  expect(vTokenMetadata_Actual[1]).equal(vTokenMetadata_Expected[1]);
  expect(vTokenMetadata_Actual[2]).equal(vTokenMetadata_Expected[2]);
  expect(vTokenMetadata_Actual[3]).equal(vTokenMetadata_Expected[3]);
  expect(vTokenMetadata_Actual[4]).equal(vTokenMetadata_Expected[4]);
  expect(vTokenMetadata_Actual[5]).equal(vTokenMetadata_Expected[5]);
  expect(vTokenMetadata_Actual[6]).equal(vTokenMetadata_Expected[6]);
  expect(vTokenMetadata_Actual[7]).equal(vTokenMetadata_Expected[7]);
  expect(vTokenMetadata_Actual[8]).equal(vTokenMetadata_Expected[8]);
  expect(vTokenMetadata_Actual[9]).equal(vTokenMetadata_Expected[9]);
  expect(vTokenMetadata_Actual[10]).equal(vTokenMetadata_Expected[10]);
  expect(vTokenMetadata_Actual[11]).equal(vTokenMetadata_Expected[11]);
  expect(vTokenMetadata_Actual[12]).equal(vTokenMetadata_Expected[12]);
  expect(vTokenMetadata_Actual[13]).equal(vTokenMetadata_Expected[13]);
  expect(vTokenMetadata_Actual[14]).equal(vTokenMetadata_Expected[14]);
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

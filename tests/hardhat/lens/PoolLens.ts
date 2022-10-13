import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  SimplePriceOracle,
  MockPriceOracle,
  Unitroller,
  VBep20ImmutableProxyFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  PoolLens,
  AccessControlManager,
  VBep20Immutable,
  RiskFund,
  ProtocolShareReserve,
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
let vDAI: VBep20Immutable;
let vWBTC: VBep20Immutable;
let priceOracle: MockPriceOracle;
let unitroller1: Unitroller;
let comptroller1Proxy: Comptroller;
let unitroller2: Unitroller;
let comptroller2Proxy: Comptroller;
let vTokenFactory: VBep20ImmutableProxyFactory;
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
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;

describe("PoolLens - PoolView Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [owner, proxyAdmin] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

    const VBep20ImmutableProxyFactory = await ethers.getContractFactory(
      "VBep20ImmutableProxyFactory"
    );
    // @ts-ignore @TODO VEN-663
    vTokenFactory = await VBep20ImmutableProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory(
      "JumpRateModelFactory"
    );
    // @ts-ignore @TODO VEN-663
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModelFactory"
    );
    // @ts-ignore @TODO VEN-663
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    // @ts-ignore @TODO VEN-663
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    const Shortfall = await ethers.getContractFactory("Shortfall");
    const shortfall = await Shortfall.deploy();

    await shortfall.initialize(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      convertToUnit("10000", 18)
    )
    const RiskFund = await ethers.getContractFactory("RiskFund");
    // @ts-ignore @TODO VEN-663
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve = await ethers.getContractFactory(
      "ProtocolShareReserve"
    );
    // @ts-ignore @TODO VEN-663
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    await poolRegistry.initialize(
      vTokenFactory.address,
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

    poolRegistryAddress = poolRegistry.address;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    // @ts-ignore @TODO VEN-663
    comptroller1 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller1.deployed();
    // @ts-ignore @TODO VEN-663
    comptroller2 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller2.deployed();

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );
    // @ts-ignore @TODO VEN-663
    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();

    // @ts-ignore @TODO VEN-663
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
    // @ts-ignore @TODO VEN-663
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    // @ts-ignore @TODO VEN-663
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    // @ts-ignore @TODO VEN-663
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    await poolRegistry.addMarket({
      poolId: 1,
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
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    await poolRegistry.addMarket({
      poolId: 1,
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
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
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


    const vWBTCAddress = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );
    const vDAIAddress = await poolRegistry.getVTokenForAsset(
      1,
      mockDAI.address
    );

    vWBTC = await ethers.getContractAt("VBep20Immutable", vWBTCAddress);
    vDAI = await ethers.getContractAt("VBep20Immutable", vDAIAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptroller1Proxy
      .connect(owner)
      .enterMarkets([vDAI.address, vWBTC.address]);

    //Set Oracle
    await comptroller1Proxy._setPriceOracle(priceOracle.address);

    const PoolLens = await ethers.getContractFactory("PoolLens");
    // @ts-ignore @TODO VEN-663
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
    expect(venusPool_1_Actual[11]).equal(closeFactor1);
    expect(venusPool_1_Actual[12]).equal(liquidationIncentive1);
    expect(venusPool_1_Actual[13]).equal(0);

    const vTokens_Actual = venusPool_1_Actual[14];
    expect(vTokens_Actual.length).equal(2);

    // get VToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );
    const vTokenMetadata_WBTC_Expected = await poolLens.vTokenMetadata(
      vTokenAddress_WBTC
    );
    const vTokenMetadata_WBTC_Actual = vTokens_Actual[0];
    assertVTokenMetadata(
      vTokenMetadata_WBTC_Actual,
      vTokenMetadata_WBTC_Expected
    );

    // get VToken for Asset-2 : DAI
    const vTokenAddress_DAI = await poolRegistry.getVTokenForAsset(1, mockDAI.address);
    const vTokenMetadata_DAI_Expected = await poolLens.vTokenMetadata(vTokenAddress_DAI);
    const vTokenMetadata_DAI_Actual = vTokens_Actual[1];
    assertVTokenMetadata(vTokenMetadata_DAI_Actual, vTokenMetadata_DAI_Expected);

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
    expect(venusPool_1_Actual[11]).equal(closeFactor2);
    expect(venusPool_1_Actual[12]).equal(liquidationIncentive2);
    expect(venusPool_1_Actual[13]).equal(0);
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
    expect(poolData[11]).equal(closeFactor1);
    expect(poolData[12]).equal(liquidationIncentive1);
    expect(poolData[13]).equal(0);

    const vTokens_Actual = poolData[14];
    expect(vTokens_Actual.length).equal(2);

    // get VToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );
    const vTokenMetadata_WBTC_Expected = await poolLens.vTokenMetadata(
      vTokenAddress_WBTC
    );
    const vTokenMetadata_WBTC_Actual = vTokens_Actual[0];
    assertVTokenMetadata(
      vTokenMetadata_WBTC_Actual,
      vTokenMetadata_WBTC_Expected
    );

    // get VToken for Asset-2 : DAI
    const vTokenAddress_DAI = await poolRegistry.getVTokenForAsset(
      1,
      mockDAI.address
    );
    const vTokenMetadata_DAI_Expected = await poolLens.vTokenMetadata(
      vTokenAddress_DAI
    );
    const vTokenMetadata_DAI_Actual = vTokens_Actual[1];
    assertVTokenMetadata(
      vTokenMetadata_DAI_Actual,
      vTokenMetadata_DAI_Expected
    );
  });
});

describe("PoolLens - VTokens Query Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [owner, proxyAdmin] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

    const VBep20ImmutableProxyFactory = await ethers.getContractFactory(
      "VBep20ImmutableProxyFactory"
    );
    // @ts-ignore @TODO VEN-663
    vTokenFactory = await VBep20ImmutableProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory(
      "JumpRateModelFactory"
    );
    // @ts-ignore @TODO VEN-663
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModelFactory"
    );
    // @ts-ignore @TODO VEN-663
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    // @ts-ignore @TODO VEN-663
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    const Shortfall = await ethers.getContractFactory("Shortfall");
    const shortfall = await Shortfall.deploy();

    await shortfall.initialize(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      convertToUnit("10000", 18)
    )
    const RiskFund = await ethers.getContractFactory("RiskFund");
    // @ts-ignore @TODO VEN-663
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve = await ethers.getContractFactory(
      "ProtocolShareReserve"
    );
    // @ts-ignore @TODO VEN-663
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    await poolRegistry.initialize(
      vTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      riskFund.address,
      protocolShareReserve.address
    );

    await shortfall.setPoolRegistry(poolRegistry.address);

    poolRegistryAddress = poolRegistry.address;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    // @ts-ignore @TODO VEN-663
    comptroller1 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller1.deployed();
    // @ts-ignore @TODO VEN-663
    comptroller2 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller2.deployed();

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );
    // @ts-ignore @TODO VEN-663
    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();
    // @ts-ignore @TODO VEN-663
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
    // @ts-ignore @TODO VEN-663
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    // @ts-ignore @TODO VEN-663
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    // @ts-ignore @TODO VEN-663
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    await poolRegistry.addMarket({
      poolId: 1,
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
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    await poolRegistry.addMarket({
      poolId: 1,
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
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
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
    // @ts-ignore @TODO VEN-663
    poolLens = await PoolLens.deploy();
  });

  it("is correct for WBTC as underlyingAsset", async () => {
    // get CToken for Asset-1 : WBTC
    const vTokenAddress_WBTC = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );
    const vTokenMetadata_Actual = await poolLens.vTokenMetadata(
      vTokenAddress_WBTC
    );

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
    expect(vTokenMetadata_Actual_Parsed["collateralFactorMantissa"]).equal("0");
    expect(vTokenMetadata_Actual_Parsed["underlyingAssetAddress"]).equal(mockWBTC.address);
    expect(vTokenMetadata_Actual_Parsed["vTokenDecimals"]).equal("8");
    expect(vTokenMetadata_Actual_Parsed["underlyingDecimals"]).equal("8");
  });
});

const assertVTokenMetadata = (
  vTokenMetadata_Actual: any,
  vTokenMetadata_Expected: any
) => {
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

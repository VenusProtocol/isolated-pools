import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Beacon,
  Comptroller,
  MockPriceOracle,
  MockToken,
  PoolLens,
  PoolRegistry,
  ProtocolShareReserve,
  Shortfall,
  VToken,
} from "../../../typechain";

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

const assertVTokenMetadata = (vTokenMetadataActual: any, vTokenMetadataExpected: any) => {
  expect(vTokenMetadataActual.length).equal(vTokenMetadataExpected.length);
  vTokenMetadataActual.forEach((item, index) => {
    expect(item).equal(vTokenMetadataExpected[index]);
  });
};

describe("PoolLens", async function () {
  let poolRegistry: PoolRegistry;
  let poolRegistryAddress: string;
  let comptrollerBeacon: Beacon;
  let vTokenBeacon: Beacon;
  let mockDAI: MockToken;
  let mockWBTC: MockToken;
  let vDAI: VToken;
  let vWBTC: VToken;
  let priceOracle: MockPriceOracle;
  let comptroller1Proxy: Comptroller;
  let comptroller2Proxy: Comptroller;
  let poolLens: PoolLens;
  let ownerAddress: string;
  let fakeAccessControlManager: FakeContract<AccessControlManager>;
  let closeFactor1: BigNumberish;
  let closeFactor2: BigNumberish;
  let liquidationIncentive1: BigNumberish;
  let liquidationIncentive2: BigNumberish;
  const minLiquidatableCollateral = convertToUnit(100, 18);
  const maxLoopsLimit = 150;
  const defaultBtcPrice = "21000.34";
  const defaultDaiPrice = "1";
  let borrowerWbtc: Signer;
  let borrowerDai: Signer;

  interface PoolRegistryFixture {
    poolRegistry: PoolRegistry;
    fakeAccessControlManager: FakeContract<AccessControlManager>;
  }

  const poolRegistryFixture = async (): Promise<PoolRegistryFixture> => {
    const VTokenProxyFactory = await ethers.getContractFactory("VTokenProxyFactory");
    const vTokenFactory = await VTokenProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelFactory");
    const jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModelFactory");
    const whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const shortfall = await smock.fake<Shortfall>("Shortfall");
    const protocolShareReserve = await smock.fake<ProtocolShareReserve>("Shortfall");

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await upgrades.deployProxy(PoolRegistry, [
      vTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      protocolShareReserve.address,
      fakeAccessControlManager.address,
    ]);

    return { poolRegistry, fakeAccessControlManager };
  };

  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [owner, ...rest] = await ethers.getSigners();
    [borrowerWbtc, borrowerDai] = rest;
    ownerAddress = await owner.getAddress();

    ({ poolRegistry, fakeAccessControlManager } = await loadFixture(poolRegistryFixture));

    poolRegistryAddress = poolRegistry.address;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    const comptroller = await Comptroller.deploy(poolRegistry.address);
    await comptroller.deployed();

    const VTokenContract = await ethers.getContractFactory("VToken");
    const vToken = await VTokenContract.deploy();
    await vToken.deployed();

    const ComptrollerBeacon = await ethers.getContractFactory("Beacon");
    comptrollerBeacon = await ComptrollerBeacon.deploy(comptroller.address);
    await comptrollerBeacon.deployed();

    const VTokenBeacon = await ethers.getContractFactory("Beacon");
    vTokenBeacon = await VTokenBeacon.deploy(vToken.address);
    await vTokenBeacon.deployed();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    closeFactor1 = convertToUnit(0.05, 18);
    liquidationIncentive1 = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptrollerBeacon.address,
      closeFactor1,
      liquidationIncentive1,
      minLiquidatableCollateral,
      priceOracle.address,
      maxLoopsLimit,
      fakeAccessControlManager.address,
    );

    closeFactor2 = convertToUnit(0.05, 18);
    liquidationIncentive2 = convertToUnit(1, 18);

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptrollerBeacon.address,
      closeFactor2,
      liquidationIncentive2,
      minLiquidatableCollateral,
      priceOracle.address,
      maxLoopsLimit,
      fakeAccessControlManager.address,
    );

    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const daiBalance = await mockDAI.balanceOf(ownerAddress);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    await priceOracle.setPrice(mockDAI.address, convertToUnit(defaultDaiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(defaultBtcPrice, 28));

    const VToken = await ethers.getContractFactory("VToken");
    const tokenImplementation = await VToken.deploy();
    await tokenImplementation.deployed();

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");

    comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    await comptroller1Proxy.acceptOwnership();

    comptroller2Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
    await comptroller2Proxy.acceptOwnership();

    const initialSupply = convertToUnit(1000, 18);
    await mockWBTC.faucet(initialSupply);
    await mockWBTC.approve(poolRegistry.address, initialSupply);

    await mockDAI.faucet(initialSupply);
    await mockDAI.approve(poolRegistry.address, initialSupply);

    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Venus WBTC",
      symbol: "vWBTC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      reserveFactor: convertToUnit(0.3, 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply,
      vTokenReceiver: owner.address,
      supplyCap: convertToUnit(4000, 18),
      borrowCap: convertToUnit(2000, 18),
    });

    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockDAI.address,
      decimals: 18,
      name: "Venus DAI",
      symbol: "vDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      reserveFactor: convertToUnit(0.3, 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply,
      vTokenReceiver: owner.address,
      supplyCap: initialSupply,
      borrowCap: initialSupply,
    });

    await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, {
      category: "High market cap",
      logoURL: "http://venis.io/pool1",
      description: "Pool1 description",
    });

    await poolRegistry.updatePoolMetadata(comptroller2Proxy.address, {
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

    // Set Oracle
    await comptroller1Proxy.setPriceOracle(priceOracle.address);

    const PoolLens = await ethers.getContractFactory("PoolLens");
    poolLens = await PoolLens.deploy();
  });

  describe("PoolView Tests", () => {
    it("get All Pools", async function () {
      const poolData = await poolLens.getAllPools(poolRegistryAddress);

      expect(poolData.length).equal(2);

      const venusPool1Actual = poolData[0];

      expect(venusPool1Actual.name).equal("Pool 1");
      expect(venusPool1Actual.creator).equal(ownerAddress);
      expect(venusPool1Actual.comptroller).equal(comptroller1Proxy.address);
      expect(venusPool1Actual.category).equal("High market cap");
      expect(venusPool1Actual.logoURL).equal("http://venis.io/pool1");
      expect(venusPool1Actual.description).equal("Pool1 description");
      expect(venusPool1Actual.priceOracle).equal(priceOracle.address);
      expect(venusPool1Actual.closeFactor).equal(closeFactor1);
      expect(venusPool1Actual.liquidationIncentive).equal(liquidationIncentive1);
      expect(venusPool1Actual.minLiquidatableCollateral).equal(minLiquidatableCollateral);

      const vTokensActual = venusPool1Actual.vTokens;
      expect(vTokensActual.length).equal(2);

      // get VToken for Asset-1 : WBTC
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenMetadataWBTCExpected = await poolLens.vTokenMetadata(vTokenAddressWBTC);
      const vTokenMetadataWBTCActual = vTokensActual[0];
      assertVTokenMetadata(vTokenMetadataWBTCActual, vTokenMetadataWBTCExpected);

      // get VToken for Asset-2 : DAI
      const vTokenAddressDAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
      const vTokenMetadataDAIExpected = await poolLens.vTokenMetadata(vTokenAddressDAI);
      const vTokenMetadataDAIActual = vTokensActual[1];
      assertVTokenMetadata(vTokenMetadataDAIActual, vTokenMetadataDAIExpected);

      const venusPool2Actual = poolData[1];

      expect(venusPool2Actual.name).equal("Pool 2");
      expect(venusPool2Actual.creator).equal(ownerAddress);
      expect(venusPool2Actual.comptroller).equal(comptroller2Proxy.address);
      expect(venusPool2Actual.category).equal("Low market cap");
      expect(venusPool2Actual.logoURL).equal("http://highrisk.io/pool2");
      expect(venusPool2Actual.description).equal("Pool2 description");
      expect(venusPool1Actual.priceOracle).equal(priceOracle.address);
      expect(venusPool1Actual.closeFactor).equal(closeFactor2);
      expect(venusPool1Actual.liquidationIncentive).equal(liquidationIncentive2);
      expect(venusPool1Actual.minLiquidatableCollateral).equal(minLiquidatableCollateral);
    });

    it("getPoolData By Comptroller", async function () {
      const poolData = await poolLens.getPoolByComptroller(poolRegistryAddress, comptroller1Proxy.address);

      expect(poolData.name).equal("Pool 1");
      expect(poolData.creator).equal(ownerAddress);
      expect(poolData.comptroller).equal(comptroller1Proxy.address);
      expect(poolData.category).equal("High market cap");
      expect(poolData.logoURL).equal("http://venis.io/pool1");
      expect(poolData.description).equal("Pool1 description");
      expect(poolData.priceOracle).equal(priceOracle.address);
      expect(poolData.closeFactor).equal(closeFactor1);
      expect(poolData.liquidationIncentive).equal(liquidationIncentive1);
      expect(poolData.minLiquidatableCollateral).equal(minLiquidatableCollateral);

      const vTokensActual = poolData.vTokens;
      expect(vTokensActual.length).equal(2);

      // get VToken for Asset-1 : WBTC
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenMetadataWBTCExpected = await poolLens.vTokenMetadata(vTokenAddressWBTC);
      const vTokenMetadataWBTCActual = vTokensActual[0];
      assertVTokenMetadata(vTokenMetadataWBTCActual, vTokenMetadataWBTCExpected);

      // get VToken for Asset-2 : DAI
      const vTokenAddressDAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
      const vTokenMetadataDAIExpected = await poolLens.vTokenMetadata(vTokenAddressDAI);
      const vTokenMetadataDAIActual = vTokensActual[1];
      assertVTokenMetadata(vTokenMetadataDAIActual, vTokenMetadataDAIExpected);
    });
  });

  describe("PoolLens - VTokens Query Tests", async function () {
    it("get all info of pools user specific", async function () {
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenAddressDAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
      const res = await poolLens.callStatic.vTokenBalancesAll([vTokenAddressWBTC, vTokenAddressDAI], ownerAddress);
      expect(res[0][0]).equal(vTokenAddressWBTC);
      expect(res[1][0]).equal(vTokenAddressDAI);
    });

    it("get underlying price", async function () {
      const vTokenAddressDAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
      const res = await poolLens.vTokenUnderlyingPrice(vTokenAddressDAI);
      expect(res[1]).equal(convertToUnit(1, 18));
    });

    it("get underlying price all", async function () {
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenAddressDAI = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);
      const res = await poolLens.vTokenUnderlyingPriceAll([vTokenAddressDAI, vTokenAddressWBTC]);
      expect(res[0][1]).equal(convertToUnit(1, 18));
      expect(res[1][1]).equal(convertToUnit("21000.34", 28));
    });

    it("get underlying price all", async function () {
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenAddressWBTCPool = await poolLens.getVTokenForAsset(
        poolRegistry.address,
        comptroller1Proxy.address,
        mockWBTC.address,
      );
      expect(vTokenAddressWBTC).equal(vTokenAddressWBTCPool);
    });

    it("is correct for WBTC as underlyingAsset", async () => {
      // get CToken for Asset-1 : WBTC
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenMetadataActual = await poolLens.vTokenMetadata(vTokenAddressWBTC);

      const vTokenMetadataActualParsed = cullTuple(vTokenMetadataActual);
      expect(vTokenMetadataActualParsed["vToken"]).equal(vTokenAddressWBTC);
      expect(vTokenMetadataActualParsed["exchangeRateCurrent"]).equal(convertToUnit(1, 18));
      expect(vTokenMetadataActualParsed["supplyRatePerBlock"]).equal("0");
      expect(vTokenMetadataActualParsed["borrowRatePerBlock"]).equal("0");
      expect(vTokenMetadataActualParsed["reserveFactorMantissa"]).equal(convertToUnit(0.3, 18));
      expect(vTokenMetadataActualParsed["supplyCaps"]).equal("4000000000000000000000");
      expect(vTokenMetadataActualParsed["borrowCaps"]).equal("2000000000000000000000");
      expect(vTokenMetadataActualParsed["totalBorrows"]).equal("0");
      expect(vTokenMetadataActualParsed["totalReserves"]).equal("0");
      expect(vTokenMetadataActualParsed["totalSupply"]).equal(convertToUnit(10000000000000, 8));
      expect(vTokenMetadataActualParsed["totalCash"]).equal(convertToUnit(10000000000000, 8));
      expect(vTokenMetadataActualParsed["isListed"]).equal("true");
      expect(vTokenMetadataActualParsed["collateralFactorMantissa"]).equal("700000000000000000");
      expect(vTokenMetadataActualParsed["underlyingAssetAddress"]).equal(mockWBTC.address);
      expect(vTokenMetadataActualParsed["vTokenDecimals"]).equal("8");
      expect(vTokenMetadataActualParsed["underlyingDecimals"]).equal("8");
    });

    it("is correct minted for user", async () => {
      const vTokenAddressWBTC = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
      const vTokenBalance = await poolLens.callStatic.vTokenBalances(vTokenAddressWBTC, ownerAddress);
      expect(vTokenBalance["balanceOfUnderlying"]).equal(convertToUnit(10000000000000, 8));
      expect(vTokenBalance["balanceOf"]).equal(convertToUnit(10000000000000, 8));
    });
  });

  describe("Shortfall view functions", () => {
    it("getPoolBadDebt - no pools have debt", async () => {
      const resp = await poolLens.getPoolBadDebt(comptroller1Proxy.address);

      expect(resp.comptroller).to.be.equal(comptroller1Proxy.address);
      expect(resp.totalBadDebtUsd).to.be.equal(0);

      expect(resp.badDebts[0][0]).to.be.equal(vWBTC.address);
      expect(resp.badDebts[0][1].toString()).to.be.equal("0");

      expect(resp.badDebts[1][0]).to.be.equal(vDAI.address);
      expect(resp.badDebts[1][1].toString()).to.be.equal("0");
    });

    it("getPoolBadDebt - all pools have debt", async () => {
      const [owner] = await ethers.getSigners();
      // Setup
      await comptroller1Proxy.setMarketSupplyCaps(
        [vWBTC.address, vDAI.address],
        [convertToUnit("9000000000", 18), convertToUnit("9000000000", 18)],
      );

      await mockWBTC.connect(borrowerDai).faucet(convertToUnit("20", 18));
      await mockWBTC.connect(borrowerDai).approve(vWBTC.address, convertToUnit("20", 18));
      await vWBTC.connect(borrowerDai).mint(convertToUnit("2", 18));
      await comptroller1Proxy.connect(borrowerDai).enterMarkets([vWBTC.address]);
      await vDAI.connect(borrowerDai).borrow(convertToUnit("0.05", 18));
      await mine(1);

      await mockDAI.connect(borrowerWbtc).faucet(convertToUnit("900000000", 18));
      await mockDAI.connect(borrowerWbtc).approve(vDAI.address, convertToUnit("9000000000", 18));
      await mockDAI.connect(borrowerWbtc).approve(vDAI.address, convertToUnit("9000000000", 18));
      await vDAI.connect(borrowerWbtc).mint(convertToUnit("900000000", 18));
      await comptroller1Proxy.connect(borrowerWbtc).enterMarkets([vDAI.address]);
      await vWBTC.connect(borrowerWbtc).borrow(convertToUnit("0.000001", 18));
      await mine(1);

      await mockDAI.connect(owner).approve(vDAI.address, convertToUnit("9000000000", 18));
      await mockWBTC.connect(owner).approve(vWBTC.address, convertToUnit("9000000000", 18));
      await priceOracle.setPrice(mockWBTC.address, convertToUnit("0.000000000000001", 18));
      await mine(1);

      await comptroller1Proxy.connect(owner).healAccount(await borrowerDai.getAddress());

      await priceOracle.setPrice(mockWBTC.address, convertToUnit(defaultBtcPrice, 28));
      await priceOracle.setPrice(mockDAI.address, convertToUnit("0.0000000000000001", 18));
      await comptroller1Proxy.connect(owner).healAccount(await borrowerWbtc.getAddress());
      // End Setup

      const resp = await poolLens.getPoolBadDebt(comptroller1Proxy.address);

      expect(resp.comptroller).to.be.equal(comptroller1Proxy.address);
      expect(resp.totalBadDebtUsd).to.be.equal("210003400000000000000000005000000000023582400");

      expect(resp.badDebts[1][0]).to.be.equal(vDAI.address);
      expect(resp.badDebts[1][1].toString()).to.be.equal("5000000000023582400");

      expect(resp.badDebts[0][0]).to.be.equal(vWBTC.address);
      expect(resp.badDebts[0][1].toString()).to.be.equal("210003400000000000000000000000000000000000000");

      // Cleanup
      await priceOracle.setPrice(mockDAI.address, convertToUnit(defaultDaiPrice, 18));
      await priceOracle.setPrice(mockWBTC.address, convertToUnit(defaultBtcPrice, 28));
    });
  });
});

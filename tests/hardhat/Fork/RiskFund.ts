import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  JumpRateModelFactory,
  MockPriceOracle,
  MockToken,
  MockToken__factory,
  PancakeRouter,
  PancakeRouter__factory,
  PoolRegistry,
  ProtocolShareReserve,
  RiskFund,
  VToken,
  VTokenProxyFactory,
  WhitePaperInterestRateModelFactory,
} from "../../../typechain";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let comptroller3: Comptroller;
let mainnetUSDC: MockToken;
let mainnetBUSD: MockToken;
let mainnetUSDT: MockToken;
let cUSDC: VToken;
let cUSDT: VToken;
let cUSDC2: VToken;
let cUSDT2: VToken;
let cUSDT3: VToken;
let bUSDT3: VToken;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let comptroller2Proxy: Comptroller;
let comptroller3Proxy: Comptroller;
let vTokenFactory: VTokenProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;
let pancakeSwapRouter: PancakeRouter;
let busdUser: any;
let usdcUser: any;
let usdtUser: any;

const riskFundFixture = async (): Promise<void> => {
  const [admin, user, proxyAdmin] = await ethers.getSigners();
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

  const RiskFund = await ethers.getContractFactory("RiskFund");
  riskFund = await RiskFund.deploy();
  await riskFund.deployed();

  const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
  protocolShareReserve = await ProtocolShareReserve.deploy();
  await protocolShareReserve.deployed();

  const Shortfall = await ethers.getContractFactory("Shortfall");
  const shortfall = await Shortfall.deploy();

  await shortfall.initialize(ethers.constants.AddressZero, ethers.constants.AddressZero, convertToUnit("10000", 18));

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

  const Comptroller = await ethers.getContractFactory("Comptroller");

  comptroller1 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
  await comptroller1.deployed();

  comptroller2 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
  await comptroller2.deployed();

  comptroller3 = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
  await comptroller3.deployed();

  // Impersonate Accounts.
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: ["0xFd2FB1D2f41347527492656aD76E86820e5735F2"],
  });

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: ["0x64f87BCa71227b97D2762907871E8188b4B1DddF"],
  });

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: ["0xE4FEb3e94B4128d973A366dc4814167a90629A08"],
  });

  // Get signers
  busdUser = await ethers.getSigner("0xFd2FB1D2f41347527492656aD76E86820e5735F2");
  usdcUser = await ethers.getSigner("0x64f87BCa71227b97D2762907871E8188b4B1DddF");
  usdtUser = await ethers.getSigner("0xE4FEb3e94B4128d973A366dc4814167a90629A08");

  // Connecting to tokens
  mainnetUSDC = await MockToken__factory.connect("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", user);

  mainnetBUSD = await MockToken__factory.connect("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", user);

  mainnetUSDT = await MockToken__factory.connect("0x55d398326f99059fF775485246999027B3197955", user);

  const _closeFactor = convertToUnit(0.05, 18);
  const _liquidationIncentive = convertToUnit(1, 18);
  const _minLiquidatableCollateral = convertToUnit(100, 18);

  // Deploy Price Oracle
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  priceOracle = await MockPriceOracle.deploy();

  const usdtPrice = ".75";
  const usdcPrice = "1";
  const busdPrice = "1.1";

  await priceOracle.setPrice(mainnetUSDC.address, convertToUnit(usdcPrice, 18));
  await priceOracle.setPrice(mainnetUSDT.address, convertToUnit(usdtPrice, 18));
  await priceOracle.setPrice(mainnetBUSD.address, convertToUnit(busdPrice, 18));

  // Registering the first pool
  await poolRegistry.createRegistryPool(
    "Pool 1",
    proxyAdmin.address,
    comptroller1.address,
    _closeFactor,
    _liquidationIncentive,
    _minLiquidatableCollateral,
    priceOracle.address,
  );

  // Registering the second pool
  await poolRegistry.createRegistryPool(
    "Pool 2",
    proxyAdmin.address,
    comptroller2.address,
    _closeFactor,
    _liquidationIncentive,
    _minLiquidatableCollateral,
    priceOracle.address,
  );

  // Registering the third pool
  await poolRegistry.createRegistryPool(
    "Pool 3",
    proxyAdmin.address,
    comptroller3.address,
    _closeFactor,
    _liquidationIncentive,
    _minLiquidatableCollateral,
    priceOracle.address,
  );

  // Setup Proxies
  const pools = await poolRegistry.callStatic.getAllPools();
  comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
  await comptroller1Proxy.acceptAdmin();

  comptroller2Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
  await comptroller2Proxy.acceptAdmin();

  comptroller3Proxy = await ethers.getContractAt("Comptroller", pools[2].comptroller);
  await comptroller3Proxy.acceptAdmin();

  const VToken = await ethers.getContractFactory("VToken");
  const tokenImplementation = await VToken.deploy();
  await tokenImplementation.deployed();

  // Deploy CTokens
  await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: mainnetUSDT.address,
    decimals: 8,
    name: "Compound USDT",
    symbol: "cUSDT",
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
    asset: mainnetUSDC.address,
    decimals: 18,
    name: "Compound USDC",
    symbol: "cUSDC",
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
    comptroller: comptroller2Proxy.address,
    asset: mainnetUSDT.address,
    decimals: 8,
    name: "Compound USDT",
    symbol: "cUSDT",
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
    comptroller: comptroller2Proxy.address,
    asset: mainnetUSDC.address,
    decimals: 18,
    name: "Compound USDC",
    symbol: "cUSDC",
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
    comptroller: comptroller3Proxy.address,
    asset: mainnetUSDT.address,
    decimals: 8,
    name: "Compound USDT",
    symbol: "cUSDT",
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
    comptroller: comptroller3Proxy.address,
    asset: mainnetBUSD.address,
    decimals: 8,
    name: "BUSDT",
    symbol: "bUSDT",
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

  const cUSDT1Address = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mainnetUSDT.address);

  const cUSDC1Address = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mainnetUSDC.address);

  const cUSDT2Address = await poolRegistry.getVTokenForAsset(comptroller2Proxy.address, mainnetUSDT.address);

  const cUSDC2Address = await poolRegistry.getVTokenForAsset(comptroller2Proxy.address, mainnetUSDC.address);

  const cUSDT3Address = await poolRegistry.getVTokenForAsset(comptroller3Proxy.address, mainnetUSDT.address);

  const bUSDT3Address = await poolRegistry.getVTokenForAsset(comptroller3Proxy.address, mainnetBUSD.address);

  cUSDT = await ethers.getContractAt("VToken", cUSDT1Address);
  cUSDC = await ethers.getContractAt("VToken", cUSDC1Address);
  cUSDT2 = await ethers.getContractAt("VToken", cUSDT2Address);
  cUSDC2 = await ethers.getContractAt("VToken", cUSDC2Address);
  cUSDT3 = await ethers.getContractAt("VToken", cUSDT3Address);
  bUSDT3 = await ethers.getContractAt("VToken", bUSDT3Address);

  // Enter Markets

  await comptroller1Proxy.connect(user).enterMarkets([cUSDC.address, cUSDT.address]);

  await comptroller2Proxy.connect(user).enterMarkets([cUSDC2.address, cUSDT2.address]);

  await comptroller3Proxy.connect(user).enterMarkets([cUSDT3.address, bUSDT3.address]);

  // Set Oracle
  await comptroller1Proxy._setPriceOracle(priceOracle.address);
  await comptroller2Proxy._setPriceOracle(priceOracle.address);
  await comptroller3Proxy._setPriceOracle(priceOracle.address);

  pancakeSwapRouter = await PancakeRouter__factory.connect("0x10ED43C718714eb63d5aA57B78B54704E256024E", admin);

  await riskFund.initialize(
    pancakeSwapRouter.address,
    convertToUnit(10, 18),
    convertToUnit(10, 18),
    mainnetBUSD.address,
    fakeAccessControlManager.address,
  );
  await riskFund.setPoolRegistry(poolRegistry.address);

  const fakeProtocolIncome = await smock.fake<RiskFund>("RiskFund");

  await protocolShareReserve.initialize(fakeProtocolIncome.address, riskFund.address);
};

describe("Risk Fund: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  beforeEach(async function () {
    await loadFixture(riskFundFixture);
  });

  describe("Test all setters", async function () {
    it("Revert on invalid Pool registry address.", async function () {
      await expect(riskFund.setPoolRegistry("0x0000000000000000000000000000000000000000")).to.be.rejectedWith(
        "Risk Fund: Pool registry address invalid",
      );
    });

    it("Revert on invalid Pancake swap address.", async function () {
      await expect(riskFund.setPancakeSwapRouter("0x0000000000000000000000000000000000000000")).to.be.rejectedWith(
        "Risk Fund: Pancake swap address invalid",
      );
    });

    it("Revert on invalid min amount to convert.", async function () {
      await expect(riskFund.setMinAmountToConvert(0)).to.be.rejectedWith("Risk Fund: Invalid min amout to convert");
    });
  });

  describe("Risk fund transfers", async function () {
    it("Convert to BUSD without funds", async function () {
      const amount = await riskFund.callStatic.swapAllPoolsAssets();
      expect(amount).equal("0");
    });

    it("Below min threshold amount", async function () {
      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await cUSDC._reduceReserves(convertToUnit(50, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDCBal).equal(convertToUnit(50, 18));
      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDC.address, convertToUnit(30, 18));
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(9, 18));

      const amount = await riskFund.callStatic.swapAllPoolsAssets();
      expect(amount).equal("0");
    });

    it("Above min threshold amount", async function () {
      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDC.address, convertToUnit(100, 18));
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

      await riskFund.swapAllPoolsAssets();
      const balanceAfter = await mainnetUSDC.balanceOf(riskFund.address);
      expect(balanceAfter).equal("0");

      const balanceBUSD = await mainnetBUSD.balanceOf(riskFund.address);
      expect(Number(balanceBUSD)).to.be.closeTo(Number(convertToUnit(30, 18)), Number(convertToUnit(3, 17)));
    });

    it("Add two assets to riskFund", async function () {
      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      const protocolReserveUSDTBal = await mainnetUSDT.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDTBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDC.address, convertToUnit(100, 18));
      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDT.address, convertToUnit(100, 18));
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

      const riskFundUSDTBal = await mainnetUSDT.balanceOf(riskFund.address);
      expect(riskFundUSDTBal).equal(convertToUnit(30, 18));

      await riskFund.swapAllPoolsAssets();
      const balanceBUSD = await mainnetBUSD.balanceOf(riskFund.address);
      expect(Number(balanceBUSD)).to.be.closeTo(Number(convertToUnit(60, 18)), Number(convertToUnit(3, 17)));

      const pool1Reserve = await riskFund.getPoolReserve(comptroller1Proxy.address);
      const pool2Reserve = await riskFund.getPoolReserve("0x0000000000000000000000000000000000000000");
      expect(Number(pool1Reserve)).to.be.closeTo(Number(convertToUnit(60, 18)), Number(convertToUnit(3, 17)));
      expect(pool2Reserve).equal(0);
    });
  });

  describe("Transfer to Auction contract", async function () {
    it("Revert while transfering funds to Auction contract", async function () {
      await expect(
        riskFund.transferReserveForAuction(comptroller1Proxy.address, convertToUnit(30, 18)),
      ).to.be.rejectedWith("Risk Fund: Auction contract invalid address.");

      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await expect(
        riskFund.transferReserveForAuction(comptroller1Proxy.address, convertToUnit(100, 18)),
      ).to.be.rejectedWith("Risk Fund: Insufficient pool reserve.");
    });

    it("Transfer funds to auction contact", async function () {
      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));
      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      const protocolReserveUSDTBal = await mainnetUSDT.balanceOf(protocolShareReserve.address);
      expect(protocolReserveUSDTBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDC.address, convertToUnit(100, 18));
      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDT.address, convertToUnit(100, 18));
      await riskFund.swapAllPoolsAssets();

      const beforeTransfer = await mainnetBUSD.balanceOf(auctionContract);
      await riskFund.transferReserveForAuction(comptroller1Proxy.address, convertToUnit(20, 18));
      const afterTransfer = await mainnetBUSD.balanceOf(auctionContract);
      const remainingBalance = await mainnetBUSD.balanceOf(riskFund.address);
      const poolReserve = await riskFund.getPoolReserve(comptroller1Proxy.address);

      const amount = Number(afterTransfer) - Number(beforeTransfer);
      expect(amount).to.be.closeTo(Number(convertToUnit(20, 18)), Number(convertToUnit(3, 17)));
      expect(remainingBalance).equal(poolReserve);
    });

    it("Should revert the transfer to auction transaction", async function () {
      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));
      await riskFund.swapAllPoolsAssets();

      fakeAccessControlManager.isAllowedToCall.returns(false);
      await expect(
        riskFund.transferReserveForAuction(comptroller1Proxy.address, convertToUnit(20, 18)),
      ).to.be.rejectedWith("Risk fund: Not authorized to transfer funds.");
    });

    it("Transfer single asset from multiple pools to riskFund.", async function () {
      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await mainnetUSDC.connect(usdcUser).approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDC.connect(usdcUser).approve(cUSDC2.address, convertToUnit(1000, 18));

      await cUSDC2.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT2.address, convertToUnit(1000, 18));

      await cUSDT2.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT.connect(usdtUser).approve(cUSDT3.address, convertToUnit(1000, 18));

      await cUSDT3.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await mainnetBUSD.connect(busdUser).approve(bUSDT3.address, convertToUnit(1000, 18));

      await bUSDT3.connect(busdUser)._addReserves(convertToUnit(50, 18));

      await cUSDT._reduceReserves(convertToUnit(110, 18));
      await cUSDC._reduceReserves(convertToUnit(120, 18));
      await cUSDT2._reduceReserves(convertToUnit(150, 18));
      await cUSDC2._reduceReserves(convertToUnit(160, 18));
      await cUSDT3._reduceReserves(convertToUnit(175, 18));
      await bUSDT3._reduceReserves(convertToUnit(50, 18));

      let protocolUSDTFor1 = await protocolShareReserve.getPoolAssetReserve(
        comptroller1Proxy.address,
        mainnetUSDT.address,
      );
      let protocolUSDCFor1 = await protocolShareReserve.getPoolAssetReserve(
        comptroller1Proxy.address,
        mainnetUSDC.address,
      );
      let protocolUSDTFor2 = await protocolShareReserve.getPoolAssetReserve(
        comptroller2Proxy.address,
        mainnetUSDT.address,
      );
      let protocolUSDCFor2 = await protocolShareReserve.getPoolAssetReserve(
        comptroller2Proxy.address,
        mainnetUSDC.address,
      );
      let protocolUSDTFor3 = await protocolShareReserve.getPoolAssetReserve(
        comptroller3Proxy.address,
        mainnetUSDT.address,
      );
      let protocolBUSDTFor3 = await protocolShareReserve.getPoolAssetReserve(
        comptroller3Proxy.address,
        mainnetBUSD.address,
      );

      expect(protocolUSDTFor1).equal(convertToUnit(110, 18));
      expect(protocolUSDTFor2).equal(convertToUnit(150, 18));
      expect(protocolUSDTFor3).equal(convertToUnit(175, 18));
      expect(protocolUSDCFor1).equal(convertToUnit(120, 18));
      expect(protocolUSDCFor2).equal(convertToUnit(160, 18));
      expect(protocolBUSDTFor3).equal(convertToUnit(50, 18));

      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDT.address, convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(comptroller2Proxy.address, mainnetUSDT.address, convertToUnit(110, 18));

      await protocolShareReserve.releaseFunds(comptroller3Proxy.address, mainnetUSDT.address, convertToUnit(130, 18));

      await protocolShareReserve.releaseFunds(comptroller1Proxy.address, mainnetUSDC.address, convertToUnit(90, 18));

      await protocolShareReserve.releaseFunds(comptroller2Proxy.address, mainnetUSDC.address, convertToUnit(80, 18));

      await protocolShareReserve.releaseFunds(comptroller3Proxy.address, mainnetBUSD.address, convertToUnit(50, 18));

      protocolUSDTFor1 = await protocolShareReserve.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDT.address);
      protocolUSDCFor1 = await protocolShareReserve.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDC.address);
      protocolUSDTFor2 = await protocolShareReserve.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDT.address);
      protocolUSDCFor2 = await protocolShareReserve.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDC.address);
      protocolUSDTFor3 = await protocolShareReserve.getPoolAssetReserve(comptroller3Proxy.address, mainnetUSDT.address);
      protocolBUSDTFor3 = await protocolShareReserve.getPoolAssetReserve(
        comptroller3Proxy.address,
        mainnetBUSD.address,
      );

      expect(protocolUSDTFor1).equal(convertToUnit(10, 18));
      expect(protocolUSDTFor2).equal(convertToUnit(40, 18));
      expect(protocolUSDTFor3).equal(convertToUnit(45, 18));
      expect(protocolUSDCFor1).equal(convertToUnit(30, 18));
      expect(protocolUSDCFor2).equal(convertToUnit(80, 18));
      expect(protocolBUSDTFor3).equal(convertToUnit(0, 18));

      let riskUSDTFor1 = await riskFund.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDT.address);
      let riskUSDCFor1 = await riskFund.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDC.address);
      let riskUSDTFor2 = await riskFund.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDT.address);
      let riskUSDCFor2 = await riskFund.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDC.address);
      let riskUSDTFor3 = await riskFund.getPoolAssetReserve(comptroller3Proxy.address, mainnetUSDT.address);
      let riskBUSDTFor3 = await riskFund.getPoolAssetReserve(comptroller3Proxy.address, mainnetBUSD.address);

      expect(riskUSDTFor1).equal(convertToUnit(30, 18));
      expect(riskUSDCFor1).equal(convertToUnit(27, 18));
      expect(riskUSDTFor2).equal(convertToUnit(33, 18));
      expect(riskUSDCFor2).equal(convertToUnit(24, 18));
      expect(riskUSDTFor3).equal(convertToUnit(39, 18));
      expect(riskBUSDTFor3).equal(convertToUnit(15, 18));

      await riskFund.swapAllPoolsAssets();

      riskUSDTFor1 = await riskFund.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDT.address);
      riskUSDCFor1 = await riskFund.getPoolAssetReserve(comptroller1Proxy.address, mainnetUSDC.address);
      riskUSDTFor2 = await riskFund.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDT.address);
      riskUSDCFor2 = await riskFund.getPoolAssetReserve(comptroller2Proxy.address, mainnetUSDC.address);
      riskUSDTFor3 = await riskFund.getPoolAssetReserve(comptroller3Proxy.address, mainnetUSDT.address);
      riskBUSDTFor3 = await riskFund.getPoolAssetReserve(comptroller3Proxy.address, mainnetBUSD.address);

      expect(riskUSDTFor1).equal(0);
      expect(riskUSDCFor1).equal(0);
      expect(riskUSDTFor2).equal(0);
      expect(riskUSDCFor2).equal(0);
      expect(riskUSDTFor3).equal(0);
      expect(riskBUSDTFor3).equal(0);

      const poolReserve1 = await riskFund.getPoolReserve(comptroller1Proxy.address);

      const poolReserve2 = await riskFund.getPoolReserve(comptroller2Proxy.address);

      const poolReserve3 = await riskFund.getPoolReserve(comptroller3Proxy.address);

      expect(poolReserve1).to.be.closeTo(convertToUnit(56, 18), convertToUnit(9, 17));
      expect(poolReserve2).to.be.closeTo(convertToUnit(56, 18), convertToUnit(9, 17));
      expect(poolReserve3).to.be.closeTo(convertToUnit(53, 18), convertToUnit(9, 17));
    });
  });
});

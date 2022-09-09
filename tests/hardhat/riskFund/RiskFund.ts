import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

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
  PancakeRouter__factory,
  PancakeRouter,
  MockToken__factory,
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let comptroller2: Comptroller;
let mockUSDC: MockToken;
let mockBUSD: MockToken;
let mockUSDT: MockToken;
let cUSDC: CErc20Immutable;
let cUSDT: CErc20Immutable;
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
let pancakeSwapRouter: PancakeRouter;
let busdUser: any;
let usdcUser: any;
let usdtUser: any;

describe("Risk Fund: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    // const signers = await ethers.getSigners();
    const [admin, user] = await ethers.getSigners();
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
    busdUser = await ethers.getSigner(
      "0xFd2FB1D2f41347527492656aD76E86820e5735F2"
    );
    usdcUser = await ethers.getSigner(
      "0x64f87BCa71227b97D2762907871E8188b4B1DddF"
    );
    usdtUser = await ethers.getSigner(
      "0xE4FEb3e94B4128d973A366dc4814167a90629A08"
    );

    // Connecting to tokens
    mockUSDC = await MockToken__factory.connect(
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      user
    );

    mockBUSD = await MockToken__factory.connect(
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      user
    );

    mockUSDT = await MockToken__factory.connect(
      "0x55d398326f99059fF775485246999027B3197955",
      user
    );

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const usdtPrice = ".75";
    const usdcPrice = "1";
    const busdPrice = "1.1";

    await priceOracle.setPrice(mockUSDC.address, convertToUnit(usdcPrice, 18));
    await priceOracle.setPrice(mockUSDT.address, convertToUnit(usdtPrice, 18));
    await priceOracle.setPrice(mockBUSD.address, convertToUnit(busdPrice, 18));

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
      asset: mockUSDT.address,
      decimals: 8,
      name: "Compound USDT",
      symbol: "cUSDT",
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
      asset: mockUSDC.address,
      decimals: 18,
      name: "Compound USDC",
      symbol: "cUSDC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
    });

    const cUSDTAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockUSDT.address
    );
    const cUSDCAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockUSDC.address
    );

    cUSDT = await ethers.getContractAt("CErc20Immutable", cUSDTAddress);
    cUSDC = await ethers.getContractAt("CErc20Immutable", cUSDCAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([cUSDC.address, cUSDT.address]);
    await comptroller1Proxy
      .connect(user)
      .enterMarkets([cUSDC.address, cUSDT.address]);

    // Set Oracle
    await comptroller1Proxy._setPriceOracle(priceOracle.address);

    pancakeSwapRouter = await PancakeRouter__factory.connect(
      "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      admin
    );

    await riskFund.initialize(
      pancakeSwapRouter.address,
      convertToUnit(10, 18),
      convertToUnit(20, 18),
      mockBUSD.address
    );
    await riskFund.setPoolRegistry(poolRegistry.address);
  });

  describe("Test all setters", async function () {
    it("Revert on invalid Pool registry address.", async function () {
      await expect(
        riskFund.setPoolRegistry("0x0000000000000000000000000000000000000000")
      ).to.be.rejectedWith("Risk Fund: Pool registry address invalid");
    });

    it("Revert on invalid Pancake swap address.", async function () {
      await expect(
        riskFund.setPancakeSwapRouter(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.rejectedWith("Risk Fund: Pancake swap address invalid");
    });

    it("Revert on invalid min amount to convert.", async function () {
      await expect(riskFund.setMinAmountToConvert(0)).to.be.rejectedWith(
        "Risk Fund: Invalid min amout to convert"
      );
    });
  });

  it("Convert to BUSD without funds", async function () {
    const amount = await riskFund.callStatic.swapAllPoolsAssets();
    expect(amount).equal("0");
  });

  it("Below min threshold amount", async function () {
    await mockUSDC
      .connect(usdcUser)
      .approve(cUSDC.address, convertToUnit(1000, 18));

    await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));
    await cUSDC._reduceReserves(convertToUnit(50, 18));

    const riskFundUSDCBal = await mockUSDC.balanceOf(riskFund.address);
    expect(riskFundUSDCBal).equal(convertToUnit(15, 18));

    const amount = await riskFund.callStatic.swapAllPoolsAssets();
    expect(amount).equal("0");
  });

  it("Above min threshold amount", async function () {
    await cUSDC._reduceReserves(convertToUnit(50, 18));

    const riskFundUSDCBal = await mockUSDC.balanceOf(riskFund.address);
    expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

    await riskFund.swapAllPoolsAssets();
    const balanceAfter = await mockUSDC.balanceOf(riskFund.address);
    expect(balanceAfter).equal("0");

    const balanceBUSD = await mockBUSD.balanceOf(riskFund.address);
    expect(Number(balanceBUSD)).to.be.greaterThan(
      Number(convertToUnit(29, 18))
    );
  });

  it("Add two assets to riskFund", async function () {
    await mockUSDT
      .connect(usdtUser)
      .approve(cUSDT.address, convertToUnit(1000, 18));

    await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

    await cUSDT._reduceReserves(convertToUnit(100, 18));
    await cUSDC._reduceReserves(convertToUnit(100, 18));

    const riskFundUSDCBal = await mockUSDC.balanceOf(riskFund.address);
    expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

    const riskFundUSDTBal = await mockUSDT.balanceOf(riskFund.address);
    expect(riskFundUSDTBal).equal(convertToUnit(30, 18));

    await riskFund.swapAllPoolsAssets();
    const balanceBUSD = await mockBUSD.balanceOf(riskFund.address);
    expect(Number(balanceBUSD)).to.be.greaterThan(
      Number(convertToUnit(89, 18))
    );

    const pool1Reserve = await riskFund.getPoolReserve(1);
    const pool2Reserve = await riskFund.getPoolReserve(2);
    expect(Number(pool1Reserve)).to.be.greaterThan(
      Number(convertToUnit(89, 18))
    );
    expect(pool2Reserve).equal(0);
  });

  it("Revert while transfering funds to Auction contract", async function () {
    await expect(
      riskFund.transferReserveForAuction(1, convertToUnit(30, 18))
    ).to.be.rejectedWith("Risk Fund: Auction contract invalid address.");

    const auctionContract = "0x0000000000000000000000000000000000000001";
    await riskFund.setAuctionContractAddress(auctionContract);

    await expect(
      riskFund.transferReserveForAuction(1, convertToUnit(100, 18))
    ).to.be.rejectedWith("Risk Fund: Insufficient balance.");
  });

  it("Transfer funds to auction contact", async function () {
    const auctionContract = "0x0000000000000000000000000000000000000001";

    await riskFund.transferReserveForAuction(1, convertToUnit(30, 18));
    const amount = await mockBUSD.balanceOf(auctionContract);
    const remainingBalance = await mockBUSD.balanceOf(riskFund.address);
    const poolReserve = await riskFund.getPoolReserve(1);

    expect(Number(amount)).to.be.greaterThan(Number(convertToUnit(20, 18)));
    expect(remainingBalance).equal(poolReserve);
  });
});

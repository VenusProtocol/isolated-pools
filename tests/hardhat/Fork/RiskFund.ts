import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  PoolRegistry,
  RiskFund,
  ProtocolShareReserve,
  MockToken,
  Comptroller,
  VBep20Immutable,
  MockPriceOracle,
  Unitroller,
  VBep20ImmutableProxyFactory,
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
let mainnetUSDC: MockToken;
let mainnetBUSD: MockToken;
let mainnetUSDT: MockToken;
let cUSDC: VBep20Immutable;
let cUSDT: VBep20Immutable;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let unitroller1: Unitroller;
let unitroller2: Unitroller;
let vTokenFactory: VBep20ImmutableProxyFactory;
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

  const Shortfall = await ethers.getContractFactory("Shortfall");
  const shortfall = await Shortfall.deploy();

  await shortfall.initialize(
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    convertToUnit("10000", 18)
  )

  await poolRegistry.initialize(
    vTokenFactory.address,
    jumpRateFactory.address,
    whitePaperRateFactory.address,
    shortfall.address,
    riskFund.address,
    protocolShareReserve.address
  );

  await shortfall.setPoolRegistry(poolRegistry.address)

  fakeAccessControlManager = await smock.fake<AccessControlManager>(
    "AccessControlManager"
  );
  fakeAccessControlManager.isAllowedToCall.returns(true);

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
  mainnetUSDC = await MockToken__factory.connect(
    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    user
  );

  mainnetBUSD = await MockToken__factory.connect(
    "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    user
  );

  mainnetUSDT = await MockToken__factory.connect(
    "0x55d398326f99059fF775485246999027B3197955",
    user
  );

  const _closeFactor = convertToUnit(0.05, 18);
  const _liquidationIncentive = convertToUnit(1, 18);

  // Deploy Price Oracle
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  // @ts-ignore @TODO VEN-663
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
  unitroller1 = await ethers.getContractAt("Unitroller", pools[0].comptroller);

  await unitroller1._acceptAdmin();

  await ethers.getContractAt("Comptroller", pools[1].comptroller);
  unitroller2 = await ethers.getContractAt("Unitroller", pools[1].comptroller);

  await unitroller2._acceptAdmin();

  const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
  const tokenImplementation = await VBep20Immutable.deploy();
  await tokenImplementation.deployed();

  // Deploy CTokens
  await poolRegistry.addMarket({
    poolId: 1,
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
    poolId: 1,
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

  const cUSDTAddress = await poolRegistry.getVTokenForAsset(
    1,
    mainnetUSDT.address
  );
  const cUSDCAddress = await poolRegistry.getVTokenForAsset(
    1,
    mainnetUSDC.address
  );

  cUSDT = await ethers.getContractAt("VBep20Immutable", cUSDTAddress);
  cUSDC = await ethers.getContractAt("VBep20Immutable", cUSDCAddress);

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
    mainnetBUSD.address,
    fakeAccessControlManager.address
  );
  await riskFund.setPoolRegistry(poolRegistry.address);

  const fakeLiquidatedShares = await smock.fake<RiskFund>("RiskFund");

  await protocolShareReserve.initialize(
    fakeLiquidatedShares.address,
    riskFund.address
  );
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

  describe("Risk fund transfers", async function () {
    it("Convert to BUSD without funds", async function () {
      const amount = await riskFund.callStatic.swapAllPoolsAssets();
      expect(amount).equal("0");
    });

    it("Below min threshold amount", async function () {
      await mainnetUSDC
        .connect(usdcUser)
        .approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));
      await cUSDC._reduceReserves(convertToUnit(50, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDCBal).equal(convertToUnit(50, 18));
      await protocolShareReserve.releaseFunds(
        mainnetUSDC.address,
        convertToUnit(50, 18)
      );
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(15, 18));

      const amount = await riskFund.callStatic.swapAllPoolsAssets();
      expect(amount).equal("0");
    });

    it("Above min threshold amount", async function () {
      await mainnetUSDC
        .connect(usdcUser)
        .approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(
        mainnetUSDC.address,
        convertToUnit(100, 18)
      );
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

      await riskFund.swapAllPoolsAssets();
      const balanceAfter = await mainnetUSDC.balanceOf(riskFund.address);
      expect(balanceAfter).equal("0");

      const balanceBUSD = await mainnetBUSD.balanceOf(riskFund.address);
      expect(Number(balanceBUSD)).to.be.closeTo(
        Number(convertToUnit(30, 18)),
        Number(convertToUnit(3, 17))
      );
    });

    it("Add two assets to riskFund", async function () {
      await mainnetUSDC
        .connect(usdcUser)
        .approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT
        .connect(usdtUser)
        .approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));

      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      const protocolReserveUSDTBal = await mainnetUSDT.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDTBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(
        mainnetUSDC.address,
        convertToUnit(100, 18)
      );
      await protocolShareReserve.releaseFunds(
        mainnetUSDT.address,
        convertToUnit(100, 18)
      );
      const riskFundUSDCBal = await mainnetUSDC.balanceOf(riskFund.address);
      expect(riskFundUSDCBal).equal(convertToUnit(30, 18));

      const riskFundUSDTBal = await mainnetUSDT.balanceOf(riskFund.address);
      expect(riskFundUSDTBal).equal(convertToUnit(30, 18));

      await riskFund.swapAllPoolsAssets();
      const balanceBUSD = await mainnetBUSD.balanceOf(riskFund.address);
      expect(Number(balanceBUSD)).to.be.closeTo(
        Number(convertToUnit(60, 18)),
        Number(convertToUnit(3, 17))
      );

      const pool1Reserve = await riskFund.getPoolReserve(1);
      const pool2Reserve = await riskFund.getPoolReserve(2);
      expect(Number(pool1Reserve)).to.be.closeTo(
        Number(convertToUnit(60, 18)),
        Number(convertToUnit(3, 17))
      );
      expect(pool2Reserve).equal(0);
    });
  });

  describe("Transfer to Auction contract", async function () {
    it("Revert while transfering funds to Auction contract", async function () {
      await expect(
        riskFund.transferReserveForAuction(1, convertToUnit(30, 18))
      ).to.be.rejectedWith("Risk Fund: Auction contract invalid address.");

      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await expect(
        riskFund.transferReserveForAuction(1, convertToUnit(100, 18))
      ).to.be.rejectedWith("Risk Fund: Insufficient pool reserve.");
    });

    it("Transfer funds to auction contact", async function () {
      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await mainnetUSDC
        .connect(usdcUser)
        .approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT
        .connect(usdtUser)
        .approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));
      const protocolReserveUSDCBal = await mainnetUSDC.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDCBal).equal(convertToUnit(100, 18));

      const protocolReserveUSDTBal = await mainnetUSDT.balanceOf(
        protocolShareReserve.address
      );
      expect(protocolReserveUSDTBal).equal(convertToUnit(100, 18));

      await protocolShareReserve.releaseFunds(
        mainnetUSDC.address,
        convertToUnit(100, 18)
      );
      await protocolShareReserve.releaseFunds(
        mainnetUSDT.address,
        convertToUnit(100, 18)
      );
      await riskFund.swapAllPoolsAssets();

      const beforeTransfer = await mainnetBUSD.balanceOf(auctionContract);
      await riskFund.transferReserveForAuction(1, convertToUnit(20, 18));
      const afterTransfer = await mainnetBUSD.balanceOf(auctionContract);
      const remainingBalance = await mainnetBUSD.balanceOf(riskFund.address);
      const poolReserve = await riskFund.getPoolReserve(1);

      const amount = Number(afterTransfer) - Number(beforeTransfer);
      expect(amount).to.be.closeTo(
        Number(convertToUnit(20, 18)),
        Number(convertToUnit(3, 17))
      );
      expect(remainingBalance).equal(poolReserve);
    });

    it("Should revert the transfer to auction transaction", async function () {
      const auctionContract = "0x0000000000000000000000000000000000000001";
      await riskFund.setAuctionContractAddress(auctionContract);

      await mainnetUSDC
        .connect(usdcUser)
        .approve(cUSDC.address, convertToUnit(1000, 18));

      await cUSDC.connect(usdcUser)._addReserves(convertToUnit(200, 18));

      await mainnetUSDT
        .connect(usdtUser)
        .approve(cUSDT.address, convertToUnit(1000, 18));

      await cUSDT.connect(usdtUser)._addReserves(convertToUnit(200, 18));

      await cUSDT._reduceReserves(convertToUnit(100, 18));
      await cUSDC._reduceReserves(convertToUnit(100, 18));
      await riskFund.swapAllPoolsAssets();

      fakeAccessControlManager.isAllowedToCall.returns(false);
      await expect(
        riskFund.transferReserveForAuction(1, convertToUnit(20, 18))
      ).to.be.rejectedWith("Risk fund: Not authorized to transfer funds.");
    });
  });
});

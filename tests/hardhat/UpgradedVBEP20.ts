import { ethers } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  VBep20Immutable,
  MockPriceOracle,
  Unitroller,
  VBep20ImmutableProxyFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  AccessControlManager,
  RiskFund,
  ProtocolShareReserve,
  TransparentUpgradeableProxy,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";
import { FakeContract, smock } from "@defi-wonderland/smock";

let poolRegistry: PoolRegistry;
let comptroller1: Comptroller;
let mockWBTC: MockToken;
let vWBTC: VBep20Immutable;
let priceOracle: MockPriceOracle;
let unitroller1: Unitroller;
let cTokenFactory: VBep20ImmutableProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;
let transparentProxy: TransparentUpgradeableProxy;

describe("UpgradedVBEP20: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  // @ts-ignore @TODO VEN-663
  let proxyAdmin;
  before(async function () {
    [, proxyAdmin] = await ethers.getSigners();
    const VBep20ImmutableProxyFactory = await ethers.getContractFactory(
      "VBep20ImmutableProxyFactory"
    );
    // @ts-ignore @TODO VEN-663
    cTokenFactory = await VBep20ImmutableProxyFactory.deploy();
    await cTokenFactory.deployed();

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
    );
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
    // @ts-ignore @TODO VEN-663
    comptroller1 = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller1.deployed();

    // Deploy Mock Tokens
    const MockWBTC = await ethers.getContractFactory("MockToken");
    // @ts-ignore @TODO VEN-663
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    // @ts-ignore @TODO VEN-663
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";

    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller1.address,
      _closeFactor,
      _liquidationIncentive,
      priceOracle.address
    );

    // Setup Proxies
    const pools = await poolRegistry.callStatic.getAllPools();
    unitroller1 = await ethers.getContractAt(
      "Unitroller",
      pools[0].comptroller
    );

    await unitroller1._acceptAdmin();

    const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    // Deploy VTokens
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
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );

    vWBTC = await ethers.getContractAt("VBep20Immutable", vWBTCAddress);
  });

  it("Upgrade the vToken contract", async function () {
    const vToken = await ethers.getContractFactory("UpgradedVBEP20");
    const vTokenDeploy = await vToken.deploy();
    await vTokenDeploy.deployed();

    transparentProxy = await ethers.getContractAt(
      "TransparentUpgradeableProxy",
      vWBTC.address
    );
    // @ts-ignore @TODO VEN-663
    await transparentProxy.connect(proxyAdmin).upgradeTo(vTokenDeploy.address);

    const upgradeTo = await transparentProxy
    // @ts-ignore @TODO VEN-663
      .connect(proxyAdmin)
      .callStatic.implementation();
    expect(upgradeTo).to.be.equal(vTokenDeploy.address);
  });
});

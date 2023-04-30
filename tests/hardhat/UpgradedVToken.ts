import { FakeContract, smock } from "@defi-wonderland/smock";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Beacon,
  Comptroller,
  MockToken,
  PoolRegistry,
  ProtocolShareReserve,
  Shortfall,
} from "../../typechain";

let poolRegistry: PoolRegistry;
let comptrollerBeacon: Beacon;
let vTokenBeacon: Beacon;
let comptroller1Proxy: Comptroller;
let mockWBTC: MockToken;
let fakeAccessControlManager: FakeContract<AccessControlManager>;

describe("UpgradedVToken: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [root] = await ethers.getSigners();
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
    const protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");

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

    // Deploy Mock Tokens
    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);
    const _minLiquidatableCollateral = convertToUnit(100, 18);
    const maxLoopsLimit = 150;

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";

    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptrollerBeacon.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      priceOracle.address,
      maxLoopsLimit,
      fakeAccessControlManager.address,
    );

    // Setup Proxies
    const pools = await poolRegistry.callStatic.getAllPools();
    comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);

    await comptroller1Proxy.acceptOwnership();

    const VToken = await ethers.getContractFactory("VToken");
    const tokenImplementation = await VToken.deploy();
    await tokenImplementation.deployed();

    const initialSupply = convertToUnit(1000, 18);
    await mockWBTC.faucet(initialSupply);
    await mockWBTC.approve(poolRegistry.address, initialSupply);

    // Deploy VTokens
    await poolRegistry.addMarket({
      comptroller: pools[0].comptroller,
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
      reserveFactor: convertToUnit(0.3, 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply,
      vTokenReceiver: root.address,
      supplyCap: initialSupply,
      borrowCap: initialSupply,
    });
  });

  it("Upgrade the vToken contract", async function () {
    const vToken = await ethers.getContractFactory("UpgradedVToken");
    const vTokenDeploy = await vToken.deploy();
    await vTokenDeploy.deployed();

    await vTokenBeacon.upgradeTo(vTokenDeploy.address);
    const upgradeTo = await vTokenBeacon.callStatic.implementation();
    expect(upgradeTo).to.be.equal(vTokenDeploy.address);

    const pools = await poolRegistry.callStatic.getAllPools();
    const vWBTCAddress = await poolRegistry.getVTokenForAsset(pools[0].comptroller, mockWBTC.address);
    const vWBTC = await ethers.getContractAt("UpgradedVToken", vWBTCAddress);

    expect(2).to.be.equal(await vWBTC.version());
  });
});

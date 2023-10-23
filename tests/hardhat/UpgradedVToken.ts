import { FakeContract, smock } from "@defi-wonderland/smock";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  PoolRegistry__factory,
  UpgradeableBeacon,
} from "../../typechain";
import { deployVTokenBeacon, makeVToken } from "./util/TokenTestHelpers";

// Disable a warning about mixing beacons and transparent proxies
upgrades.silenceWarnings();

let poolRegistry: PoolRegistry;
let vTokenBeacon: UpgradeableBeacon;
let comptroller1Proxy: Comptroller;
let mockWBTC: MockToken;
let fakeAccessControlManager: FakeContract<AccessControlManager>;

describe("UpgradedVToken: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [root] = await ethers.getSigners();

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
    poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;

    // Deploy Mock Tokens
    const MockWBTC = await ethers.getContractFactory<MockToken__factory>("MockToken");
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

    const Comptroller = await ethers.getContractFactory("Comptroller");
    const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

    comptroller1Proxy = (await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
      maxLoopsLimit,
      fakeAccessControlManager.address,
    ])) as Comptroller;
    await comptroller1Proxy.setPriceOracle(priceOracle.address);

    // Registering the first pool
    await poolRegistry.addPool(
      "Pool 1",
      comptroller1Proxy.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
    );

    vTokenBeacon = await deployVTokenBeacon();
    const vWBTC = await makeVToken({
      underlying: mockWBTC.address,
      comptroller: comptroller1Proxy.address,
      accessControlManager: fakeAccessControlManager.address,
      admin: root.address,
      beacon: vTokenBeacon,
    });

    const initialSupply = parseUnits("1000", 18);
    await mockWBTC.faucet(initialSupply);
    await mockWBTC.approve(poolRegistry.address, initialSupply);

    // Deploy VTokens
    await poolRegistry.addMarket({
      vToken: vWBTC.address,
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      initialSupply,
      vTokenReceiver: root.address,
      supplyCap: initialSupply,
      borrowCap: initialSupply,
      baseRatePerBlockForStable: 0,
      stableRatePremium: convertToUnit(2, 12),
      optimalStableLoanRatio: convertToUnit(5, 17),
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

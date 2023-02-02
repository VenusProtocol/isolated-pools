import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Beacon,
  Beacon__factory,
  Comptroller,
  JumpRateModelFactory,
  JumpRateModelFactory__factory,
  JumpRateModelV2,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  ProtocolShareReserve,
  RewardsDistributor,
  RiskFund,
  Shortfall,
  VToken,
  VTokenProxyFactory,
  VTokenProxyFactory__factory,
  WhitePaperInterestRateModelFactory,
  WhitePaperInterestRateModelFactory__factory,
} from "../../typechain";

const WP_RATE_MODEL = 0;
const JUMP_RATE_MODEL = 1;
const INITIAL_SUPPLY = convertToUnit(1000, 18);

interface NewMarketParameters {
  comptroller: string;
  asset: string;
  decimals: BigNumberish;
  name: string;
  symbol: string;
  rateModel: BigNumberish;
  baseRatePerYear: BigNumberish;
  multiplierPerYear: BigNumberish;
  jumpMultiplierPerYear: BigNumberish;
  kink_: BigNumberish;
  collateralFactor: BigNumberish;
  liquidationThreshold: BigNumberish;
  accessControlManager: string;
  vTokenProxyAdmin: string;
  beaconAddress: string;
  initialSupply: BigNumberish;
}

describe("PoolRegistry: Tests", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let proxyAdmin: SignerWithAddress;
  let poolRegistry: PoolRegistry;
  let comptrollerBeacon: Beacon;
  let vTokenBeacon: Beacon;
  let mockDAI: MockToken;
  let mockWBTC: MockToken;
  let mockToken: MockToken;
  let vDAI: VToken;
  let vWBTC: VToken;
  let priceOracle: MockPriceOracle;
  let comptroller1Proxy: Comptroller;
  let comptroller2Proxy: Comptroller;
  let vTokenFactory: VTokenProxyFactory;
  let jumpRateFactory: JumpRateModelFactory;
  let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
  let fakeAccessControlManager: FakeContract<AccessControlManager>;
  let rewardDistributor: FakeContract<RewardsDistributor>;

  const withDefaultMarketParameters = async (overwrites: Partial<NewMarketParameters> = {}) => {
    const defaults = {
      comptroller: comptroller1Proxy.address,
      asset: mockToken.address,
      decimals: 8,
      name: "Venus SomeToken",
      symbol: "vST",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    };
    return { ...defaults, ...overwrites };
  };

  /**
   * Deploying required contracts along with the poolRegistry.
   */
  const poolRegistryFixture = async () => {
    [owner, user, proxyAdmin] = await ethers.getSigners();
    const VTokenProxyFactory = await ethers.getContractFactory<VTokenProxyFactory__factory>("VTokenProxyFactory");
    vTokenFactory = await VTokenProxyFactory.deploy();
    await vTokenFactory.deployed();
    const JumpRateModelFactory = await ethers.getContractFactory<JumpRateModelFactory__factory>("JumpRateModelFactory");
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory =
      await ethers.getContractFactory<WhitePaperInterestRateModelFactory__factory>(
        "WhitePaperInterestRateModelFactory",
      );
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const shortfall = await smock.fake<Shortfall>("Shortfall");
    const riskFund = await smock.fake<RiskFund>("RiskFund");
    const protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await upgrades.deployProxy(PoolRegistry, [
      vTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address,
      shortfall.address,
      riskFund.address,
      protocolShareReserve.address,
    ]);

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const Comptroller = await ethers.getContractFactory("Comptroller");
    const comptroller = await Comptroller.deploy(poolRegistry.address, fakeAccessControlManager.address);
    await comptroller.deployed();

    const VTokenContract = await ethers.getContractFactory("VToken");
    const vToken = await VTokenContract.deploy();
    await vToken.deployed();

    const ComptrollerBeacon = await ethers.getContractFactory<Beacon__factory>("Beacon");
    comptrollerBeacon = await ComptrollerBeacon.deploy(comptroller.address);
    await comptrollerBeacon.deployed();

    const VTokenBeacon = await ethers.getContractFactory<Beacon__factory>("Beacon");
    vTokenBeacon = await VTokenBeacon.deploy(vToken.address);
    await vTokenBeacon.deployed();

    // Deploy Mock Tokens
    const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
    mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));
    mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
    mockToken = await MockToken.deploy("SomeToken", "ST", 18);

    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);
    const _minLiquidatableCollateral = convertToUnit(100, 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";
    const someTokenPrice = "1234";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));
    await priceOracle.setPrice(mockToken.address, convertToUnit(someTokenPrice, 18));

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptrollerBeacon.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      priceOracle.address,
    );

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
      comptrollerBeacon.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      priceOracle.address,
    );

    // Setup Proxies
    const pools = await poolRegistry.callStatic.getAllPools();
    comptroller1Proxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    await comptroller1Proxy.acceptOwnership();

    comptroller2Proxy = await ethers.getContractAt("Comptroller", pools[1].comptroller);
    await comptroller2Proxy.acceptOwnership();

    await mockWBTC.faucet(INITIAL_SUPPLY);
    await mockWBTC.approve(poolRegistry.address, INITIAL_SUPPLY);

    await mockDAI.faucet(INITIAL_SUPPLY);
    await mockDAI.approve(poolRegistry.address, INITIAL_SUPPLY);

    // Deploy VTokens
    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Compound WBTC",
      symbol: "vWBTC",
      rateModel: WP_RATE_MODEL,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    });

    await poolRegistry.addMarket({
      comptroller: comptroller1Proxy.address,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "vDAI",
      rateModel: WP_RATE_MODEL,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockWBTC.address);
    const vDAIAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockDAI.address);

    vWBTC = await ethers.getContractAt("VToken", vWBTCAddress);
    vDAI = await ethers.getContractAt("VToken", vDAIAddress);

    // Enter Markets
    await comptroller1Proxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptroller1Proxy.connect(user).enterMarkets([vDAI.address, vWBTC.address]);

    // Set Oracle
    await comptroller1Proxy.setPriceOracle(priceOracle.address);
  };

  beforeEach(async () => {
    await loadFixture(poolRegistryFixture);
  });

  describe("setPoolName", async () => {
    const newName = "My fancy pool";

    it("reverts if not called by owner", async () => {
      await expect(poolRegistry.connect(user).setPoolName(comptroller1Proxy.address, newName)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("sets new pool name", async () => {
      await poolRegistry.setPoolName(comptroller1Proxy.address, newName);
      const poolInfo = await poolRegistry.getPoolByComptroller(comptroller1Proxy.address);
      expect(poolInfo.name).to.equal(newName);
    });

    it("emits PoolNameSet event", async () => {
      const oldName = "Pool 1";
      const tx = await poolRegistry.setPoolName(comptroller1Proxy.address, newName);
      await expect(tx).to.emit(poolRegistry, "PoolNameSet").withArgs(comptroller1Proxy.address, oldName, newName);
    });
  });

  describe("addMarket", async () => {
    it("reverts if called by a non-owner", async () => {
      await expect(poolRegistry.connect(user).addMarket(await withDefaultMarketParameters({}))).to.be.rejectedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("adds a new vToken to the pool", async () => {
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );

      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
      await comptroller1Proxy.addRewardsDistributor(rewardDistributor.address);

      await poolRegistry.addMarket(await withDefaultMarketParameters());
      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address);
      expect(vTokenAddress).to.be.a.properAddress;
      expect(vTokenAddress).to.not.equal(constants.AddressZero);
      const vToken = await ethers.getContractAt<VToken>("VToken", vTokenAddress);
      expect(await vToken.isVToken()).to.equal(true);
      expect(await vToken.underlying()).to.equal(mockToken.address);
      expect(await vToken.exchangeRateStored()).to.equal(10n ** 28n);
      expect(await vToken.name()).to.equal("Venus SomeToken");
      expect(await vToken.symbol()).to.equal("vST");
      expect(await vToken.comptroller()).to.equal(comptroller1Proxy.address);
      expect(await vToken.owner()).to.equal(owner.address);
      expect(await vToken.accessControlManager()).to.equal(fakeAccessControlManager.address);
    });

    it("reverts if market is readded with same comptroller asset combination", async () => {
      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.addMarket(await withDefaultMarketParameters());
      await expect(poolRegistry.addMarket(await withDefaultMarketParameters())).to.be.revertedWith(
        "RegistryPool: Market already added for asset comptroller combination",
      );
    });

    it("sets rate model to a new JumpRateModel with the correct parameters", async () => {
      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.addMarket(
        await withDefaultMarketParameters({
          comptroller: comptroller1Proxy.address,
          rateModel: JUMP_RATE_MODEL,
          jumpMultiplierPerYear: convertToUnit("1.1", 18),
          kink_: convertToUnit("0.8", 18),
        }),
      );
      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address);
      const vToken = await ethers.getContractAt<VToken>("VToken", vTokenAddress);
      const rateModelAddress = await vToken.interestRateModel();
      expect(rateModelAddress).to.be.a.properAddress;
      expect(rateModelAddress).to.not.equal(constants.AddressZero);
      const rateModel = await ethers.getContractAt<JumpRateModelV2>("JumpRateModelV2", rateModelAddress);
      expect(await rateModel.kink()).to.equal(convertToUnit("0.8", 18));
    });
  });

  it("Pools should have correct names", async () => {
    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
    expect(pools[1].name).equal("Pool 2");
  });

  it("Should get 2 pools", async () => {
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools.length).equal(2);
  });

  it("Get pool by comptroller", async () => {
    const pool1 = await poolRegistry.getPoolByComptroller(comptroller1Proxy.address);
    expect(pool1[0]).equal("Pool 1");

    const pool2 = await poolRegistry.getPoolByComptroller(comptroller2Proxy.address);
    expect(pool2[0]).equal("Pool 2");
  });

  it("Should be correct balances in tokens", async () => {
    const [owner] = await ethers.getSigners();
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const btcBalance = await mockWBTC.balanceOf(owner.address);
    expect(btcBalance).equal(convertToUnit(1000, 8));
  });

  // Get all pools that support a given asset
  it("Get pools with asset", async () => {
    const pools = await poolRegistry.getPoolsSupportedByAsset(mockWBTC.address);
    expect(pools[0].toString()).equal(comptroller1Proxy.address);
  });

  it("Enter Market", async () => {
    const [owner] = await ethers.getSigners();
    const res = await comptroller1Proxy.getAssetsIn(owner.address);
    expect(res[0]).equal(vDAI.address);
    expect(res[1]).equal(vWBTC.address);
  });

  describe("updatePoolMetadata", async () => {
    const riskRating = 2;
    const category = "High market cap";
    const logoURL = "http://venus.io/pool1";
    const description = "An sample description";
    const newMetadata = {
      riskRating,
      category,
      logoURL,
      description,
    };

    it("reverts if called by a non-owner", async () => {
      const [, user] = await ethers.getSigners();
      await expect(
        poolRegistry.connect(user).updatePoolMetadata(comptroller1Proxy.address, newMetadata),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("sets new pool metadata", async () => {
      await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata);
      const metadata = await poolRegistry.metadata(comptroller1Proxy.address);
      expect(metadata.riskRating).equal(riskRating);
      expect(metadata.category).equal(category);
      expect(metadata.logoURL).equal(logoURL);
      expect(metadata.description).equal(description);
    });

    it("emits PoolMetadataUpdated event", async () => {
      const oldMetadata = await poolRegistry.metadata(comptroller1Proxy.address);
      const tx = await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata);
      await expect(tx)
        .to.emit(poolRegistry, "PoolMetadataUpdated")
        .withArgs(comptroller1Proxy.address, oldMetadata, [riskRating, category, logoURL, description]);
    });
  });
});

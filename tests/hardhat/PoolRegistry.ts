import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  Beacon,
  Beacon__factory,
  Comptroller,
  FeeToken__factory,
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
  Shortfall,
  VToken,
  VTokenProxyFactory,
  VTokenProxyFactory__factory,
  WhitePaperInterestRateModelFactory,
  WhitePaperInterestRateModelFactory__factory,
} from "../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const WP_RATE_MODEL = 0;
const JUMP_RATE_MODEL = 1;
const INITIAL_SUPPLY = parseUnits("1000", 18);

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
  reserveFactor: BigNumberish;
  accessControlManager: string;
  beaconAddress: string;
  initialSupply: BigNumberish;
  vTokenReceiver: string;
  supplyCap: BigNumberish;
  borrowCap: BigNumberish;
}

describe("PoolRegistry: Tests", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let poolRegistry: PoolRegistry;
  let comptrollerBeacon: Beacon;
  let vTokenBeacon: Beacon;
  let mockDAI: MockContract<MockToken>;
  let mockWBTC: MockContract<MockToken>;
  let mockToken: MockContract<MockToken>;
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
  const maxLoopsLimit = 150;

  const withDefaultMarketParameters = (overwrites: Partial<NewMarketParameters> = {}): NewMarketParameters => {
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
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      reserveFactor: parseUnits("0.3", 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      vTokenReceiver: owner.address,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    };
    return { ...defaults, ...overwrites };
  };

  /**
   * Deploying required contracts along with the poolRegistry.
   */
  const poolRegistryFixture = async () => {
    [owner, user] = await ethers.getSigners();
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

    const ComptrollerBeacon = await ethers.getContractFactory<Beacon__factory>("Beacon");
    comptrollerBeacon = await ComptrollerBeacon.deploy(comptroller.address);
    await comptrollerBeacon.deployed();

    const VTokenBeacon = await ethers.getContractFactory<Beacon__factory>("Beacon");
    vTokenBeacon = await VTokenBeacon.deploy(vToken.address);
    await vTokenBeacon.deployed();

    // Deploy Mock Tokens
    const MockToken = await smock.mock<MockToken__factory>("MockToken");
    mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(parseUnits("1000", 18));
    mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
    mockToken = await MockToken.deploy("SomeToken", "ST", 18);

    const _closeFactor = parseUnits("0.05", 18);
    const _liquidationIncentive = parseUnits("1", 18);
    const _minLiquidatableCollateral = parseUnits("100", 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";
    const someTokenPrice = "1234";

    await priceOracle.setPrice(mockDAI.address, parseUnits(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, parseUnits(btcPrice, 28));
    await priceOracle.setPrice(mockToken.address, parseUnits(someTokenPrice, 18));

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

    // Registering the second pool
    await poolRegistry.createRegistryPool(
      "Pool 2",
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
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      reserveFactor: parseUnits("0.3", 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      vTokenReceiver: owner.address,
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
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      reserveFactor: parseUnits("0.3", 18),
      accessControlManager: fakeAccessControlManager.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply: INITIAL_SUPPLY,
      vTokenReceiver: owner.address,
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
    fakeAccessControlManager.isAllowedToCall.reset();
    fakeAccessControlManager.isAllowedToCall.returns(true);
  });

  describe("setPoolName", async () => {
    const newName = "My fancy pool";

    it("reverts if ACM denies the access", async () => {
      fakeAccessControlManager.isAllowedToCall
        .whenCalledWith(owner.address, "setPoolName(address,string)")
        .returns(false);
      await expect(poolRegistry.setPoolName(comptroller1Proxy.address, newName)).to.be.revertedWithCustomError(
        poolRegistry,
        "Unauthorized",
      );
    });

    it("reverts if the name is too long", async () => {
      const longName = Array(101).fill("a").join("");
      await expect(poolRegistry.setPoolName(comptroller1Proxy.address, longName)).to.be.revertedWith(
        "Pool's name is too large",
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
    it("reverts if ACM denies the access", async () => {
      fakeAccessControlManager.isAllowedToCall
        .whenCalledWith(owner.address, "addMarket(AddMarketInput)")
        .returns(false);
      await expect(poolRegistry.addMarket(withDefaultMarketParameters({}))).to.be.revertedWithCustomError(
        poolRegistry,
        "Unauthorized",
      );
    });

    it("reverts if Comptroller address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ comptroller: constants.AddressZero })),
      ).to.be.revertedWith("PoolRegistry: Invalid comptroller address");
    });

    it("reverts if the asset address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ asset: constants.AddressZero })),
      ).to.be.revertedWith("PoolRegistry: Invalid asset address");
    });

    it("reverts if the beacon address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ beaconAddress: constants.AddressZero })),
      ).to.be.revertedWith("PoolRegistry: Invalid beacon address");
    });

    it("reverts if vTokenReceiver address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ vTokenReceiver: constants.AddressZero })),
      ).to.be.revertedWith("PoolRegistry: Invalid vTokenReceiver address");
    });

    it("adds a new vToken to the pool", async () => {
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );

      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      rewardDistributor = await smock.fake<RewardsDistributor>("RewardsDistributor");
      await comptroller1Proxy.addRewardsDistributor(rewardDistributor.address);

      await poolRegistry.addMarket(withDefaultMarketParameters());
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

    it("transfers initial supply from the sender's address", async () => {
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );
      fakeAccessControlManager.isAllowedToCall.whenCalledWith(user.address, "addMarket(AddMarketInput)").returns(true);

      await mockToken.connect(user).faucet(INITIAL_SUPPLY);
      await mockToken.connect(user).approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.connect(user).addMarket(withDefaultMarketParameters());

      expect(await mockToken.balanceOf(user.address)).to.equal(0);
    });

    it("transfers vTokens to vTokenReceiver address", async () => {
      const vTokenReceiver = await ethers.getSigner(5);
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );
      fakeAccessControlManager.isAllowedToCall.whenCalledWith(user.address, "addMarket(AddMarketInput)").returns(true);

      await mockToken.connect(user).faucet(INITIAL_SUPPLY);
      await mockToken.connect(user).approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry
        .connect(user)
        .addMarket(withDefaultMarketParameters({ vTokenReceiver: vTokenReceiver.address }));

      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address);
      const vToken = await ethers.getContractAt<VToken>("VToken", vTokenAddress);
      expect(await vToken.balanceOf(vTokenReceiver.address)).to.equal(parseUnits("1000", 8));
    });

    it("uses two-step approval", async () => {
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );
      fakeAccessControlManager.isAllowedToCall.whenCalledWith(user.address, "addMarket(AddMarketInput)").returns(true);

      await mockToken.connect(user).faucet(INITIAL_SUPPLY);
      await mockToken.connect(user).approve(poolRegistry.address, INITIAL_SUPPLY);

      mockToken.approve.reset();
      await poolRegistry.connect(user).addMarket(withDefaultMarketParameters());
      expect(mockToken.approve).to.have.been.calledTwice;
      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address);
      expect(mockToken.approve.atCall(0)).to.have.been.calledWith(vTokenAddress, 0);
      expect(mockToken.approve.atCall(1)).to.have.been.calledWith(vTokenAddress, INITIAL_SUPPLY);
    });

    it("supports fee-on-transfer tokens", async () => {
      const FeeToken = await smock.mock<FeeToken__factory>("FeeToken");
      const feeToken = await FeeToken.deploy(INITIAL_SUPPLY, "FeeToken", 18, "FT", parseUnits("0.1", 4), owner.address);
      await priceOracle.setPrice(feeToken.address, parseUnits("1", 18));

      fakeAccessControlManager.isAllowedToCall.whenCalledWith(user.address, "addMarket(AddMarketInput)").returns(true);
      await feeToken.allocateTo(user.address, INITIAL_SUPPLY);
      await feeToken.connect(user).approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.connect(user).addMarket(withDefaultMarketParameters({ asset: feeToken.address }));

      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, feeToken.address);
      const vToken = await ethers.getContractAt<VToken>("VToken", vTokenAddress);
      expect(await vToken.balanceOf(owner.address)).to.equal(parseUnits("810", 8));
    });

    it("reverts if market is readded with same comptroller asset combination", async () => {
      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.addMarket(withDefaultMarketParameters());
      await expect(poolRegistry.addMarket(withDefaultMarketParameters())).to.be.revertedWith(
        "PoolRegistry: Market already added for asset comptroller combination",
      );
    });

    it("sets rate model to a new JumpRateModel with the correct parameters", async () => {
      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

      await poolRegistry.addMarket(
        withDefaultMarketParameters({
          comptroller: comptroller1Proxy.address,
          rateModel: JUMP_RATE_MODEL,
          jumpMultiplierPerYear: parseUnits("1.1", 18),
          kink_: parseUnits("0.8", 18),
        }),
      );
      const vTokenAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address);
      const vToken = await ethers.getContractAt<VToken>("VToken", vTokenAddress);
      const rateModelAddress = await vToken.interestRateModel();
      expect(rateModelAddress).to.be.a.properAddress;
      expect(rateModelAddress).to.not.equal(constants.AddressZero);
      const rateModel = await ethers.getContractAt<JumpRateModelV2>("JumpRateModelV2", rateModelAddress);
      expect(await rateModel.kink()).to.equal(parseUnits("0.8", 18));
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
    await mockWBTC.faucet(parseUnits("1000", 8));

    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(parseUnits("1000", 18));

    const btcBalance = await mockWBTC.balanceOf(owner.address);
    expect(btcBalance).equal(parseUnits("1000", 8));
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
    const category = "High market cap";
    const logoURL = "http://venus.io/pool1";
    const description = "An sample description";
    const newMetadata = {
      category,
      logoURL,
      description,
    };

    it("reverts if ACM denies the access", async () => {
      fakeAccessControlManager.isAllowedToCall
        .whenCalledWith(owner.address, "updatePoolMetadata(address,VenusPoolMetaData)")
        .returns(false);
      await expect(
        poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata),
      ).to.be.revertedWithCustomError(poolRegistry, "Unauthorized");
    });

    it("sets new pool metadata", async () => {
      await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata);
      const metadata = await poolRegistry.metadata(comptroller1Proxy.address);
      expect(metadata.category).equal(category);
      expect(metadata.logoURL).equal(logoURL);
      expect(metadata.description).equal(description);
    });

    it("emits PoolMetadataUpdated event", async () => {
      const oldMetadata = await poolRegistry.metadata(comptroller1Proxy.address);
      const tx = await poolRegistry.updatePoolMetadata(comptroller1Proxy.address, newMetadata);
      await expect(tx)
        .to.emit(poolRegistry, "PoolMetadataUpdated")
        .withArgs(comptroller1Proxy.address, oldMetadata, [category, logoURL, description]);
    });
  });

  describe("createRegistryPool", async () => {
    it("reverts if ACM denies the access", async () => {
      const createRegistryPool = "createRegistryPool(string,address,uint256,uint256,uint256,address,uint256,address)";
      fakeAccessControlManager.isAllowedToCall.whenCalledWith(owner.address, createRegistryPool).returns(false);
      await expect(
        poolRegistry.createRegistryPool(
          "Pool 3",
          comptrollerBeacon.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
          priceOracle.address,
          maxLoopsLimit,
          fakeAccessControlManager.address,
        ),
      ).to.be.revertedWithCustomError(poolRegistry, "Unauthorized");
    });

    it("reverts if pool name is too long", async () => {
      const longName = Array(101).fill("a").join("");
      await expect(
        poolRegistry.createRegistryPool(
          longName,
          comptrollerBeacon.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
          priceOracle.address,
          maxLoopsLimit,
          fakeAccessControlManager.address,
        ),
      ).to.be.revertedWith("Pool's name is too large");
    });

    it("reverts if beacon address is zero", async () => {
      await expect(
        poolRegistry.createRegistryPool(
          "Pool 3",
          constants.AddressZero,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
          priceOracle.address,
          maxLoopsLimit,
          fakeAccessControlManager.address,
        ),
      ).to.be.revertedWith("PoolRegistry: Invalid Comptroller beacon address.");
    });

    it("reverts if price oracle address is zero", async () => {
      await expect(
        poolRegistry.createRegistryPool(
          "Pool 3",
          comptrollerBeacon.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
          constants.AddressZero,
          maxLoopsLimit,
          fakeAccessControlManager.address,
        ),
      ).to.be.revertedWith("PoolRegistry: Invalid PriceOracle address.");
    });
  });

  describe("setProtocolShareReserve", () => {
    let protocolShareReserve: FakeContract<ProtocolShareReserve>;

    beforeEach(async () => {
      protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(poolRegistry.connect(user).setProtocolShareReserve(protocolShareReserve.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if zero address", async () => {
      await expect(
        poolRegistry.connect(owner).setProtocolShareReserve(ethers.constants.AddressZero),
      ).revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });

    it("sets protocol share reserve if called by admin", async () => {
      await poolRegistry.connect(owner).setProtocolShareReserve(protocolShareReserve.address);
    });
  });

  describe("setShortfallContract", () => {
    let shortfall: FakeContract<Shortfall>;

    beforeEach(async () => {
      shortfall = await smock.fake<Shortfall>("Shortfall");
    });

    it("reverts if called by a non-owner", async () => {
      await expect(poolRegistry.connect(user).setShortfallContract(shortfall.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if zero address", async () => {
      await expect(
        poolRegistry.connect(owner).setShortfallContract(ethers.constants.AddressZero),
      ).revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });

    it("sets shortfall contract if called by admin", async () => {
      await poolRegistry.connect(owner).setShortfallContract(shortfall.address);
    });
  });
});

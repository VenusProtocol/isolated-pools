import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManager,
  Comptroller,
  FeeToken__factory,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  UpgradeableBeacon,
  VToken,
} from "../../typechain";
import { makeVToken } from "./util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const INITIAL_SUPPLY = parseUnits("1000", 18);

// Disable a warning about mixing beacons and transparent proxies
upgrades.silenceWarnings();

interface NewMarketParameters {
  vToken: string;
  collateralFactor: BigNumberish;
  liquidationThreshold: BigNumberish;
  initialSupply: BigNumberish;
  vTokenReceiver: string;
  supplyCap: BigNumberish;
  borrowCap: BigNumberish;
}

describe("PoolRegistry: Tests", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let poolRegistry: PoolRegistry;
  let vTokenBeacon: UpgradeableBeacon;
  let mockDAI: MockContract<MockToken>;
  let mockWBTC: MockContract<MockToken>;
  let mockToken: MockContract<MockToken>;
  let vDAI: VToken;
  let vWBTC: VToken;
  let vMockToken: VToken;
  let priceOracle: MockPriceOracle;
  let comptroller1Proxy: Comptroller;
  let comptroller2Proxy: Comptroller;
  let comptroller3Proxy: Comptroller;
  let fakeAccessControlManager: FakeContract<AccessControlManager>;
  const maxLoopsLimit = 150;

  const withDefaultMarketParameters = (overwrites: Partial<NewMarketParameters> = {}): NewMarketParameters => {
    const defaults = {
      vToken: vMockToken.address,
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
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

    fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    fakeAccessControlManager.isAllowedToCall.returns(true);

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;

    // Deploy Mock Tokens
    const MockToken = await smock.mock<MockToken__factory>("MockToken");
    mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(parseUnits("1000", 18));
    mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
    mockToken = await MockToken.deploy("SomeToken", "ST", 18);

    // Deploy Price Oracle
    const MockPriceOracle = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";
    const someTokenPrice = "1234";

    await priceOracle.setPrice(mockDAI.address, parseUnits(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, parseUnits(btcPrice, 28));
    await priceOracle.setPrice(mockToken.address, parseUnits(someTokenPrice, 18));

    const Comptroller = await ethers.getContractFactory("Comptroller");
    const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

    [comptroller1Proxy, comptroller2Proxy, comptroller3Proxy] = await Promise.all(
      [...Array(3)].map(async () => {
        const comptroller = await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
          maxLoopsLimit,
          fakeAccessControlManager.address,
        ]);
        await comptroller.setPriceOracle(priceOracle.address);
        return comptroller as Comptroller;
      }),
    );

    const _closeFactor = parseUnits("0.05", 18);
    const _liquidationIncentive = parseUnits("1", 18);
    const _minLiquidatableCollateral = parseUnits("100", 18);

    // Registering the first pool
    await poolRegistry.addPool(
      "Pool 1",
      comptroller1Proxy.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
    );

    // Registering the second pool
    await poolRegistry.addPool(
      "Pool 2",
      comptroller2Proxy.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
    );

    // Setup Proxies
    vWBTC = await makeVToken({
      underlying: mockWBTC,
      comptroller: comptroller1Proxy,
      accessControlManager: fakeAccessControlManager,
      decimals: 8,
      initialExchangeRateMantissa: parseUnits("1", 18),
      admin: owner.address,
      beacon: vTokenBeacon,
    });

    await mockWBTC.faucet(INITIAL_SUPPLY);
    await mockWBTC.approve(poolRegistry.address, INITIAL_SUPPLY);
    await poolRegistry.addMarket({
      vToken: vWBTC.address,
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      initialSupply: INITIAL_SUPPLY,
      vTokenReceiver: owner.address,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    });

    vDAI = await makeVToken({
      underlying: mockDAI,
      comptroller: comptroller1Proxy,
      accessControlManager: fakeAccessControlManager,
      decimals: 18,
      initialExchangeRateMantissa: parseUnits("1", 18),
      admin: owner.address,
      beacon: vTokenBeacon,
    });

    await mockDAI.faucet(INITIAL_SUPPLY);
    await mockDAI.approve(poolRegistry.address, INITIAL_SUPPLY);
    await poolRegistry.addMarket({
      vToken: vDAI.address,
      collateralFactor: parseUnits("0.7", 18),
      liquidationThreshold: parseUnits("0.7", 18),
      initialSupply: INITIAL_SUPPLY,
      vTokenReceiver: owner.address,
      supplyCap: INITIAL_SUPPLY,
      borrowCap: INITIAL_SUPPLY,
    });

    vMockToken = await makeVToken({
      underlying: mockToken,
      comptroller: comptroller1Proxy,
      accessControlManager: fakeAccessControlManager,
      decimals: 8,
      initialExchangeRateMantissa: parseUnits("1", 28), // underlying.decimals + 18 - vToken.decimals
      admin: owner.address,
      beacon: vTokenBeacon,
    });

    // Enter Markets
    await comptroller1Proxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptroller1Proxy.connect(user).enterMarkets([vDAI.address, vWBTC.address]);
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
      await expect(poolRegistry.addMarket(withDefaultMarketParameters())).to.be.revertedWithCustomError(
        poolRegistry,
        "Unauthorized",
      );
    });

    it("reverts if the vToken address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ vToken: constants.AddressZero })),
      ).to.be.revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });

    it("reverts if vTokenReceiver address is zero", async () => {
      await expect(
        poolRegistry.addMarket(withDefaultMarketParameters({ vTokenReceiver: constants.AddressZero })),
      ).to.be.revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });

    it("reverts if initial supply is zero", async () => {
      await expect(poolRegistry.addMarket(withDefaultMarketParameters({ initialSupply: 0 }))).to.be.revertedWith(
        "PoolRegistry: initialSupply is zero",
      );
    });

    it("adds a new vToken to the pool", async () => {
      expect(await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, mockToken.address)).to.equal(
        constants.AddressZero,
      );

      await mockToken.faucet(INITIAL_SUPPLY);
      await mockToken.approve(poolRegistry.address, INITIAL_SUPPLY);

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
      const vTokenReceiver = (await ethers.getSigners())[5]; // hardhat-ethers does not support getSigner(5)
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

      const vToken = await makeVToken({
        underlying: feeToken,
        comptroller: comptroller1Proxy,
        accessControlManager: fakeAccessControlManager,
        decimals: 8,
        initialExchangeRateMantissa: parseUnits("1", 28), // underlying.decimals + 18 - vToken.decimals
        admin: user.address,
        beacon: vTokenBeacon,
      });

      await feeToken.allocateTo(user.address, INITIAL_SUPPLY);
      await feeToken.connect(user).approve(poolRegistry.address, INITIAL_SUPPLY);
      await poolRegistry.connect(user).addMarket(withDefaultMarketParameters({ vToken: vToken.address }));

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

  describe("addPool", async () => {
    it("reverts if ACM denies the access", async () => {
      const addPoolSignature = "addPool(string,address,uint256,uint256,uint256)";
      fakeAccessControlManager.isAllowedToCall.whenCalledWith(owner.address, addPoolSignature).returns(false);
      await expect(
        poolRegistry.addPool(
          "Pool 3",
          comptroller3Proxy.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
        ),
      ).to.be.revertedWithCustomError(poolRegistry, "Unauthorized");
    });

    it("reverts if pool name is too long", async () => {
      const longName = Array(101).fill("a").join("");
      await expect(
        poolRegistry.addPool(
          longName,
          comptroller3Proxy.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
        ),
      ).to.be.revertedWith("Pool's name is too large");
    });

    it("reverts if Comptroller address is zero", async () => {
      await expect(
        poolRegistry.addPool(
          "Pool 3",
          constants.AddressZero,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
        ),
      ).to.be.revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });

    it("reverts if price oracle address is zero", async () => {
      // Deploy a Comptroller contract without a price oracle
      // We skip proxies and initialization here because it shouldn't affect the test
      const Comptroller = await ethers.getContractFactory("Comptroller");
      const comptroller = await Comptroller.deploy(poolRegistry.address);
      await expect(
        poolRegistry.addPool(
          "Pool 3",
          comptroller.address,
          parseUnits("0.5", 18),
          parseUnits("1.1", 18),
          parseUnits("100", 18),
        ),
      ).to.be.revertedWithCustomError(poolRegistry, "ZeroAddressNotAllowed");
    });
  });
});

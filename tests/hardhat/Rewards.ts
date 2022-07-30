import { ethers, network } from "hardhat";
import { expect } from "chai";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  SimplePriceOracle,
  CErc20Immutable,
  MockPriceOracle,
  Unitroller,
  CErc20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  RewardsDistributor,
  Comp
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let poolRegistry: PoolRegistry;
let comptroller: Comptroller;
let simplePriceOracle1: SimplePriceOracle;
let simplePriceOracle2: SimplePriceOracle;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let priceOracle: MockPriceOracle;
let comptrollerProxy: Comptroller;
let unitroller: Unitroller;
let cTokenFactory:CErc20ImmutableFactory;
let jumpRateFactory:JumpRateModelFactory;
let whitePaperRateFactory:WhitePaperInterestRateModelFactory;
let rewardsDistributor:RewardsDistributor;
let comp:Comp;

describe("Rewards: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const CErc20ImmutableFactory = await ethers.getContractFactory('CErc20ImmutableFactory');
    cTokenFactory = await CErc20ImmutableFactory.deploy();
    await cTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory('JumpRateModelFactory');
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory('WhitePaperInterestRateModelFactory');
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy();
    await poolRegistry.deployed();

    await poolRegistry.initialize(
      cTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address
    );

    const Comptroller = await ethers.getContractFactory("Comptroller");

    comptroller = await Comptroller.deploy(poolRegistry.address);
    await comptroller.deployed();

    const SimplePriceOracle = await ethers.getContractFactory(
      "SimplePriceOracle"
    );

    simplePriceOracle1 = await SimplePriceOracle.deploy();
    await simplePriceOracle1.deployed();

    simplePriceOracle2 = await SimplePriceOracle.deploy();
    await simplePriceOracle2.deployed();
  })

  // Register pools to the protocol
  it("Register pool", async function () {
    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller.address,
      _closeFactor,
      _liquidationIncentive,
      simplePriceOracle1.address
    );

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");

    comptrollerProxy = await ethers.getContractAt(
      "Comptroller",
      pools[0].comptroller
    );
    unitroller = await ethers.getContractAt(
      "Unitroller",
      pools[0].comptroller
    );

    await unitroller._acceptAdmin();
  })

  it("Deploy Mock Tokens", async function () {
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.faucet(convertToUnit(1000, 8));

    const btcBalance = await mockWBTC.balanceOf(owner.address);

    expect(btcBalance).equal(convertToUnit(1000, 8));
  })

  it("Deploy Price Oracle", async function () {
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await MockPriceOracle.deploy();

    const btcPrice = "21000.34";
    const daiPrice = "1";

    await priceOracle.setPrice(mockDAI.address, convertToUnit(daiPrice, 18));
    await priceOracle.setPrice(mockWBTC.address, convertToUnit(btcPrice, 28));

    await comptrollerProxy._setPriceOracle(priceOracle.address);
  })

  it("Deploy CToken", async function () {
    await poolRegistry.addMarket({
      poolId: 0,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Compound WBTC",
      symbol: "cWBTC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18)
    });

    await poolRegistry.addMarket({
      poolId: 0,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "cDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18)
    });
    
    const cWBTCAddress = await poolRegistry.getCTokenForAsset(0, mockWBTC.address);
    const cDAIAddress = await poolRegistry.getCTokenForAsset(0, mockDAI.address);

    cWBTC = await ethers.getContractAt("CErc20Immutable", cWBTCAddress)
    cDAI = await ethers.getContractAt("CErc20Immutable", cDAIAddress)
  });

  it("Configure Rewards for Pool", async function () {
    const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
    rewardsDistributor = await RewardsDistributor.deploy();

    const [,,compOwner] = await ethers.getSigners();
    const Comp = await ethers.getContractFactory("Comp");
    comp = await Comp.deploy(compOwner.address);
    await comp.connect(compOwner).transfer(rewardsDistributor.address, convertToUnit(1000000, 18))

    await rewardsDistributor.initialize(comptrollerProxy.address, comp.address);
    
    await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);

    expect(await comp.balanceOf(rewardsDistributor.address)).equal(convertToUnit(1000000, 18))
    await rewardsDistributor._setRewardTokenSpeeds(
      [cWBTC.address, cDAI.address],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)]
    )
  })

  it("Enter Market", async function () {
    const [owner, user] = await ethers.getSigners();
    await comptrollerProxy.enterMarkets([cDAI.address, cWBTC.address]);
    await comptrollerProxy
      .connect(user)
      .enterMarkets([cDAI.address, cWBTC.address]);
    const res = await comptrollerProxy.getAssetsIn(owner.address);
    expect(res[0]).equal(cDAI.address);
    expect(res[1]).equal(cWBTC.address);
  });

  it("Lend and Borrow", async function () {
    const daiAmount = convertToUnit(31000, 18);
    await mockDAI.faucet(daiAmount);
    await mockDAI.approve(cDAI.address, daiAmount);
    await cDAI.mint(daiAmount);

    const [, user] = await ethers.getSigners();
    await mockWBTC.connect(user).faucet(convertToUnit(1000, 8));

    const btcAmount = convertToUnit(1000, 8);
    await mockWBTC.connect(user).approve(cWBTC.address, btcAmount);
    await cWBTC.connect(user).mint(btcAmount);

    // console.log((await comptroller1Proxy.callStatic.getAccountLiquidity(owner.address))[1].toString())
    // console.log((await comptroller1Proxy.callStatic.getAccountLiquidity(user.address))[1].toString())
    await cWBTC.borrow(convertToUnit(1, 8));
    await cDAI.connect(user).borrow(convertToUnit(100, 18));

    await mockWBTC.approve(cWBTC.address, convertToUnit(1, 8));
    await cWBTC.repayBorrow(convertToUnit(1, 8)) 
  });

  it("Claim COMP", async function () {
    const [user1, user2] = await ethers.getSigners();
    await rewardsDistributor["claimRewardToken(address,address[])"](user1.address, [cWBTC.address, cDAI.address])
    await rewardsDistributor["claimRewardToken(address,address[])"](user2.address, [cWBTC.address, cDAI.address])

    expect((await comp.balanceOf(user1.address)).toString()).not.equal("0")
    expect((await comp.balanceOf(user2.address)).toString()).not.equal("0")
  })
});

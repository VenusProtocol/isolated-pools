import { ethers, network } from "hardhat";
import { expect } from "chai";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import {
  MockToken,
  PoolRegistry,
  Comptroller,
  CErc20Immutable,
  Unitroller,
  CErc20ImmutableFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  RewardsDistributor,
  Comp,
  PoolRegistry__factory,
  PriceOracle,
  PriceOracle__factory,
  AccessControlManager,
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let poolRegistry: MockContract<PoolRegistry>;
let comptroller: Comptroller;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let cDAI: CErc20Immutable;
let cWBTC: CErc20Immutable;
let comptrollerProxy: Comptroller;
let unitroller: Unitroller;
let cTokenFactory: CErc20ImmutableFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let rewardsDistributor: RewardsDistributor;
let comp: Comp;
let fakePriceOracle: FakeContract<PriceOracle>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;

describe("Rewards: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
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

    const PoolRegistryFactory = await smock.mock<PoolRegistry__factory>(
      "PoolRegistry"
    );
    poolRegistry = await PoolRegistryFactory.deploy();
    await poolRegistry.deployed();

    await poolRegistry.initialize(
      cTokenFactory.address,
      jumpRateFactory.address,
      whitePaperRateFactory.address
    );

    fakeAccessControlManager = await smock.fake<AccessControlManager>(
      "AccessControlManager"
    );
    await fakeAccessControlManager.isAllowedToCall.returns(true);

    const Comptroller = await ethers.getContractFactory("Comptroller");

    comptroller = await Comptroller.deploy(
      poolRegistry.address,
      fakeAccessControlManager.address
    );
    await comptroller.deployed();

    // Deploy Mock Tokens
    const MockDAI = await ethers.getContractFactory("MockToken");
    mockDAI = await MockDAI.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    const MockWBTC = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockWBTC.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.deployed();
    await mockWBTC.faucet(convertToUnit(1000, 8));

    //Deploy Mock Price Oracle
    fakePriceOracle = await smock.fake<PriceOracle>(PriceOracle__factory.abi);

    const btcPrice = "21000.34";
    const daiPrice = "1";

    fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
      if (cDAI && cWBTC) {
        if (args[0] === cDAI.address) {
          return convertToUnit(daiPrice, 18);
        } else {
          return convertToUnit(btcPrice, 28);
        }
      }

      return 1;
    });

    //Register Pools to the protocol
    const _closeFactor = convertToUnit(0.05, 18);
    const _liquidationIncentive = convertToUnit(1, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptroller.address,
      _closeFactor,
      _liquidationIncentive,
      fakePriceOracle.address
    );

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();

    comptrollerProxy = await ethers.getContractAt(
      "Comptroller",
      pools[0].comptroller
    );
    unitroller = await ethers.getContractAt("Unitroller", pools[0].comptroller);

    await unitroller._acceptAdmin();
    await comptrollerProxy._setPriceOracle(fakePriceOracle.address);
    console.log("1");
    //Deploy CTokens
    await poolRegistry.addMarket({
      poolId: 1,
      asset: mockWBTC.address,
      decimals: 8,
      name: "Compound WBTC",
      symbol: "cWBTC",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
    });
    console.log("2");

    await poolRegistry.addMarket({
      poolId: 1,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "cDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
    });
    console.log("2");

    const cWBTCAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockWBTC.address
    );
    const cDAIAddress = await poolRegistry.getCTokenForAsset(
      1,
      mockDAI.address
    );

    cWBTC = await ethers.getContractAt("CErc20Immutable", cWBTCAddress);
    cDAI = await ethers.getContractAt("CErc20Immutable", cDAIAddress);
    console.log(cWBTC.address);
    console.log(cDAI.address);

    const [, user, compOwner] = await ethers.getSigners();

    //Enter Markets
    await comptrollerProxy.enterMarkets([cDAI.address, cWBTC.address]);
    await comptrollerProxy.enterMarkets([cDAI.address, cWBTC.address]);
    await comptrollerProxy
      .connect(user)
      .enterMarkets([cDAI.address, cWBTC.address]);

    //Configure rewards for pool
    const RewardsDistributor = await ethers.getContractFactory(
      "RewardsDistributor"
    );
    rewardsDistributor = await RewardsDistributor.deploy();

    const Comp = await ethers.getContractFactory("Comp");
    comp = await Comp.deploy(compOwner.address);
    await comp
      .connect(compOwner)
      .transfer(rewardsDistributor.address, convertToUnit(1000000, 18));

    await rewardsDistributor.initialize(comptrollerProxy.address, comp.address);

    await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);

    await rewardsDistributor._setRewardTokenSpeeds(
      [cWBTC.address, cDAI.address],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)]
    );
  });

  it("Should have correct btc balance", async function () {
    const [owner] = await ethers.getSigners();

    const btcBalance = await mockWBTC.balanceOf(owner.address);

    expect(btcBalance).equal(convertToUnit(1000, 8));
  });

  it("Pool should have correct name", async function () {
    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();
    expect(pools[0].name).equal("Pool 1");
  });

  it("Rewards distributor should have correct balance", async function () {
    expect(await comp.balanceOf(rewardsDistributor.address)).equal(
      convertToUnit(1000000, 18)
    );
  });

  it("Should have coorect market addresses", async function () {
    const [owner, user] = await ethers.getSigners();

    const res = await comptrollerProxy.getAssetsIn(owner.address);
    expect(res[0]).equal(cDAI.address);
    expect(res[1]).equal(cWBTC.address);
  });

  //NOTE: PLease review this test and fix it accordingly
  it("Claim COMP", async function () {
    const [owner, user1, user2] = await ethers.getSigners();
    await rewardsDistributor["claimRewardToken(address,address[])"](
      user1.address,
      [cWBTC.address, cDAI.address]
    );
    await rewardsDistributor["claimRewardToken(address,address[])"](
      user2.address,
      [cWBTC.address, cDAI.address]
    );

    const test = await comp.balanceOf(user1.address);
    const test1 = await comp.balanceOf(user2.address);

    //expect((await comp.balanceOf(user1.address)).toString()).not.equal("0")
    expect((await comp.balanceOf(user2.address)).toString()).not.equal("0");
  });
});

import { ethers } from "hardhat";
import { expect } from "chai";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";

import {
  MockToken,
  PoolRegistry,
  Comptroller,
  VBep20Immutable,
  Unitroller,
  VBep20ImmutableProxyFactory,
  JumpRateModelFactory,
  WhitePaperInterestRateModelFactory,
  RewardsDistributor,
  PoolRegistry__factory,
  PriceOracle,
  PriceOracle__factory,
  AccessControlManager,
  ProtocolShareReserve,
  RiskFund,
  ProtocolShareReserve__factory,
  RiskFund__factory
} from "../../typechain";
import { convertToUnit } from "../../helpers/utils";

let poolRegistry: MockContract<PoolRegistry>;
let comptroller: Comptroller;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: VBep20Immutable;
let vWBTC: VBep20Immutable;
let comptrollerProxy: Comptroller;
let unitroller: Unitroller;
let vTokenFactory: VBep20ImmutableProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let rewardsDistributor: RewardsDistributor;
let xvs: MockToken;
let fakePriceOracle: FakeContract<PriceOracle>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: FakeContract<ProtocolShareReserve>;
let riskFund: FakeContract<RiskFund>;

describe("Rewards: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [, proxyAdmin] = await ethers.getSigners();
    const VBep20ImmutableProxyFactory = await ethers.getContractFactory(
      "VBep20ImmutableProxyFactory"
    );
    vTokenFactory = await VBep20ImmutableProxyFactory.deploy();
    await vTokenFactory.deployed();

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

    const RiskFund = await smock.mock<RiskFund__factory>("RiskFund");
    riskFund = await RiskFund.deploy();
    await riskFund.deployed();

    const ProtocolShareReserve =
      await smock.mock<ProtocolShareReserve__factory>(
        "ProtocolShareReserve"
      );
    protocolShareReserve = await ProtocolShareReserve.deploy();
    await protocolShareReserve.deployed();

    const PoolRegistryFactory = await smock.mock<PoolRegistry__factory>(
      "PoolRegistry"
    );
    poolRegistry = await PoolRegistryFactory.deploy();
    await poolRegistry.deployed();

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

    await shortfall.setPoolRegistry(poolRegistry.address);

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
    const MockToken = await ethers.getContractFactory("MockToken");
    mockDAI = await MockToken.deploy("MakerDAO", "DAI", 18);
    await mockDAI.faucet(convertToUnit(1000, 18));

    const [owner] = await ethers.getSigners();
    const daiBalance = await mockDAI.balanceOf(owner.address);
    expect(daiBalance).equal(convertToUnit(1000, 18));

    mockWBTC = await MockToken.deploy("Bitcoin", "BTC", 8);
    await mockWBTC.deployed();
    await mockWBTC.faucet(convertToUnit(1000, 8));

    //Deploy Mock Price Oracle
    fakePriceOracle = await smock.fake<PriceOracle>(PriceOracle__factory.abi);

    const btcPrice = "21000.34";
    const daiPrice = "1";

    fakePriceOracle.getUnderlyingPrice.returns((args: any) => {
      if (vDAI && vWBTC) {
        if (args[0] === vDAI.address) {
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

    const VBep20Immutable = await ethers.getContractFactory("VBep20Immutable");
    const tokenImplementation = await VBep20Immutable.deploy();
    await tokenImplementation.deployed();

    //Deploy VTokens
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
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    await poolRegistry.addMarket({
      poolId: 1,
      asset: mockDAI.address,
      decimals: 18,
      name: "Compound DAI",
      symbol: "vDAI",
      rateModel: 0,
      baseRatePerYear: 0,
      multiplierPerYear: "40000000000000000",
      jumpMultiplierPerYear: 0,
      kink_: 0,
      collateralFactor: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      tokenImplementation_: tokenImplementation.address,
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(
      1,
      mockWBTC.address
    );
    const vDAIAddress = await poolRegistry.getVTokenForAsset(
      1,
      mockDAI.address
    );

    vWBTC = await ethers.getContractAt("VBep20Immutable", vWBTCAddress);
    vDAI = await ethers.getContractAt("VBep20Immutable", vDAIAddress);
    
    const [, user] = await ethers.getSigners();

    //Enter Markets
    await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptrollerProxy
      .connect(user)
      .enterMarkets([vDAI.address, vWBTC.address]);

    //Configure rewards for pool
    const RewardsDistributor = await ethers.getContractFactory(
      "RewardsDistributor"
    );
    rewardsDistributor = await RewardsDistributor.deploy();

    xvs = await MockToken.deploy("Venus Token", "XVS", 18);
    const initialXvs = convertToUnit(1000000, 18);
    await xvs.faucet(initialXvs);
    await xvs.transfer(rewardsDistributor.address, initialXvs);

    await rewardsDistributor.initialize(comptrollerProxy.address, xvs.address);

    await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);

    await rewardsDistributor._setRewardTokenSpeeds(
      [vWBTC.address, vDAI.address],
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
    expect(await xvs.balanceOf(rewardsDistributor.address)).equal(
      convertToUnit(1000000, 18)
    );
  });

  it("Should have coorect market addresses", async function () {
    const [owner, user] = await ethers.getSigners();

    const res = await comptrollerProxy.getAssetsIn(owner.address);
    expect(res[0]).equal(vDAI.address);
    expect(res[1]).equal(vWBTC.address);
  });

  //TODO: Test reward accruals. This test used to pass before, but it
  //      was a false-positive. The correct test would need to mint or
  //      borrow some assets (or pretend to do so, using smock).
  it.skip("Claim XVS", async function () {
    const [owner, user1, user2] = await ethers.getSigners();
    await rewardsDistributor["claimRewardToken(address,address[])"](
      user1.address,
      [vWBTC.address, vDAI.address]
    );
    await rewardsDistributor["claimRewardToken(address,address[])"](
      user2.address,
      [vWBTC.address, vDAI.address]
    );

    const test = await xvs.balanceOf(user1.address);
    const test1 = await xvs.balanceOf(user2.address);

    console.log(await xvs.balanceOf(rewardsDistributor.address));
    console.log(test);
    console.log(test1);

    //expect((await xvs.balanceOf(user1.address)).toString()).not.equal("0")
    expect((await xvs.balanceOf(user2.address)).toString()).not.equal("0");
  });
});

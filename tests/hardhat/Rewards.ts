import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import {
  AccessControlManager,
  Beacon,
  Comptroller,
  JumpRateModelFactory,
  MockToken,
  PoolRegistry,
  PoolRegistry__factory,
  PriceOracle,
  PriceOracle__factory,
  ProtocolShareReserve,
  RewardsDistributor,
  RiskFund,
  Shortfall,
  VToken,
  VTokenProxyFactory,
  WhitePaperInterestRateModelFactory,
} from "../../typechain";

let poolRegistry: MockContract<PoolRegistry>;
let comptrollerBeacon: Beacon;
let vTokenBeacon: Beacon;
let mockDAI: MockToken;
let mockWBTC: MockToken;
let vDAI: VToken;
let vWBTC: VToken;
let comptrollerProxy: Comptroller;
let vTokenFactory: VTokenProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let rewardsDistributor: RewardsDistributor;
let xvs: MockToken;
let fakePriceOracle: FakeContract<PriceOracle>;
let fakeAccessControlManager: FakeContract<AccessControlManager>;

describe("Rewards: Tests", async function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */
  before(async function () {
    const [, proxyAdmin] = await ethers.getSigners();
    const VTokenProxyFactory = await ethers.getContractFactory("VTokenProxyFactory");
    vTokenFactory = await VTokenProxyFactory.deploy();
    await vTokenFactory.deployed();

    const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelFactory");
    jumpRateFactory = await JumpRateModelFactory.deploy();
    await jumpRateFactory.deployed();

    const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModelFactory");
    whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
    await whitePaperRateFactory.deployed();

    const riskFund = await smock.fake<RiskFund>("RiskFund");
    const protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");
    const shortfall = await smock.fake<Shortfall>("Shortfall");

    const PoolRegistry = await smock.mock<PoolRegistry__factory>("PoolRegistry");
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

    const ComptrollerBeacon = await ethers.getContractFactory("Beacon");
    comptrollerBeacon = await ComptrollerBeacon.deploy(comptroller.address);
    await comptrollerBeacon.deployed();

    const VTokenBeacon = await ethers.getContractFactory("Beacon");
    vTokenBeacon = await VTokenBeacon.deploy(vToken.address);
    await vTokenBeacon.deployed();

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
    const _minLiquidatableCollateral = convertToUnit(100, 18);

    // Registering the first pool
    await poolRegistry.createRegistryPool(
      "Pool 1",
      comptrollerBeacon.address,
      _closeFactor,
      _liquidationIncentive,
      _minLiquidatableCollateral,
      fakePriceOracle.address,
    );

    // Get all pools list.
    const pools = await poolRegistry.callStatic.getAllPools();

    comptrollerProxy = await ethers.getContractAt("Comptroller", pools[0].comptroller);
    await comptrollerProxy.acceptOwnership();
    await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

    const VToken = await ethers.getContractFactory("VToken");
    const tokenImplementation = await VToken.deploy();
    await tokenImplementation.deployed();

    const initialSupply = convertToUnit(1000, 18);
    await mockWBTC.faucet(initialSupply);
    await mockWBTC.approve(poolRegistry.address, initialSupply);

    await mockDAI.faucet(initialSupply);
    await mockDAI.approve(poolRegistry.address, initialSupply);

    //Deploy VTokens
    await poolRegistry.addMarket({
      comptroller: comptrollerProxy.address,
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
      beaconAddress: vTokenBeacon.address,
      initialSupply,
      supplyCap: initialSupply
    });

    await poolRegistry.addMarket({
      comptroller: comptrollerProxy.address,
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
      liquidationThreshold: convertToUnit(0.7, 18),
      accessControlManager: fakeAccessControlManager.address,
      vTokenProxyAdmin: proxyAdmin.address,
      beaconAddress: vTokenBeacon.address,
      initialSupply,
      supplyCap: initialSupply
    });

    const vWBTCAddress = await poolRegistry.getVTokenForAsset(comptrollerProxy.address, mockWBTC.address);
    const vDAIAddress = await poolRegistry.getVTokenForAsset(comptrollerProxy.address, mockDAI.address);

    vWBTC = await ethers.getContractAt("VToken", vWBTCAddress);
    vDAI = await ethers.getContractAt("VToken", vDAIAddress);

    const [, , user] = await ethers.getSigners();

    //Enter Markets
    await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptrollerProxy.enterMarkets([vDAI.address, vWBTC.address]);
    await comptrollerProxy.connect(user).enterMarkets([vDAI.address, vWBTC.address]);

    //Configure rewards for pool
    const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
    rewardsDistributor = await RewardsDistributor.deploy();

    const rewardsDistributor2 = await RewardsDistributor.deploy();

    xvs = await MockToken.deploy("Venus Token", "XVS", 18);
    const initialXvs = convertToUnit(1000000, 18);
    await xvs.faucet(initialXvs);
    await xvs.transfer(rewardsDistributor.address, initialXvs);

    await rewardsDistributor.initialize(comptrollerProxy.address, xvs.address);
    await rewardsDistributor2.initialize(comptrollerProxy.address, mockDAI.address);

    await comptrollerProxy.addRewardsDistributor(rewardsDistributor.address);
    await comptrollerProxy.addRewardsDistributor(rewardsDistributor2.address);

    await rewardsDistributor.setRewardTokenSpeeds(
      [vWBTC.address, vDAI.address],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
      [convertToUnit(0.5, 18), convertToUnit(0.5, 18)],
    );

    await rewardsDistributor2.setRewardTokenSpeeds(
      [vWBTC.address, vDAI.address],
      [convertToUnit(0.4, 18), convertToUnit(0.3, 18)],
      [convertToUnit(0.2, 18), convertToUnit(0.1, 18)],
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
    expect(await xvs.balanceOf(rewardsDistributor.address)).equal(convertToUnit(1000000, 18));
  });

  it("Should have correct market addresses", async function () {
    const [owner] = await ethers.getSigners();

    const res = await comptrollerProxy.getAssetsIn(owner.address);
    expect(res[0]).equal(vDAI.address);
    expect(res[1]).equal(vWBTC.address);
  });

  it("Comptroller returns correct reward speeds", async function () {
    const res = await comptrollerProxy.getRewardsByMarket(vDAI.address);
    expect(res[0][0]).equal(xvs.address);
    expect(res[0][1].toString()).equal(convertToUnit(0.5, 18));
    expect(res[0][2].toString()).equal(convertToUnit(0.5, 18));
    expect(res[1][0]).equal(mockDAI.address);
    expect(res[1][1].toString()).equal(convertToUnit(0.3, 18));
    expect(res[1][2].toString()).equal(convertToUnit(0.1, 18));
  });

  it("Cannot add reward distributors with duplicate reward tokens", async function () {
    const RewardsDistributor = await ethers.getContractFactory("RewardsDistributor");
    rewardsDistributor = await RewardsDistributor.deploy();

    const rewardsDistributorDuplicate = await RewardsDistributor.deploy();
    await rewardsDistributorDuplicate.initialize(comptrollerProxy.address, xvs.address);

    await await expect(comptrollerProxy.addRewardsDistributor(rewardsDistributorDuplicate.address)).to.be.revertedWith(
      "distributor already exists with this reward",
    );
  });

  //TODO: Test reward accruals. This test used to pass before, but it
  //      was a false-positive. The correct test would need to mint or
  //      borrow some assets (or pretend to do so, using smock).
  it.skip("Claim XVS", async function () {
    const [_owner, user1, user2] = await ethers.getSigners();
    await rewardsDistributor["claimRewardToken(address,address[])"](user1.address, [vWBTC.address, vDAI.address]);
    await rewardsDistributor["claimRewardToken(address,address[])"](user2.address, [vWBTC.address, vDAI.address]);

    const test = await xvs.balanceOf(user1.address);
    const test1 = await xvs.balanceOf(user2.address);

    console.log(await xvs.balanceOf(rewardsDistributor.address));
    console.log(test);
    console.log(test1);

    //expect((await xvs.balanceOf(user1.address)).toString()).not.equal("0")
    expect((await xvs.balanceOf(user2.address)).toString()).not.equal("0");
  });
});

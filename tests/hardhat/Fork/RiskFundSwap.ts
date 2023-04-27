import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { AddressOne, convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Beacon,
  Comptroller,
  JumpRateModelFactory,
  MockPriceOracle,
  MockToken,
  MockToken__factory,
  PancakeRouter,
  PancakeRouter__factory,
  PoolRegistry,
  ProtocolShareReserve,
  RiskFund,
  VToken,
  VTokenProxyFactory,
  WhitePaperInterestRateModelFactory,
} from "../../../typechain";

let poolRegistry: PoolRegistry;
let comptrollerBeacon: Beacon;
let vTokenBeacon: Beacon;
let BUSD: MockToken;
let USDT: MockToken;
let vUSDT: VToken;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let vTokenFactory: VTokenProxyFactory;
let jumpRateFactory: JumpRateModelFactory;
let whitePaperRateFactory: WhitePaperInterestRateModelFactory;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;
let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
let busdUser: any;
let usdtUser: any;
const maxLoopsLimit = 150;

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const ADD_RESERVE_AMOUNT = parseUnits("100", 18);
const REDUCE_RESERVE_AMOUNT = parseUnits("50", 18);

const initPancakeSwapRouter = async (
  admin: SignerWithAddress,
): Promise<PancakeRouter | FakeContract<PancakeRouter>> => {
  let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
  if (FORK_MAINNET) {
    pancakeSwapRouter = PancakeRouter__factory.connect("0x10ED43C718714eb63d5aA57B78B54704E256024E", admin);
  } else {
    const pancakeSwapRouterFactory = await smock.mock<PancakeRouter__factory>("PancakeRouter");
    pancakeSwapRouter = await pancakeSwapRouterFactory.deploy(
      "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      admin.address,
    );
    await pancakeSwapRouter.deployed();
    const pancakeRouterSigner = await ethers.getSigner(pancakeSwapRouter.address);
    // Send some BNB to account so it can faucet money from mock tokens
    const tx = await admin.sendTransaction({
      to: pancakeSwapRouter.address,
      value: ethers.utils.parseEther("10"),
    });
    await tx.wait();
    await USDT.connect(pancakeRouterSigner).faucet(parseUnits("1000000", 18));
    await BUSD.connect(pancakeRouterSigner).faucet(parseUnits("1000000", 18));
  }
  return pancakeSwapRouter;
};

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

const initMockToken = async (name: string, symbol: string, user: SignerWithAddress): Promise<MockToken> => {
  const MockToken = await ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy(name, symbol, 18);
  await token.deployed();
  await token.faucet(ADD_RESERVE_AMOUNT);
  await token.transfer(user.address, ADD_RESERVE_AMOUNT);
  return token;
};

const riskFundFixture = async (): Promise<void> => {
  const [admin, user, ...signers] = await ethers.getSigners();
  if (FORK_MAINNET) {
    // MAINNET USER WITH BALANCE
    busdUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
    usdtUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");

    BUSD = MockToken__factory.connect("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", user);
    USDT = MockToken__factory.connect("0x55d398326f99059fF775485246999027B3197955", user);
  } else {
    [busdUser, usdtUser] = signers;

    BUSD = await initMockToken("Mock BUSD", "BUSD", busdUser);
    USDT = await initMockToken("Mock USDT", "USDT", usdtUser);
  }

  const VTokenProxyFactory = await ethers.getContractFactory("VTokenProxyFactory");
  vTokenFactory = await VTokenProxyFactory.deploy();
  await vTokenFactory.deployed();

  const JumpRateModelFactory = await ethers.getContractFactory("JumpRateModelFactory");
  jumpRateFactory = await JumpRateModelFactory.deploy();
  await jumpRateFactory.deployed();

  const WhitePaperInterestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModelFactory");
  whitePaperRateFactory = await WhitePaperInterestRateModelFactory.deploy();
  await whitePaperRateFactory.deployed();

  pancakeSwapRouter = await initPancakeSwapRouter(admin);

  fakeAccessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  fakeAccessControlManager.isAllowedToCall.returns(true);

  const Shortfall = await ethers.getContractFactory("Shortfall");
  const shortfall = await upgrades.deployProxy(Shortfall, [
    BUSD.address,
    AddressOne,
    parseUnits("10000", 18),
    fakeAccessControlManager.address,
  ]);

  const RiskFund = await ethers.getContractFactory("RiskFund");
  riskFund = await upgrades.deployProxy(RiskFund, [
    pancakeSwapRouter.address,
    parseUnits("10", 18),
    BUSD.address,
    fakeAccessControlManager.address,
    maxLoopsLimit,
  ]);

  await riskFund.setShortfallContractAddress(shortfall.address);

  const fakeProtocolIncome = await smock.fake<RiskFund>("RiskFund");
  const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
  protocolShareReserve = await upgrades.deployProxy(ProtocolShareReserve, [
    fakeProtocolIncome.address,
    riskFund.address,
  ]);

  const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
  poolRegistry = await upgrades.deployProxy(PoolRegistry, [
    vTokenFactory.address,
    jumpRateFactory.address,
    whitePaperRateFactory.address,
    shortfall.address,
    protocolShareReserve.address,
    fakeAccessControlManager.address,
  ]);

  await protocolShareReserve.setPoolRegistry(poolRegistry.address);

  await shortfall.updatePoolRegistry(poolRegistry.address);

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

  const _closeFactor = parseUnits("0.05", 18);
  const _liquidationIncentive = parseUnits("1", 18);
  const _minLiquidatableCollateral = parseUnits("100", 18);

  // Deploy Price Oracle
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  priceOracle = await MockPriceOracle.deploy();

  const usdtPrice = ".75";
  const busdPrice = "1.1";

  await priceOracle.setPrice(USDT.address, parseUnits(usdtPrice, 18));
  await priceOracle.setPrice(BUSD.address, parseUnits(busdPrice, 18));

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
  await USDT.faucet(initialSupply);
  await USDT.approve(poolRegistry.address, initialSupply);

  await BUSD.faucet(initialSupply);
  await BUSD.approve(poolRegistry.address, initialSupply);

  // Deploy CTokens
  await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: USDT.address,
    decimals: 8,
    name: "Venus USDT",
    symbol: "vUSDT",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    reserveFactor: convertToUnit(0.3, 18),
    accessControlManager: fakeAccessControlManager.address,
    beaconAddress: vTokenBeacon.address,
    initialSupply,
    vTokenReceiver: admin.address,
    supplyCap: initialSupply,
    borrowCap: initialSupply,
  });

  await poolRegistry.addMarket({
    comptroller: comptroller1Proxy.address,
    asset: BUSD.address,
    decimals: 18,
    name: "Venus BUSD",
    symbol: "vBUSD",
    rateModel: 0,
    baseRatePerYear: 0,
    multiplierPerYear: "40000000000000000",
    jumpMultiplierPerYear: 0,
    kink_: 0,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    reserveFactor: convertToUnit(0.3, 18),
    accessControlManager: fakeAccessControlManager.address,
    beaconAddress: vTokenBeacon.address,
    initialSupply,
    vTokenReceiver: admin.address,
    supplyCap: initialSupply,
    borrowCap: initialSupply,
  });

  const vUSDTAddress = await poolRegistry.getVTokenForAsset(comptroller1Proxy.address, USDT.address);

  vUSDT = await ethers.getContractAt("VToken", vUSDTAddress);

  await riskFund.setPoolRegistry(poolRegistry.address);
};

describe("Risk Fund: Swap Tests", () => {
  beforeEach(async () => {
    await loadFixture(riskFundFixture);
  });
  it("Swap All Pool Assets", async () => {
    await USDT.connect(usdtUser).approve(vUSDT.address, ADD_RESERVE_AMOUNT);
    await vUSDT.connect(usdtUser).addReserves(ADD_RESERVE_AMOUNT);
    await vUSDT.connect(usdtUser).reduceReserves(REDUCE_RESERVE_AMOUNT);

    await protocolShareReserve.releaseFunds(comptroller1Proxy.address, USDT.address, REDUCE_RESERVE_AMOUNT);

    await riskFund.swapPoolsAssets([vUSDT.address], [parseUnits("10", 18)], [[USDT.address, BUSD.address]]);
    expect(await riskFund.poolReserves(comptroller1Proxy.address)).to.be.equal("14960261570862459704");

    const balance = await BUSD.balanceOf(riskFund.address);
    expect(Number(balance)).to.be.closeTo(Number(parseUnits("15", 18)), Number(parseUnits("1", 17)));
  });
});

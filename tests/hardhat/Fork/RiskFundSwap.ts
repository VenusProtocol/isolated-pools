import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { AddressOne } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  MockPriceOracle,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PancakeRouter,
  PancakeRouter__factory,
  PoolRegistry,
  ProtocolShareReserve,
  RiskFund,
  VToken,
} from "../../../typechain";
import { deployVTokenBeacon, makeVToken } from "../util/TokenTestHelpers";

// Disable a warning about mixing beacons and transparent proxies
upgrades.silenceWarnings();

let poolRegistry: PoolRegistry;
let BUSD: MockToken;
let USDT: MockToken;
let vUSDT: VToken;
let priceOracle: MockPriceOracle;
let comptroller1Proxy: Comptroller;
let fakeAccessControlManager: FakeContract<AccessControlManager>;
let protocolShareReserve: ProtocolShareReserve;
let riskFund: RiskFund;
let pancakeSwapRouter: PancakeRouter | FakeContract<PancakeRouter>;
let busdUser: SignerWithAddress;
let usdtUser: SignerWithAddress;
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

const initMainnetUser = async (user: string): Promise<SignerWithAddress> => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

const initMockToken = async (name: string, symbol: string, user: SignerWithAddress): Promise<MockToken> => {
  const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
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
  riskFund = (await upgrades.deployProxy(RiskFund, [
    pancakeSwapRouter.address,
    parseUnits("10", 18),
    BUSD.address,
    fakeAccessControlManager.address,
    maxLoopsLimit,
  ])) as RiskFund;

  await riskFund.setShortfallContractAddress(shortfall.address);

  const fakeProtocolIncome = await smock.fake<RiskFund>("RiskFund");
  const ProtocolShareReserve = await ethers.getContractFactory("ProtocolShareReserve");
  protocolShareReserve = (await upgrades.deployProxy(ProtocolShareReserve, [
    fakeProtocolIncome.address,
    riskFund.address,
  ])) as ProtocolShareReserve;

  const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
  poolRegistry = (await upgrades.deployProxy(PoolRegistry, [fakeAccessControlManager.address])) as PoolRegistry;

  await protocolShareReserve.setPoolRegistry(poolRegistry.address);

  await shortfall.updatePoolRegistry(poolRegistry.address);

  const _closeFactor = parseUnits("0.05", 18);
  const _liquidationIncentive = parseUnits("1", 18);
  const _minLiquidatableCollateral = parseUnits("100", 18);

  // Deploy Price Oracle
  const MockPriceOracle = await ethers.getContractFactory<MockPriceOracle__factory>("MockPriceOracle");
  priceOracle = await MockPriceOracle.deploy();

  const usdtPrice = ".75";
  const busdPrice = "1.1";

  await priceOracle.setPrice(USDT.address, parseUnits(usdtPrice, 18));
  await priceOracle.setPrice(BUSD.address, parseUnits(busdPrice, 18));

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

  const initialSupply = parseUnits("1000", 18);
  const vTokenBeacon = await deployVTokenBeacon();

  vUSDT = await makeVToken({
    underlying: USDT,
    comptroller: comptroller1Proxy,
    accessControlManager: fakeAccessControlManager,
    decimals: 8,
    admin,
    protocolShareReserve,
    beacon: vTokenBeacon,
  });

  const vBUSD = await makeVToken({
    underlying: BUSD,
    comptroller: comptroller1Proxy,
    accessControlManager: fakeAccessControlManager,
    decimals: 8,
    admin,
    protocolShareReserve,
    beacon: vTokenBeacon,
  });

  await USDT.faucet(initialSupply);
  await USDT.approve(poolRegistry.address, initialSupply);
  await poolRegistry.addMarket({
    vToken: vUSDT.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply,
    vTokenReceiver: admin.address,
    supplyCap: initialSupply,
    borrowCap: initialSupply,
  });

  await BUSD.faucet(initialSupply);
  await BUSD.approve(poolRegistry.address, initialSupply);
  await poolRegistry.addMarket({
    vToken: vBUSD.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply,
    vTokenReceiver: admin.address,
    supplyCap: initialSupply,
    borrowCap: initialSupply,
  });

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

    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 100;
    await riskFund.swapPoolsAssets([vUSDT.address], [parseUnits("10", 18)], [[USDT.address, BUSD.address]], deadline);
    expect(await riskFund.getPoolsBaseAssetReserves(comptroller1Proxy.address)).to.be.equal("24931282761361385504");

    const balance = await BUSD.balanceOf(riskFund.address);
    expect(Number(balance)).to.be.closeTo(Number(parseUnits("25", 18)), Number(parseUnits("1", 17)));
  });
});

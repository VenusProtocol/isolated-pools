import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import {
  Comptroller,
  IAccessControlManagerV8,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  PrimeLiquidityProviderScenario,
  PrimeScenario,
  ResilientOracleInterface,
  VToken,
  VTokenHarness,
  XVSStoreScenario,
  XVSVaultScenario,
} from "../../typechain";
import { deployVTokenBeacon, makeVToken } from "./util/TokenTestHelpers";

// import { convertToUnit } from "../../../helpers/utils";

const { expect } = chai;
chai.use(smock.matchers);

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
export const bigNumber16 = BigNumber.from("10000000000000000"); // 1e16

type SetupProtocolFixture = {
  oracle: FakeContract<ResilientOracleInterface>;
  accessControl: FakeContract<IAccessControlManagerV8>;
  comptroller: Comptroller;
  usdt: MockToken;
  vusdt: VToken;
  eth: MockToken;
  veth: VToken;
  xvsVault: XVSVaultScenario;
  xvs: MockToken;
  xvsStore: XVSStoreScenario;
  prime: PrimeScenario;
  primeLiquidityProvider: FakeContract<PrimeLiquidityProviderScenario>;
  _primeLiquidityProvider: PrimeLiquidityProviderScenario;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, user1, user2, user3] = await ethers.getSigners();

  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const accessControl = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControl.isAllowedToCall.returns(true);

  const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
  const poolRegistry = (await upgrades.deployProxy(PoolRegistry, [accessControl.address])) as PoolRegistry;

  const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
  const usdt = await MockToken.deploy("USDT", "USDT", 18);
  await usdt.faucet(convertToUnit(1000000, 18));

  const eth = await MockToken.deploy("ETH", "ETH", 18);
  await eth.faucet(convertToUnit(1000, 18));

  const weth = await MockToken.deploy("WETH", "WETH", 18);
  await weth.faucet(convertToUnit(1000, 18));

  const _closeFactor = convertToUnit(0.05, 18);
  const _liquidationIncentive = convertToUnit(1, 18);
  const _minLiquidatableCollateral = convertToUnit(100, 18);

  const Comptroller = await ethers.getContractFactory("Comptroller");
  const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

  const maxLoopsLimit = 150;
  const fakePriceOracle = await smock.fake<ResilientOracleInterface>(MockPriceOracle__factory.abi);

  const comptrollerProxy = (await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
    maxLoopsLimit,
    accessControl.address,
  ])) as Comptroller;
  await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

  // Registering the first pool
  await poolRegistry.addPool(
    "Pool 1",
    comptrollerProxy.address,
    _closeFactor,
    _liquidationIncentive,
    _minLiquidatableCollateral,
  );

  const vTokenBeacon = await deployVTokenBeacon();
  const vUSDT = await makeVToken({
    underlying: usdt,
    comptroller: comptrollerProxy,
    accessControlManager: accessControl,
    admin: wallet,
    beacon: vTokenBeacon,
  });
  const vETH = await makeVToken({
    underlying: eth,
    comptroller: comptrollerProxy,
    accessControlManager: accessControl,
    admin: wallet,
    beacon: vTokenBeacon,
  });

  fakePriceOracle.getUnderlyingPrice.returns((vToken: string) => {
    if (vToken == vUSDT.address) {
      return convertToUnit(1, 18);
    } else if (vToken == vETH.address) {
      return convertToUnit(1200, 18);
    }
  });

  const usdtInitialSupply = parseUnits("10", 18);
  await usdt.approve(poolRegistry.address, usdtInitialSupply);
  await poolRegistry.addMarket({
    vToken: vUSDT.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply: usdtInitialSupply,
    vTokenReceiver: wallet.address,
    supplyCap: parseUnits("10000", 18),
    borrowCap: parseUnits("10000", 18),
  });

  const ethInitialSupply = parseUnits("1000", 18);
  await eth.faucet(ethInitialSupply);
  await eth.approve(poolRegistry.address, ethInitialSupply);
  await poolRegistry.addMarket({
    vToken: vETH.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply: ethInitialSupply,
    vTokenReceiver: wallet.address,
    supplyCap: parseUnits("10000", 18),
    borrowCap: parseUnits("10000", 18),
  });

  await comptrollerProxy.enterMarkets([vETH.address, vUSDT.address]);

  const xvs = await MockToken.deploy("XVS", "XVS", 18);
  await xvs.faucet(convertToUnit(100000000, 18));

  const xvsStoreScenarioFactory = await ethers.getContractFactory("XVSStoreScenario");
  const xvsStoreScenario: XVSStoreScenario = (await xvsStoreScenarioFactory.deploy()) as XVSStoreScenario;

  const xvsVaultScenarioFactory = await ethers.getContractFactory("XVSVaultScenario");
  const xvsVaultScenario: XVSVaultScenario = (await xvsVaultScenarioFactory.deploy()) as XVSVaultScenario;

  await xvsStoreScenario.setNewOwner(xvsVaultScenario.address);
  await xvsVaultScenario.setXvsStore(xvs.address, xvsStoreScenario.address);
  await xvsVaultScenario.setAccessControl(accessControl.address);

  await xvs.transfer(xvsStoreScenario.address, bigNumber18.mul(1000));
  await xvs.transfer(user1.address, bigNumber18.mul(1000000));
  await xvs.transfer(user2.address, bigNumber18.mul(1000000));
  await xvs.transfer(user3.address, bigNumber18.mul(1000000));

  await xvsStoreScenario.setRewardToken(xvs.address, true);

  const lockPeriod = 300;
  const allocPoint = 100;
  const poolId = 0;
  const rewardPerBlock = bigNumber18.mul(1);
  await xvsVaultScenario.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);

  const primeLiquidityProviderScenarioFactory = await ethers.getContractFactory("PrimeLiquidityProviderScenario");
  const _primeLiquidityProviderScenario = await upgrades.deployProxy(
    primeLiquidityProviderScenarioFactory,
    [
      accessControl.address,
      [xvs.address, usdt.address, eth.address],
      [10, 10, 10],
      [convertToUnit(1, 18), convertToUnit(1, 18), convertToUnit(1, 18)],
      10,
    ],
    {},
  );

  const primeLiquidityProviderScenario = await smock.fake<PrimeLiquidityProviderScenario>(
    "PrimeLiquidityProviderScenario",
  );

  const stakingPeriod = 90 * 24 * 60 * 60;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");

  const primeScenarioFactory = await ethers.getContractFactory("PrimeScenario");
  const primeScenario: PrimeScenario = await upgrades.deployProxy(
    primeScenarioFactory,
    [
      xvsVaultScenario.address,
      xvs.address,
      0,
      1,
      2,
      accessControl.address,
      primeLiquidityProviderScenario.address,
      oracle.address,
      10,
    ],
    {
      constructorArgs: [weth.address, vETH.address, 10512000, stakingPeriod, minimumXVS, maximumXVSCap],
      unsafeAllow: "constructor",
    },
  );

  await eth.transfer(user1.address, bigNumber18.mul(100));
  await usdt.transfer(user2.address, bigNumber18.mul(10000));

  return {
    oracle,
    accessControl,
    // comptrollerLens,
    comptroller: comptrollerProxy,
    usdt,
    vusdt: vUSDT,
    eth,
    veth: vETH,
    xvs,
    xvsStore: xvsStoreScenario,
    xvsVault: xvsVaultScenario,
    prime: primeScenario,
    primeLiquidityProvider: primeLiquidityProviderScenario,
    _primeLiquidityProvider: _primeLiquidityProviderScenario,
  };
}

describe("Prime Token", () => {
  let deployer: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  before(async () => {
    [deployer, user1, user2, user3] = await ethers.getSigners();
  });

  describe("protocol setup", () => {
    let comptroller: Comptroller;
    let prime: PrimeScenario;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({ comptroller, vusdt, veth, usdt, eth, prime } = await loadFixture(deployProtocol));

      await eth.connect(user1).approve(veth.address, bigNumber18.mul(90));
      await veth.connect(user1).mint(bigNumber18.mul(90));

      await usdt.connect(user2).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user2).mint(bigNumber18.mul(9000));

      await comptroller.connect(user1).enterMarkets([vusdt.address, veth.address]);
      await comptroller.connect(user2).enterMarkets([vusdt.address, veth.address]);

      await vusdt.connect(user1).borrow(bigNumber18.mul(5));
      await veth.connect(user2).borrow(bigNumber18.mul(1));
    });

    it("markets added", async () => {
      expect(await comptroller.allMarkets(0)).to.be.equal(vusdt.address);
      expect(await comptroller.allMarkets(1)).to.be.equal(veth.address);
    });

    it("borrow balance", async () => {
      expect(await usdt.balanceOf(user1.getAddress())).to.be.gt(0);
      expect(await eth.balanceOf(user2.getAddress())).to.be.gt(0);
    });
  });
});

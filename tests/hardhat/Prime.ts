import { FakeContract, smock } from "@defi-wonderland/smock";
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
  UpgradeableBeacon,
  VToken,
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
  link: MockToken;
  vlink: VToken;
  xvsVault: XVSVaultScenario;
  xvs: MockToken;
  xvsStore: XVSStoreScenario;
  prime: PrimeScenario;
  primeLiquidityProvider: FakeContract<PrimeLiquidityProviderScenario>;
  _primeLiquidityProvider: PrimeLiquidityProviderScenario;
  vTokenBeacon: UpgradeableBeacon;
  poolRegistry: PoolRegistry;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, user1, user2, user3] = await ethers.getSigners();

  const accessControl = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControl.isAllowedToCall.returns(true);

  const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
  const poolRegistry = (await upgrades.deployProxy(PoolRegistry, [accessControl.address])) as PoolRegistry;

  const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
  const usdt = await MockToken.deploy("USDT", "USDT", 18);
  await usdt.faucet(convertToUnit(1000000, 18));

  const link = await MockToken.deploy("LINK", "LINK", 18);
  await link.faucet(convertToUnit(1000, 18));

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
  const vLINK = await makeVToken({
    underlying: link,
    comptroller: comptrollerProxy,
    accessControlManager: accessControl,
    admin: wallet,
    beacon: vTokenBeacon,
  });
  const vETH = await makeVToken({
    underlying: weth,
    comptroller: comptrollerProxy,
    accessControlManager: accessControl,
    admin: wallet,
    beacon: vTokenBeacon,
  });

  fakePriceOracle.getUnderlyingPrice.returns((vToken: string) => {
    if (vToken == vUSDT.address) {
      return convertToUnit(1, 18);
    } else if (vToken == vLINK.address) {
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

  const linkInitialSupply = parseUnits("1000", 18);
  await link.faucet(linkInitialSupply);
  await link.approve(poolRegistry.address, linkInitialSupply);
  await poolRegistry.addMarket({
    vToken: vLINK.address,
    collateralFactor: parseUnits("0.7", 18),
    liquidationThreshold: parseUnits("0.7", 18),
    initialSupply: linkInitialSupply,
    vTokenReceiver: wallet.address,
    supplyCap: parseUnits("10000", 18),
    borrowCap: parseUnits("10000", 18),
  });

  await comptrollerProxy.enterMarkets([vLINK.address, vUSDT.address]);

  const xvs = await MockToken.deploy("XVS", "XVS", 18);
  await xvs.faucet(convertToUnit(100000000, 18));

  fakePriceOracle.getPrice.returns((token: string) => {
    if (token == xvs.address) {
      return convertToUnit(3, 18);
    }
  });

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
      [xvs.address, usdt.address, link.address],
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
      fakePriceOracle.address,
      10,
    ],
    {
      constructorArgs: [weth.address, vETH.address, 10512000, stakingPeriod, minimumXVS, maximumXVSCap],
      unsafeAllow: "constructor",
    },
  );

  await link.transfer(user1.address, bigNumber18.mul(100));
  await usdt.transfer(user2.address, bigNumber18.mul(10000));

  await xvsVaultScenario.setPrimeToken(primeScenario.address, xvs.address, poolId);
  await primeScenario.setLimit(1000, 1000);
  await primeScenario.addMarket(comptrollerProxy.address, vUSDT.address, bigNumber18.mul("1"), bigNumber18.mul("1"));
  await primeScenario.addMarket(comptrollerProxy.address, vLINK.address, bigNumber18.mul("1"), bigNumber18.mul("1"));
  await comptrollerProxy.setPrimeToken(primeScenario.address);
  await primeScenario.togglePause();

  return {
    oracle: fakePriceOracle,
    accessControl,
    // comptrollerLens,
    comptroller: comptrollerProxy,
    usdt,
    vusdt: vUSDT,
    link,
    vlink: vLINK,
    xvs,
    xvsStore: xvsStoreScenario,
    xvsVault: xvsVaultScenario,
    prime: primeScenario,
    primeLiquidityProvider: primeLiquidityProviderScenario,
    _primeLiquidityProvider: _primeLiquidityProviderScenario,
    vTokenBeacon,
    poolRegistry,
  };
}

describe("Prime Token", () => {
  let user1: Signer;
  let user2: Signer;

  before(async () => {
    [user1, user2] = await ethers.getSigners();
  });

  describe("protocol setup", () => {
    let comptroller: Comptroller;
    let vusdt: VToken;
    let vlink: VToken;
    let usdt: MockToken;
    let link: MockToken;

    beforeEach(async () => {
      ({ comptroller, vusdt, vlink, usdt, link } = await loadFixture(deployProtocol));

      await link.connect(user1).approve(vlink.address, bigNumber18.mul(90));
      await vlink.connect(user1).mint(bigNumber18.mul(90));

      await usdt.connect(user2).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user2).mint(bigNumber18.mul(9000));

      await comptroller.connect(user1).enterMarkets([vusdt.address, vlink.address]);
      await comptroller.connect(user2).enterMarkets([vusdt.address, vlink.address]);

      await vusdt.connect(user1).borrow(bigNumber18.mul(5));
      await vlink.connect(user2).borrow(bigNumber18.mul(1));
    });

    it("markets added", async () => {
      expect(await comptroller.allMarkets(0)).to.be.equal(vusdt.address);
      expect(await comptroller.allMarkets(1)).to.be.equal(vlink.address);
    });

    it("borrow balance", async () => {
      expect(await usdt.balanceOf(await await user1.getAddress())).to.be.gt(0);
      expect(await link.balanceOf(await user2.getAddress())).to.be.gt(0);
    });
  });

  describe("boosted yield", () => {
    let comptroller: Comptroller;
    let prime: PrimeScenario;
    let vusdt: VToken;
    let vlink: VToken;
    let usdt: MockToken;
    let link: MockToken;
    let xvsVault: XVSVaultScenario;
    let xvs: MockToken;
    let primeLiquidityProvider: FakeContract<PrimeLiquidityProviderScenario>;

    beforeEach(async () => {
      ({ comptroller, prime, vusdt, vlink, usdt, link, xvsVault, xvs, primeLiquidityProvider } = await loadFixture(
        deployProtocol,
      ));

      await primeLiquidityProvider.tokenAmountAccrued.returns("0");

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);
      await prime.connect(user1).claim();

      await xvs.connect(user2).approve(xvsVault.address, bigNumber18.mul(100));
      await xvsVault.connect(user2).deposit(xvs.address, 0, bigNumber18.mul(100));

      await link.connect(user1).approve(vlink.address, bigNumber18.mul(90));
      await vlink.connect(user1).mint(bigNumber18.mul(90));

      await usdt.connect(user2).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user2).mint(bigNumber18.mul(9000));

      await comptroller.connect(user1).enterMarkets([vusdt.address, vlink.address]);

      await comptroller.connect(user2).enterMarkets([vusdt.address, vlink.address]);

      await vusdt.connect(user1).borrow(bigNumber18.mul(5));
      await vlink.connect(user2).borrow(bigNumber18.mul(1));
    });

    it("calculate score", async () => {
      const xvsBalance = bigNumber18.mul(5000);
      const capital = bigNumber18.mul(120);

      // 5000^0.5 * 120^1-0.5 = 774.5966692
      expect((await prime.calculateScore(xvsBalance, capital)).toString()).to.be.equal("774596669241483420144");

      await prime.updateAlpha(4, 5); // 0.80

      //  5000^0.8 * 120^1-0.8 = 2371.44061
      expect((await prime.calculateScore(xvsBalance, capital)).toString()).to.be.equal("2371440609779311958519");
    });

    it("accrue interest - prime token minted after market is added", async () => {
      let interest = await prime.interests(vusdt.address, await user1.getAddress());
      /**
       * score = 10000^0.5 * 5^0.5 = 223.6067977
       */
      expect(interest.score).to.be.equal("223606797749979014552");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      let market = await prime.markets(vusdt.address);
      expect(market.sumOfMembersScore).to.be.equal("223606797749979014552");
      expect(market.rewardIndex).to.be.equal(0);

      await primeLiquidityProvider.tokenAmountAccrued.returns("518436");
      await prime.accrueInterest(vusdt.address);
      market = await prime.markets(vusdt.address);
      expect(market.sumOfMembersScore).to.be.equal("223606797749979014552");
      /**
       * IncomeToDistribute = 518436
       * IndexDelta = IncomeToDistribute/MarketScore = 518436 / 223606797749979014552 = 0.000000000000002318
       * NewIndex += IndexDelta = 2318
       */
      expect(market.rewardIndex).to.be.equal("2318");

      /**
       * index = 2318 - 0
       * score = 223606797749979014552 (223.606797749979014552)
       * interest = index * score = 2318 * 223.606797749979014552 = 518320
       */
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, await user1.getAddress())).to.be.equal(518320);

      const interestsAccrued = await prime.callStatic.getPendingRewards(await user1.getAddress());
      expect(interestsAccrued[0].rewardToken).to.be.equal(usdt.address);
      expect(interestsAccrued[1].rewardToken).to.be.equal(link.address);
      expect(interestsAccrued[0].amount).to.be.equal(518320);
      expect(interestsAccrued[1].amount).to.be.equal(518000);

      await prime.issue(false, [await user2.getAddress()]);

      interest = await prime.interests(vusdt.address, await user2.getAddress());
      /**
       * score = 100^0.5 * 300^0.5 = 173.2050808
       */
      expect(interest.score).to.be.equal("173205080756887726446");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal("2318");
    });

    it("claim interest", async () => {
      await primeLiquidityProvider.tokenAmountAccrued.returns("518436");
      await prime.accrueInterest(vusdt.address);
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, await user1.getAddress())).to.be.equal(518320);

      await expect(prime.connect(user1)["claimInterest(address)"](vusdt.address)).to.be.reverted;

      const interest = await prime.callStatic.getInterestAccrued(vusdt.address, await user1.getAddress());
      await usdt.transfer(prime.address, interest);
      const previousBalance = await usdt.balanceOf(await user1.getAddress());
      expect(
        await prime.callStatic["claimInterest(address,address)"](vusdt.address, await user1.getAddress()),
      ).to.be.equal(interest);
      await expect(prime["claimInterest(address,address)"](vusdt.address, await user1.getAddress())).to.be.not.reverted;
      const newBalance = await usdt.balanceOf(await user1.getAddress());
      expect(newBalance).to.be.equal(previousBalance.add(interest));
    });
  });

  describe("PLP integration", () => {
    let comptroller: Comptroller;
    let prime: PrimeScenario;
    let vusdt: VToken;
    let vlink: VToken;
    let vmatic: VToken;
    let matic: MockToken;
    let xvsVault: XVSVaultScenario;
    let xvs: MockToken;
    let oracle: FakeContract<ResilientOracleInterface>;
    let _primeLiquidityProvider: PrimeLiquidityProviderScenario;
    let vTokenBeacon: UpgradeableBeacon;
    let poolRegistry: PoolRegistry;

    beforeEach(async () => {
      const [wallet, user1] = await ethers.getSigners();

      ({
        comptroller,
        prime,
        vusdt,
        vlink,
        xvsVault,
        xvs,
        oracle,
        _primeLiquidityProvider,
        vTokenBeacon,
        poolRegistry,
      } = await loadFixture(deployProtocol));

      const accessControl = await smock.fake<IAccessControlManagerV8>("AccessControlManager");
      accessControl.isAllowedToCall.returns(true);

      await _primeLiquidityProvider.setPrimeToken(prime.address);
      await prime.setPLP(_primeLiquidityProvider.address);

      const MockToken = await ethers.getContractFactory<MockToken__factory>("MockToken");
      matic = await MockToken.deploy("MATIC", "USDMATICT", 18);
      await matic.faucet(convertToUnit(100000000, 18));

      await _primeLiquidityProvider.initializeTokens([matic.address]);

      vmatic = await makeVToken({
        underlying: matic,
        comptroller: comptroller,
        accessControlManager: accessControl,
        admin: wallet,
        beacon: vTokenBeacon,
      });

      const maticInitialSupply = parseUnits("1000", 18);
      await matic.faucet(maticInitialSupply);
      await matic.approve(poolRegistry.address, maticInitialSupply);

      oracle.getUnderlyingPrice.returns((vToken: string) => {
        if (vToken == vusdt.address) {
          return convertToUnit(1, 18);
        } else if (vToken == vlink.address) {
          return convertToUnit(1200, 18);
        } else if (vToken == vmatic.address) {
          return convertToUnit(1, 18);
        }
      });

      await poolRegistry.addMarket({
        vToken: vmatic.address,
        collateralFactor: parseUnits("0.5", 18),
        liquidationThreshold: parseUnits("0.5", 18),
        initialSupply: maticInitialSupply,
        vTokenReceiver: wallet.address,
        supplyCap: parseUnits("10000", 18),
        borrowCap: parseUnits("10000", 18),
      });

      await comptroller.enterMarkets([vmatic.address]);

      await prime.addMarket(comptroller.address, vmatic.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);
      await prime.connect(user1).claim();

      await matic.transfer(user1.getAddress(), bigNumber18.mul(90));
      await matic.connect(user1).approve(vmatic.address, bigNumber18.mul(90));
      await vmatic.connect(user1).mint(bigNumber18.mul(90));

      const speed = convertToUnit(1, 18);
      await _primeLiquidityProvider.setTokensDistributionSpeed([matic.address], [speed]);
      await matic.transfer(_primeLiquidityProvider.address, bigNumber18.mul(10000));
    });

    it("claim interest", async () => {
      let interest = await prime.interests(vmatic.address, await user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      let plpAccrued = await _primeLiquidityProvider.tokenAmountAccrued(matic.address);
      expect(plpAccrued).to.be.equal(0);

      await mine(100);
      await _primeLiquidityProvider.accrueTokens(matic.address);
      plpAccrued = await _primeLiquidityProvider.tokenAmountAccrued(matic.address);
      expect(plpAccrued).to.be.equal(bigNumber18.mul(102)); // (1 * 100) + 2 = 102

      await prime.accrueInterest(vmatic.address);
      interest = await prime.interests(vmatic.address, await user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      await prime.accrueInterestAndUpdateScore(await user1.getAddress(), vmatic.address);

      const market = await prime.markets(vmatic.address);
      // 103000000000000000000 / 948683298050513937723 = 108571532999114341
      // 1000000000000000000 / 948683298050513937723 = 1054092553389459
      // 108571532999114341 + 1054092553389459 = 109625625552503800
      expect(market.rewardIndex).to.be.equal("109625625552503800");

      interest = await prime.interests(vmatic.address, await user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      // 109625625552503800 * 948683298050513937723 = 103999999999999999163
      expect(interest.accrued).to.be.equal("103999999999999999163");
      expect(interest.rewardIndex).to.be.equal("109625625552503800");

      const beforeBalance = await matic.balanceOf(await user1.getAddress());
      expect(beforeBalance).to.be.equal(0);
      await prime["claimInterest(address,address)"](vmatic.address, await user1.getAddress());
      const afterBalance = await matic.balanceOf(await user1.getAddress());
      // 103999999999999999163 + 1000000000000000000 = 104999999999999998571
      expect(afterBalance).to.be.equal("104999999999999998571");
    });

    it("APR Estimation", async () => {
      const apr = await prime.calculateAPR(vmatic.address, await user1.getAddress());
      expect(apr.supplyAPR.toString()).to.be.equal("1168000000");
    });

    it("Hypothetical APR Estimation", async () => {
      let apr = await prime.estimateAPR(
        vmatic.address,
        await user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(100),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("525600000");
      expect(apr.borrowAPR.toString()).to.be.equal("525600000");

      apr = await prime.estimateAPR(
        vmatic.address,
        await user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(50),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("700800000");
      expect(apr.borrowAPR.toString()).to.be.equal("700800000");

      apr = await prime.estimateAPR(
        vmatic.address,
        await user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(0),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("0");
      expect(apr.borrowAPR.toString()).to.be.equal("1051200000");
    });
  });
});

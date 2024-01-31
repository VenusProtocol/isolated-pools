import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Wallet, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  IAccessControlManagerV5,
  IComptroller,
  MockPriceOracle__factory,
  MockToken,
  MockToken__factory,
  PoolRegistry,
  PoolRegistry__factory,
  PrimeScenario,
  PrimeScenario__factory,
  ResilientOracleInterface,
  VAIControllerHarness,
  VAIScenario,
  VTokenHarness,
  VTokenHarness__factory,
} from "../../../typechain";
import { makeVToken } from "../util/TokenTestHelpers";

const BLOCKS_PER_YEAR = 1000;

interface ComptrollerFixture {
  usdt: MockContract<MockToken>;
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: Comptroller;
  oracle: FakeContract<ResilientOracleInterface>;
  vai: VAIScenario;
  vaiController: VAIControllerHarness;
  vusdt: VTokenHarness;
}

describe("VAIController", async () => {
  let user1: Wallet;
  let user2: Wallet;
  let wallet: Wallet;
  let treasuryAddress: Wallet;
  let accessControlManager: FakeContract<AccessControlManager>;
  let comptroller: Comptroller;
  let oracle: FakeContract<ResilientOracleInterface>;
  let vai: VAIScenario;
  let vaiController: VAIControllerHarness;
  let usdt: MockContract<MockToken>;
  let vusdt: VTokenHarness;

  before("get signers", async () => {
    [wallet, user1, user2, treasuryAddress] = await ethers.getSigners();
  });

  async function comptrollerFixture(): Promise<ComptrollerFixture> {
    const MockToken = await smock.mock<MockToken__factory>("MockToken");
    usdt = await MockToken.deploy("USDT", "USDT", 18);

    accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    accessControlManager.isAllowedToCall.returns(true);

    const closeFactor = convertToUnit(0.6, 18);
    const liquidationIncentive = convertToUnit(1, 18);
    const minLiquidatableCollateral = convertToUnit(100, 18);

    const vaiFactory = await ethers.getContractFactory("VAIScenario");
    const vai = (await vaiFactory.deploy(BigNumber.from(97))) as VAIScenario;

    const vaiControllerFactory = await ethers.getContractFactory("VAIControllerHarness");
    const vaiControllerBeacon = await upgrades.deployBeacon(vaiControllerFactory, { constructorArgs: [] });

    const vaiControllerProxy = (await upgrades.deployBeaconProxy(vaiControllerBeacon, vaiControllerFactory, [
      accessControlManager.address,
    ])) as VAIControllerHarness;

    const PoolRegistry = await ethers.getContractFactory<PoolRegistry__factory>("PoolRegistry");
    const poolRegistry = (await upgrades.deployProxy(PoolRegistry, [accessControlManager.address])) as PoolRegistry;

    const Comptroller = await ethers.getContractFactory("Comptroller");
    const comptrollerBeacon = await upgrades.deployBeacon(Comptroller, { constructorArgs: [poolRegistry.address] });

    const maxLoopsLimit = 150;
    const fakePriceOracle = await smock.fake<ResilientOracleInterface>(MockPriceOracle__factory.abi);

    const comptrollerProxy = (await upgrades.deployBeaconProxy(comptrollerBeacon, Comptroller, [
      maxLoopsLimit,
      accessControlManager.address,
    ])) as Comptroller;

    await comptrollerProxy.setPriceOracle(fakePriceOracle.address);

    // Registering the pool
    await poolRegistry.addPool(
      "Pool 1",
      comptrollerProxy.address,
      closeFactor,
      liquidationIncentive,
      minLiquidatableCollateral,
    );

    await comptrollerProxy.setPriceOracle(fakePriceOracle.address);
    await comptrollerProxy.setVAIController(vaiControllerProxy.address);

    await vaiControllerProxy.setComptroller(comptrollerProxy.address);
    await vaiControllerProxy.setAccessControlManager(accessControlManager.address);
    await vaiControllerProxy.setBlocksPerYear(BLOCKS_PER_YEAR);
    await vaiControllerProxy.setVAIAddress(vai.address);
    await vaiControllerProxy.setVAIMintRate(BigNumber.from(10000));
    await vaiControllerProxy.setReceiver(treasuryAddress.address);
    await vaiControllerProxy.setMintCap(BigNumber.from(10000));

    await vai.rely(vaiControllerProxy.address);

    const vusdt = await makeVToken<VTokenHarness__factory>(
      {
        underlying: usdt,
        comptroller: comptrollerProxy,
        accessControlManager: accessControlManager,
        admin: wallet,
      },
      { kind: "VTokenHarness" },
    );

    fakePriceOracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(convertToUnit(1, 18));
    fakePriceOracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));

    const usdtInitialSupply = convertToUnit(10, 18);
    await usdt.faucet(usdtInitialSupply);
    await usdt.approve(poolRegistry.address, usdtInitialSupply);
    await poolRegistry.addMarket({
      vToken: vusdt.address,
      collateralFactor: convertToUnit(0.5, 18),
      liquidationThreshold: convertToUnit(0.5, 18),
      initialSupply: usdtInitialSupply,
      vTokenReceiver: wallet.address,
      supplyCap: convertToUnit(10000, 18),
      borrowCap: convertToUnit(10000, 18),
    });

    return {
      usdt,
      accessControlManager,
      comptroller: comptrollerProxy,
      oracle: fakePriceOracle,
      vai,
      vaiController: vaiControllerProxy,
      vusdt,
    };
  }

  beforeEach("deploy Comptroller", async () => {
    ({ usdt, accessControlManager, comptroller, oracle, vai, vaiController, vusdt } = await loadFixture(
      comptrollerFixture,
    ));
    accessControlManager.isAllowedToCall.reset();
    accessControlManager.isAllowedToCall.returns(true);
    await vusdt.setReduceReservesBlockDelta(10000000000);
    await vusdt.harnessSetBalance(user1.address, convertToUnit(200, 18));
    await comptroller.connect(user1).enterMarkets([vusdt.address]);
  });

  it("check wallet usdt balance", async () => {
    expect(await usdt.balanceOf(wallet.address)).to.eq(0);
    expect(await vusdt.balanceOf(user1.address)).to.eq(convertToUnit(200, 18));
  });

  describe("getMintableVAI", async () => {
    it("oracle", async () => {
      expect(await comptroller.oracle()).to.eq(oracle.address);
    });

    it("getAssetsIn", async () => {
      const enteredMarkets = await comptroller.getAssetsIn(user1.address);
      expect(enteredMarkets.length).to.eq(1);
    });

    it("getAccountSnapshot", async () => {
      const res = await vusdt.getAccountSnapshot(user1.address);
      expect(res[0]).to.eq(0);
      expect(res[1]).to.eq(convertToUnit(200, 18));
      expect(res[2]).to.eq(BigNumber.from(0));
      expect(res[3]).to.eq(convertToUnit(1, 18));
    });

    it("getUnderlyingPrice", async () => {
      expect(await oracle.getUnderlyingPrice(vusdt.address)).to.eq(convertToUnit(1, 18));
    });

    it("getComptroller", async () => {
      expect(await vaiController.owner()).to.eq(wallet.address);
      expect(await vaiController.comptroller()).to.eq(comptroller.address);
    });

    it("success", async () => {
      const res = await vaiController.getMintableVAI(user1.address);
      expect(res).to.eq(convertToUnit(100, 18));
    });
  });

  describe("mintVAI", async () => {
    it("should revert when mint action is paused", async () => {
      await comptroller.setActionsPaused([vaiController.address], [0], true);
      await expect(vaiController.connect(user1).mintVAI(convertToUnit(100, 18))).to.be.revertedWithCustomError(
        vaiController,
        "ActionPaused",
      );
    });

    it("reverts if mint VAI amount is zero", async () => {
      const mintTransaction = vaiController.connect(user1).mintVAI(0);
      await expect(mintTransaction).to.be.revertedWithCustomError(vaiController, "ZeroValueNotAllowed");
    });

    it("reverts if mint cap is reached", async () => {
      const mintCap = await vaiController.mintCap();
      const mintTransaction = vaiController.connect(user1).mintVAI(mintCap);
      await expect(mintTransaction).to.be.revertedWithCustomError(vaiController, "MintCapReached");
    });

    it("reverts if mint amount is more than user mintable amount ", async () => {
      const mintableVAI = await vaiController.getMintableVAI(user1.address);
      const mintAmount = mintableVAI.add(BigNumber.from(1000000000));
      const mintTransaction = vaiController.connect(user1).mintVAI(mintAmount);
      await expect(mintTransaction).to.be.revertedWithCustomError(vaiController, "InsufficientMintableVAIBalance");
    });

    it("success", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      expect(await vaiController.mintedVAIs(user1.address)).to.eq(convertToUnit(100, 18));
    });
  });

  describe("repayVAI", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("should revert when repay action is paused", async () => {
      await comptroller.setActionsPaused([vaiController.address], [3], true);
      await expect(vaiController.connect(user1).repayVAI(convertToUnit(100, 18))).to.be.revertedWithCustomError(
        vaiController,
        "ActionPaused",
      );
    });

    it("reverts if mint VAI amount is zero", async () => {
      const mintTransaction = vaiController.connect(user1).repayVAI(0);
      await expect(mintTransaction).to.be.revertedWithCustomError(vaiController, "ZeroValueNotAllowed");
    });

    it("success for zero rate", async () => {
      await vaiController.connect(user1).repayVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(0);
      expect(await vaiController.mintedVAIs(user1.address)).to.eq(0);
    });

    it("success for 0.2 rate repay all", async () => {
      await vai.allocateTo(user1.address, convertToUnit(20, 18));
      await vaiController.setBaseRate(convertToUnit(2, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      await vaiController.connect(user1).repayVAI(convertToUnit(120, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(0);
      expect(await vaiController.mintedVAIs(user1.address)).to.eq(0);
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(convertToUnit(20, 18));
    });

    it("success for 0.2 rate repay half", async () => {
      await vaiController.setBaseRate(convertToUnit(2, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      await vaiController.connect(user1).repayVAI(convertToUnit(60, 18));

      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(40, 18));
      expect(await vaiController.mintedVAIs(user1.address)).to.eq(convertToUnit(50, 18));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(convertToUnit(10, 18));
    });
  });

  describe("getHypotheticalAccountLiquidity", async () => {
    beforeEach("user1 borrow", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      await vai.allocateTo(user2.address, convertToUnit(100, 18));

      expect(await vaiController.mintedVAIs(user1.address)).to.eq(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
    });

    it("success for zero rate 0.9 vusdt collateralFactor", async () => {
      await comptroller.setCollateralFactor(vusdt.address, convertToUnit(9, 17), convertToUnit(9, 17));

      const res = await comptroller.getHypotheticalAccountLiquidity(
        user1.address,
        ethers.constants.AddressZero,
        BigNumber.from(0),
        BigNumber.from(0),
      );
      expect(res[1]).to.eq(convertToUnit(80, 18));
      expect(res[2]).to.eq(convertToUnit(0, 18));
    });

    it("success for 0.2 rate 0.9 vusdt collateralFactor", async () => {
      await vaiController.setBaseRate(convertToUnit(2, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      await comptroller.setCollateralFactor(vusdt.address, convertToUnit(9, 17), convertToUnit(9, 17));
      const res = await comptroller.getHypotheticalAccountLiquidity(
        user1.address,
        ethers.constants.AddressZero,
        BigNumber.from(0),
        BigNumber.from(0),
      );

      expect(res[1]).to.eq(convertToUnit(60, 18));
      expect(res[2]).to.eq(convertToUnit(0, 18));
    });
  });

  describe("liquidateVAI", async () => {
    beforeEach("user1 borrow", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      await vai.allocateTo(user2.address, convertToUnit(100, 18));

      expect(await vaiController.mintedVAIs(user1.address)).to.eq(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      expect(await vai.balanceOf(user2.address)).to.eq(convertToUnit(100, 18));
    });

    it("liquidationIncentiveMantissa", async () => {
      expect(await comptroller.liquidationIncentiveMantissa()).to.eq(convertToUnit(1, 18));
    });

    it("success for zero rate 0.2 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
      await comptroller.setCollateralFactor(vusdt.address, convertToUnit(1, 17), convertToUnit(1, 17));
      await vaiController.connect(user2).liquidateVAI(user1.address, convertToUnit(60, 18), vusdt.address);

      expect(await vai.balanceOf(user2.address)).to.eq(convertToUnit(40, 18));
      expect(await vusdt.balanceOf(user2.address)).to.eq(convertToUnit(57, 18));
    });

    it("success for 0.2 rate 0.3 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);

      const TEMP_BLOCKS_PER_YEAR = 100000000;
      await vaiController.setBlocksPerYear(TEMP_BLOCKS_PER_YEAR);

      await vaiController.setBaseRate(convertToUnit(2, 17));
      await vaiController.harnessSetBlockNumber(BigNumber.from(TEMP_BLOCKS_PER_YEAR));
      await vusdt.harnessSetBlockNumber(BigNumber.from(TEMP_BLOCKS_PER_YEAR));

      await comptroller.setCollateralFactor(vusdt.address, convertToUnit(3, 17), convertToUnit(3, 17));
      await vaiController.connect(user2).liquidateVAI(user1.address, convertToUnit(60, 18), vusdt.address);

      expect(await vai.balanceOf(user2.address)).to.eq(convertToUnit(40, 18));
      expect(await vusdt.balanceOf(user2.address)).to.eq(convertToUnit(47.5, 18));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(convertToUnit(10, 18));
      expect(await vaiController.mintedVAIs(user1.address)).to.eq(convertToUnit(50, 18));
    });
  });

  describe("getVAIRepayRate", async () => {
    it("success for zero baseRate", async () => {
      const res = await vaiController.getVAIRepayRate();
      expect(res).to.eq(0);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      const vaiRepayRate = await vaiController.getVAIRepayRate();
      expect(vaiRepayRate.toString()).to.eq(convertToUnit(1, 17));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));

      expect(await vaiController.getVAIRepayRate()).to.eq(convertToUnit(15, 16));
    });
  });

  describe("getVAIRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(100, 18));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(115, 18));
    });
  });

  describe("getVAICalculateRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(50, 18)))[0]).to.eq(
        convertToUnit(50, 18),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[0]).to.eq(
        convertToUnit(100, 18),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[1]).to.eq(
        convertToUnit(10, 18),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[2]).to.eq(
        convertToUnit(0, 18),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[0]).to.eq(
        convertToUnit(100, 18),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[1]).to.eq(
        convertToUnit(15, 18),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[2]).to.eq(
        convertToUnit(0, 18),
      );
    });
  });

  describe("getMintableVAI", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(50, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(50, 18));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("should revert when VAI price from oracle is zero", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();
      oracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(0);

      await expect(vaiController.getMintableVAI(user1.address)).to.be.revertedWithCustomError(
        vaiController,
        "ZeroValueNotAllowed",
      );
      oracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(convertToUnit(1, 18));
    });

    it("include current interest when calculating mintable VAI", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      const userMintableVaiAmount = BigNumber.from((await vaiController.getMintableVAI(user1.address))._hex).toString();
      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(55, 18));
      expect(userMintableVaiAmount).to.eq(convertToUnit(45, 18));
    });
  });

  describe("accrueVAIInterest", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for called once", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });

    it("success for called twice", async () => {
      await vaiController.setBaseRate(convertToUnit(1, 17));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await vaiController.accrueVAIInterest();
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });
  });

  describe("setBaseRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setBaseRate(uint256)").returns(false);
      await expect(vaiController.setBaseRate(42)).to.be.revertedWithCustomError(vaiController, "Unauthorized");
    });

    it("emits NewVAIBaseRate event", async () => {
      const tx = await vaiController.setBaseRate(42);
      await expect(tx).to.emit(vaiController, "NewVAIBaseRate").withArgs(0, 42);
    });

    it("sets new base rate in storage", async () => {
      await vaiController.setBaseRate(42);
      expect(await vaiController.baseRateMantissa()).to.equal(42);
    });
  });

  describe("setFloatRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setFloatRate(uint256)").returns(false);
      await expect(vaiController.setFloatRate(42)).to.be.revertedWithCustomError(vaiController, "Unauthorized");
    });

    it("emits NewVAIFloatRate event", async () => {
      const tx = await vaiController.setFloatRate(42);
      await expect(tx).to.emit(vaiController, "NewVAIFloatRate").withArgs(0, 42);
    });

    it("sets new float rate in storage", async () => {
      await vaiController.setFloatRate(42);
      expect(await vaiController.floatRateMantissa()).to.equal(42);
    });
  });

  describe("setMintCap", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setMintCap(uint256)").returns(false);
      await expect(vaiController.setMintCap(42)).to.be.revertedWithCustomError(vaiController, "Unauthorized");
    });

    it("emits NewVAIMintCap event", async () => {
      const tx = await vaiController.setMintCap(42);

      await expect(tx).to.emit(vaiController, "NewVAIMintCap").withArgs(10000, 42);
    });

    it("sets new mint cap in storage", async () => {
      await vaiController.setMintCap(42);
      expect(await vaiController.mintCap()).to.be.equal(42);
    });
  });

  describe("setVAIMintRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setVAIMintRate(uint256)").returns(false);
      await expect(vaiController.setVAIMintRate(42)).to.be.revertedWithCustomError(vaiController, "Unauthorized");
    });

    it("emits NewVAIMintRate event", async () => {
      const tx = await vaiController.setVAIMintRate(42);

      await expect(tx).to.emit(vaiController, "NewVAIMintRate").withArgs(10000, 42);
    });

    it("sets new VAI mint rate in storage", async () => {
      await vaiController.setVAIMintRate(42);
      expect(await vaiController.VAIMintRate()).to.be.equal(42);
    });
  });

  describe("setReceiver", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(vaiController.connect(user1).setReceiver(user1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if the receiver is zero address", async () => {
      await expect(vaiController.setReceiver(constants.AddressZero)).to.be.revertedWithCustomError(
        vaiController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewVAIReceiver event", async () => {
      const tx = await vaiController.setReceiver(user1.address);
      await expect(tx).to.emit(vaiController, "NewVAIReceiver").withArgs(treasuryAddress.address, user1.address);
    });

    it("sets VAI receiver address in storage", async () => {
      await vaiController.setReceiver(user1.address);
      expect(await vaiController.receiver()).to.equal(user1.address);
    });
  });

  describe("setAccessControl", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(
        vaiController.connect(user1).setAccessControlManager(accessControlManager.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if ACM is zero address", async () => {
      await expect(vaiController.setAccessControlManager(constants.AddressZero)).to.be.revertedWith(
        "invalid acess control manager address",
      );
    });

    it("emits NewAccessControl event", async () => {
      const newAccessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
      const tx = await vaiController.setAccessControlManager(newAccessControlManager.address);
      await expect(tx)
        .to.emit(vaiController, "NewAccessControlManager")
        .withArgs(accessControlManager.address, newAccessControlManager.address);
    });

    it("sets ACM address in storage", async () => {
      const newAccessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
      await vaiController.setAccessControlManager(newAccessControlManager.address);
      expect(await vaiController.accessControlManager()).to.equal(newAccessControlManager.address);
    });
  });

  describe("setComptroller", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(vaiController.connect(user1).setComptroller(comptroller.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if comptroller is zero address", async () => {
      await expect(vaiController.setComptroller(constants.AddressZero)).to.be.revertedWithCustomError(
        vaiController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewComptroller event", async () => {
      const newComptroller = await smock.fake<IComptroller>("IComptroller");
      const tx = await vaiController.setComptroller(newComptroller.address);
      await expect(tx).to.emit(vaiController, "NewComptroller").withArgs(comptroller.address, newComptroller.address);
    });

    it("sets comptroller address in storage", async () => {
      const newComptroller = await smock.fake<IComptroller>("IComptroller");
      await vaiController.setComptroller(newComptroller.address);
      expect(await vaiController.comptroller()).to.equal(newComptroller.address);
    });
  });

  describe("setPrimeToken", async () => {
    it("reverts if called by non-owner", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");

      await expect(vaiController.connect(user1).setPrimeToken(prime.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if prime token is zero address", async () => {
      await expect(vaiController.setPrimeToken(constants.AddressZero)).to.be.revertedWithCustomError(
        vaiController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewPrime event", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      const tx = await vaiController.setPrimeToken(prime.address);

      await expect(tx).to.emit(vaiController, "NewPrime").withArgs(constants.AddressZero, prime.address);
    });

    it("sets prime token address in storage", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      await vaiController.setPrimeToken(prime.address);
      expect(await vaiController.prime()).to.equal(prime.address);
    });
  });

  describe("setVAIToken", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(vaiController.connect(user1).setVAIToken(vai.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if VAI token is zero address", async () => {
      await expect(vaiController.setVAIToken(constants.AddressZero)).to.be.revertedWithCustomError(
        vaiController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewVAIToken event", async () => {
      const newVAI = await smock.fake<VAIScenario>("VAIScenario");
      const tx = await vaiController.setVAIToken(newVAI.address);

      await expect(tx).to.emit(vaiController, "NewVAIToken").withArgs(vai.address, newVAI.address);
    });

    it("sets VAI token address in storage", async () => {
      const newVAI = await smock.fake<VAIScenario>("VAIScenario");

      await vaiController.setVAIToken(newVAI.address);
      expect(await vaiController.getVAIAddress()).to.equal(newVAI.address);
    });
  });

  describe("setTreasuryData", async () => {
    let newTreasuryAddress: string;
    let newTreauryGuardianAddress: string;
    const newTreasuryPercent: string = convertToUnit(0.5, 18);

    beforeEach(async () => {
      const [, , , newTreauryGuardian, newTreasury] = await ethers.getSigners();
      newTreauryGuardianAddress = newTreauryGuardian.address;
      newTreasuryAddress = newTreasury.address;
    });

    it("reverts if called by non-owner", async () => {
      await expect(
        vaiController.connect(user1).setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent),
      ).to.be.revertedWithCustomError(vaiController, "CallerNotAuthorized");
    });

    it("reverts if new treasury guardian address is zero address", async () => {
      await expect(
        vaiController.setTreasuryData(constants.AddressZero, newTreasuryAddress, newTreasuryPercent),
      ).to.be.revertedWithCustomError(vaiController, "ZeroAddressNotAllowed");
    });

    it("reverts if new treasury address is zero address", async () => {
      await expect(
        vaiController.setTreasuryData(newTreauryGuardianAddress, constants.AddressZero, newTreasuryPercent),
      ).to.be.revertedWithCustomError(vaiController, "ZeroAddressNotAllowed");
    });

    it("reverts if new treasury percent is greater than 1e18", async () => {
      await expect(
        vaiController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(vaiController, "TreasuryPercentOverflow");
    });

    it("emits events on success", async () => {
      const tx = await vaiController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent);

      await expect(tx)
        .to.emit(vaiController, "NewTreasuryGuardian")
        .withArgs(constants.AddressZero, newTreauryGuardianAddress);

      await expect(tx).to.emit(vaiController, "NewTreasuryAddress").withArgs(constants.AddressZero, newTreasuryAddress);

      await expect(tx).to.emit(vaiController, "NewTreasuryPercent").withArgs(0, newTreasuryPercent);
    });

    it("sets values in storage", async () => {
      await vaiController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent);

      expect(await vaiController.treasuryAddress()).to.equal(newTreasuryAddress);
      expect(await vaiController.treasuryGuardian()).to.equal(newTreauryGuardianAddress);
      expect(await vaiController.treasuryPercent()).to.equal(newTreasuryPercent);
    });
  });

  describe("toggleOnlyPrimeHolderMint", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "toggleOnlyPrimeHolderMint()").returns(false);
      await expect(vaiController.toggleOnlyPrimeHolderMint()).to.be.revertedWithCustomError(
        vaiController,
        "Unauthorized",
      );
    });

    it("fails when prime address is not set and mint for prime holders is also disabled", async () => {
      await expect(vaiController.toggleOnlyPrimeHolderMint()).to.be.revertedWithCustomError(
        vaiController,
        "ToggleConditionNotMet",
      );
    });

    it("emits MintOnlyForPrimeHolder on success", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      await vaiController.setPrimeToken(prime.address);

      const tx = await vaiController.toggleOnlyPrimeHolderMint();

      await expect(tx).to.emit(vaiController, "MintOnlyForPrimeHolder").withArgs(false, true);
    });
  });

  describe("prime", async () => {
    it("prime integration", async () => {
      const PrimeScenarioFactory = await smock.mock<PrimeScenario__factory>("PrimeScenario");
      const primeScenario = await PrimeScenarioFactory.deploy(
        wallet.address,
        wallet.address,
        100,
        100,
        100,
        100,
        false,
      );

      expect(await vaiController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");
      await primeScenario.mintForUser(user1.address);

      expect(await vaiController.mintEnabledOnlyForPrimeHolder()).to.be.equal(false);
      expect(await vaiController.prime()).to.be.equal(constants.AddressZero);
      expect(await vaiController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      expect(await primeScenario.isUserPrimeHolder(user1.address)).to.be.equal(true);
      await vaiController.setPrimeToken(primeScenario.address);
      expect(await vaiController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      expect(await vaiController.mintEnabledOnlyForPrimeHolder()).to.be.equal(false);
      await vaiController.toggleOnlyPrimeHolderMint();
      expect(await vaiController.mintEnabledOnlyForPrimeHolder()).to.be.equal(true);
      expect(await vaiController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      await primeScenario.burnForUser(user1.address);
      expect(await vaiController.getMintableVAI(user1.address)).to.be.equal("0");
    });
  });
});

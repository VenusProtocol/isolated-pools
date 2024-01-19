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
  VAIController: VAIControllerHarness;
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
  let VAIController: VAIControllerHarness;
  let usdt: MockContract<MockToken>;
  let vusdt: VTokenHarness;

  before("get signers", async () => {
    [wallet, user1, user2, treasuryAddress] = await (ethers as any).getSigners();
  });

  async function comptrollerFixture(): Promise<ComptrollerFixture> {
    const MockToken = await smock.mock<MockToken__factory>("MockToken");
    usdt = await MockToken.deploy("MakerDAO", "DAI", 18);

    accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
    accessControlManager.isAllowedToCall.returns(true);

    const closeFactor = convertToUnit(0.6, 18);
    const liquidationIncentive = convertToUnit(1, 18);
    const minLiquidatableCollateral = convertToUnit(100, 18);

    const vaiFactory = await ethers.getContractFactory("VAIScenario");
    const vai = (await vaiFactory.deploy(BigNumber.from(97))) as VAIScenario;

    const VAIControllerFactory = await ethers.getContractFactory("VAIControllerHarness");
    const VAIControllerBeacon = await upgrades.deployBeacon(VAIControllerFactory, { constructorArgs: [] });

    const VAIControllerProxy = (await upgrades.deployBeaconProxy(VAIControllerBeacon, VAIControllerFactory, [
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
    await comptrollerProxy.setVAIController(VAIControllerProxy.address);

    await VAIControllerProxy.setComptroller(comptrollerProxy.address);
    await VAIControllerProxy.setAccessControlManager(accessControlManager.address);
    await VAIControllerProxy.setBlocksPerYear(BLOCKS_PER_YEAR);
    await VAIControllerProxy.setVAIAddress(vai.address);
    await VAIControllerProxy.setVAIMintRate(BigNumber.from(10000));
    await VAIControllerProxy.setReceiver(treasuryAddress.address);
    await VAIControllerProxy.setMintCap(BigNumber.from(10000));

    await vai.rely(VAIControllerProxy.address);

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

    fakePriceOracle.getPrice.whenCalledWith(usdt.address).returns(convertToUnit(1, 18));
    fakePriceOracle.getPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));

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
      VAIController: VAIControllerProxy,
      vusdt,
    };
  }

  beforeEach("deploy Comptroller", async () => {
    ({ usdt, accessControlManager, comptroller, oracle, vai, VAIController, vusdt } = await loadFixture(
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
      expect(await VAIController.owner()).to.eq(wallet.address);
      expect(await VAIController.comptroller()).to.eq(comptroller.address);
    });

    it("success", async () => {
      const res = await VAIController.getMintableVAI(user1.address);
      expect(res).to.eq(convertToUnit(100, 18));
    });
  });

  describe("mintVAI", async () => {
    it("should revert when mint action is paused", async () => {
      await comptroller.setActionsPaused([VAIController.address], [0], true);
      await expect(VAIController.connect(user1).mintVAI(convertToUnit(100, 18))).to.be.revertedWithCustomError(
        VAIController,
        "ActionPaused",
      );
    });

    it("reverts if mint VAI amount is zero", async () => {
      const mintTransaction = VAIController.connect(user1).mintVAI(0);
      await expect(mintTransaction).to.be.revertedWithCustomError(VAIController, "ZeroValueNotAllowed");
    });

    it("reverts if mint cap is reached", async () => {
      const mintCap = await VAIController.mintCap();
      const mintTransaction = VAIController.connect(user1).mintVAI(mintCap);
      await expect(mintTransaction).to.be.revertedWithCustomError(VAIController, "MintCapReached");
    });

    it("reverts if mint amount is more than user mintable amount ", async () => {
      const mintableVAI = await VAIController.getMintableVAI(user1.address);
      const mintAmount = mintableVAI.add(BigNumber.from(1000000000));
      const mintTransaction = VAIController.connect(user1).mintVAI(mintAmount);
      await expect(mintTransaction).to.be.revertedWithCustomError(VAIController, "InsufficientMintableVAIBalance");
    });

    it("success", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      expect(await VAIController.mintedVAIs(user1.address)).to.eq(convertToUnit(100, 18));
    });
  });

  describe("repayVAI", async () => {
    beforeEach("mintVAI", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(VAIController.address, ethers.constants.MaxUint256);
    });

    it("should revert when repay action is paused", async () => {
      await comptroller.setActionsPaused([VAIController.address], [3], true);
      await expect(VAIController.connect(user1).repayVAI(convertToUnit(100, 18))).to.be.revertedWithCustomError(
        VAIController,
        "ActionPaused",
      );
    });

    it("reverts if mint VAI amount is zero", async () => {
      const mintTransaction = VAIController.connect(user1).repayVAI(0);
      await expect(mintTransaction).to.be.revertedWithCustomError(VAIController, "ZeroValueNotAllowed");
    });

    it("success for zero rate", async () => {
      await VAIController.connect(user1).repayVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(0);
      expect(await VAIController.mintedVAIs(user1.address)).to.eq(0);
    });

    it("success for 1.2 rate repay all", async () => {
      await vai.allocateTo(user1.address, convertToUnit(20, 18));
      await VAIController.setBaseRate(convertToUnit(2, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);

      await VAIController.connect(user1).repayVAI(convertToUnit(120, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(0);
      expect(await VAIController.mintedVAIs(user1.address)).to.eq(0);
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(convertToUnit(20, 18));
    });

    it("success for 1.2 rate repay half", async () => {
      await VAIController.setBaseRate(convertToUnit(2, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);

      await VAIController.connect(user1).repayVAI(convertToUnit(60, 18));

      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(40, 18));
      expect(await VAIController.mintedVAIs(user1.address)).to.eq(convertToUnit(50, 18));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(convertToUnit(10, 18));
    });
  });

  describe("getHypotheticalAccountLiquidity", async () => {
    beforeEach("user1 borrow", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      await vai.allocateTo(user2.address, convertToUnit(100, 18));
      expect(await VAIController.mintedVAIs(user1.address)).to.eq(convertToUnit(100, 18));
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

    it("success for 1.2 rate 0.9 vusdt collateralFactor", async () => {
      await VAIController.setBaseRate(convertToUnit(2, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

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

  // TODO: Have to write liquidation tests

  describe("getVAIRepayRate", async () => {
    it("success for zero baseRate", async () => {
      const res = await VAIController.getVAIRepayRate();
      expect(res).to.eq(0);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);

      const vaiRepayRate = await VAIController.getVAIRepayRate();
      expect(vaiRepayRate.toString()).to.eq(convertToUnit(1, 17));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));

      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));
      expect(await VAIController.getVAIRepayRate()).to.eq(convertToUnit(15, 16));
    });
  });

  describe("getVAIRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(VAIController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(100, 18));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(115, 18));
    });
  });

  describe("getVAICalculateRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(VAIController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(50, 18)))[0]).to.eq(
        convertToUnit(50, 18),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(1, 18));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[0]).to.eq(
        convertToUnit(100, 18),
      );

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[1]).to.eq(
        convertToUnit(10, 18),
      );

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(110, 18)))[2]).to.eq(
        convertToUnit(0, 18),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPrice 0.5 * 1e18", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.setFloatRate(convertToUnit(1, 17));
      oracle.getUnderlyingPrice.whenCalledWith(vai.address).returns(convertToUnit(5, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[0]).to.eq(
        convertToUnit(100, 18),
      );

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[1]).to.eq(
        convertToUnit(15, 18),
      );

      expect((await VAIController.getVAICalculateRepayAmount(user1.address, convertToUnit(115, 18)))[2]).to.eq(
        convertToUnit(0, 18),
      );
    });
  });

  describe("getMintableVAI", async () => {
    beforeEach("mintVAI", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(50, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(50, 18));
      await vai.connect(user1).approve(VAIController.address, ethers.constants.MaxUint256);
    });

    it("should revert when VAI price from oracle is zero", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();
      oracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(0);

      await expect(VAIController.getMintableVAI(user1.address)).to.be.revertedWithCustomError(
        VAIController,
        "ZeroValueNotAllowed",
      );
      oracle.getUnderlyingPrice.whenCalledWith(vusdt.address).returns(convertToUnit(1, 18));
    });

    it("include current interest when calculating mintable VAI", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      const userMintableVaiAmount = BigNumber.from((await VAIController.getMintableVAI(user1.address))._hex).toString();
      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(55, 18));
      expect(userMintableVaiAmount).to.eq(convertToUnit(45, 18));
    });
  });

  describe("accrueVAIInterest", async () => {
    beforeEach("mintVAI", async () => {
      await VAIController.connect(user1).mintVAI(convertToUnit(100, 18));
      expect(await vai.balanceOf(user1.address)).to.eq(convertToUnit(100, 18));
      await vai.connect(user1).approve(VAIController.address, ethers.constants.MaxUint256);
    });

    it("success for called once", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR);
      await VAIController.accrueVAIInterest();

      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });

    it("success for called twice", async () => {
      await VAIController.setBaseRate(convertToUnit(1, 17));
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await VAIController.accrueVAIInterest();
      await VAIController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await VAIController.accrueVAIInterest();

      expect(await VAIController.getVAIRepayAmount(user1.address)).to.eq(convertToUnit(110, 18));
    });
  });

  describe("setBaseRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setBaseRate(uint256)").returns(false);
      await expect(VAIController.setBaseRate(42)).to.be.revertedWithCustomError(VAIController, "Unauthorized");
    });

    it("emits NewVAIBaseRate event", async () => {
      const tx = await VAIController.setBaseRate(42);
      await expect(tx).to.emit(VAIController, "NewVAIBaseRate").withArgs(0, 42);
    });

    it("sets new base rate in storage", async () => {
      await VAIController.setBaseRate(42);
      expect(await VAIController.baseRateMantissa()).to.equal(42);
    });
  });

  describe("setFloatRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setFloatRate(uint256)").returns(false);
      await expect(VAIController.setFloatRate(42)).to.be.revertedWithCustomError(VAIController, "Unauthorized");
    });

    it("emits NewVAIFloatRate event", async () => {
      const tx = await VAIController.setFloatRate(42);
      await expect(tx).to.emit(VAIController, "NewVAIFloatRate").withArgs(0, 42);
    });

    it("sets new float rate in storage", async () => {
      await VAIController.setFloatRate(42);
      expect(await VAIController.floatRateMantissa()).to.equal(42);
    });
  });

  describe("setMintCap", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setMintCap(uint256)").returns(false);
      await expect(VAIController.setMintCap(42)).to.be.revertedWithCustomError(VAIController, "Unauthorized");
    });

    it("emits NewVAIMintCap event", async () => {
      const tx = await VAIController.setMintCap(42);

      await expect(tx).to.emit(VAIController, "NewVAIMintCap").withArgs(10000, 42);
    });

    it("sets new mint cap in storage", async () => {
      await VAIController.setMintCap(42);
      expect(await VAIController.mintCap()).to.be.equal(42);
    });
  });

  describe("setVAIMintRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "setVAIMintRate(uint256)").returns(false);
      await expect(VAIController.setVAIMintRate(42)).to.be.revertedWithCustomError(VAIController, "Unauthorized");
    });

    it("emits NewVAIMintRate event", async () => {
      const tx = await VAIController.setVAIMintRate(42);

      await expect(tx).to.emit(VAIController, "NewVAIMintRate").withArgs(10000, 42);
    });

    it("sets new VAI mint rate in storage", async () => {
      await VAIController.setVAIMintRate(42);
      expect(await VAIController.VAIMintRate()).to.be.equal(42);
    });
  });

  describe("setReceiver", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(VAIController.connect(user1).setReceiver(user1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if the receiver is zero address", async () => {
      await expect(VAIController.setReceiver(constants.AddressZero)).to.be.revertedWithCustomError(
        VAIController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewVAIReceiver event", async () => {
      const tx = await VAIController.setReceiver(user1.address);
      await expect(tx).to.emit(VAIController, "NewVAIReceiver").withArgs(treasuryAddress.address, user1.address);
    });

    it("sets VAI receiver address in storage", async () => {
      await VAIController.setReceiver(user1.address);
      expect(await VAIController.receiver()).to.equal(user1.address);
    });
  });

  describe("setAccessControl", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(
        VAIController.connect(user1).setAccessControlManager(accessControlManager.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if ACM is zero address", async () => {
      await expect(VAIController.setAccessControlManager(constants.AddressZero)).to.be.revertedWith(
        "invalid acess control manager address",
      );
    });

    it("emits NewAccessControl event", async () => {
      const newAccessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
      const tx = await VAIController.setAccessControlManager(newAccessControlManager.address);
      await expect(tx)
        .to.emit(VAIController, "NewAccessControlManager")
        .withArgs(accessControlManager.address, newAccessControlManager.address);
    });

    it("sets ACM address in storage", async () => {
      const newAccessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
      await VAIController.setAccessControlManager(newAccessControlManager.address);
      expect(await VAIController.accessControlManager()).to.equal(newAccessControlManager.address);
    });
  });

  describe("setComptroller", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(VAIController.connect(user1).setComptroller(comptroller.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if comptroller is zero address", async () => {
      await expect(VAIController.setComptroller(constants.AddressZero)).to.be.revertedWithCustomError(
        VAIController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewComptroller event", async () => {
      const newComptroller = await smock.fake<IComptroller>("IComptroller");
      const tx = await VAIController.setComptroller(newComptroller.address);
      await expect(tx).to.emit(VAIController, "NewComptroller").withArgs(comptroller.address, newComptroller.address);
    });

    it("sets comptroller address in storage", async () => {
      const newComptroller = await smock.fake<IComptroller>("IComptroller");
      await VAIController.setComptroller(newComptroller.address);
      expect(await VAIController.comptroller()).to.equal(newComptroller.address);
    });
  });

  describe("setPrimeToken", async () => {
    it("reverts if called by non-owner", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");

      await expect(VAIController.connect(user1).setPrimeToken(prime.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if prime token is zero address", async () => {
      await expect(VAIController.setPrimeToken(constants.AddressZero)).to.be.revertedWithCustomError(
        VAIController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewPrime event", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      const tx = await VAIController.setPrimeToken(prime.address);

      await expect(tx).to.emit(VAIController, "NewPrime").withArgs(constants.AddressZero, prime.address);
    });

    it("sets prime token address in storage", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      await VAIController.setPrimeToken(prime.address);
      expect(await VAIController.prime()).to.equal(prime.address);
    });
  });

  describe("setVAIToken", async () => {
    it("reverts if called by non-owner", async () => {
      await expect(VAIController.connect(user1).setVAIToken(vai.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts if VAI token is zero address", async () => {
      await expect(VAIController.setVAIToken(constants.AddressZero)).to.be.revertedWithCustomError(
        VAIController,
        "ZeroAddressNotAllowed",
      );
    });

    it("emits NewVAIToken event", async () => {
      const newVAI = await smock.fake<VAIScenario>("VAIScenario");
      const tx = await VAIController.setVAIToken(newVAI.address);

      await expect(tx).to.emit(VAIController, "NewVAIToken").withArgs(vai.address, newVAI.address);
    });

    it("sets VAI token address in storage", async () => {
      const newVAI = await smock.fake<VAIScenario>("VAIScenario");

      await VAIController.setVAIToken(newVAI.address);
      expect(await VAIController.getVAIAddress()).to.equal(newVAI.address);
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
        VAIController.connect(user1).setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent),
      ).to.be.revertedWithCustomError(VAIController, "CallerNotAuthorized");
    });

    it("reverts if new treasury guardian address is zero address", async () => {
      await expect(
        VAIController.setTreasuryData(constants.AddressZero, newTreasuryAddress, newTreasuryPercent),
      ).to.be.revertedWithCustomError(VAIController, "ZeroAddressNotAllowed");
    });

    it("reverts if new treasury address is zero address", async () => {
      await expect(
        VAIController.setTreasuryData(newTreauryGuardianAddress, constants.AddressZero, newTreasuryPercent),
      ).to.be.revertedWithCustomError(VAIController, "ZeroAddressNotAllowed");
    });

    it("reverts if new treasury percent is greater than 1e18", async () => {
      await expect(
        VAIController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(VAIController, "TreasuryPercentOverflow");
    });

    it("emits events on success", async () => {
      const tx = await VAIController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent);

      await expect(tx)
        .to.emit(VAIController, "NewTreasuryGuardian")
        .withArgs(constants.AddressZero, newTreauryGuardianAddress);

      await expect(tx).to.emit(VAIController, "NewTreasuryAddress").withArgs(constants.AddressZero, newTreasuryAddress);

      await expect(tx).to.emit(VAIController, "NewTreasuryPercent").withArgs(0, newTreasuryPercent);
    });

    it("sets values in storage", async () => {
      await VAIController.setTreasuryData(newTreauryGuardianAddress, newTreasuryAddress, newTreasuryPercent);

      expect(await VAIController.treasuryAddress()).to.equal(newTreasuryAddress);
      expect(await VAIController.treasuryGuardian()).to.equal(newTreauryGuardianAddress);
      expect(await VAIController.treasuryPercent()).to.equal(newTreasuryPercent);
    });
  });

  describe("toggleOnlyPrimeHolderMint", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControlManager.isAllowedToCall.whenCalledWith(wallet.address, "toggleOnlyPrimeHolderMint()").returns(false);
      await expect(VAIController.toggleOnlyPrimeHolderMint()).to.be.revertedWithCustomError(
        VAIController,
        "Unauthorized",
      );
    });

    it("fails when prime address is not set and mint for prime holders is also disabled", async () => {
      await expect(VAIController.toggleOnlyPrimeHolderMint()).to.be.revertedWithCustomError(
        VAIController,
        "ToggleConditionNotMet",
      );
    });

    it("emits MintOnlyForPrimeHolder on success", async () => {
      const prime = await smock.fake<PrimeScenario>("PrimeScenario");
      await VAIController.setPrimeToken(prime.address);

      const tx = await VAIController.toggleOnlyPrimeHolderMint();

      await expect(tx).to.emit(VAIController, "MintOnlyForPrimeHolder").withArgs(false, true);
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

      expect(await VAIController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");
      await primeScenario.mintForUser(user1.address);

      expect(await VAIController.mintEnabledOnlyForPrimeHolder()).to.be.equal(false);
      expect(await VAIController.prime()).to.be.equal(constants.AddressZero);
      expect(await VAIController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      expect(await primeScenario.isUserPrimeHolder(user1.address)).to.be.equal(true);
      await VAIController.setPrimeToken(primeScenario.address);
      expect(await VAIController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      expect(await VAIController.mintEnabledOnlyForPrimeHolder()).to.be.equal(false);
      await VAIController.toggleOnlyPrimeHolderMint();
      expect(await VAIController.mintEnabledOnlyForPrimeHolder()).to.be.equal(true);
      expect(await VAIController.getMintableVAI(user1.address)).to.be.equal("100000000000000000000");

      await primeScenario.burnForUser(user1.address);
      expect(await VAIController.getMintableVAI(user1.address)).to.be.equal("0");
    });
  });
});

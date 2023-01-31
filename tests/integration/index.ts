import { smock } from "@defi-wonderland/smock";
import BigNumber from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";
import { deployments } from "hardhat";

import { convertToUnit, scaleDownBy } from "../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  MockToken,
  PoolRegistry,
  PriceOracle,
  RiskFund,
  VToken,
} from "../../typechain";
import { Error } from "../hardhat/util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

const toggleMining = async status => {
  if (!status) {
    await ethers.provider.send("evm_setAutomine", [false]);
  } else {
    await ethers.provider.send("evm_setAutomine", [true]);
  }
};

const mineBlock = async () => {
  await ethers.provider.send("hardhat_mine");
};

const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }: any) => {
  await deployments.fixture([
    "MockTokens",
    "OracleDeploy",
    "Oracle",
    "SwapRouter",
    "AccessControl",
    "RiskFund",
    "Factories",
    "AccessControlConfig",
    "Pools",
  ]);
  const EXPONENT_SCALE = 10e18;
  const { deployer, acc1, acc2, acc3 } = await getNamedAccounts();
  const PoolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry");
  const AccessControlManager = await ethers.getContract("AccessControlManager");
  const RiskFund = await ethers.getContract("RiskFund");
  const VTokenFactory = await ethers.getContract("VTokenProxyFactory");
  const JumpRateModelFactory = await ethers.getContract("JumpRateModelFactory");
  const WhitePaperRateFactory = await ethers.getContract("WhitePaperInterestRateModelFactory");
  const ProtocolShareReserve = await ethers.getContract("ProtocolShareReserve");
  const shortfall = await ethers.getContract("Shortfall");

  const PriceOracle = await ethers.getContract("ResilientOracle");

  const pools = await PoolRegistry.callStatic.getAllPools();
  const Comptroller = await ethers.getContractAt("Comptroller", pools[0].comptroller);

  const BNX = await ethers.getContract("MockBNX");
  const BSW = await ethers.getContract("MockBSW");
  const BUSD = await ethers.getContract("MockBUSD");

  // Set Oracle
  await Comptroller.setPriceOracle(PriceOracle.address);

  const vBNXAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, BNX.address);
  const vBSWAddress = await PoolRegistry.getVTokenForAsset(Comptroller.address, BSW.address);

  const vBNX = await ethers.getContractAt("VToken", vBNXAddress);
  const vBSW = await ethers.getContractAt("VToken", vBSWAddress);

  // Enter Markets
  await Comptroller.connect(await ethers.getSigner(acc1)).enterMarkets([vBNX.address, vBSW.address]);
  await Comptroller.connect(await ethers.getSigner(acc2)).enterMarkets([vBNX.address, vBSW.address]);
  await Comptroller.connect(await ethers.getSigner(acc3)).enterMarkets([vBNX.address, vBSW.address]);

  // Enable access to setting supply and borrow caps
  await AccessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketSupplyCaps(address[],uint256[])",
    deployer,
  );
  await AccessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "setMarketBorrowCaps(address[],uint256[])",
    deployer,
  );

  // Set supply caps
  const supply = convertToUnit(10, 36);
  await Comptroller.setMarketSupplyCaps([vBNX.address, vBSW.address], [supply, supply]);

  // Set borrow caps
  const borrowCap = convertToUnit(10, 36);
  await Comptroller.setMarketBorrowCaps([vBNX.address, vBSW.address], [borrowCap, borrowCap]);

  const vBNXPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vBNX.address)).toString(), 18),
  );
  const vBSWPrice: BigNumber = new BigNumber(
    scaleDownBy((await PriceOracle.getUnderlyingPrice(vBSW.address)).toString(), 18),
  );

  return {
    fixture: {
      PoolRegistry,
      AccessControlManager,
      RiskFund,
      VTokenFactory,
      JumpRateModelFactory,
      WhitePaperRateFactory,
      ProtocolShareReserve,
      PriceOracle,
      Comptroller,
      vBNX,
      vBSW,
      BNX,
      BSW,
      deployer,
      acc1,
      acc2,
      vBNXPrice,
      vBSWPrice,
      acc3,
      BUSD,
      shortfall,
    },
  };
});

describe("Positive Cases", () => {
  let fixture;
  let PoolRegistry: PoolRegistry;
  let AccessControlManager: AccessControlManager;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vBSW: VToken;
  let BNX: MockToken;
  let BSW: MockToken;
  let acc1: string;
  let acc2: string;
  let vBNXPrice: BigNumber;
  let vBSWPrice: BigNumber;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ PoolRegistry, AccessControlManager, Comptroller, vBNX, vBSW, BNX, BSW, acc1, acc2, vBNXPrice, vBSWPrice } =
      fixture);
  });
  describe("Setup", () => {
    it("PoolRegistry should be initialized properly", async function () {
      await expect(
        PoolRegistry.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("PoolRegistry has the required permissions ", async function () {
      let canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "setCollateralFactor(address,uint256,uint256)",
      );
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "supportMarket(address)",
      );
      expect(canCall).to.be.true;

      canCall = await AccessControlManager.connect(Comptroller.address).isAllowedToCall(
        PoolRegistry.address,
        "setLiquidationIncentive(uint256)",
      );
      expect(canCall).to.be.true;
    });
  });

  describe("Main Operations", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 18);
    const vTokenMintAmount: BigNumberish = convertToUnit(1, 8);
    const collateralFactor: number = 0.7;
    let acc1Signer: Signer;
    let acc2Signer: Signer;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BSW.connect(acc1Signer).faucet(mintAmount);
      await BSW.connect(acc1Signer).approve(vBSW.address, mintAmount);
    });

    it("Mint, Redeem, Borrow, Repay", async function () {
      let error: BigNumber;
      let liquidity: BigNumber;
      let shortfall: BigNumber;
      let balance: BigNumber;
      let borrowBalance: BigNumber;
      // //////////
      // // MINT //
      // //////////
      const tx = await vBNX.connect(acc2Signer).mint(mintAmount);
      await expect(tx).to.emit(vBNX, "Mint").withArgs(acc2, mintAmount, vTokenMintAmount, vTokenMintAmount);
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(vTokenMintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(collateralFactor).multipliedBy(vBNXPrice));
      expect(shortfall).to.equal(0);
      // ////////////
      // // Borrow //
      // ////////////
      // Supply WBTC to market from 2nd account
      await expect(vBSW.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBSW, "Mint")
        .withArgs(await acc1Signer.getAddress(), mintAmount, vTokenMintAmount, vTokenMintAmount);
      [error, balance, borrowBalance] = await vBSW
        .connect(acc2Signer)
        .getAccountSnapshot(await acc1Signer.getAddress());
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(vTokenMintAmount);
      expect(borrowBalance).to.equal(0);
      [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
      expect(error).to.equal(Error.NO_ERROR);
      expect(liquidity).to.equal(new BigNumber(mintAmount).multipliedBy(collateralFactor).multipliedBy(vBSWPrice));
      expect(shortfall).to.equal(0);
      const bswBorrowAmount = convertToUnit(1, 18);
      const vBSWBorrowAmount = convertToUnit(1, 18);

      await expect(vBSW.connect(acc2Signer).borrow(bswBorrowAmount))
        .to.emit(vBSW, "Borrow")
        .withArgs(acc2, bswBorrowAmount, vBSWBorrowAmount, vBSWBorrowAmount);
      [error, balance, borrowBalance] = await vBSW.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(0);
      expect(borrowBalance).to.equal(vBSWBorrowAmount);
      // ////////////
      // // REDEEM //
      // ////////////
      const vTokenRedeemAmount = convertToUnit(5, 7);
      const tokenRedeemAmount = convertToUnit(5, 17);
      const balanceAfterVToken = new BigNumber(vTokenMintAmount).minus(vTokenRedeemAmount);
      const balanceAfter = new BigNumber(mintAmount).minus(tokenRedeemAmount);
      await expect(vBNX.connect(acc2Signer).redeem(vTokenRedeemAmount))
        .to.emit(vBNX, "Redeem")
        .withArgs(acc2, tokenRedeemAmount, vTokenRedeemAmount, balanceAfterVToken);
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(balanceAfterVToken);
      expect(borrowBalance).to.equal(0);
      [error, balance, borrowBalance] = await vBSW.connect(acc2Signer).getAccountSnapshot(acc2);
      const bnxLiquidity = new BigNumber(mintAmount).minus(new BigNumber(tokenRedeemAmount)).multipliedBy(vBNXPrice);
      const bswBorrow = new BigNumber(borrowBalance.toString()).multipliedBy(vBSWPrice);
      let preComputeLiquidity = bnxLiquidity.minus(bswBorrow).multipliedBy(collateralFactor);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(Number(liquidity)).to.be.closeTo(preComputeLiquidity.toNumber(), Number(convertToUnit(1, 18)));
      expect(shortfall).to.equal(0);
      // ////////////
      // // REPAY //
      // //////////
      await BSW.connect(acc2Signer).faucet(bswBorrowAmount);
      await BSW.connect(acc2Signer).approve(vBSW.address, bswBorrowAmount);
      await expect(vBSW.connect(acc2Signer).repayBorrow(bswBorrowAmount)).to.emit(vBSW, "RepayBorrow");
      [error, balance, borrowBalance] = await vBNX.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(balance).to.equal(balanceAfterVToken);
      expect(borrowBalance).to.equal(0);
      preComputeLiquidity = balanceAfter.multipliedBy(collateralFactor).multipliedBy(vBNXPrice);
      [error, liquidity, shortfall] = await Comptroller.connect(acc2Signer).getAccountLiquidity(acc2);
      expect(error).to.equal(Error.NO_ERROR);
      expect(Number(liquidity)).to.be.closeTo(preComputeLiquidity.toNumber(), Number(convertToUnit(1, 14)));
      expect(shortfall).to.equal(0);
    });
  });
});

describe("Straight Cases For Single User Liquidation and healing", () => {
  let fixture;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vBSW: VToken;
  let BNX: MockToken;
  let BSW: MockToken;
  let acc1: string;
  let acc2: string;
  let vBSWPrice: BigNumber;
  let vBNXPrice: BigNumber;
  const EXPONENT_SCALE = 1e18;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vBSW, BNX, BSW, acc1, acc2, vBNXPrice, vBSWPrice } = fixture);
  });

  describe("Force Liquidation of user via Comptroller", () => {
    const mintAmount: BigNumberish = convertToUnit(1, 15);
    const bswBorrowAmount: BigNumberish = convertToUnit(1, 15);
    const vTokenMintedAmount: BigNumberish = convertToUnit(1, 5);
    const insufficientLiquidityBorrow: BigNumberish = convertToUnit(3, 18);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let result;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BSW.connect(acc1Signer).faucet(mintAmount);
      await BSW.connect(acc1Signer).approve(vBSW.address, mintAmount);
      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply WBTC to market from 2nd account
      await expect(vBSW.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBSW, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vBSW.connect(acc2Signer).borrow(insufficientLiquidityBorrow)).to.be.revertedWithCustomError(
        Comptroller,
        "InsufficientLiquidity",
      );
      // Approve more assets for liquidation
      await BSW.connect(acc1Signer).faucet(insufficientLiquidityBorrow);
      await BSW.connect(acc1Signer).approve(vBSW.address, insufficientLiquidityBorrow);
      await expect(vBSW.connect(acc2Signer).borrow(bswBorrowAmount))
        .to.emit(vBSW, "Borrow")
        .withArgs(acc2, bswBorrowAmount, bswBorrowAmount, bswBorrowAmount);
    });

    it("Should revert when repay amount on liquidation is not equal to borrow amount", async function () {
      // Repay amount does not make borrower principal to zero
      const repayAmount = Number(bswBorrowAmount) / 2;
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vBSW.address,
        repayAmount: repayAmount,
      };
      await expect(Comptroller.connect(acc1Signer).liquidateAccount(acc2, [param])).to.be.revertedWith(
        "Nonzero borrow balance after liquidation",
      );
    });

    it("Should success on liquidation when repayamount is equal to borrowing", async function () {
      const repayAmount = "1000000000019006";
      const param = {
        vTokenCollateral: vBNX.address,
        vTokenBorrowed: vBSW.address,
        repayAmount: repayAmount,
      };
      result = await Comptroller.connect(acc1Signer).liquidateAccount(acc2, [param]);
      const seizeAmount = EXPONENT_SCALE * repayAmount * (vBSWPrice / vBNXPrice);
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vBSW.protocolSeizeShareMantissa();
      const seizeTokens = seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE;
      await expect(result)
        .to.emit(vBSW, "LiquidateBorrow")
        .withArgs(acc1, acc2, repayAmount, vBNX.address, seizeTokensOverall.toFixed(0));
      const liquidatorBalance = await vBNX.connect(acc1Signer).balanceOf(acc1);
      expect(liquidatorBalance).to.equal(seizeTokens.toFixed(0));
    });
  });

  describe("Liquidation of user via Vtoken", () => {
    let mintAmount = convertToUnit("1", 17);
    let vTokenMintAmount = convertToUnit("1", 7);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let bswBorrowAmount = convertToUnit("1", 4);
    let udnerlyingMintAmount;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BSW.connect(acc1Signer).faucet(mintAmount);
      await BSW.connect(acc1Signer).approve(vBSW.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintAmount, vTokenMintAmount);
      // borrow
      // Supply WBTC to market from 2nd account
      await expect(vBSW.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBSW, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintAmount, vTokenMintAmount);
      await expect(vBSW.connect(acc2Signer).borrow(bswBorrowAmount))
        .to.emit(vBSW, "Borrow")
        .withArgs(acc2, bswBorrowAmount, bswBorrowAmount, bswBorrowAmount);

      // Approve more assets for liquidation
      await BSW.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BSW.connect(acc1Signer).approve(vBSW.address, convertToUnit("1", 18));
    });

    it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
      const collateral: BigNumberish = vBNXPrice * mintAmount;
      await expect(vBSW.connect(acc1Signer).liquidateBorrow(acc2, bswBorrowAmount, vBSW.address))
        .to.be.revertedWithCustomError(Comptroller, "MinimalCollateralViolated")
        .withArgs("100000000000000000000", collateral.toString());
    });

    it("Should revert when try to drain market", async function () {
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await vBSW.connect(acc2Signer).borrow(convertToUnit("1", 18));
      await expect(vBSW.connect(acc2Signer).borrow(convertToUnit("1", 18))).to.be.revertedWithCustomError(
        vBSW,
        "BorrowCashNotAvailable",
      );
    });

    it("Should revert when liquidation is called through vToken and no shortfall", async function () {
      // Mint and Increase collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);

      await vBNX.connect(acc2Signer).mint(udnerlyingMintAmount);
      // Liquidation
      await expect(
        vBSW.connect(acc1Signer).liquidateBorrow(acc2, bswBorrowAmount, vBSW.address),
      ).to.be.revertedWithCustomError(Comptroller, "InsufficientShortfall");
    });

    it("Should revert when liquidation is called through vToken and trying to seize more tokens", async function () {
      // Mint and Incrrease collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      const VTokenMintAmount = convertToUnit(1, 8);
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await expect(vBNX.connect(acc2Signer).mint(udnerlyingMintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, udnerlyingMintAmount, VTokenMintAmount, expectedTotalBalance);
      // price manipulation and borrow to overcome insufficient shortfall
      bswBorrowAmount = convertToUnit("1", 18);
      await vBSW.connect(acc2Signer).borrow(bswBorrowAmount);
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("100", 40));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(vBSW.connect(acc1Signer).liquidateBorrow(acc2, 201, vBNX.address)).to.be.revertedWith(
        "LIQUIDATE_SEIZE_TOO_MUCH",
      );
    });

    it("Should revert when liquidation is called through vToken and trying to pay too much", async function () {
      // Mint and Incrrease collateral of the user
      udnerlyingMintAmount = convertToUnit("1", 18);
      const VTokenMintAmount = convertToUnit("1", 8);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await BNX.connect(acc2Signer).faucet(udnerlyingMintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, udnerlyingMintAmount);

      await expect(vBNX.connect(acc2Signer).mint(udnerlyingMintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, udnerlyingMintAmount, VTokenMintAmount, expectedTotalBalance);
      // price manipulation and borrow to overcome insufficient shortfall
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("1", 20));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      // Liquidation
      await expect(
        vBSW.connect(acc1Signer).liquidateBorrow(acc2, convertToUnit("1", 18), vBNX.address),
      ).to.be.revertedWithCustomError(Comptroller, "TooMuchRepay");
    });

    it("Should success when liquidation is called through vToken", async function () {
      // Mint and Incrrease collateral of the user
      mintAmount = convertToUnit("1", 18);
      vTokenMintAmount = convertToUnit("1", 8);
      const expectedTotalBalance = Number(convertToUnit(1, 7)) + Number(convertToUnit(1, 8));
      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintAmount, expectedTotalBalance);

      // price manipulation and borrow to overcome insufficient shortfall
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("100", 18));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("100", 18));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      const borrowBalance = await vBSW.borrowBalanceStored(acc2);
      const closeFactor = await Comptroller.closeFactorMantissa();
      const maxClose = (borrowBalance * closeFactor) / 1e18;
      const seizeAmount = EXPONENT_SCALE * maxClose * (convertToUnit("100", 18) / convertToUnit("100", 18));
      const exchangeRateStored = await vBNX.exchangeRateStored();
      const seizeTokensOverall = seizeAmount / exchangeRateStored;
      const reserveMantissa = await vBSW.protocolSeizeShareMantissa();
      const seizeTokens = (seizeTokensOverall - (seizeTokensOverall * reserveMantissa) / EXPONENT_SCALE).toFixed(0);
      await expect(vBSW.connect(acc1Signer).liquidateBorrow(acc2, maxClose.toString(), vBNX.address))
        .to.emit(vBSW, "LiquidateBorrow")
        .withArgs(acc1, acc2, maxClose.toString(), vBNX.address, seizeTokensOverall.toFixed(0));
      const liquidatorBalance = await vBNX.connect(acc1Signer).balanceOf(acc1);
      expect(liquidatorBalance).to.equal(seizeTokens);
    });
  });

  describe("Heal Borrow and Forgive account", () => {
    const mintAmount = convertToUnit("1", 12);
    const vTokenMintedAmount = convertToUnit("1", 2);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    const bswBorrowAmount = 1e4;
    let result;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);

      // Fund 2nd account
      await BSW.connect(acc1Signer).faucet(mintAmount);
      await BSW.connect(acc1Signer).approve(vBSW.address, mintAmount);

      await expect(vBNX.connect(acc2Signer).mint(mintAmount))
        .to.emit(vBNX, "Mint")
        .withArgs(acc2, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // borrow
      // Supply WBTC to market from 2nd account
      await expect(vBSW.connect(acc1Signer).mint(mintAmount))
        .to.emit(vBSW, "Mint")
        .withArgs(acc1, mintAmount, vTokenMintedAmount, vTokenMintedAmount);
      // It should revert when try to borrow more than liquidity
      await expect(vBSW.connect(acc2Signer).borrow(bswBorrowAmount))
        .to.emit(vBSW, "Borrow")
        .withArgs(acc2, bswBorrowAmount, bswBorrowAmount, bswBorrowAmount);

      // Approve more assets for liquidation
      await BSW.connect(acc1Signer).faucet(bswBorrowAmount);
      await BSW.connect(acc1Signer).approve(vBSW.address, bswBorrowAmount);
    });

    it("Should revert when total collateral is greater then minLiquidation threshold", async function () {
      // Increase mint to make collateral large then min threshold liquidation
      const mintAmount = convertToUnit("1", 18);
      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);
      await vBNX.connect(acc2Signer).mint(mintAmount);
      // heal
      await expect(Comptroller.connect(acc1Signer).healAccount(acc2))
        .to.be.revertedWithCustomError(Comptroller, "CollateralExceedsThreshold")
        .withArgs("100000000000000000000", "159990159990000000000");
    });

    it("Should revert on healing if borrow is less then collateral amount", async function () {
      await expect(Comptroller.connect(acc1Signer).healAccount(acc2))
        .to.be.revertedWithCustomError(Comptroller, "CollateralExceedsThreshold")
        .withArgs(bswBorrowAmount * vBSWPrice, (vBNXPrice * mintAmount).toString());
    });

    it("Should success on healing and forgive borrow account", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("1", 25));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1", 15));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      /*
      Calculations
      snapshot.totalCollateral 1e9  // (bnxPrice * mint amount) / mantissa
      snapshot.borrows 1e11    //  (bswPrice * bswBorrowAmount) / mantissa
      percantage 0.1   (collateral/borrow) * mantissa
      repaymentAmount 1000       percentage*borrowBalance 
      borrowBalance 10000
      */
      const collateralAmount = 1e9;
      const borrowAmount = 1e11;
      const percantageOfRepay = (collateralAmount / borrowAmount) * 1e18;
      const repayAmount = bswBorrowAmount * (percantageOfRepay / 1e18);
      const badDebt = bswBorrowAmount - repayAmount;
      result = await Comptroller.connect(acc1Signer).healAccount(acc2);
      await expect(result)
        .to.emit(vBSW, "RepayBorrow")
        .withArgs(vBSW.address, acc2, bswBorrowAmount - repayAmount, repayAmount, 0)
        .to.emit(vBSW, "BadDebtIncreased")
        .withArgs(acc2, bswBorrowAmount - repayAmount, 0, badDebt);

      // Forgive Account
      result = await vBSW.connect(acc2Signer).getAccountSnapshot(acc2);
      expect(result.error).to.equal(Error.NO_ERROR);
      expect(result.vTokenBalance).to.equal(0);
      expect(result.borrowBalance).to.equal(0);
      expect((await vBSW.badDebt()).toString()).to.equal(badDebt.toString());
    });
  });
});

describe("Risk Fund and Auction related scenarios", () => {
  let fixture;
  let Comptroller: Comptroller;
  let vBNX: VToken;
  let vBSW: VToken;
  let BNX: MockToken;
  let BSW: MockToken;
  let acc1: string;
  let acc2: string;
  let deployer: string;
  let ProtocolShareReserve: ProtocolShareReserve;
  let RiskFund: RiskFund;
  let PoolRegistry: PoolRegistry;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ Comptroller, vBNX, vBSW, BNX, BSW, acc1, acc2, deployer, ProtocolShareReserve, RiskFund, PoolRegistry } =
      fixture);
  });

  describe("Generate risk fund swap it to base asset", () => {
    const mintAmount = convertToUnit("1", 12);
    let acc1Signer: Signer;
    let acc2Signer: Signer;
    let deployerSigner: Signer;
    const bswBorrowAmount = 1e4;

    beforeEach(async () => {
      acc1Signer = await ethers.getSigner(acc1);
      acc2Signer = await ethers.getSigner(acc2);
      deployerSigner = await ethers.getSigner(deployer);

      await BNX.connect(acc2Signer).faucet(mintAmount);
      await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount);
      // Fund 2nd account
      await BSW.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BSW.connect(acc1Signer).approve(vBSW.address, convertToUnit("1", 18));
      await vBNX.connect(acc2Signer).mint(mintAmount);
      // borrow
      await vBSW.connect(acc1Signer).mint(convertToUnit("1", 18));
      await vBSW.connect(acc2Signer).borrow(bswBorrowAmount);
      // Approve more assets for liquidation
      await BSW.connect(acc1Signer).faucet(convertToUnit("1", 18));
      await BSW.connect(acc1Signer).approve(vBSW.address, convertToUnit("1", 18));
      await RiskFund.setPoolRegistry(PoolRegistry.address);
    });

    it("generate bad Debt, reserves transfer to protocol share reserves, start auction", async function () {
      // Increase price of borrowed underlying tokens to surpass available collateral
      const dummyPriceOracle = await smock.fake<PriceOracle>("PriceOracle");
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBSW.address).returns(convertToUnit("1", 25));
      dummyPriceOracle.getUnderlyingPrice.whenCalledWith(vBNX.address).returns(convertToUnit("1", 15));
      await Comptroller.setPriceOracle(dummyPriceOracle.address);
      await Comptroller.connect(acc1Signer).healAccount(acc2);
      // At this point market contain bad debt
      const totalReserves = await vBNX.totalReserves();
      // Reserves of the market are being transferred to protocol share reserves
      await vBNX.reduceReserves(totalReserves);
      // Check the balance of protocol share reserve
      expect(await BNX.balanceOf(ProtocolShareReserve.address)).to.be.equal(totalReserves);
      expect(await BNX.balanceOf(deployer)).to.be.equal(0);
      // Reduce reserves, transfer 70% to protocol income and rest 30% to riskFund
      await ProtocolShareReserve.connect(deployerSigner).releaseFunds(Comptroller.address, BNX.address, totalReserves);
      expect(await BNX.balanceOf(deployer)).to.be.equal(totalReserves * 0.7);
      expect(await BNX.balanceOf(RiskFund.address)).to.be.equal(totalReserves * 0.3);
    });
  });
});

describe("Multiple Users Engagement in a Block", () => {
  let fixture;
  let vBNX: VToken;
  let vBSW: VToken;
  let BNX: MockToken;
  let BSW: MockToken;
  let acc1: string;
  let acc2: string;
  let acc3: string;
  let Comptroller: Comptroller;
  let vBNXPrice;
  let vBSWPrice;
  let acc1Signer: Signer;
  let acc2Signer: Signer;
  let acc3Signer: Signer;
  let error;
  let liquidity;
  let shortfall;
  let balance;
  let borrowBalance;
  const mintAmount1 = convertToUnit("1", 18);
  const mintAmount2 = convertToUnit("1", 16);
  const mintAmount3 = convertToUnit("1", 14);
  const vTokenMintedAmount1 = convertToUnit("1", 8);
  const vTokenMintedAmount2 = convertToUnit("1", 6);
  const vTokenMintedAmount3 = convertToUnit("1", 4);
  const bswBorrowAmount = 1e4;
  const collateralFactor = 0.7;

  beforeEach(async () => {
    ({ fixture } = await setupTest());
    ({ vBNX, vBSW, BNX, BSW, acc1, acc2, acc3, Comptroller, vBNXPrice, vBSWPrice } = fixture);
    acc1Signer = await ethers.getSigner(acc1);
    acc2Signer = await ethers.getSigner(acc2);
    acc3Signer = await ethers.getSigner(acc3);
  });

  it("Mint Redeem Borrow Repay", async function () {
    await BSW.connect(acc1Signer).faucet(mintAmount1);
    await BSW.connect(acc1Signer).approve(vBSW.address, mintAmount1);

    await BNX.connect(acc2Signer).faucet(mintAmount2);
    await BNX.connect(acc2Signer).approve(vBNX.address, mintAmount2);

    await BNX.connect(acc3Signer).faucet(mintAmount3);
    await BNX.connect(acc3Signer).approve(vBNX.address, mintAmount3);

    // MINT //
    // Minting in same block should not affect each other balance
    await toggleMining(false);
    await vBSW.connect(acc1Signer).mint(mintAmount1);
    await vBNX.connect(acc2Signer).mint(mintAmount2);
    await vBNX.connect(acc3Signer).mint(mintAmount3);
    await mineBlock();
    await toggleMining(true);
    // Verify Balances of each account
    expect(await vBSW.balanceOf(acc1)).to.equal(vTokenMintedAmount1);
    expect(await vBNX.balanceOf(acc2)).to.equal(vTokenMintedAmount2);
    expect(await vBNX.balanceOf(acc3)).to.equal(vTokenMintedAmount3);

    // BORROW //
    await toggleMining(false);
    await vBSW.connect(acc2Signer).borrow(bswBorrowAmount);
    await vBSW.connect(acc3Signer).borrow(bswBorrowAmount);
    await vBNX.connect(acc1Signer).borrow(bswBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    // Verify Balance of accounts
    expect(await BNX.balanceOf(acc1)).to.equal(bswBorrowAmount);
    expect(await BSW.balanceOf(acc2)).to.equal(bswBorrowAmount);
    expect(await BSW.balanceOf(acc3)).to.equal(bswBorrowAmount);

    // REPAY //
    await BNX.connect(acc1Signer).approve(vBNX.address, bswBorrowAmount);
    await BSW.connect(acc2Signer).approve(vBSW.address, bswBorrowAmount);
    await BSW.connect(acc3Signer).approve(vBSW.address, bswBorrowAmount);

    await toggleMining(false);
    await vBNX.connect(acc1Signer).repayBorrow(bswBorrowAmount);
    await vBSW.connect(acc2Signer).repayBorrow(bswBorrowAmount);
    await vBSW.connect(acc3Signer).repayBorrow(bswBorrowAmount);
    await mineBlock();
    await toggleMining(true);

    [error, balance, borrowBalance] = await vBNX.connect(acc1Signer).getAccountSnapshot(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vBSW.connect(acc3Signer).getAccountSnapshot(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    [error, balance, borrowBalance] = await vBSW.connect(acc3Signer).getAccountSnapshot(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(balance).to.equal(0);
    expect(borrowBalance).to.equal(0);

    // REDEEM //
    await toggleMining(false);
    const redeemAmount = convertToUnit("1", 3);
    await vBNX.connect(acc1Signer).redeem(redeemAmount);
    await vBSW.connect(acc2Signer).redeem(redeemAmount);
    await vBSW.connect(acc3Signer).redeem(redeemAmount);
    await mineBlock();
    await toggleMining(true);
    [error, liquidity, shortfall] = await Comptroller.connect(acc1Signer).getAccountLiquidity(acc1);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount1 * collateralFactor * vBSWPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc2);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount2 * collateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);

    [error, liquidity, shortfall] = await Comptroller.connect(acc3Signer).getAccountLiquidity(acc3);
    expect(error).to.equal(Error.NO_ERROR);
    expect(liquidity).to.equal((mintAmount3 * collateralFactor * vBNXPrice).toString());
    expect(shortfall).to.equal(0);
  });
});

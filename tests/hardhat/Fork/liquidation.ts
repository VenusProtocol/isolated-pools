import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  FaucetToken,
  FaucetToken__factory,
  IProtocolShareReserve__factory,
  MockToken,
  MockToken__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";

const ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
const ORACLE_ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
const ORACLE = "0xCeA29f1266e880A1482c06eD656cD08C148BaA32";
const acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
const acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
const USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const COMPTROLLER = "0x10b57706AD2345e590c2eA4DC02faef0d9f5b08B";
const VUSDD = "0x899dDf81DfbbF5889a16D075c352F2b959Dd24A4";
const VUSDT = "0x3338988d0beb4419Acb8fE624218754053362D06";

let impersonatedTimelock: Signer;
let impersonatedOracleOwner: Signer;
let accessControlManager: AccessControlManager;
let priceOracle: ChainlinkOracle;
let comptroller: Comptroller;
let vUSDD: VToken;
let vUSDT: VToken;
let usdd: MockToken;
let usdt: FaucetToken;
let acc1Signer: Signer;
let acc2Signer: Signer;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
  impersonatedOracleOwner = await initMainnetUser(ORACLE_ADMIN, ethers.utils.parseUnits("2"));
}

async function configureVToken(vTokenAddress: string) {
  const VToken = VToken__factory.connect(vTokenAddress, impersonatedTimelock);
  return VToken;
}

async function grantPermissions() {
  accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);

  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMarketSupplyCaps(address[],uint256[])", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMarketBorrowCaps(address[],uint256[])", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(ORACLE, "setDirectPrice(address,uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMinLiquidatableCollateral(uint256)", ADMIN);
  await tx.wait();
}
if (FORK_TESTNET) {
  describe("Liquidation", async () => {
    async function setupBeforeEach(mintAmount: BigNumberish, usdtBorrowAmount: BigNumberish) {
      await setup();
      await priceOracle.setDirectPrice(usdd.address, "159990000000000000000");
      await priceOracle.setDirectPrice(usdt.address, "208000");

      await usdt.connect(acc1Signer).allocateTo(acc1, mintAmount);
      await usdt.connect(acc1Signer).approve(vUSDT.address, mintAmount);
      await expect(vUSDT.connect(acc1Signer).mint(mintAmount)).to.emit(vUSDT, "Mint");

      await usdd.connect(acc2Signer).faucet(mintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc2Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");
      await expect(vUSDT.connect(acc2Signer).borrow(usdtBorrowAmount)).to.emit(vUSDT, "Borrow");

      // Approve more assets for liquidation
      await usdt.connect(acc1Signer).allocateTo(acc1, convertToUnit(3, 18));
      await usdt.connect(acc1Signer).approve(vUSDT.address, convertToUnit(3, 18));
    }

    async function setup() {
      await setForkBlock(30914000);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));

      usdt = FaucetToken__factory.connect(USDT, impersonatedTimelock);
      usdd = MockToken__factory.connect(USDD, impersonatedTimelock);
      vUSDT = await configureVToken(VUSDT);
      vUSDD = await configureVToken(VUSDD);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      priceOracle = ChainlinkOracle__factory.connect(ORACLE, impersonatedOracleOwner);

      await grantPermissions();

      await comptroller.setMarketSupplyCaps(
        [vUSDT.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vUSDT.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.connect(acc1Signer).enterMarkets([vUSDT.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vUSDD.address]);
    }

    describe("Liquidate from VToken", async () => {
      const mintAmount = convertToUnit("1", 17);
      const usdtBorrowAmount = convertToUnit("1", 4);
      beforeEach(async () => {
        await setup();

        await usdt.connect(acc1Signer).allocateTo(acc1, mintAmount);
        await usdt.connect(acc1Signer).approve(vUSDT.address, mintAmount);
        await expect(vUSDT.connect(acc1Signer).mint(mintAmount)).to.emit(vUSDT, "Mint");

        await usdd.connect(acc2Signer).faucet(mintAmount);
        await usdd.connect(acc2Signer).approve(vUSDD.address, mintAmount);
        await expect(vUSDD.connect(acc2Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

        await expect(vUSDT.connect(acc2Signer).borrow(usdtBorrowAmount)).to.emit(vUSDT, "Borrow");

        await usdt.connect(acc1Signer).allocateTo(acc1, convertToUnit("1", 18));
        await usdt.connect(acc1Signer).approve(vUSDT.address, convertToUnit("1", 18));
      });

      it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
        await expect(
          vUSDT.connect(acc1Signer).liquidateBorrow(acc2, usdtBorrowAmount, vUSDD.address),
        ).to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated");
      });

      it("Should revert when liquidation is called through vToken and no shortfall", async function () {
        // Mint and Increase collateral of the user
        const underlyingMintAmount = convertToUnit("1", 30);
        await usdd.connect(acc2Signer).faucet(underlyingMintAmount);
        await usdd.connect(acc2Signer).approve(vUSDD.address, underlyingMintAmount);

        await vUSDD.connect(acc2Signer).mint(underlyingMintAmount);

        // Liquidation
        await expect(
          vUSDT.connect(acc1Signer).liquidateBorrow(acc2, usdtBorrowAmount, vUSDD.address),
        ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
      });

      it("Should revert when liquidation is called through vToken and trying to seize more tokens", async function () {
        await comptroller.setMinLiquidatableCollateral(0);
        await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 5));

        const borrowBalance = await vUSDT.borrowBalanceStored(acc2);
        const closeFactor = await comptroller.closeFactorMantissa();
        const maxClose = (borrowBalance * closeFactor) / 1e18;

        // Liquidation
        await expect(vUSDT.connect(acc1Signer).liquidateBorrow(acc2, maxClose, vUSDD.address)).to.be.revertedWith(
          "LIQUIDATE_SEIZE_TOO_MUCH",
        );
      });

      it("Should revert when liquidation is called through vToken and trying to pay too much", async function () {
        // Mint and Incrrease collateral of the user
        await comptroller.setMinLiquidatableCollateral(0);
        const underlyingMintAmount = convertToUnit("1", 18);
        await usdd.connect(acc2Signer).faucet(underlyingMintAmount);
        await usdd.connect(acc2Signer).approve(vUSDD.address, underlyingMintAmount);

        await expect(vUSDD.connect(acc2Signer).mint(underlyingMintAmount)).to.emit(vUSDD, "Mint");
        // price manipulation to put user underwater
        await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 5));

        const borrowBalance = await vUSDT.borrowBalanceStored(acc2);
        const closeFactor = await comptroller.closeFactorMantissa();
        const maxClose = (borrowBalance * closeFactor) / 1e18;
        // Liquidation
        await expect(
          vUSDT.connect(acc1Signer).liquidateBorrow(acc2, maxClose + 1, vUSDD.address),
        ).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
      });

      it("liquidate user", async () => {
        await comptroller.setMinLiquidatableCollateral(0);
        await priceOracle.setDirectPrice(usdd.address, convertToUnit("100", 15));
        const borrowBalance = await vUSDT.borrowBalanceStored(acc2);

        const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc2);
        expect(err).equals(0);
        expect(liquidity).equals(0);
        expect(shortfall).greaterThan(0);

        const totalReservesUsddPrev = await vUSDD.totalReserves();
        const vUSDDBalAcc1Prev = await vUSDD.balanceOf(acc1);
        const vUSDDBalAcc2Prev = await vUSDD.balanceOf(acc2);

        const borrowBalancePrev = await vUSDT.borrowBalanceStored(acc2);
        const closeFactor = await comptroller.closeFactorMantissa();
        const maxClose = (borrowBalance * closeFactor) / 1e18;

        const priceBorrowed = await priceOracle.getUnderlyingPrice(vUSDT.address);
        const priceCollateral = await priceOracle.getUnderlyingPrice(vUSDD.address);
        const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
        const exchangeRateCollateralPrev = await vUSDD.callStatic.exchangeRateCurrent();
        const num = (liquidationIncentive * priceBorrowed) / 1e18;
        const den = (priceCollateral * exchangeRateCollateralPrev) / 1e18;
        const ratio = num / den;
        const seizeTokens = ratio * maxClose;

        const result = vUSDT.connect(acc1Signer).liquidateBorrow(acc2, maxClose.toString(), vUSDD.address);

        await expect(result).to.emit(vUSDT, "LiquidateBorrow");
        const vUSDDBalAcc2New = await vUSDD.balanceOf(acc2);
        const vUSDDBalAcc1New = await vUSDD.balanceOf(acc1);
        const totalReservesUsddNew = await vUSDD.totalReserves();
        const exchangeRateCollateralNew = await vUSDD.exchangeRateStored();
        const protocolSeizeShareMantissa = await vUSDD.protocolSeizeShareMantissa();

        const protocolSeizeTokens = Math.floor((seizeTokens * protocolSeizeShareMantissa) / liquidationIncentive);
        const liquidatorSeizeTokens = Math.floor(seizeTokens - protocolSeizeTokens);

        const reserveIncrease = (protocolSeizeTokens * exchangeRateCollateralNew) / 1e18;
        const borrowBalanceNew = await vUSDT.borrowBalanceStored(acc2);

        expect(borrowBalancePrev - maxClose).equals(borrowBalanceNew);
        expect(vUSDDBalAcc2Prev - vUSDDBalAcc2New).equals(Math.floor(seizeTokens));
        expect(vUSDDBalAcc1New - vUSDDBalAcc1Prev).to.closeTo(liquidatorSeizeTokens, 2);
        expect(totalReservesUsddNew - totalReservesUsddPrev).to.closeTo(
          Math.round(reserveIncrease),
          parseUnits("0.00003", 18),
        );
      });
    });

    describe("Liquidate from Comptroller", async () => {
      const mintAmount: BigNumberish = convertToUnit(1, 15);
      const usdtBorrowAmount: BigNumberish = convertToUnit(1, 15);
      beforeEach(async () => {
        await setupBeforeEach(mintAmount, usdtBorrowAmount);
      });

      it("Should revert when not enough collateral to seize", async function () {
        await usdd.connect(acc2Signer).faucet(1e10);
        await usdd.connect(acc2Signer).approve(vUSDD.address, 1e10);
        await vUSDD.connect(acc2Signer).mint(1e10);

        // Repay amount does not make borrower principal to zero
        const repayAmount = Number(usdtBorrowAmount) / 2;
        const param = {
          vTokenCollateral: vUSDD.address,
          vTokenBorrowed: vUSDT.address,
          repayAmount: repayAmount,
        };
        await priceOracle.setDirectPrice(usdd.address, convertToUnit("100", 12));
        await expect(comptroller.connect(acc1Signer).liquidateAccount(acc2, [param])).to.be.revertedWithCustomError(
          comptroller,
          "InsufficientCollateral",
        );
      });

      it("Should success on liquidation when repay amount is equal to borrowing", async function () {
        await usdd.connect(acc2Signer).faucet(convertToUnit(1, 10));
        await usdd.connect(acc2Signer).approve(vUSDD.address, convertToUnit(1, 10));
        await vUSDD.connect(acc2Signer).mint(convertToUnit(1, 10));

        await comptroller
          .connect(impersonatedTimelock)
          .setCollateralFactor(vUSDD.address, convertToUnit(7, 17), convertToUnit(8, 17));
        await comptroller.connect(impersonatedTimelock).setLiquidationIncentive(convertToUnit(1, 18));

        await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 14));
        await priceOracle.setDirectPrice(usdt.address, convertToUnit("1", 2));

        const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc2);
        expect(err).equals(0);
        expect(liquidity).equals(0);
        expect(shortfall).greaterThan(0);

        const totalReservesUsddPrev = await vUSDD.totalReserves();
        const vUSDDBalAcc1Prev = await vUSDD.balanceOf(acc1);
        const vUSDDBalAcc2Prev = await vUSDD.balanceOf(acc2);

        const priceBorrowed = await priceOracle.getUnderlyingPrice(vUSDT.address);
        const priceCollateral = await priceOracle.getUnderlyingPrice(vUSDD.address);
        const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
        const exchangeRateCollateralPrev = await vUSDD.callStatic.exchangeRateCurrent();
        const num = (liquidationIncentive * priceBorrowed) / 1e18;
        const den = (priceCollateral * exchangeRateCollateralPrev) / 1e18;
        const ratio = num / den;

        const repayAmount = 1000001017860540; // After interest accrual
        const seizeTokens = ratio * repayAmount;
        const param = {
          vTokenCollateral: vUSDD.address,
          vTokenBorrowed: vUSDT.address,
          repayAmount: repayAmount,
        };
        const result = comptroller.connect(acc1Signer).liquidateAccount(acc2, [param]);
        await expect(result).to.emit(vUSDT, "LiquidateBorrow");
        expect(await vUSDT.borrowBalanceStored(acc2)).equals(0);

        const vUSDDBalAcc1New = await vUSDD.balanceOf(acc1);
        const vUSDDBalAcc2New = await vUSDD.balanceOf(acc2);
        const totalReservesUsddNew = await vUSDD.totalReserves();
        const exchangeRateCollateralNew = await vUSDD.exchangeRateStored();

        const liquidatorSeizeTokens = Math.floor((seizeTokens * 95) / 100);
        const protocolSeizeTokens = Math.floor((seizeTokens * 5) / 100);
        const reserveIncrease = (protocolSeizeTokens * exchangeRateCollateralNew) / 1e18;

        expect(vUSDDBalAcc2Prev - vUSDDBalAcc2New).equals(Math.floor(seizeTokens));
        expect(vUSDDBalAcc1New - vUSDDBalAcc1Prev).equals(liquidatorSeizeTokens);
        expect(totalReservesUsddNew - totalReservesUsddPrev).to.closeTo(
          Math.round(reserveIncrease),
          parseUnits("0.00003", 18),
        );
      });
    });

    describe("Heal Borrow and Forgive account", () => {
      const mintAmount = convertToUnit("1", 12);
      const usdtBorrowAmount = convertToUnit(1, 4);
      let result;

      beforeEach(async () => {
        await setupBeforeEach(mintAmount, usdtBorrowAmount);
      });

      it("Should success on healing and forgive borrow account", async function () {
        // Increase price of borrowed underlying tokens to surpass available collateral
        await priceOracle.setDirectPrice(usdt.address, convertToUnit(1, 13)); // 25
        await priceOracle.setDirectPrice(usdd.address, convertToUnit(1, 15)); // 15

        const USDDPrice = await priceOracle.getUnderlyingPrice(VUSDD);
        const USDTPrice = await priceOracle.getUnderlyingPrice(VUSDT);

        const collateralBal = await vUSDD.balanceOf(acc2);
        const exchangeRateCollateral = await vUSDD.callStatic.exchangeRateCurrent();
        const borrowBalanceCurrent = await vUSDT.callStatic.borrowBalanceCurrent(acc2);

        const vTokenCollateralPrice = USDDPrice.mul(exchangeRateCollateral).div(convertToUnit(1, 18));
        const totalCollateral = vTokenCollateralPrice.mul(collateralBal).div(convertToUnit(1, 18));
        const scaledBorrows = USDTPrice.mul(borrowBalanceCurrent).div(convertToUnit(1, 18));

        const percentageOfRepay = totalCollateral.mul(convertToUnit(11, 18)).div(scaledBorrows);
        const repayAmount = percentageOfRepay.mul(borrowBalanceCurrent).div(convertToUnit(1, 18));
        const badDebt = borrowBalanceCurrent.sub(repayAmount);

        result = await comptroller.connect(acc1Signer).healAccount(acc2);
        await expect(result).to.emit(vUSDT, "RepayBorrow");

        // Forgive Account
        result = await vUSDT.connect(acc2Signer).getAccountSnapshot(acc2);
        expect(result.vTokenBalance).to.equal(0);
        expect(result.borrowBalance).to.equal(0);
        const badDebtAfter = await vUSDT.badDebt();
        expect(badDebtAfter).to.closeTo(badDebt, 1011);
      });
    });
  });
}

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
  IERC20,
  IERC20__factory,
  MockPriceOracle,
  MockPriceOracle__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const {
  ACC1,
  ACC2,
  ADMIN,
  ACM,
  PSR,
  TOKEN1,
  TOKEN2,
  VTOKEN1,
  VTOKEN2,
  COMPTROLLER,
  TOKEN1_HOLDER,
  TOKEN2_HOLDER,
  RESILIENT_ORACLE,
  CHAINLINK_ORACLE,
  BLOCK_NUMBER,
} = getContractAddresses(FORKED_NETWORK as string);

const AddressZero = "0x0000000000000000000000000000000000000000";

let token1: IERC20;
let token2: IERC20;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let comptroller: Comptroller;
let token1Holder: Signer;
let token2Holder: Signer;
let acc1Signer: Signer;
let acc2Signer: Signer;
let impersonatedTimelock: Signer;
let priceOracle: ChainlinkOracle;
let resilientOracle: MockPriceOracle;
let accessControlManager: AccessControlManager;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
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
    .giveCallPermission(CHAINLINK_ORACLE, "setDirectPrice(address,uint256)", ADMIN);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setMinLiquidatableCollateral(uint256)", ADMIN);
  await tx.wait();
}
if (FORK) {
  describe("Liquidation", async () => {
    async function setupBeforeEach(mintAmount: BigNumberish, token2BorrowAmount: BigNumberish) {
      await setup();
      await priceOracle.setDirectPrice(token1.address, "159990000000000000000");
      await priceOracle.setDirectPrice(token2.address, "208000000000000000");

      await token2.connect(token2Holder).transfer(ACC1, mintAmount);
      await token2.connect(acc1Signer).approve(vTOKEN2.address, mintAmount);
      await expect(vTOKEN2.connect(acc1Signer).mint(mintAmount)).to.emit(vTOKEN2, "Mint");

      await token1.connect(token1Holder).transfer(ACC2, mintAmount);
      await token1.connect(acc2Signer).approve(vTOKEN1.address, mintAmount);
      await expect(vTOKEN1.connect(acc2Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");
      await expect(vTOKEN2.connect(acc2Signer).borrow(token2BorrowAmount)).to.emit(vTOKEN2, "Borrow");

      // Approve more assets for liquidation
      await token2.connect(token2Holder).transfer(ACC1, convertToUnit(3, 18));
      await token2.connect(acc1Signer).approve(vTOKEN2.address, convertToUnit(3, 18));
    }

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));

      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);
      vTOKEN2 = await configureVToken(VTOKEN2);
      vTOKEN1 = await configureVToken(VTOKEN1);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      priceOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);

      const tupleForToken2 = {
        asset: TOKEN2,
        oracles: [CHAINLINK_ORACLE, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      const tupleForToken1 = {
        asset: TOKEN1,
        oracles: [CHAINLINK_ORACLE, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);
      await resilientOracle.setTokenConfig(tupleForToken2);
      await resilientOracle.setTokenConfig(tupleForToken1);
      await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 18));
      await priceOracle.setDirectPrice(token2.address, convertToUnit("1", 18));

      await grantPermissions();

      await comptroller.setMarketSupplyCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN2.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN1.address]);
    }

    describe("Liquidate from VToken", async () => {
      const mintAmount = convertToUnit("1000", 18);
      const token2BorrowAmount = convertToUnit("1", 9);
      beforeEach(async () => {
        await setup();

        await token2.connect(token2Holder).transfer(ACC1, mintAmount);
        await token2.connect(acc1Signer).approve(vTOKEN2.address, mintAmount);
        await expect(vTOKEN2.connect(acc1Signer).mint(mintAmount)).to.emit(vTOKEN2, "Mint");

        await token1.connect(token1Holder).transfer(ACC2, mintAmount);
        await token1.connect(acc2Signer).approve(vTOKEN1.address, mintAmount);
        await expect(vTOKEN1.connect(acc2Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

        await expect(vTOKEN2.connect(acc2Signer).borrow(token2BorrowAmount)).to.emit(vTOKEN2, "Borrow");

        await token2.connect(token2Holder).transfer(ACC1, convertToUnit("1", 18));
        await token2.connect(acc1Signer).approve(vTOKEN2.address, convertToUnit("1", 18));
      });

      it("Should revert when liquidation is called through vToken and does not met minCollateral Criteria", async function () {
        await comptroller.setMinLiquidatableCollateral(convertToUnit("1", 25));
        await expect(
          vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, token2BorrowAmount, vTOKEN1.address),
        ).to.be.revertedWithCustomError(comptroller, "MinimalCollateralViolated");
      });

      it("Should revert when liquidation is called through vToken and no shortfall", async function () {
        // Mint and Increase collateral of the user
        const underlyingMintAmount = convertToUnit("1", 20);
        await token1.connect(token1Holder).transfer(ACC2, underlyingMintAmount);
        await token1.connect(acc2Signer).approve(vTOKEN1.address, underlyingMintAmount);
        await vTOKEN1.connect(acc2Signer).mint(underlyingMintAmount);

        // Liquidation
        await expect(
          vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, token2BorrowAmount, vTOKEN1.address),
        ).to.be.revertedWithCustomError(comptroller, "InsufficientShortfall");
      });

      it("Should revert when liquidation is called through vToken and trying to seize more tokens", async function () {
        await comptroller.setMinLiquidatableCollateral(0);
        await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 5));

        const borrowBalance = await vTOKEN2.borrowBalanceStored(ACC2);
        const closeFactor = await comptroller.closeFactorMantissa();
        const maxClose = (borrowBalance * closeFactor) / 1e18;

        // Liquidation
        await expect(vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, maxClose, vTOKEN1.address)).to.be.revertedWith(
          "LIQUIDATE_SEIZE_TOO_MUCH",
        );
      });

      it("Should revert when liquidation is called through vToken and trying to pay too much", async function () {
        // Mint and Incrrease collateral of the user
        await comptroller.setMinLiquidatableCollateral(0);
        const underlyingMintAmount = convertToUnit("1", 18);
        await token1.connect(token1Holder).transfer(ACC2, underlyingMintAmount);
        await token1.connect(acc2Signer).approve(vTOKEN1.address, underlyingMintAmount);

        await expect(vTOKEN1.connect(acc2Signer).mint(underlyingMintAmount)).to.emit(vTOKEN1, "Mint");

        // price manipulation to put user underwater
        await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 5));

        const borrowBalance = await vTOKEN2.borrowBalanceStored(ACC2);
        const closeFactor = await comptroller.closeFactorMantissa();

        // amount to repay should be greater than maxClose for getting error of TooMuchRepay
        const maxClose = (borrowBalance * closeFactor) / 1e18 + 1e10;
        // Liquidation
        await expect(
          vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, maxClose, vTOKEN1.address),
        ).to.be.revertedWithCustomError(comptroller, "TooMuchRepay");
      });

      it("liquidate user", async () => {
        await comptroller.setMinLiquidatableCollateral(0);
        await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 6));
        const borrowBalance = await vTOKEN2.borrowBalanceStored(ACC2);

        const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);
        expect(err).equals(0);
        expect(liquidity).equals(0);
        expect(shortfall).greaterThan(0);

        const totalReservesToken1Prev = await vTOKEN1.totalReserves();
        const vTOKEN1BalAcc1Prev = await vTOKEN1.balanceOf(ACC1);
        const vTOKEN1BalAcc2Prev = await vTOKEN1.balanceOf(ACC2);
        const psrBalancePrev = await token1.balanceOf(PSR);

        const psrAndreservesSumPrev = psrBalancePrev.add(totalReservesToken1Prev);
        const borrowBalancePrev = await vTOKEN2.borrowBalanceStored(ACC2);
        const closeFactor = await comptroller.closeFactorMantissa();
        const maxClose = (borrowBalance * closeFactor) / 1e18;

        const priceBorrowed = await priceOracle.getPrice(TOKEN2);
        const priceCollateral = await priceOracle.getPrice(TOKEN1);
        const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
        const exchangeRateCollateralPrev = await vTOKEN1.callStatic.exchangeRateCurrent();
        const num = (liquidationIncentive * priceBorrowed) / 1e18;
        const den = (priceCollateral * exchangeRateCollateralPrev) / 1e18;
        const ratio = num / den;
        const seizeTokens = ratio * maxClose;

        const result = vTOKEN2.connect(acc1Signer).liquidateBorrow(ACC2, maxClose.toString(), vTOKEN1.address);

        await expect(result).to.emit(vTOKEN2, "LiquidateBorrow");
        const vTOKEN1BalAcc2New = await vTOKEN1.balanceOf(ACC2);
        const vTOKEN1BalAcc1New = await vTOKEN1.balanceOf(ACC1);
        const totalReservesToken1New = await vTOKEN1.totalReserves();
        const exchangeRateCollateralNew = await vTOKEN1.exchangeRateStored();
        const protocolSeizeShareMantissa = await vTOKEN1.protocolSeizeShareMantissa();

        const protocolSeizeTokens = Math.floor((seizeTokens * protocolSeizeShareMantissa) / liquidationIncentive);
        const liquidatorSeizeTokens = Math.floor(seizeTokens - protocolSeizeTokens);
        const reserveIncrease = (protocolSeizeTokens * exchangeRateCollateralNew) / 1e18;
        const borrowBalanceNew = await vTOKEN2.borrowBalanceStored(ACC2);
        expect(borrowBalancePrev - maxClose).closeTo(borrowBalanceNew, 100);

        expect(vTOKEN1BalAcc2Prev - vTOKEN1BalAcc2New).to.closeTo(Math.floor(seizeTokens), 100);

        expect(vTOKEN1BalAcc1New - vTOKEN1BalAcc1Prev).to.closeTo(liquidatorSeizeTokens, 100);
        const psrBalanceNew = await token1.balanceOf(PSR);

        const psrAndreservesSumNew = psrBalanceNew.add(totalReservesToken1New);
        const difference = psrAndreservesSumNew.sub(psrAndreservesSumPrev);

        expect(difference.toString()).to.closeTo(reserveIncrease.toString(), parseUnits("0.00003", 18));
      });
    });

    describe("Liquidate from Comptroller", async () => {
      const mintAmount: BigNumberish = convertToUnit(1, 15);
      const token2BorrowAmount: BigNumberish = convertToUnit(1, 15);
      beforeEach(async () => {
        await setupBeforeEach(mintAmount, token2BorrowAmount);
      });

      it("Should revert when not enough collateral to seize", async function () {
        await token1.connect(token1Holder).transfer(ACC2, 1e10);
        await token1.connect(acc2Signer).approve(vTOKEN1.address, 1e10);
        await vTOKEN1.connect(acc2Signer).mint(1e10);

        // Repay amount does not make borrower principal to zero
        const repayAmount = Number(token2BorrowAmount) / 2;
        const param = {
          vTokenCollateral: vTOKEN1.address,
          vTokenBorrowed: vTOKEN2.address,
          repayAmount: repayAmount,
        };
        await priceOracle.setDirectPrice(token1.address, convertToUnit("100", 12));
        await expect(comptroller.connect(acc1Signer).liquidateAccount(ACC2, [param])).to.be.revertedWithCustomError(
          comptroller,
          "InsufficientCollateral",
        );
      });

      it("Should success on liquidation when repay amount is equal to borrowing", async function () {
        await comptroller
          .connect(impersonatedTimelock)
          .setCollateralFactor(vTOKEN1.address, convertToUnit(7, 17), convertToUnit(8, 17));
        await comptroller.connect(impersonatedTimelock).setLiquidationIncentive(convertToUnit(1, 18));

        await priceOracle.setDirectPrice(token1.address, convertToUnit("1", 12));
        await priceOracle.setDirectPrice(token2.address, convertToUnit("1", 12));

        const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);
        expect(err).equals(0);
        expect(liquidity).equals(0);
        expect(shortfall).greaterThan(0);

        const totalReservesToken1Prev = await vTOKEN1.totalReserves();
        const vTOKEN1BalAcc1Prev = await vTOKEN1.balanceOf(ACC1);
        const vTOKEN1BalAcc2Prev = await vTOKEN1.balanceOf(ACC2);
        const priceBorrowed = await priceOracle.getPrice(TOKEN2);
        const priceCollateral = await priceOracle.getPrice(TOKEN1);
        const liquidationIncentive = await comptroller.liquidationIncentiveMantissa();
        const exchangeRateCollateralPrev = await vTOKEN1.callStatic.exchangeRateCurrent();

        const num = (liquidationIncentive * priceBorrowed) / 1e18;
        const den = (priceCollateral * exchangeRateCollateralPrev) / 1e18;
        const ratio = num / den;
        await token1.connect(token1Holder).transfer(ACC2, convertToUnit(1, 12));
        await token1.connect(acc2Signer).approve(vTOKEN1.address, convertToUnit(1, 12));
        await vTOKEN1.connect(acc2Signer).mint(convertToUnit(1, 12));

        // repayAmount will be calculated after accruing interest and then using borrowBalanceStored to get the repayAmount.
        let repayAmount;
        if (FORKED_NETWORK == "bsctestnet") repayAmount = 1000000047610436;
        else if (FORKED_NETWORK == "sepolia") repayAmount = 1000000019818620;
        else if (FORKED_NETWORK == "bscmainnet") repayAmount = 1000000034788981;
        else if (FORKED_NETWORK == "ethereum") repayAmount = 1000000076103691;

        const seizeTokens = ratio * repayAmount;
        const param = {
          vTokenCollateral: vTOKEN1.address,
          vTokenBorrowed: vTOKEN2.address,
          repayAmount: repayAmount,
        };
        const result = comptroller.connect(acc1Signer).liquidateAccount(ACC2, [param]);
        await expect(result).to.emit(vTOKEN2, "LiquidateBorrow");
        expect(await vTOKEN2.borrowBalanceStored(ACC2)).equals(0);

        const vTOKEN1BalAcc1New = await vTOKEN1.balanceOf(ACC1);
        const vTOKEN1BalAcc2New = await vTOKEN1.balanceOf(ACC2);
        const totalReservesToken1New = await vTOKEN1.totalReserves();
        const exchangeRateCollateralNew = await vTOKEN1.exchangeRateStored();

        const liquidatorSeizeTokens = Math.floor((seizeTokens * 95) / 100);
        const protocolSeizeTokens = Math.floor((seizeTokens * 5) / 100);
        const reserveIncrease = (protocolSeizeTokens * exchangeRateCollateralNew) / 1e18;

        expect(vTOKEN1BalAcc2Prev - vTOKEN1BalAcc2New).to.closeTo(Math.floor(seizeTokens), 100);
        expect(vTOKEN1BalAcc1New - vTOKEN1BalAcc1Prev).to.closeTo(liquidatorSeizeTokens, 1);
        expect(totalReservesToken1New - totalReservesToken1Prev).to.closeTo(
          Math.round(reserveIncrease),
          parseUnits("0.0003", 18),
        );
      });
    });

    describe("Heal Borrow and Forgive account", () => {
      const mintAmount = convertToUnit("1", 12);
      const token2BorrowAmount = convertToUnit(1, 4);
      let result;

      beforeEach(async () => {
        await setupBeforeEach(mintAmount, token2BorrowAmount);
      });

      it("Should success on healing and forgive borrow account", async function () {
        // Increase price of borrowed underlying tokens to surpass available collateral
        await priceOracle.setDirectPrice(token2.address, convertToUnit(1, 25)); // 25
        await priceOracle.setDirectPrice(token1.address, convertToUnit(1, 15)); // 15

        const TOKEN1Price = await priceOracle.getPrice(TOKEN1);
        const TOKEN2Price = await priceOracle.getPrice(TOKEN2);

        const collateralBal = await vTOKEN1.balanceOf(ACC2);
        const exchangeRateCollateral = await vTOKEN1.callStatic.exchangeRateCurrent();
        const borrowBalanceCurrent = await vTOKEN2.callStatic.borrowBalanceCurrent(ACC2);

        const vTokenCollateralPrice = TOKEN1Price.mul(exchangeRateCollateral).div(convertToUnit(1, 18));
        const totalCollateral = vTokenCollateralPrice.mul(collateralBal).div(convertToUnit(1, 18));
        const scaledBorrows = TOKEN2Price.mul(borrowBalanceCurrent).div(convertToUnit(1, 18));

        const percentageOfRepay = totalCollateral.mul(convertToUnit(11, 18)).div(scaledBorrows);
        const repayAmount = percentageOfRepay.mul(borrowBalanceCurrent).div(convertToUnit(1, 18));
        const badDebt = borrowBalanceCurrent.sub(repayAmount);

        result = await comptroller.connect(acc1Signer).healAccount(ACC2);
        await expect(result).to.emit(vTOKEN2, "RepayBorrow");

        // Forgive Account
        result = await vTOKEN2.connect(acc2Signer).getAccountSnapshot(ACC2);
        expect(result.vTokenBalance).to.equal(0);
        expect(result.borrowBalance).to.equal(0);
        const badDebtAfter = await vTOKEN2.badDebt();
        expect(badDebtAfter).to.closeTo(badDebt, 1011);
      });
    });
  });
}

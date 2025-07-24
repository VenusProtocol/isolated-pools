import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { DEFAULT_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
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
  LiquidationManager,
  MockPriceOracle,
  MockPriceOracle__factory,
  VToken,
  VToken__factory,
  WrappedNative,
  WrappedNative__factory,
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
  POOL_REGISTRY,
} = getContractAddresses(FORKED_NETWORK as string);

const AddressZero = "0x0000000000000000000000000000000000000000";
const COMPTROLLER_BEACON = "0x38B4Efab9ea1bAcD19dC81f19c4D1C2F9DeAe1B2";
const VTOKEN_BEACON = "0x2b8A1C539ABaC89CbF7E2Bc6987A0A38A5e660D4";
const maxBorrowRateMantissa = ethers.BigNumber.from(0.0005e16);

let token1: IERC20 | WrappedNative;
let token2: IERC20;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let comptroller: Comptroller;
let liquidationManager: LiquidationManager;
let token1Holder: Signer;
let token2Holder: Signer;
let acc1Signer: Signer;
let acc2Signer: Signer;
let impersonatedTimelock: Signer;
let chainlinkOracle: ChainlinkOracle;
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
  const tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(chainlinkOracle.address, "setDirectPrice(address,uint256)", ADMIN);
  await tx.wait();
}

if (FORK) {
  describe("Liquidation", async () => {
    async function setupBeforeEach(mintAmount: BigNumberish, token2BorrowAmount: BigNumberish) {
      await setup();
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, "159990000000000000000");
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, "208000000000000000");

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

      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      vTOKEN2 = await configureVToken(VTOKEN2);
      vTOKEN1 = await configureVToken(VTOKEN1);

      // --- Upgrade Comptroller Implementation ---
      const ComptrollerFactory = await ethers.getContractFactory("Comptroller");
      const newComptrollerImpl = await ComptrollerFactory.deploy(POOL_REGISTRY);
      await newComptrollerImpl.deployed();

      const comptrollerBeacon = await ethers.getContractAt(
        "UpgradeableBeacon",
        COMPTROLLER_BEACON,
        impersonatedTimelock,
      );
      await comptrollerBeacon.upgradeTo(newComptrollerImpl.address);

      // --- Upgrade VToken Implementation ---
      const VTokenFactory = await ethers.getContractFactory("VToken");
      const newVTokenImpl = await VTokenFactory.deploy(false, DEFAULT_BLOCKS_PER_YEAR, maxBorrowRateMantissa);
      await newVTokenImpl.deployed();

      const vTokenBeacon = await ethers.getContractAt("UpgradeableBeacon", VTOKEN_BEACON, impersonatedTimelock);
      await vTokenBeacon.upgradeTo(newVTokenImpl.address);

      // --- Deploy and Set New LiquidationManager ---
      const LiquidationManagerFactory = await ethers.getContractFactory("LiquidationManager");
      liquidationManager = await LiquidationManagerFactory.deploy();
      await liquidationManager.deployed();

      accessControlManager = AccessControlManager__factory.connect(ACM, impersonatedTimelock);
      await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(comptroller.address, "setLiquidationModule(address)", ADMIN);
      await comptroller.setLiquidationModule(liquidationManager.address);

      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2000000"));

      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);
      if (FORKED_NETWORK == "arbitrumsepolia" || FORKED_NETWORK == "arbitrumone") {
        token1 = WrappedNative__factory.connect(TOKEN1, impersonatedTimelock);
        await token1.connect(token1Holder).deposit({ value: convertToUnit("200000", 18) });
      }

      if (FORKED_NETWORK == "opbnbmainnet" || FORKED_NETWORK == "opbnbtestnet") {
        const chainlinkOracleFactory = await ethers.getContractFactory("ChainlinkOracle");
        chainlinkOracle = await upgrades.deployProxy(chainlinkOracleFactory, [ACM], { impersonatedTimelock });
      } else {
        chainlinkOracle = ChainlinkOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);
      }
      await grantPermissions();

      const tupleForToken1 = {
        asset: TOKEN1,
        oracles: [chainlinkOracle.address, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      const tupleForToken2 = {
        asset: TOKEN2,
        oracles: [chainlinkOracle.address, AddressZero, AddressZero],
        enableFlagsForOracles: [true, false, false],
      };

      resilientOracle = MockPriceOracle__factory.connect(RESILIENT_ORACLE, impersonatedTimelock);

      await resilientOracle.setTokenConfig(tupleForToken1);
      await resilientOracle.setTokenConfig(tupleForToken2);
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 18));
      await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit("1", 18));

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

      await accessControlManager
        .connect(impersonatedTimelock)
        .giveCallPermission(comptroller.address, "setMarketLiquidationIncentive(address,uint256)", ADMIN);
      await comptroller.setMarketLiquidationIncentive(vTOKEN1.address, parseUnits("1", 18));
      await comptroller.setMarketLiquidationIncentive(vTOKEN2.address, parseUnits("1", 18));
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
        await comptroller.setForcedLiquidation(vTOKEN2.address, true);
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 5));

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
        await comptroller.setForcedLiquidation(vTOKEN2.address, true);
        const underlyingMintAmount = convertToUnit("1", 18);
        await token1.connect(token1Holder).transfer(ACC2, underlyingMintAmount);
        await token1.connect(acc2Signer).approve(vTOKEN1.address, underlyingMintAmount);

        await expect(vTOKEN1.connect(acc2Signer).mint(underlyingMintAmount)).to.emit(vTOKEN1, "Mint");

        // price manipulation to put user underwater
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 5));

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
        await comptroller.setForcedLiquidation(vTOKEN2.address, true);
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 6));
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

        const priceBorrowed = await chainlinkOracle.getPrice(TOKEN2);
        const priceCollateral = await chainlinkOracle.getPrice(TOKEN1);
        const liquidationIncentive = await comptroller.getMarketLiquidationIncentive(vTOKEN1.address);
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
        expect(borrowBalancePrev.sub(maxClose)).closeTo(borrowBalanceNew, 200);

        expect(vTOKEN1BalAcc2Prev.sub(vTOKEN1BalAcc2New)).to.closeTo(Math.floor(seizeTokens), 1000);

        expect(vTOKEN1BalAcc1New.sub(vTOKEN1BalAcc1Prev)).to.closeTo(liquidatorSeizeTokens, 1000);
        const psrBalanceNew = await token1.balanceOf(PSR);

        const psrAndreservesSumNew = psrBalanceNew.add(totalReservesToken1New);
        const difference = psrAndreservesSumNew.sub(psrAndreservesSumPrev);

        expect(difference.toString()).to.closeTo(reserveIncrease.toString(), parseUnits("0.03", 18));
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
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("100", 12));
        await expect(comptroller.connect(acc1Signer).liquidateAccount(ACC2, [param])).to.be.revertedWithCustomError(
          comptroller,
          "InsufficientCollateral",
        );
      });

      it("Should success on liquidation when repay amount is equal to borrowing", async function () {
        await comptroller
          .connect(impersonatedTimelock)
          .setCollateralFactor(vTOKEN1.address, convertToUnit(6, 17), convertToUnit(8, 17));

        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit("1", 12));
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit("1", 12));

        const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(ACC2);
        expect(err).equals(0);
        expect(liquidity).equals(0);
        expect(shortfall).greaterThan(0);

        const totalReservesToken1Prev = await vTOKEN1.totalReserves();
        const vTOKEN1BalAcc1Prev = await vTOKEN1.balanceOf(ACC1);
        const vTOKEN1BalAcc2Prev = await vTOKEN1.balanceOf(ACC2);

        const priceCollateral = await chainlinkOracle.getPrice(TOKEN1);
        const exchangeRateCollateralPrev = await vTOKEN1.callStatic.exchangeRateCurrent();

        await token1.connect(token1Holder).transfer(ACC2, convertToUnit(1, 12));
        await token1.connect(acc2Signer).approve(vTOKEN1.address, convertToUnit(1, 12));
        await vTOKEN1.connect(acc2Signer).mint(convertToUnit(1, 12));

        const NetworkRespectiveRepayAmounts = {
          bsctestnet: 1000000048189326,
          sepolia: 1000000138102911,
          bscmainnet: 1000000018727042,
          ethereum: 1000000262400450,
          opbnbtestnet: 1000000000288189,
          opbnbmainnet: 1000000008986559,
          arbitrumsepolia: 1000000000046406,
          arbitrumone: 1000000032216389,
        };
        const repayAmount = NetworkRespectiveRepayAmounts[FORKED_NETWORK];

        const borrowMarkets = await comptroller.getAssetsIn(ACC2);
        const collateralToSeize = await liquidationManager.calculateIncentiveAdjustedDebt(
          ACC2,
          borrowMarkets,
          comptroller.address,
        );

        // Convert collateralToSeize (USD value) to actual vTokens to seize
        const collateralValue = (priceCollateral * exchangeRateCollateralPrev) / 1e18;
        const seizeTokens = (collateralToSeize * 1e18) / collateralValue;

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

        // 10. Verify token distribution (95% liquidator, 5% protocol)
        const liquidatorSeizeTokens = Math.floor((seizeTokens * 95) / 100);
        const protocolSeizeTokens = Math.floor((seizeTokens * 5) / 100);
        const reserveIncrease = (protocolSeizeTokens * exchangeRateCollateralNew) / 1e18;

        expect(vTOKEN1BalAcc2Prev.sub(vTOKEN1BalAcc2New)).to.closeTo(
          Math.floor(seizeTokens),
          100, // tolerance for rounding
        );

        expect(vTOKEN1BalAcc1New.sub(vTOKEN1BalAcc1Prev)).to.closeTo(
          liquidatorSeizeTokens,
          1, // tolerance
        );

        expect(totalReservesToken1New.sub(totalReservesToken1Prev)).to.closeTo(
          Math.round(reserveIncrease),
          parseUnits("1", 17), // tolerance
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
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token2.address, convertToUnit(1, 25)); // 25
        await chainlinkOracle.connect(impersonatedTimelock).setDirectPrice(token1.address, convertToUnit(1, 15)); // 15

        const token1Price = await chainlinkOracle.getPrice(TOKEN1);
        const token2Price = await chainlinkOracle.getPrice(TOKEN2);

        const collateralBal = await vTOKEN1.balanceOf(ACC2);
        const exchangeRateCollateral = await vTOKEN1.callStatic.exchangeRateCurrent();
        const borrowBalanceCurrent = await vTOKEN2.callStatic.borrowBalanceCurrent(ACC2);

        const vTokenCollateralPrice = token1Price.mul(exchangeRateCollateral).div(convertToUnit(1, 18));
        const totalCollateral = vTokenCollateralPrice.mul(collateralBal).div(convertToUnit(1, 18));
        const scaledBorrows = token2Price.mul(borrowBalanceCurrent).div(convertToUnit(1, 18));

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

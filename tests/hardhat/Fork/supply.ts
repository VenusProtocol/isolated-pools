import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { Signer } from "ethers";
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
  MockToken,
  MockToken__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";

const ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
const ORACLE_ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
const ORACLE = "0xfc4e26B7fD56610E84d33372435F0275A359E8eF";
const acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
const acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
const acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
const USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const COMPTROLLER = "0x605AA769d14F6Af2E405295FEC2A4d8Baa623d80";
const VUSDD = "0xeD7401294EBF0A1b0721562a69031565F4a4Bacd";
const VUSDT = "0x296da137120562c79b26808c1aa142a59ebf31f4";

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
let acc3Signer: Signer;

const blocksToMint: number = 300000;
const usdtBorrowAmount = convertToUnit("1", 4);

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

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(comptroller.address, "setCollateralFactor(address,uint256,uint256)", ADMIN);
}

if (FORK_TESTNET) {
  describe("Supply fork tests", async () => {
    async function setup() {
      await setForkBlock(30080357);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(acc3, ethers.utils.parseUnits("2"));

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
      await comptroller.connect(acc2Signer).enterMarkets([vUSDT.address, vUSDD.address]);
      await comptroller.connect(acc3Signer).enterMarkets([vUSDD.address]);
    }

    beforeEach(async () => {
      await setup();
      await priceOracle.setDirectPrice(usdt.address, convertToUnit("1", 15));
    });

    const calculateExchangeRate = async () => {
      const cash = await vUSDT.getCash();
      const borrows = await vUSDT.totalBorrows();
      const badDebt = await vUSDT.badDebt();
      const reserves = await vUSDT.totalReserves();
      const supply = await vUSDT.totalSupply();
      const exchangeRatecal = new BigNumber(Number(cash) + Number(borrows) + Number(badDebt) - Number(reserves))
        .multipliedBy(Number(convertToUnit(1, 18)))
        .toFixed(0);

      return new BigNumber(exchangeRatecal).dividedBy(Number(supply)).toFixed(0);
    };

    it("Evolution of exchange rate", async () => {
      const mintAmount = convertToUnit("1", 17);
      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      let exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      let calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      // Mint vUSDT with first account(acc1)
      await usdt.connect(acc1Signer).allocateTo(acc1, convertToUnit(2, 18));
      await usdt.connect(acc1Signer).approve(vUSDT.address, convertToUnit(2, 18));
      await expect(vUSDT.connect(acc1Signer).mint(convertToUnit(1, 18))).to.emit(vUSDT, "Mint");

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      // Set oracle price for usdt
      await priceOracle.setDirectPrice(usdt.address, convertToUnit("1", 15));

      // Mint vUSDD with second account(acc2)
      await usdd.connect(acc2Signer).faucet(mintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc2Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

      // Borrow usdt with second account(acc2)
      await expect(vUSDT.connect(acc2Signer).borrow(usdtBorrowAmount)).to.be.emit(vUSDT, "Borrow");

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      await usdt.connect(acc2Signer).approve(vUSDT.address, convertToUnit(1, 5));
      await vUSDT.connect(acc2Signer).repayBorrow(usdtBorrowAmount);

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      // setup to liquidate the second account(acc2) with first account(acc1)
      await comptroller.setMinLiquidatableCollateral(0);
      await expect(vUSDT.connect(acc2Signer).borrow(usdtBorrowAmount)).to.be.emit(vUSDT, "Borrow");
      await priceOracle.setDirectPrice(usdd.address, convertToUnit("1", 13));

      const [err, liquidity, shortfall] = await comptroller.callStatic.getAccountLiquidity(acc2);
      expect(err).equals(0);
      expect(liquidity).equals(0);
      expect(shortfall).greaterThan(0);

      const borrowBalance = await vUSDT.borrowBalanceStored(acc2);
      const closeFactor = await comptroller.closeFactorMantissa();
      const maxClose = (Number(borrowBalance) * Number(closeFactor)) / 2e18;
      let result = vUSDT.connect(acc1Signer).liquidateBorrow(acc2, maxClose, vUSDD.address);
      await expect(result).to.emit(vUSDT, "LiquidateBorrow");

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      // Setup for healAccount(acc2)
      await priceOracle.setDirectPrice(usdd.address, convertToUnit(1, 10));
      await priceOracle.setDirectPrice(usdt.address, convertToUnit(1, 18));

      const [err2, liquidity2, shortfall2] = await comptroller.callStatic.getAccountLiquidity(acc2);
      expect(err2).equals(0);
      expect(liquidity2).equals(0);
      expect(shortfall2).greaterThan(0);
      await comptroller.setMinLiquidatableCollateral(convertToUnit(1, 22));

      result = comptroller.connect(acc1Signer).healAccount(acc2);
      await expect(result).to.emit(vUSDT, "RepayBorrow");

      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);

      const totalBal = await vUSDT.balanceOf(acc1);
      await expect(vUSDT.connect(acc1Signer).redeem(totalBal)).to.emit(vUSDT, "Redeem");

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Accural all the interest till latest block
      await vUSDT.accrueInterest();

      // Assert current exchange rate
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      calculatedRate = await calculateExchangeRate();
      expect(exchangeRate).closeTo(calculatedRate, 1);
    });

    it("Two users Mint, one redeems", async () => {
      const mintAmount = convertToUnit("1", 18);
      // Mint vUSDT with first account(acc1)
      await usdt.connect(acc1Signer).allocateTo(acc1, convertToUnit(2, 18));
      await usdt.connect(acc1Signer).approve(vUSDT.address, convertToUnit(2, 18));
      await expect(vUSDT.connect(acc1Signer).mint(convertToUnit(1, 18))).to.emit(vUSDT, "Mint");

      // Mint vUSDT with second account(acc2)
      await usdt.connect(acc2Signer).allocateTo(acc2, convertToUnit(2, 18));
      await usdt.connect(acc2Signer).approve(vUSDT.address, convertToUnit(2, 18));
      await expect(vUSDT.connect(acc2Signer).mint(convertToUnit(1, 18))).to.emit(vUSDT, "Mint");

      // Mint vUSDD with second account(acc2)
      await usdd.connect(acc3Signer).faucet(mintAmount);
      await usdd.connect(acc3Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc3Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

      // Borrow usdt with second account(acc2)
      await expect(vUSDT.connect(acc3Signer).borrow(usdtBorrowAmount)).to.be.emit(vUSDT, "Borrow");

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Partial redeem for first account(acc1)
      let balanceBefore = await usdt.balanceOf(acc1);
      await vUSDT.connect(acc1Signer).redeem(convertToUnit(5, 17));
      let balanceAfter = await usdt.balanceOf(acc1);

      // Expected undelying after partial redeem
      let exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      let expectedRedeemAmount = new BigNumber(convertToUnit(5, 17))
        .multipliedBy(Number(exchangeRate))
        .dividedBy(Number(convertToUnit(1, 18)))
        .plus(Number(balanceBefore))
        .toFixed(0);
      expect(expectedRedeemAmount).closeTo(balanceAfter, 10);

      // Mine 300,000 blocks
      await mine(blocksToMint);

      // Complete redeem for first account(acc1)
      const accountBalance = await vUSDT.balanceOf(acc1);
      balanceBefore = await usdt.balanceOf(acc1);
      await vUSDT.connect(acc1Signer).redeem(accountBalance);
      balanceAfter = await usdt.balanceOf(acc1);

      // Expected undelying after complete redeem
      exchangeRate = await vUSDT.callStatic.exchangeRateCurrent();
      expectedRedeemAmount = new BigNumber(Number(accountBalance))
        .multipliedBy(Number(exchangeRate))
        .dividedBy(Number(convertToUnit(1, 18)))
        .plus(Number(balanceBefore))
        .toFixed(0);
      expect(expectedRedeemAmount).closeTo(balanceAfter, 10);
    });
  });
}

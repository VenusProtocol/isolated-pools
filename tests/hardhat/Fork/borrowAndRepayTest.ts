import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  BinanceOracle,
  BinanceOracle__factory,
  Comptroller,
  Comptroller__factory,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";
const FORK_MAINNET = process.env.FORK_MAINNET === "true";

let ADMIN: string;
let ACM: string;
let acc1: string;
let acc2: string;
let acc3: string;
let USDD: string;
let HAY: string;
let COMPTROLLER: string;
let VUSDD: string;
let VHAY: string;
let BLOCK_NUMBER: number;
let BINANCE_ORACLE: string;

if (FORK_TESTNET) {
  ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
  ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
  acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
  acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
  USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
  HAY = "0xe73774DfCD551BF75650772dC2cC56a2B6323453";
  COMPTROLLER = "0x10b57706AD2345e590c2eA4DC02faef0d9f5b08B";
  VUSDD = "0x899dDf81DfbbF5889a16D075c352F2b959Dd24A4";
  VHAY = "0x170d3b2da05cc2124334240fB34ad1359e34C562";
  BINANCE_ORACLE = "0xB58BFDCE610042311Dc0e034a80Cc7776c1D68f5";
  BLOCK_NUMBER = 30912551;
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vUSDD: VToken;
let vHAY: VToken;
let usdd: MockToken;
let hay: MockToken;
let priceOracle: ResilientOracleInterface;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let mintAmount: BigNumberish;
let hayBorrowAmount: BigNumberish;
let binanceOracle: BinanceOracle;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

async function configureVToken(vTokenAddress: string) {
  return VToken__factory.connect(vTokenAddress, impersonatedTimelock);
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
}

if (FORK_TESTNET || FORK_MAINNET) {
  describe("Borrow and Repay", async () => {
    mintAmount = convertToUnit("1", 21);
    hayBorrowAmount = convertToUnit("3", 20);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(acc3, ethers.utils.parseUnits("2"));

      hay = MockToken__factory.connect(HAY, impersonatedTimelock);
      usdd = MockToken__factory.connect(USDD, impersonatedTimelock);
      vHAY = await configureVToken(VHAY);
      vUSDD = await configureVToken(VUSDD);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      const oracle = await comptroller.oracle();
      priceOracle = ResilientOracleInterface__factory.connect(oracle, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vUSDD.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vUSDD.address]);
      await comptroller.connect(acc3Signer).enterMarkets([vHAY.address]);

      await comptroller.setMarketSupplyCaps(
        [vHAY.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vHAY.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );

      binanceOracle = BinanceOracle__factory.connect(BINANCE_ORACLE, impersonatedTimelock);
      await binanceOracle.connect(impersonatedTimelock).setMaxStalePeriod("HAY", 31536000);
    }
    beforeEach(async () => {
      await setup();

      // Allocate reserves to market from acc3 to the hay market
      await hay.connect(acc3Signer).faucet(convertToUnit(100000000000, 18));
      await hay.connect(acc3Signer).approve(vHAY.address, convertToUnit(100000000000, 18));
      await expect(vHAY.connect(acc3Signer).mint(convertToUnit(100000000000, 18))).to.emit(vHAY, "Mint");

      // Increase collateral for acc1
      await usdd.connect(acc1Signer).faucet(mintAmount);
      await usdd.connect(acc1Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc1Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");

      // Increase collateral for acc2
      await usdd.connect(acc2Signer).faucet(mintAmount);
      await usdd.connect(acc2Signer).approve(vUSDD.address, mintAmount);
      await expect(vUSDD.connect(acc2Signer).mint(mintAmount)).to.emit(vUSDD, "Mint");
    });

    it("Total Borrow Balance with Two Borrowers", async function () {
      // common factors
      const vUSDDCollateralFactor = await comptroller.markets(VUSDD);
      const exchangeRateCollateral = await vUSDD.exchangeRateStored();
      const USDDPrice = await priceOracle.getUnderlyingPrice(VUSDD);
      const HAYPrice = await priceOracle.getUnderlyingPrice(VHAY);
      const vTokenPrice = exchangeRateCollateral.mul(USDDPrice).div(convertToUnit(1, 18));
      const weighhtedPriceUsdd = vTokenPrice
        .mul(vUSDDCollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));
      const expectedMintAmount = (mintAmount * convertToUnit(1, 18)) / exchangeRateCollateral;

      // Acc1 pre borrow checks
      let expectedLiquidityAcc1 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // Acc2 pre borrow checks
      let expectedLiquidityAcc2 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc2);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc2));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // *************************Borrow Acc1**************************************************/
      await expect(vHAY.connect(acc1Signer).borrow(hayBorrowAmount)).to.be.emit(vHAY, "Borrow");
      const borrowIndexAcc1Prev = await vHAY.borrowIndex();

      // Acc1 post borrow checks
      expect(hayBorrowAmount).equals(await vHAY.borrowBalanceStored(acc1));
      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(HAYPrice.mul(hayBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vHAY.accrueInterest();
      let borrowIndexCurrent = await vHAY.borrowIndex();

      // Change borrow balance of acc1
      let borrowBalanceStored = await vHAY.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(hayBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // *************************Borrow Acc2**************************************************/
      await expect(vHAY.connect(acc2Signer).borrow(hayBorrowAmount)).to.be.emit(vHAY, "Borrow");
      const borrowIndexAcc2Prev = await vHAY.borrowIndex();

      // Acc2 post borrow checks
      expect(hayBorrowAmount).equals(await vHAY.borrowBalanceStored(acc2));
      expectedLiquidityAcc2 = expectedLiquidityAcc2.sub(HAYPrice.mul(hayBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc2);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vHAY.accrueInterest();
      borrowIndexCurrent = await vHAY.borrowIndex();

      // Change borrow balance of acc1
      borrowBalanceStored = await vHAY.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(hayBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // Change borrow balance of acc2
      borrowBalanceStored = await vHAY.borrowBalanceStored(acc2);
      expect(borrowIndexCurrent.mul(hayBorrowAmount).div(borrowIndexAcc2Prev)).equals(borrowBalanceStored);

      // *************************Repay Acc2**************************************************/

      // Allocate some funds to repay debt
      await vHAY.accrueInterest();
      borrowBalanceStored = await vHAY.borrowBalanceStored(acc2);
      await hay.connect(acc2Signer).faucet(borrowBalanceStored.add(convertToUnit(1, 20)));
      await hay.connect(acc2Signer).approve(vHAY.address, borrowBalanceStored.add(convertToUnit(1, 20)));
      await vHAY.connect(acc2Signer).repayBorrow(borrowBalanceStored.add(convertToUnit(1, 20)));

      // Full debt repaid acc2
      borrowBalanceStored = await vHAY.borrowBalanceStored(acc2);
      expect(borrowBalanceStored).equals(0);

      // acc1 balance checks
      await vHAY.accrueInterest();
      borrowIndexCurrent = await vHAY.borrowIndex();
      borrowBalanceStored = await vHAY.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(hayBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);
    });

    it("Attempt to borrow over set cap", async function () {
      const vUSDDCollateralFactor = await comptroller.markets(VUSDD);
      const exchangeRateCollateral = await vUSDD.exchangeRateStored();
      const USDDPrice = await priceOracle.getUnderlyingPrice(VUSDD);
      const HAYPrice = await priceOracle.getUnderlyingPrice(VHAY);
      const vTokenPrice = exchangeRateCollateral.mul(USDDPrice).div(convertToUnit(1, 18));
      const weighhtedPriceUsdd = vTokenPrice
        .mul(vUSDDCollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));
      const expectedMintAmount = (mintAmount * convertToUnit(1, 18)) / exchangeRateCollateral;

      // checks
      let expectedLiquidityAcc1 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // *************************Borrow**************************************************/
      await expect(vHAY.connect(acc1Signer).borrow(hayBorrowAmount)).to.be.emit(vHAY, "Borrow");
      expect(hayBorrowAmount).equals(await vHAY.borrowBalanceStored(acc1));

      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(HAYPrice.mul(hayBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // **************************Set borrow caap zero***********************************/
      await comptroller.setMarketBorrowCaps([VHAY], [0]);
      await expect(vHAY.connect(acc1Signer).borrow(hayBorrowAmount)).to.be.revertedWithCustomError(
        comptroller,
        "BorrowCapExceeded",
      );
    });
  });
}

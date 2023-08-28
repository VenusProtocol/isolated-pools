import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  BinanceOracle,
  BinanceOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import CONTRACT_ADDRESSES from "./constants/Contracts.json";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";
const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const network = process.env.NETWORK_NAME;

const {
  ACM,
  ACC1,
  ACC2,
  ACC3,
  ADMIN,
  USDC_HOLDER,
  USDC,
  VUSDC,
  USDD,
  VUSDD,
  HAY,
  VHAY,
  HAY_HOLDER,
  USDD_HOLDER,
  COMPTROLLER,
  BLOCK_NUMBER,
  BINANCE_ORACLE
} = CONTRACT_ADDRESSES[network as string];

const TOKEN2: string = HAY; // TOKEN2 = HAY
const VTOKEN2: string = VHAY; // VTOKEN2 = VHAY
const TOKEN2_HOLDER: string = HAY_HOLDER;

let TOKEN1: string;
let VTOKEN1: string;
let TOKEN1_HOLDER: string;

if (network == "sepolia") {
  TOKEN1 = USDC; // TOKEN1 = USDC
  VTOKEN1 = VUSDC; // VTOKEN2 = VUSDC
  TOKEN1_HOLDER = USDC_HOLDER;
} else {
  TOKEN1 = USDD; // TOKEN1 = USDD
  VTOKEN1 = VUSDD; // VTOKEN1 = VUSDD
  TOKEN1_HOLDER = USDD_HOLDER;
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let token1: IERC20;
let token2: IERC20;
let priceOracle: ResilientOracleInterface;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let token2Holder: Signer;
let token1Holder: Signer;
let mintAmount: BigNumber;
let TOKEN2BorrowAmount: BigNumberish;
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
    mintAmount = BigNumber.from(convertToUnit(1, 21));
    TOKEN2BorrowAmount = convertToUnit("3", 20);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);

      await configureTimelock();
      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(ACC3, ethers.utils.parseUnits("2")); // it will be the depositor
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));

      if (network == "bsc") {
        binanceOracle = BinanceOracle__factory.connect(BINANCE_ORACLE, impersonatedTimelock);
        await binanceOracle.setMaxStalePeriod("HAY", BigInt(150000000000000000));
        await binanceOracle.setMaxStalePeriod("USDD", BigInt(150000000000000000))
      }
      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);

      vTOKEN2 = await configureVToken(VTOKEN2);
      vTOKEN1 = await configureVToken(VTOKEN1);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      const oracle = await comptroller.oracle();
      priceOracle = ResilientOracleInterface__factory.connect(oracle, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN1.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN1.address]);
      await comptroller.connect(acc3Signer).enterMarkets([vTOKEN2.address]);

      await comptroller.setMarketSupplyCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vTOKEN2.address, vTOKEN1.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
    }
    beforeEach(async () => {
      await setup();

      // Allocate reserves to market from ACC3 to the TOKEN2 market
      await token2.connect(token2Holder).approve(vTOKEN2.address, convertToUnit(10000, 18));
      await expect(vTOKEN2.connect(token2Holder).mint(convertToUnit(10000, 18))).to.emit(vTOKEN2, "Mint");

      // Increase collateral for ACC
      await token1.connect(token1Holder).transfer(ACC1, mintAmount);
      await token1.connect(acc1Signer).approve(vTOKEN1.address, mintAmount);

      // Increase collateral for ACC2
      await token1.connect(token1Holder).transfer(ACC2, mintAmount);
      await token1.connect(acc2Signer).approve(vTOKEN1.address, mintAmount);
    });

    it("Total Borrow Balance with Two Borrowers", async function () {
      // common factors
      const vTOKEN1CollateralFactor = await comptroller.markets(VTOKEN1);

      await expect(vTOKEN1.connect(acc1Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

      let exchangeRateCollateral = await vTOKEN1.exchangeRateStored();

      let TOKEN1Price = await priceOracle.getUnderlyingPrice(VTOKEN1);
      let TOKEN2Price = await priceOracle.getUnderlyingPrice(VTOKEN2);

      let vTokenPrice = exchangeRateCollateral.mul(TOKEN1Price).div(convertToUnit(1, 18));

      let weighhtedPriceTOKEN1 = vTokenPrice
        .mul(vTOKEN1CollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));

      let expectedMintAmount = mintAmount.mul(convertToUnit(1, 18)).div(exchangeRateCollateral);

      // ACC1 pre borrow checks
      let expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);
      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(ACC1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // Acc2 pre borrow checks
      await expect(vTOKEN1.connect(acc2Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");
      exchangeRateCollateral = await vTOKEN1.exchangeRateStored();

      TOKEN1Price = await priceOracle.getUnderlyingPrice(VTOKEN1);

      TOKEN2Price = await priceOracle.getUnderlyingPrice(VTOKEN2);

      vTokenPrice = exchangeRateCollateral.mul(TOKEN1Price).div(convertToUnit(1, 18));

      weighhtedPriceTOKEN1 = vTokenPrice
        .mul(vTOKEN1CollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));
      expectedMintAmount = mintAmount.mul(convertToUnit(1, 18)).div(await vTOKEN1.exchangeRateStored());

      expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(await vTOKEN1.balanceOf(ACC1)).div(convertToUnit(1, 18));

      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC2);

      let expectedLiquidityAcc2 = weighhtedPriceTOKEN1.mul(expectedMintAmount).div(convertToUnit(1, 18));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC2);
      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(ACC2));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // *************************Borrow Acc1**************************************************/

      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);
      expect(liquidity).equals(expectedLiquidityAcc1);

      await expect(vTOKEN2.connect(acc1Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);
      const borrowIndexAcc1Prev = await vTOKEN2.borrowIndex();

      // Acc1 post borrow checks
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(ACC1));
      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(TOKEN2Price.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1); // ************************************
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vTOKEN2.accrueInterest();
      let borrowIndexCurrent = await vTOKEN2.borrowIndex();

      // Change borrow balance of acc1
      let borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC1);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // *************************Borrow Acc2**************************************************/
      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      const borrowIndexAcc2Prev = await vTOKEN2.borrowIndex();

      // Acc2 post borrow checks
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(ACC2));
      expectedLiquidityAcc2 = expectedLiquidityAcc2.sub(TOKEN2Price.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC2);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vTOKEN2.accrueInterest();
      borrowIndexCurrent = await vTOKEN2.borrowIndex();

      // Change borrow balance of ACC1
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC1);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // Change borrow balance of ACC2
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC2);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc2Prev)).equals(borrowBalanceStored);

      // *************************Repay ACC2**************************************************/

      // Allocate some funds to repay debt
      await vTOKEN2.accrueInterest();
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC2);

      await token2.connect(token2Holder).transfer(ACC2, borrowBalanceStored.add(convertToUnit(1, 20)));
      await token2.connect(acc2Signer).approve(vTOKEN2.address, borrowBalanceStored.add(convertToUnit(1, 20)));
      await vTOKEN2.connect(acc2Signer).repayBorrow(borrowBalanceStored.add(convertToUnit(1, 20)));

      // Full debt repaid acc2
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC2);
      expect(borrowBalanceStored).equals(0);

      // acc1 balance checks
      await vTOKEN2.accrueInterest();
      borrowIndexCurrent = await vTOKEN2.borrowIndex();
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC1);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);
    });

    it("Attempt to borrow over set cap", async function () {
      const vTOKEN1CollateralFactor = await comptroller.markets(VTOKEN1);
      await expect(vTOKEN1.connect(acc1Signer).mint(mintAmount)).to.emit(vTOKEN1, "Mint");

      const exchangeRateCollateral = await vTOKEN1.exchangeRateStored();
      const USDDPrice = await priceOracle.getUnderlyingPrice(VTOKEN1);
      const HAYPrice = await priceOracle.getUnderlyingPrice(VTOKEN2);
      const vTokenPrice = exchangeRateCollateral.mul(USDDPrice).div(convertToUnit(1, 18));
      const weighhtedPriceTOKEN1 = vTokenPrice
        .mul(vTOKEN1CollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));

      const expectedMintAmount = mintAmount.mul(convertToUnit(1, 18)).div(await vTOKEN1.exchangeRateStored());

      // checks
      let expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(await vTOKEN1.balanceOf(ACC1)).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);

      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(ACC1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // *************************Borrow**************************************************/
      await expect(vTOKEN2.connect(acc1Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(ACC1));

      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(HAYPrice.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(ACC1);
      expect(err).equals(0);
      expect(liquidity).to.be.closeTo(BigNumber.from(expectedLiquidityAcc1), 325002723328);
      expect(shortfall).equals(0);

      // **************************Set borrow caap zero***********************************/
      await comptroller.setMarketBorrowCaps([VTOKEN2], [0]);
      await expect(vTOKEN2.connect(acc1Signer).borrow(TOKEN2BorrowAmount)).to.be.revertedWithCustomError(
        comptroller,
        "BorrowCapExceeded",
      );
    });
  });
}

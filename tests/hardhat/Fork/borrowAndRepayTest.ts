import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  ChainlinkOracle,
  ChainlinkOracle__factory,
  Comptroller,
  Comptroller__factory,
  MockToken,
  MockToken__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";
const FORK_MAINNET = process.env.FORK_MAINNET === "true";

let ADMIN: string;
let ORACLE_ADMIN: string;
let ACM: string;
let ORACLE: string;
let acc1: string;
let acc2: string;
let acc3: string;
let USDD: string;
let BSW: string;
let COMPTROLLER: string;
let VUSDD: string;
let VBSW: string;

if (FORK_TESTNET) {
  ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
  ORACLE_ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
  ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
  ORACLE = "0xfc4e26B7fD56610E84d33372435F0275A359E8eF";
  acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
  acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
  USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
  BSW = "0x7FCC76fc1F573d8Eb445c236Cc282246bC562bCE";
  COMPTROLLER = "0x5bCe7102339B3865ba7ceA8602d5B61db9980827";
  VUSDD = "0x9b921bbcdc18030540bcb341b1fec7fa00f7bee5";
  VBSW = "0x7250b36b8971adf911f0d82c162634de684fc9b3";
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let impersonatedOracleOwner: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vUSDD: VToken;
let vBSW: VToken;
let usdd: MockToken;
let bsw: MockToken;
let priceOracle: ChainlinkOracle;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let mintAmount: BigNumberish;
let bswBorrowAmount: BigNumberish;

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
}

if (FORK_TESTNET || FORK_MAINNET) {
  describe("Borrow and Repay", async () => {
    mintAmount = convertToUnit("1", 21);
    bswBorrowAmount = convertToUnit("7", 20);

    async function setup() {
      await setForkBlock(30080357);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(acc3, ethers.utils.parseUnits("2"));

      bsw = MockToken__factory.connect(BSW, impersonatedTimelock);
      usdd = MockToken__factory.connect(USDD, impersonatedTimelock);
      vBSW = await configureVToken(VBSW);
      vUSDD = await configureVToken(VUSDD);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      priceOracle = ChainlinkOracle__factory.connect(ORACLE, impersonatedOracleOwner);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vUSDD.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vUSDD.address]);
      await comptroller.connect(acc3Signer).enterMarkets([vBSW.address]);

      await comptroller.setMarketSupplyCaps(
        [vBSW.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
      await comptroller.setMarketBorrowCaps(
        [vBSW.address, vUSDD.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );
    }
    beforeEach(async () => {
      await setup();

      // Allocate reserves to market from acc3 to the bsw market
      await bsw.connect(acc3Signer).faucet(convertToUnit(100000000000, 18));
      await bsw.connect(acc3Signer).approve(vBSW.address, convertToUnit(100000000000, 18));
      await expect(vBSW.connect(acc3Signer).mint(convertToUnit(100000000000, 18))).to.emit(vBSW, "Mint");

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
      const vUSDDPrice = await priceOracle.getUnderlyingPrice(VUSDD);
      const vBSWPrice = await priceOracle.getUnderlyingPrice(VBSW);
      const vTokenPrice = exchangeRateCollateral.mul(vUSDDPrice).div(convertToUnit(1, 18));
      const weighhtedPriceUsdd = vTokenPrice
        .mul(vUSDDCollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));
      const expectedMintAmount = (mintAmount * convertToUnit(1, 18)) / exchangeRateCollateral;

      // Acc1 pre borrow checks
      let expectedLiquidityAcc1 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc1);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // Acc2 pre borrow checks
      let expectedLiquidityAcc2 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc2);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc2));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // *************************Borrow Acc1**************************************************/
      await expect(vBSW.connect(acc1Signer).borrow(bswBorrowAmount)).to.be.emit(vBSW, "Borrow");
      const borrowIndexAcc1Prev = await vBSW.borrowIndex();

      // Acc1 post borrow checks
      expect(bswBorrowAmount).equals(await vBSW.borrowBalanceStored(acc1));
      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(vBSWPrice.mul(bswBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vBSW.accrueInterest();
      let borrowIndexCurrent = await vBSW.borrowIndex();

      // Change borrow balance of acc1
      let borrowBalanceStored = await vBSW.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(bswBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // *************************Borrow Acc2**************************************************/
      await expect(vBSW.connect(acc2Signer).borrow(bswBorrowAmount)).to.be.emit(vBSW, "Borrow");
      const borrowIndexAcc2Prev = await vBSW.borrowIndex();

      // Acc2 post borrow checks
      expect(bswBorrowAmount).equals(await vBSW.borrowBalanceStored(acc2));
      expectedLiquidityAcc2 = expectedLiquidityAcc2.sub(vBSWPrice.mul(bswBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc2);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vBSW.accrueInterest();
      borrowIndexCurrent = await vBSW.borrowIndex();

      // Change borrow balance of acc1
      borrowBalanceStored = await vBSW.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(bswBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // Change borrow balance of acc2
      borrowBalanceStored = await vBSW.borrowBalanceStored(acc2);
      expect(borrowIndexCurrent.mul(bswBorrowAmount).div(borrowIndexAcc2Prev)).equals(borrowBalanceStored);

      // *************************Repay Acc2**************************************************/

      // Allocate some funds to repay debt
      await vBSW.accrueInterest();
      borrowBalanceStored = await vBSW.borrowBalanceStored(acc2);
      await bsw.connect(acc2Signer).faucet(borrowBalanceStored.add(convertToUnit(1, 20)));
      await bsw.connect(acc2Signer).approve(vBSW.address, borrowBalanceStored.add(convertToUnit(1, 20)));
      await vBSW.connect(acc2Signer).repayBorrow(borrowBalanceStored.add(convertToUnit(1, 20)));

      // Full debt repaid acc2
      borrowBalanceStored = await vBSW.borrowBalanceStored(acc2);
      expect(borrowBalanceStored).equals(0);

      // acc1 balance checks
      await vBSW.accrueInterest();
      borrowIndexCurrent = await vBSW.borrowIndex();
      borrowBalanceStored = await vBSW.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(bswBorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);
    });

    it("Attempt to borrow over set cap", async function () {
      const vUSDDCollateralFactor = await comptroller.markets(VUSDD);
      const exchangeRateCollateral = await vUSDD.exchangeRateStored();
      const vUSDDPrice = await priceOracle.getUnderlyingPrice(VUSDD);
      const vBSWPrice = await priceOracle.getUnderlyingPrice(VBSW);
      const vTokenPrice = exchangeRateCollateral.mul(vUSDDPrice).div(convertToUnit(1, 18));
      const weighhtedPriceUsdd = vTokenPrice
        .mul(vUSDDCollateralFactor.collateralFactorMantissa)
        .div(convertToUnit(1, 18));
      const expectedMintAmount = (mintAmount * convertToUnit(1, 18)) / exchangeRateCollateral;

      // checks
      let expectedLiquidityAcc1 = weighhtedPriceUsdd.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc1);

      expect(expectedMintAmount).equals(await vUSDD.balanceOf(acc1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // *************************Borrow**************************************************/
      await expect(vBSW.connect(acc1Signer).borrow(bswBorrowAmount)).to.be.emit(vBSW, "Borrow");
      expect(bswBorrowAmount).equals(await vBSW.borrowBalanceStored(acc1));

      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(vBSWPrice.mul(bswBorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(acc1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // **************************Set borrow caap zero***********************************/
      await comptroller.setMarketBorrowCaps([VBSW], [0]);
      await expect(vBSW.connect(acc1Signer).borrow(bswBorrowAmount)).to.be.revertedWithCustomError(
        comptroller,
        "BorrowCapExceeded",
      );
    });
  });
}

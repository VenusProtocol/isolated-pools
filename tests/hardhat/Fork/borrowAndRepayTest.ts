import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
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
const network = process.env.NETWORK_NAME;

let ADMIN: string;
let ACM: string;
let acc1: string;
let acc2: string;
let acc3: string;
let TOKEN1: string;
let TOKEN2: string;
let COMPTROLLER: string;
let VTOKEN1: string;
let VTOKEN2: string;
let BLOCK_NUMBER: number;

if (FORK_TESTNET) {
  if (network == "sepolia") {
    ADMIN = "0xcd2a514f04241b7c9A0d5d54441e92E4611929CF";
    ACM = "0x799700ea540f002134C371fB955e2392FD94DbCD";
    acc1 = "0x3Ac99C7853b58f4AA38b309D372562a5A88bB9C1";
    acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
    acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
    TOKEN1 = "0x16ffae6A9b4DcDb4a626Ee35721Aa748F0902D9C"; // TOKEN1 = USDC
    TOKEN2 = "0xA33524BeFb504152EFBfB4433501D42BCA90e704"; // TOKEN2 = TOKEN2
    COMPTROLLER = "0xa8cD3a5A542A71D276b35A6AFBb373d37824991a";
    VTOKEN2 = "0x5f22a9b867295F4e9fAff66a83a25BdD361807eD"; // VTOKEN1 = VTOKEN2
    VTOKEN1 = "0x6BF77cE5A5b21fe2175cDeeD728cD5Af5aa53A50"; // VTOKEN2 = VUSDC
    BLOCK_NUMBER = 3998891;
  } else if (network == "bsctestnet") {
    ADMIN = "0xce10739590001705F7FF231611ba4A48B2820327";
    ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
    acc1 = "0x9cc6F5f16498fCEEf4D00A350Bd8F8921D304Dc9";
    acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
    acc3 = "0x394d1d517e8269596a7E4Cd1DdaC1C928B3bD8b3";
    TOKEN1 = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382"; // TOKEN1 = USDD
    TOKEN2 = "0xe73774DfCD551BF75650772dC2cC56a2B6323453"; // TOKEN2 = HAY
    COMPTROLLER = "0x10b57706AD2345e590c2eA4DC02faef0d9f5b08B";
    VTOKEN1 = "0x899dDf81DfbbF5889a16D075c352F2b959Dd24A4"; // VTOKEN1 = VUSDD
    VTOKEN2 = "0x170d3b2da05cc2124334240fB34ad1359e34C562"; // VTOKEN2 = VHAY
    BLOCK_NUMBER = 31912551;
  }
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vTOKEN1: VToken;
let vTOKEN2: VToken;
let token1: MockToken;
let token2: MockToken;
let priceOracle: ResilientOracleInterface;
let acc1Signer: Signer;
let acc2Signer: Signer;
let acc3Signer: Signer;
let mintAmount: BigNumber;
let TOKEN2BorrowAmount: BigNumberish;

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
      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      acc3Signer = await initMainnetUser(acc3, ethers.utils.parseUnits("2"));

      token2 = MockToken__factory.connect(TOKEN2, impersonatedTimelock);
      token1 = MockToken__factory.connect(TOKEN1, impersonatedTimelock);
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

      // Allocate reserves to market from acc3 to the TOKEN2 market
      await token2.connect(acc3Signer).faucet(convertToUnit(100000000000, 18));
      await token2.connect(acc3Signer).approve(vTOKEN2.address, convertToUnit(100000000000, 18));
      await expect(vTOKEN2.connect(acc3Signer).mint(convertToUnit(100000000000, 18))).to.emit(vTOKEN2, "Mint");

      // Increase collateral for acc1
      await token1.connect(acc1Signer).faucet(mintAmount);
      await token1.connect(acc1Signer).approve(vTOKEN1.address, mintAmount);

      // Increase collateral for acc2
      await token1.connect(acc2Signer).faucet(mintAmount);
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

      // Acc1 pre borrow checks
      let expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(expectedMintAmount).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(acc1));
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

      expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(await vTOKEN1.balanceOf(acc1)).div(convertToUnit(1, 18));

      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc2);

      let expectedLiquidityAcc2 = weighhtedPriceTOKEN1.mul(expectedMintAmount).div(convertToUnit(1, 18));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc2);
      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(acc2));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // *************************Borrow Acc1**************************************************/

      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      expect(liquidity).equals(expectedLiquidityAcc1);

      await expect(vTOKEN2.connect(acc1Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      const borrowIndexAcc1Prev = await vTOKEN2.borrowIndex();

      // Acc1 post borrow checks
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(acc1));
      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(TOKEN2Price.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1); // ************************************
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vTOKEN2.accrueInterest();
      let borrowIndexCurrent = await vTOKEN2.borrowIndex();

      // Change borrow balance of acc1
      let borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // *************************Borrow Acc2**************************************************/
      await expect(vTOKEN2.connect(acc2Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      const borrowIndexAcc2Prev = await vTOKEN2.borrowIndex();

      // Acc2 post borrow checks
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(acc2));
      expectedLiquidityAcc2 = expectedLiquidityAcc2.sub(TOKEN2Price.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc2);
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc2);
      expect(shortfall).equals(0);

      // ********************************Mine 300000 blocks***********************************/
      await mine(300000);
      await vTOKEN2.accrueInterest();
      borrowIndexCurrent = await vTOKEN2.borrowIndex();

      // Change borrow balance of acc1
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc1);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc1Prev)).equals(borrowBalanceStored);

      // Change borrow balance of acc2
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc2);
      expect(borrowIndexCurrent.mul(TOKEN2BorrowAmount).div(borrowIndexAcc2Prev)).equals(borrowBalanceStored);

      // *************************Repay Acc2**************************************************/

      // Allocate some funds to repay debt
      await vTOKEN2.accrueInterest();
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc2);
      await token2.connect(acc2Signer).faucet(borrowBalanceStored.add(convertToUnit(1, 20)));
      await token2.connect(acc2Signer).approve(vTOKEN2.address, borrowBalanceStored.add(convertToUnit(1, 20)));
      await vTOKEN2.connect(acc2Signer).repayBorrow(borrowBalanceStored.add(convertToUnit(1, 20)));

      // Full debt repaid acc2
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc2);
      expect(borrowBalanceStored).equals(0);

      // acc1 balance checks
      await vTOKEN2.accrueInterest();
      borrowIndexCurrent = await vTOKEN2.borrowIndex();
      borrowBalanceStored = await vTOKEN2.borrowBalanceStored(acc1);
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
      let expectedLiquidityAcc1 = weighhtedPriceTOKEN1.mul(await vTOKEN1.balanceOf(acc1)).div(convertToUnit(1, 18));
      let [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);

      expect(expectedMintAmount).equals(await vTOKEN1.balanceOf(acc1));
      expect(err).equals(0);
      expect(liquidity).equals(expectedLiquidityAcc1);
      expect(shortfall).equals(0);

      // *************************Borrow**************************************************/
      await expect(vTOKEN2.connect(acc1Signer).borrow(TOKEN2BorrowAmount)).to.be.emit(vTOKEN2, "Borrow");
      expect(TOKEN2BorrowAmount).equals(await vTOKEN2.borrowBalanceStored(acc1));

      expectedLiquidityAcc1 = expectedLiquidityAcc1.sub(HAYPrice.mul(TOKEN2BorrowAmount).div(convertToUnit(1, 18)));
      [err, liquidity, shortfall] = await comptroller.getBorrowingPower(acc1);
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

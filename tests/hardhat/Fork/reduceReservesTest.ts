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
  IERC20,
  IERC20__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { ACC1, ACC2, ACM, ADMIN, PSR, TOKEN1_HOLDER, TOKEN1, VTOKEN1, COMPTROLLER, BLOCK_NUMBER } = getContractAddresses(
  FORKED_NETWORK as string,
);

let token1Holder: string;
let accessControlManager: AccessControlManager;
let token1: IERC20;
let vTOKEN1: VToken;

let comptroller: Comptroller;
let acc1Signer: Signer;
let acc2Signer: Signer;
let impersonatedTimelock: Signer;
let mintAmount: BigNumberish;
let TOKEN1BorrowAmount: BigNumberish;

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
}

if (FORK) {
  describe("Reduce Reserves", async () => {
    mintAmount = convertToUnit("1000", 18);
    TOKEN1BorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      token1Holder = await initMainnetUser(TOKEN1_HOLDER, ethers.utils.parseUnits("2"));

      token1 = IERC20__factory.connect(TOKEN1, impersonatedTimelock);
      vTOKEN1 = await configureVToken(VTOKEN1);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN1.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN1.address]);

      await comptroller.setMarketSupplyCaps([vTOKEN1.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vTOKEN1.address], [convertToUnit(1, 50)]);
    }

    async function mintVTokens(signer: Signer, token: IERC20, vToken: VToken, amount: BigNumberish) {
      await token.connect(token1Holder).transfer(await signer.getAddress(), amount);
      await token.connect(signer).approve(vToken.address, amount);
      await expect(vToken.connect(signer).mint(amount)).to.emit(vToken, "Mint");
    }

    beforeEach(async () => {
      await setup();
      // Mint some tokens in vTOKEN1 market to add underlying assets for borrow and reserves purpose
      await mintVTokens(acc2Signer, token1, vTOKEN1, mintAmount);
    });

    it("Reduce partial reserves and verify effects", async function () {
      let totalCashOld = await vTOKEN1.getCash();
      await mintVTokens(acc1Signer, token1, vTOKEN1, mintAmount);
      let totalCashNew = await vTOKEN1.getCash();

      expect(totalCashNew.sub(totalCashOld)).equals(mintAmount);

      totalCashOld = totalCashNew;
      await vTOKEN1.connect(acc2Signer).borrow(TOKEN1BorrowAmount);
      totalCashNew = await vTOKEN1.getCash();

      expect(totalCashOld.sub(totalCashNew)).equals(TOKEN1BorrowAmount);

      // MINE 300000 BLOCKS
      await mine(300000);

      // Save states just before accruing interests
      const accrualBlockNumberPrior = await vTOKEN1.accrualBlockNumber();
      const borrowRatePrior = await vTOKEN1.borrowRatePerBlock();
      const totalBorrowsPrior = await vTOKEN1.totalBorrows();
      const reserveBefore = await vTOKEN1.totalReserves();
      const psrBalancePrior = await token1.balanceOf(PSR);

      await vTOKEN1.accrueInterest();

      // Calculation of reserves
      const currBlock = await ethers.provider.getBlockNumber();
      const blockDelta = BigNumber.from(currBlock).sub(BigNumber.from(accrualBlockNumberPrior));
      const simpleInterestFactor = borrowRatePrior.mul(blockDelta);
      const interestAccumulated = simpleInterestFactor.mul(totalBorrowsPrior).div(convertToUnit(1, 18));
      const reserveFactorMantissa = await vTOKEN1.reserveFactorMantissa();
      const totalReservesExpected = reserveFactorMantissa.mul(interestAccumulated).div(convertToUnit(1, 18));
      const psrBalanceNew = await token1.balanceOf(PSR);

      const psrBalanceDiff = psrBalanceNew.sub(psrBalancePrior);
      let totalReservesCurrent = BigNumber.from((await vTOKEN1.totalReserves()).add(psrBalanceDiff)).sub(reserveBefore);

      expect(totalReservesExpected).equals(totalReservesCurrent);

      // Calculation of exchange rate
      let exchangeRateStored = await vTOKEN1.exchangeRateStored();
      totalCashNew = await vTOKEN1.getCash();
      let totalSupply = await vTOKEN1.totalSupply();
      let badDebt = await vTOKEN1.badDebt();
      let totalBorrowCurrent = await vTOKEN1.totalBorrows();
      let cashPlusBorrowsMinusReserves = totalCashNew
        .add(totalBorrowCurrent)
        .add(badDebt)
        .sub(await vTOKEN1.totalReserves());
      let exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);

      expect(exchangeRateExpected).equals(exchangeRateStored);

      // Reduce reserves
      await vTOKEN1.accrueInterest();
      totalCashOld = await vTOKEN1.getCash();
      const totalReservesOld = await vTOKEN1.totalReserves();
      const reduceAmount = totalReservesOld.mul(50).div(100);
      const protocolShareBalanceOld = await token1.balanceOf(PSR);

      const psrBalanceBefore = await token1.balanceOf(PSR);
      await vTOKEN1.reduceReserves(reduceAmount);
      const psrBalanceAfter = await token1.balanceOf(PSR);

      totalReservesCurrent = await vTOKEN1.totalReserves();
      expect(psrBalanceAfter.sub(psrBalanceBefore)).to.be.equal(reduceAmount);

      const protocolShareBalanceNew = await token1.balanceOf(PSR);
      expect(protocolShareBalanceNew.sub(protocolShareBalanceOld)).equals(reduceAmount);

      totalCashNew = await vTOKEN1.getCash();
      expect(totalCashOld.sub(totalCashNew)).equals(reduceAmount);

      exchangeRateStored = await vTOKEN1.exchangeRateStored();
      totalCashNew = await vTOKEN1.getCash();
      totalSupply = await vTOKEN1.totalSupply();
      badDebt = await vTOKEN1.badDebt();
      totalBorrowCurrent = await vTOKEN1.totalBorrows();
      cashPlusBorrowsMinusReserves = totalCashNew.add(totalBorrowCurrent).add(badDebt).sub(totalReservesCurrent);
      exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);
      expect(exchangeRateExpected).equals(exchangeRateStored);
    });
  });
}

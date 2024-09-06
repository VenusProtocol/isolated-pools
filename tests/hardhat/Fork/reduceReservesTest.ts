import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers, network } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, mineOnZksync, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { ACC1, ACC2, ADMIN, PSR, TOKEN2_HOLDER, TOKEN2, VTOKEN2, COMPTROLLER, BLOCK_NUMBER } = getContractAddresses(
  FORKED_NETWORK as string,
);

let holder: string;
let token: IERC20;
let vToken: VToken;

let comptroller: Comptroller;
let acc1Signer: Signer;
let acc2Signer: Signer;
let impersonatedTimelock: Signer;
let mintAmount: BigNumberish;
let borrowAmount: BigNumberish;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

async function configureVToken(vTokenAddress: string) {
  const VToken = VToken__factory.connect(vTokenAddress, impersonatedTimelock);
  return VToken;
}

if (FORK) {
  describe("Reduce Reserves", async () => {
    mintAmount = convertToUnit("1000", 18);
    borrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2000000"));

      token = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      vToken = await configureVToken(VTOKEN2);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);

      await comptroller.connect(acc1Signer).enterMarkets([vToken.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vToken.address]);

      await comptroller.setMarketSupplyCaps([vToken.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vToken.address], [convertToUnit(1, 50)]);
    }

    async function mintVTokens(signer: Signer, token: IERC20, vToken: VToken, amount: BigNumberish) {
      await token.connect(holder).transfer(await signer.getAddress(), amount);
      await token.connect(signer).approve(vToken.address, amount);
      await expect(vToken.connect(signer).mint(amount)).to.emit(vToken, "Mint");
    }

    beforeEach(async () => {
      await setup();
      // Mint some tokens in vToken market to add underlying assets for borrow and reserves purpose
      await mintVTokens(acc2Signer, token, vToken, mintAmount);
    });

    it("Reduce partial reserves and verify effects", async function () {
      let totalCashOld = await vToken.getCash();
      await mintVTokens(acc1Signer, token, vToken, mintAmount);
      let totalCashNew = await vToken.getCash();

      expect(totalCashNew.sub(totalCashOld)).equals(mintAmount);

      totalCashOld = totalCashNew;
      await vToken.connect(acc2Signer).borrow(borrowAmount);
      totalCashNew = await vToken.getCash();

      expect(totalCashOld.sub(totalCashNew)).equals(borrowAmount);

      // MINE 300000 BLOCKS
      if (FORKED_NETWORK == "zksyncsepolia") {
        await mineOnZksync(300000);
      } else {
        await mine(300000);
      }

      // Save states just before accruing interests
      const accrualBlockNumberPrior = await vToken.accrualBlockNumber();
      const borrowRatePrior = await vToken.borrowRatePerBlock();
      const totalBorrowsPrior = await vToken.totalBorrows();
      const reserveBefore = await vToken.totalReserves();
      const psrBalancePrior = await token.balanceOf(PSR);

      await vToken.accrueInterest();

      // Calculation of reserves
      let currBlockOrTimestamp = await ethers.provider.getBlockNumber();

      if (FORKED_NETWORK == "arbitrumsepolia" || FORKED_NETWORK == "arbitrumone" || FORKED_NETWORK == "zksyncsepolia") {
        currBlockOrTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      }

      let blockDelta = BigNumber.from(currBlockOrTimestamp).sub(BigNumber.from(accrualBlockNumberPrior));
      // Hardhat mine one extra block in mineOnZksync for Zksync
      if (FORKED_NETWORK == "zksyncsepolia") {
        blockDelta = blockDelta.sub(1);
      }
      const simpleInterestFactor = borrowRatePrior.mul(blockDelta);
      const interestAccumulated = simpleInterestFactor.mul(totalBorrowsPrior).div(convertToUnit(1, 18));
      const reserveFactorMantissa = await vToken.reserveFactorMantissa();
      const totalReservesExpected = reserveFactorMantissa.mul(interestAccumulated).div(convertToUnit(1, 18));
      const psrBalanceNew = await token.balanceOf(PSR);
      const psrBalanceDiff = psrBalanceNew.sub(psrBalancePrior);
      let totalReservesCurrent = BigNumber.from((await vToken.totalReserves()).add(psrBalanceDiff)).sub(reserveBefore);

      expect(totalReservesExpected).equals(totalReservesCurrent);
      // Calculation of exchange rate
      let exchangeRateStored = await vToken.exchangeRateStored();
      totalCashNew = await vToken.getCash();
      let totalSupply = await vToken.totalSupply();
      let badDebt = await vToken.badDebt();
      let totalBorrowCurrent = await vToken.totalBorrows();
      let cashPlusBorrowsMinusReserves = totalCashNew
        .add(totalBorrowCurrent)
        .add(badDebt)
        .sub(await vToken.totalReserves());
      let exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);

      expect(exchangeRateExpected).equals(exchangeRateStored);
      // Reduce reserves
      await vToken.accrueInterest();
      totalCashOld = await vToken.getCash();
      const totalReservesOld = await vToken.totalReserves();
      const reduceAmount = totalReservesOld.mul(50).div(100);
      const protocolShareBalanceOld = await token.balanceOf(PSR);

      const psrBalanceBefore = await token.balanceOf(PSR);
      await vToken.reduceReserves(reduceAmount);
      const psrBalanceAfter = await token.balanceOf(PSR);

      totalReservesCurrent = await vToken.totalReserves();
      expect(psrBalanceAfter.sub(psrBalanceBefore)).to.be.equal(reduceAmount);

      const protocolShareBalanceNew = await token.balanceOf(PSR);
      expect(protocolShareBalanceNew.sub(protocolShareBalanceOld)).equals(reduceAmount);

      totalCashNew = await vToken.getCash();
      expect(totalCashOld.sub(totalCashNew)).equals(reduceAmount);
      exchangeRateStored = await vToken.exchangeRateStored();
      totalCashNew = await vToken.getCash();
      totalSupply = await vToken.totalSupply();
      badDebt = await vToken.badDebt();
      totalBorrowCurrent = await vToken.totalBorrows();
      cashPlusBorrowsMinusReserves = totalCashNew.add(totalBorrowCurrent).add(badDebt).sub(totalReservesCurrent);
      exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);
      expect(exchangeRateExpected).equals(exchangeRateStored);
      await network.provider.request({ method: "hardhat_reset" });
    });
  });
}

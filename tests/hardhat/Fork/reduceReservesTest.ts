import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  Comptroller__factory,
  MockToken,
  MockToken__factory,
  ProtocolShareReserve,
  ProtocolShareReserve__factory,
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
let USDD: string;
let COMPTROLLER: string;
let VUSDD: string;
let PROTOCOL_SHARE_RESERVE: string;
let POOL_REGISTRY: string;

if (FORK_TESTNET) {
  ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
  ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
  acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
  USDD = "0x2E2466e22FcbE0732Be385ee2FBb9C59a1098382";
  COMPTROLLER = "0x5bCe7102339B3865ba7ceA8602d5B61db9980827";
  VUSDD = "0x9b921bbcdc18030540bcb341b1fec7fa00f7bee5";
  PROTOCOL_SHARE_RESERVE = "0x8d8f14D362f1c8e100106DA6A3254B4d9f2eB309";
  POOL_REGISTRY = "0xF57fdd25224807B1113f40E4F95c5f625fB458E2";
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vUSDD: VToken;
let usdd: MockToken;
let protocolShareReserve: ProtocolShareReserve;
let acc1Signer: Signer;
let acc2Signer: Signer;
let mintAmount: BigNumberish;
let bswBorrowAmount: BigNumberish;

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

if (FORK_TESTNET || FORK_MAINNET) {
  describe("Reduce Reserves", async () => {
    mintAmount = convertToUnit("1000", 18);
    bswBorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(30308687);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));

      usdd = MockToken__factory.connect(USDD, impersonatedTimelock);
      vUSDD = await configureVToken(VUSDD);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      protocolShareReserve = ProtocolShareReserve__factory.connect(PROTOCOL_SHARE_RESERVE, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vUSDD.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vUSDD.address]);

      await comptroller.setMarketSupplyCaps([vUSDD.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vUSDD.address], [convertToUnit(1, 50)]);

      await protocolShareReserve.connect(impersonatedTimelock).setPoolRegistry(POOL_REGISTRY);
    }
    async function mintVTokens(signer: Signer, token: MockToken, vToken: VToken, amount: BigNumberish) {
      await token.connect(signer).faucet(amount);
      await token.connect(signer).approve(vToken.address, amount);
      await expect(vToken.connect(signer).mint(amount)).to.emit(vToken, "Mint");
    }

    beforeEach(async () => {
      await setup();
      // Mint some tokens in vUsdd market to add underlying assets for borrow and reserves purpose
      await mintVTokens(acc2Signer, usdd, vUSDD, mintAmount);
    });

    it("Reduce partial reserves and verify effects", async function () {
      let totalCashOld = await vUSDD.getCash();
      await mintVTokens(acc1Signer, usdd, vUSDD, mintAmount);
      let totalCashNew = await vUSDD.getCash();
      expect(totalCashNew.sub(totalCashOld)).equals(mintAmount);

      totalCashOld = totalCashNew;
      await vUSDD.connect(acc2Signer).borrow(bswBorrowAmount);
      totalCashNew = await vUSDD.getCash();
      expect(totalCashOld.sub(totalCashNew)).equals(bswBorrowAmount);

      // MINE 300000 BLOCKS
      await mine(300000);

      // Save states just before accruing interests
      const accrualBlockNumberPrior = await vUSDD.accrualBlockNumber();
      const borrowRatePrior = await vUSDD.borrowRatePerBlock();
      const totalBorrowsPrior = await vUSDD.totalBorrows();

      await vUSDD.accrueInterest();

      // Calculation of reserves
      const currBlock = await ethers.provider.getBlockNumber();
      const blockDelta = currBlock - accrualBlockNumberPrior;
      const simpleInterestFactor = borrowRatePrior.mul(blockDelta);
      const interestAccumulated = simpleInterestFactor.mul(totalBorrowsPrior).div(convertToUnit(1, 18));
      const reserveFactorMantissa = await vUSDD.reserveFactorMantissa();
      const totalReservesExpected = reserveFactorMantissa.mul(interestAccumulated).div(convertToUnit(1, 18));
      let totalReservesCurrent = await vUSDD.totalReserves();
      expect(totalReservesExpected).equals(totalReservesCurrent);

      // Calculation of exchange rate
      let exchangeRateStored = await vUSDD.exchangeRateStored();
      totalCashNew = await vUSDD.getCash();
      let totalSupply = await vUSDD.totalSupply();
      let badDebt = await vUSDD.badDebt();
      let totalBorrowCurrent = await vUSDD.totalBorrows();
      let cashPlusBorrowsMinusReserves = totalCashNew.add(totalBorrowCurrent).add(badDebt).sub(totalReservesCurrent);
      let exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);
      expect(exchangeRateExpected).equals(exchangeRateStored);

      // Reduce reserves
      totalCashOld = await vUSDD.getCash();
      const totalReservesOld = await vUSDD.totalReserves();
      const reduceAmount = totalReservesOld.mul(50).div(100);
      const protocolShareBalanceOld = await usdd.balanceOf(PROTOCOL_SHARE_RESERVE);

      await vUSDD.reduceReserves(reduceAmount);

      totalReservesCurrent = await vUSDD.totalReserves();
      expect(totalReservesOld.sub(totalReservesCurrent)).to.closeTo(reduceAmount, parseUnits("0.000000002", 18));

      const protocolShareBalanceNew = await usdd.balanceOf(PROTOCOL_SHARE_RESERVE);
      expect(protocolShareBalanceNew.sub(protocolShareBalanceOld)).equals(reduceAmount);

      totalCashNew = await vUSDD.getCash();
      expect(totalCashOld.sub(totalCashNew)).equals(reduceAmount);

      exchangeRateStored = await vUSDD.exchangeRateStored();
      totalCashNew = await vUSDD.getCash();
      totalSupply = await vUSDD.totalSupply();
      badDebt = await vUSDD.badDebt();
      totalBorrowCurrent = await vUSDD.totalBorrows();
      cashPlusBorrowsMinusReserves = totalCashNew.add(totalBorrowCurrent).add(badDebt).sub(totalReservesCurrent);
      exchangeRateExpected = cashPlusBorrowsMinusReserves.mul(convertToUnit(1, 18)).div(totalSupply);
      expect(exchangeRateExpected).equals(exchangeRateStored);
    });
  });
}

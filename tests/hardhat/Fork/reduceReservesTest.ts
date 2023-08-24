import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  AccessControlManager__factory,
  Comptroller,
  Comptroller__factory,
  MockToken,
  MockToken__factory,
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

const ADMIN: string = CONTRACT_ADDRESSES[network as string].ADMIN;
const ACM: string = CONTRACT_ADDRESSES[network as string].ACM;
const acc1: string = CONTRACT_ADDRESSES[network as string].acc1;
const acc2: string = CONTRACT_ADDRESSES[network as string].acc2;
const COMPTROLLER: string = CONTRACT_ADDRESSES[network as string].COMPTROLLER;
const POOL_REGISTRY: string = CONTRACT_ADDRESSES[network as string].POOL_REGISTRY;
const BLOCK_NUMBER: number = CONTRACT_ADDRESSES[network as string].BLOCK_NUMBER;
let TOKEN1: string;
let VTOKEN1: string;
let PROTOCOL_SHARE_RESERVE: string;

if (network == "sepolia") {
  TOKEN1 = CONTRACT_ADDRESSES[network as string].USDC; // TOKEN1 = USDC
  VTOKEN1 = CONTRACT_ADDRESSES[network as string].VUSDC; // VTOKEN2 = VUSDC
} else if (network == "bsctestnet") {
  TOKEN1 = CONTRACT_ADDRESSES[network as string].USDD; // TOKEN1 = USDD
  VTOKEN1 = CONTRACT_ADDRESSES[network as string].VUSDD; // VTOKEN1 = VUSDD
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vTOKEN1: VToken;
let token1: MockToken;
let acc1Signer: Signer;
let acc2Signer: Signer;
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

if (FORK_TESTNET || FORK_MAINNET) {
  describe("Reduce Reserves", async () => {
    mintAmount = convertToUnit("1000", 18);
    TOKEN1BorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));

      token1 = MockToken__factory.connect(TOKEN1, impersonatedTimelock);
      vTOKEN1 = await configureVToken(VTOKEN1);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);

      const PSR = await ethers.getContractFactory("ProtocolShareReserve");
      const psr = await upgrades.deployProxy(PSR, [ADMIN, acc1]);
      await psr.deployed();

      const FakePSR = await smock.fake("ProtocolShareReserve");
      PROTOCOL_SHARE_RESERVE = FakePSR.address;

      await vTOKEN1.connect(impersonatedTimelock).setProtocolShareReserve(PROTOCOL_SHARE_RESERVE);

      FakePSR.updateAssetsState.returns(true);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN1.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN1.address]);

      await comptroller.setMarketSupplyCaps([vTOKEN1.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vTOKEN1.address], [convertToUnit(1, 50)]);
    }
    async function mintVTokens(signer: Signer, token: MockToken, vToken: VToken, amount: BigNumberish) {
      await token.connect(signer).faucet(amount);
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

      await vTOKEN1.accrueInterest();

      // Calculation of reserves
      const currBlock = await ethers.provider.getBlockNumber();
      const blockDelta = BigNumber.from(currBlock).sub(BigNumber.from(accrualBlockNumberPrior));
      const simpleInterestFactor = borrowRatePrior.mul(blockDelta);
      const interestAccumulated = simpleInterestFactor.mul(totalBorrowsPrior).div(convertToUnit(1, 18));
      const reserveFactorMantissa = await vTOKEN1.reserveFactorMantissa();
      const totalReservesExpected = reserveFactorMantissa.mul(interestAccumulated).div(convertToUnit(1, 18));
      let totalReservesCurrent = BigNumber.from(await vTOKEN1.totalReserves()).sub(reserveBefore);
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
      const protocolShareBalanceOld = await token1.balanceOf(PROTOCOL_SHARE_RESERVE);

      await vTOKEN1.reduceReserves(reduceAmount);

      // totalReservesCurrent = BigNumber.from(await vTOKEN1.totalReserves()).sub(BigNumber.from(reserveBefore));
      totalReservesCurrent = await vTOKEN1.totalReserves();

      expect(totalReservesOld.sub(totalReservesCurrent)).to.closeTo(reduceAmount, parseUnits("0.0000002", 19));

      const protocolShareBalanceNew = await token1.balanceOf(PROTOCOL_SHARE_RESERVE);
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

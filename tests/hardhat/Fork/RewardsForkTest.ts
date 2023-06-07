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
  RewardsDistributor,
  RewardsDistributor__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_TESTNET = process.env.FORK_TESTNET === "true";
const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const MANTISSA_ONE = convertToUnit(1, 18);

let ADMIN: string;
let ACM: string;
let acc1: string;
let acc2: string;
let BSW: string;
let COMPTROLLER: string;
let VBSW: string;
let REWARD_DISTRIBUTOR1: string;
let REWARD_DISTRIBUTOR2: string;

if (FORK_TESTNET) {
  ADMIN = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
  ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
  acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
  acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
  BSW = "0x7FCC76fc1F573d8Eb445c236Cc282246bC562bCE";
  COMPTROLLER = "0x5bCe7102339B3865ba7ceA8602d5B61db9980827";
  VBSW = "0x7250b36b8971adf911f0d82c162634de684fc9b3";
  REWARD_DISTRIBUTOR1 = "0x6fcd8cD773b6769F7d3D3Ad7f62dc68F95959A44"; // XVS
  REWARD_DISTRIBUTOR2 = "0xA42a4cFe65B1F1711240bC11e78cBD0b0B20EF5F"; // BIFI
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vBSW: VToken;
let bsw: MockToken;
let rewardDistributor1: RewardsDistributor;
let rewardDistributor2: RewardsDistributor;
let acc1Signer: Signer;
let acc2Signer: Signer;
let comptrollerSigner: Signer;
let mintAmount: BigNumberish;
let bswBorrowAmount: BigNumberish;

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
  describe("Rewards distributions", async () => {
    mintAmount = convertToUnit("100000000", 18);
    bswBorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(30335394);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      comptrollerSigner = await initMainnetUser(COMPTROLLER, ethers.utils.parseUnits("2"));

      bsw = MockToken__factory.connect(BSW, impersonatedTimelock);
      vBSW = await configureVToken(VBSW);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      rewardDistributor1 = RewardsDistributor__factory.connect(REWARD_DISTRIBUTOR1, impersonatedTimelock);
      rewardDistributor2 = RewardsDistributor__factory.connect(REWARD_DISTRIBUTOR2, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vBSW.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vBSW.address]);

      await comptroller.setMarketSupplyCaps([vBSW.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vBSW.address], [convertToUnit(1, 50)]);
    }

    async function mintVTokens(signer: Signer, token: MockToken, vToken: VToken, amount: BigNumberish) {
      await token.connect(signer).faucet(amount);
      await token.connect(signer).approve(vToken.address, amount);
      await expect(vToken.connect(signer).mint(amount)).to.emit(vToken, "Mint");
    }

    async function computeSupplyRewards(
      rewardDistributor: RewardsDistributor,
      vTokenAddress: string,
      vToken: VToken,
      user: string,
    ) {
      const supplierAccruedOld = await rewardDistributor.rewardTokenAccrued(user);
      await rewardDistributor.connect(comptrollerSigner).updateRewardTokenSupplyIndex(vTokenAddress);

      const supplyState = await rewardDistributor.rewardTokenSupplyState(vTokenAddress);
      const supplyIndex = supplyState.index;
      let supplierIndex = await rewardDistributor.rewardTokenSupplierIndex(vTokenAddress, user);

      if (supplierIndex == parseUnits("0") && supplyIndex >= parseUnits("1", 36)) {
        supplierIndex = parseUnits("1", 36);
      }

      const deltaIndex = supplyIndex.sub(supplierIndex).div(MANTISSA_ONE);
      const supplierTokens = await vToken.balanceOf(user);
      const supplierDelta = supplierTokens.mul(deltaIndex).div(MANTISSA_ONE);
      const supplierAccruedExpected = supplierAccruedOld.add(supplierDelta);
      await rewardDistributor.connect(comptrollerSigner).distributeSupplierRewardToken(vTokenAddress, user);
      return supplierAccruedExpected;
    }

    async function computeBorrowRewards(
      rewardDistributor: RewardsDistributor,
      vTokenAddress: string,
      vToken: VToken,
      user: string,
    ) {
      await vBSW.accrueInterest();
      const marketBorrowIndex = await vToken.borrowIndex();
      const borrowerAccruedOld = await rewardDistributor.rewardTokenAccrued(user);

      await rewardDistributor
        .connect(comptrollerSigner)
        .updateRewardTokenBorrowIndex(vTokenAddress, { mantissa: marketBorrowIndex });

      const borrowState = await rewardDistributor.rewardTokenBorrowState(vTokenAddress);
      const borrowIndex = borrowState.index;
      let borrowerIndex = await rewardDistributor.rewardTokenBorrowerIndex(vTokenAddress, user);

      if (borrowerIndex == parseUnits("0") && borrowIndex >= parseUnits("1", 36)) {
        borrowerIndex = parseUnits("1", 36);
      }

      const deltaIndex = borrowIndex.sub(borrowerIndex).div(MANTISSA_ONE);
      const borrowerTokens = await vToken.borrowBalanceStored(user);
      const borrowBalance = borrowerTokens.mul(MANTISSA_ONE).div(marketBorrowIndex);
      const borrowerDelta = borrowBalance.mul(deltaIndex).div(MANTISSA_ONE);
      const borrowerAccruedExpected = borrowerAccruedOld.add(borrowerDelta);

      await rewardDistributor
        .connect(comptrollerSigner)
        .distributeBorrowerRewardToken(vTokenAddress, user, { mantissa: marketBorrowIndex });
      return borrowerAccruedExpected;
    }

    beforeEach(async () => {
      await setup();
    });

    it("Rewards for suppliers", async function () {
      await mintVTokens(acc1Signer, bsw, vBSW, mintAmount);
      await mine(3000000);
      await vBSW.accrueInterest();

      // Reward1 calculations for user 1
      let supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VBSW, vBSW, acc1);
      let supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward2 calculations for user 1
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor2, VBSW, vBSW, acc1);
      supplierAccruedCurrent = await rewardDistributor2.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Transfer vTokens to user 2 from user 1
      const acc1Balance = await vBSW.balanceOf(acc1);
      await vBSW.connect(acc1Signer).transfer(acc2, acc1Balance);
      await vBSW.accrueInterest();

      // Reward1 calculations for user 1
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VBSW, vBSW, acc1);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward2 calculations for user 1
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor2, VBSW, vBSW, acc1);
      supplierAccruedCurrent = await rewardDistributor2.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward1 calculations for user 2
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VBSW, vBSW, acc2);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc2);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward2 calculations for user 2
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor2, VBSW, vBSW, acc2);
      supplierAccruedCurrent = await rewardDistributor2.rewardTokenAccrued(acc2);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);
    });

    it("Rewards for borrowers", async function () {
      await mintVTokens(acc1Signer, bsw, vBSW, mintAmount);
      await vBSW.connect(acc1Signer).borrow(bswBorrowAmount);
      await mine(3000000);
      await vBSW.accrueInterest();

      // Reward1 calculations for user 1
      let borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VBSW, vBSW, acc1);
      let borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000006", 18));

      // Reward2 calculations for user 1
      borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor2, VBSW, vBSW, acc1);
      borrowerAccruedCurrent = await rewardDistributor2.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000080", 18));

      // Repay
      const borrowBalanceStored = await vBSW.borrowBalanceStored(acc1);
      await bsw.connect(acc1Signer).faucet(borrowBalanceStored);
      await bsw.connect(acc1Signer).approve(VBSW, borrowBalanceStored);
      await expect(vBSW.connect(acc1Signer).repayBorrow(borrowBalanceStored)).to.emit(vBSW, "RepayBorrow");

      // Reward1 calculations for user 1
      borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VBSW, vBSW, acc1);
      borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000006", 18));

      // Reward2 calculations for user 1
      borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor2, VBSW, vBSW, acc1);
      borrowerAccruedCurrent = await rewardDistributor2.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000006", 18));
    });
  });
}

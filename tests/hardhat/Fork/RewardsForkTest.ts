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
  BinanceOracle,
  BinanceOracle__factory,
  Comptroller,
  Comptroller__factory,
  IERC20,
  IERC20__factory,
  RewardsDistributor,
  RewardsDistributor__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const {
  ACM,
  ACC1,
  ACC2,
  ADMIN,
  TOKEN2,
  VTOKEN2,
  COMPTROLLER,
  TOKEN2_HOLDER,
  BINANCE_ORACLE,
  REWARD_DISTRIBUTOR1,
  BLOCK_NUMBER,
} = getContractAddresses(FORKED_NETWORK as string);

const MANTISSA_ONE = convertToUnit(1, 18);

let token2: IERC20;
let vTOKEN2: VToken;
let comptroller: Comptroller;
let acc1Signer: Signer;
let acc2Signer: Signer;
let token2Holder: Signer;
let comptrollerSigner: Signer;
let impersonatedTimelock: Signer;
let binanceOracle: BinanceOracle;
let mintAmount: BigNumberish;
let bswBorrowAmount: BigNumberish;
let rewardDistributor1: RewardsDistributor;
let accessControlManager: AccessControlManager;

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

if (FORK) {
  describe("Rewards distributions", async () => {
    mintAmount = convertToUnit("10000", 18);
    bswBorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(ACC1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(ACC2, ethers.utils.parseUnits("2"));
      token2Holder = await initMainnetUser(TOKEN2_HOLDER, ethers.utils.parseUnits("2"));
      comptrollerSigner = await initMainnetUser(COMPTROLLER, ethers.utils.parseUnits("2"));

      token2 = IERC20__factory.connect(TOKEN2, impersonatedTimelock);
      vTOKEN2 = await configureVToken(VTOKEN2);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      rewardDistributor1 = RewardsDistributor__factory.connect(REWARD_DISTRIBUTOR1, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN2.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN2.address]);

      await comptroller.setMarketSupplyCaps([vTOKEN2.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vTOKEN2.address], [convertToUnit(1, 50)]);

      if (FORKED_NETWORK != "sepolia") {
        binanceOracle = BinanceOracle__factory.connect(BINANCE_ORACLE, impersonatedTimelock);
        await binanceOracle.connect(impersonatedTimelock).setMaxStalePeriod("HAY", 31536000);
      }
    }

    async function mintVTokens(signer: Signer, token: IERC20, vToken: VToken, amount: BigNumberish) {
      await token.connect(token2Holder).transfer(await signer.getAddress(), amount);
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
      await vTOKEN2.accrueInterest();
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
      await mintVTokens(acc1Signer, token2, vTOKEN2, mintAmount);
      await mine(3000000);
      await vTOKEN2.accrueInterest();

      // Reward1 calculations for user 1
      let supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN2, vTOKEN2, ACC1);
      let supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(ACC1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Transfer vTokens to user 2 from user 1
      const acc1Balance = await vTOKEN2.balanceOf(ACC1);
      await vTOKEN2.connect(acc1Signer).transfer(ACC2, acc1Balance);
      await vTOKEN2.accrueInterest();

      // Reward1 calculations for user 1
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN2, vTOKEN2, ACC1);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(ACC1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward1 calculations for user 2
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN2, vTOKEN2, ACC2);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(ACC2);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);
    });

    it("Rewards for borrowers", async function () {
      await mintVTokens(acc1Signer, token2, vTOKEN2, mintAmount);
      await vTOKEN2.connect(acc1Signer).borrow(bswBorrowAmount);
      await mine(3000000);
      await vTOKEN2.accrueInterest();

      // Reward1 calculations for user 1
      let borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VTOKEN2, vTOKEN2, ACC1);
      let borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(ACC1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000079", 18));

      // Repay
      const borrowBalanceStored = await vTOKEN2.borrowBalanceStored(ACC1);
      await token2.connect(token2Holder).transfer(ACC1, borrowBalanceStored);
      await token2.connect(acc1Signer).approve(VTOKEN2, borrowBalanceStored);
      await expect(vTOKEN2.connect(acc1Signer).repayBorrow(borrowBalanceStored)).to.emit(vTOKEN2, "RepayBorrow");

      // Reward1 calculations for user 1
      borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VTOKEN2, vTOKEN2, ACC1);
      borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(ACC1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000006", 18));
    });
  });
}

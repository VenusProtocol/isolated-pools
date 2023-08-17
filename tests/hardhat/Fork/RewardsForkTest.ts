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
const network = process.env.NETWORK_NAME;
const MANTISSA_ONE = convertToUnit(1, 18);

let ADMIN: string;
let ACM: string;
let acc1: string;
let acc2: string;
let TOKEN1: string;
let COMPTROLLER: string;
let VTOKEN1: string;
let REWARD_DISTRIBUTOR1: string;
let BLOCK_NUMBER: number;
let BINANCE_ORACLE: string;

if (FORK_TESTNET) {
  if (network == "sepolia") {
    ADMIN = "0xcd2a514f04241b7c9A0d5d54441e92E4611929CF";
    ACM = "0x799700ea540f002134C371fB955e2392FD94DbCD";
    acc1 = "0x02EB950C215D12d723b44a18CfF098C6E166C531";
    acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
    TOKEN1 = "0xA33524BeFb504152EFBfB4433501D42BCA90e704";
    COMPTROLLER = "0xa8cD3a5A542A71D276b35A6AFBb373d37824991a";
    VTOKEN1 = "0x5f22a9b867295F4e9fAff66a83a25BdD361807eD";
    REWARD_DISTRIBUTOR1 = "0xf2c98D07e189B67049b8742bDEa42b492a8A96B1";
    BLOCK_NUMBER = 3998891;
  } else if (network == "bsctestnet") {
    ADMIN = "0xce10739590001705f7ff231611ba4a48b2820327";
    ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
    acc1 = "0xe70898180a366F204AA529708fB8f5052ea5723c";
    acc2 = "0xA4a04C2D661bB514bB8B478CaCB61145894563ef";
    TOKEN1 = "0xe73774DfCD551BF75650772dC2cC56a2B6323453";
    COMPTROLLER = "0x10b57706AD2345e590c2eA4DC02faef0d9f5b08B";
    VTOKEN1 = "0x170d3b2da05cc2124334240fB34ad1359e34C562";
    REWARD_DISTRIBUTOR1 = "0xb0269d68CfdCc30Cb7Cd2E0b52b08Fa7Ffd3079b";
    BINANCE_ORACLE = "0xB58BFDCE610042311Dc0e034a80Cc7776c1D68f5";
    BLOCK_NUMBER = 32523068;
  }
}

if (FORK_MAINNET) {
  // Mainnet addresses
}

let impersonatedTimelock: Signer;
let accessControlManager: AccessControlManager;
let comptroller: Comptroller;
let vTOKEN1: VToken;
let token1: MockToken;
let rewardDistributor1: RewardsDistributor;
let acc1Signer: Signer;
let acc2Signer: Signer;
let comptrollerSigner: Signer;
let mintAmount: BigNumberish;
let bswBorrowAmount: BigNumberish;
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
  describe("Rewards distributions", async () => {
    mintAmount = convertToUnit("100000000", 18);
    bswBorrowAmount = convertToUnit("100", 18);

    async function setup() {
      await setForkBlock(BLOCK_NUMBER);
      await configureTimelock();

      acc1Signer = await initMainnetUser(acc1, ethers.utils.parseUnits("2"));
      acc2Signer = await initMainnetUser(acc2, ethers.utils.parseUnits("2"));
      comptrollerSigner = await initMainnetUser(COMPTROLLER, ethers.utils.parseUnits("2"));

      token1 = MockToken__factory.connect(TOKEN1, impersonatedTimelock);
      vTOKEN1 = await configureVToken(VTOKEN1);
      comptroller = Comptroller__factory.connect(COMPTROLLER, impersonatedTimelock);
      rewardDistributor1 = RewardsDistributor__factory.connect(REWARD_DISTRIBUTOR1, impersonatedTimelock);

      await grantPermissions();

      await comptroller.connect(acc1Signer).enterMarkets([vTOKEN1.address]);
      await comptroller.connect(acc2Signer).enterMarkets([vTOKEN1.address]);

      await comptroller.setMarketSupplyCaps([vTOKEN1.address], [convertToUnit(1, 50)]);
      await comptroller.setMarketBorrowCaps([vTOKEN1.address], [convertToUnit(1, 50)]);

      if (network != "sepolia") {
        binanceOracle = BinanceOracle__factory.connect(BINANCE_ORACLE, impersonatedTimelock);
        await binanceOracle.connect(impersonatedTimelock).setMaxStalePeriod("HAY", 31536000);
      }
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
      await vTOKEN1.accrueInterest();
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
      await mintVTokens(acc1Signer, token1, vTOKEN1, mintAmount);
      await mine(3000000);
      await vTOKEN1.accrueInterest();

      // Reward1 calculations for user 1
      let supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN1, vTOKEN1, acc1);
      let supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Transfer vTokens to user 2 from user 1
      const acc1Balance = await vTOKEN1.balanceOf(acc1);
      await vTOKEN1.connect(acc1Signer).transfer(acc2, acc1Balance);
      await vTOKEN1.accrueInterest();

      // Reward1 calculations for user 1
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN1, vTOKEN1, acc1);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);

      // Reward1 calculations for user 2
      supplierAccruedExpected = await computeSupplyRewards(rewardDistributor1, VTOKEN1, vTOKEN1, acc2);
      supplierAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc2);
      expect(supplierAccruedExpected).equals(supplierAccruedCurrent);
    });
    it("Rewards for borrowers", async function () {
      await mintVTokens(acc1Signer, token1, vTOKEN1, mintAmount);
      await vTOKEN1.connect(acc1Signer).borrow(bswBorrowAmount);
      await mine(3000000);
      await vTOKEN1.accrueInterest();

      // Reward1 calculations for user 1
      let borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VTOKEN1, vTOKEN1, acc1);
      let borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000079", 18));

      // Repay
      const borrowBalanceStored = await vTOKEN1.borrowBalanceStored(acc1);
      await token1.connect(acc1Signer).faucet(borrowBalanceStored);
      await token1.connect(acc1Signer).approve(VTOKEN1, borrowBalanceStored);
      await expect(vTOKEN1.connect(acc1Signer).repayBorrow(borrowBalanceStored)).to.emit(vTOKEN1, "RepayBorrow");

      // Reward1 calculations for user 1
      borrowerAccruedExpected = await computeBorrowRewards(rewardDistributor1, VTOKEN1, vTOKEN1, acc1);
      borrowerAccruedCurrent = await rewardDistributor1.rewardTokenAccrued(acc1);
      expect(borrowerAccruedExpected).to.closeTo(borrowerAccruedCurrent, parseUnits("0.000000000000000006", 18));
    });
  });
}

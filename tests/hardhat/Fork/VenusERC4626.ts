import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { Comptroller, ERC20, VToken, VenusERC4626 } from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { ADMIN, ACM, PSR, USDT, VUSDT, COMPTROLLER, USDT_HOLDER, BLOCK_NUMBER } = getContractAddresses(
  FORKED_NETWORK as string,
);

let usdt: ERC20;
let vUSDT: VToken;
let comptroller: Comptroller;
let venusERC4626: VenusERC4626;
let usdtHolder: Signer;
let adminSigner: Signer;
let userSigner: Signer;

async function configureTimelock() {
  adminSigner = await initMainnetUser(ADMIN, parseUnits("2"));
}

async function setup() {
  await setForkBlock(BLOCK_NUMBER);
  await configureTimelock();

  // Initialize signers
  userSigner = await initMainnetUser(await ethers.provider.getSigner().getAddress(), parseUnits("2"));
  usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));

  // Get mainnet contracts
  usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", USDT);
  comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
  vUSDT = await ethers.getContractAt("VToken", VUSDT);

  // Deploy VenusERC4626
  const VenusERC4626Factory = await ethers.getContractFactory("VenusERC4626");
  venusERC4626 = (await upgrades.deployProxy(VenusERC4626Factory, [VUSDT])) as VenusERC4626;

  // Initialize vault
  await venusERC4626.initialize2(
    ACM,
    PSR,
    100, // loops limit
    ADMIN,
  );

  // Fund user with USDT
  await usdt.connect(usdtHolder).transfer(await userSigner.getAddress(), parseUnits("1000", 18));
  await usdt.connect(userSigner).approve(venusERC4626.address, parseUnits("10000", 18));
}

if (FORK) {
  describe("VenusERC4626 Fork Tests", () => {
    const depositAmount = parseUnits("100", 18); // 100 USDT
    const mintShares = parseUnits("50", 18); // 50 shares

    beforeEach(async () => {
      await setup();
    });

    describe("Deposit Operations", () => {
      it("should preview deposits", async () => {
        // Accrue interest to update the stored exchange rate
        await vUSDT.connect(userSigner).accrueInterest();

        const previewDeposit = await venusERC4626.previewDeposit(depositAmount);

        // Perform the deposit - it will accrue interest too, so the minted VTokens will be lower than previewed
        const tx = await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
        const receipt = await tx.wait();

        const depositEvent = receipt.events?.find(e => e.event === "Deposit");
        const actualShares = depositEvent?.args?.shares;

        expect(actualShares).to.be.lte(previewDeposit);
      });

      it("should deposit assets and mint shares", async () => {
        const assetsBefore = await usdt.balanceOf(await userSigner.getAddress());
        const sharesBefore = await venusERC4626.balanceOf(await userSigner.getAddress());

        // Perform the deposit
        const tx = await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
        const receipt = await tx.wait();

        const depositEvent = receipt.events?.find(e => e.event === "Deposit");
        const actualShares = depositEvent?.args?.shares;

        const assetsAfter = await usdt.balanceOf(await userSigner.getAddress());
        const sharesAfter = await venusERC4626.balanceOf(await userSigner.getAddress());

        expect(assetsBefore.sub(assetsAfter)).to.equal(depositAmount);
        expect(sharesAfter.sub(sharesBefore)).to.equal(actualShares);

        const expectedAssetsFromShares = await venusERC4626.previewRedeem(actualShares);
        expect(expectedAssetsFromShares).to.be.lte(depositAmount);
      });

      it("should withdraw more than deposited assets, with time", async () => {
        // Perform the deposit
        const tx = await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
        const receipt = await tx.wait();

        const depositEvent = receipt.events?.find(e => e.event === "Deposit");
        const actualShares = depositEvent?.args?.shares;

        // 1 day, assuming 1.5 seconds per block. The exact amount of blocks is not relevant for the test
        await mine(57600);

        // Accrue interest to update the stored exchange rate
        await vUSDT.connect(userSigner).accrueInterest();

        const expectedAssetsFromShares = await venusERC4626.previewRedeem(actualShares);
        expect(expectedAssetsFromShares).to.be.gte(depositAmount);
      });

      it("should revert when depositing more than max", async () => {
        // Set supply cap to 0
        await comptroller.connect(adminSigner).setMarketSupplyCaps([VUSDT], [0]);

        await expect(
          venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress()),
        ).to.be.revertedWithCustomError(venusERC4626, "ERC4626__DepositMoreThanMax");
      });

      it("should revert when depositing zero amount", async () => {
        await expect(venusERC4626.connect(userSigner).deposit(0, await userSigner.getAddress()))
          .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
          .withArgs("deposit");
      });

      it("should revert when depositing not enough assets to mint a VToken", async () => {
        await expect(venusERC4626.connect(userSigner).deposit(1, await userSigner.getAddress()))
          .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
          .withArgs("vTokensReceived at _deposit");
      });
    });

    describe("Mint Operations", () => {
      it("should mint shares for assets", async () => {
        const assetsBefore = await usdt.balanceOf(await userSigner.getAddress());
        const sharesBefore = await venusERC4626.balanceOf(await userSigner.getAddress());

        // Perform mint
        const tx = await venusERC4626.connect(userSigner).mint(mintShares, await userSigner.getAddress());
        const receipt = await tx.wait();

        const event = receipt.events?.find(e => e.event === "Deposit");
        const actualAssets = event?.args?.assets;

        const assetsAfter = await usdt.balanceOf(await userSigner.getAddress());
        const sharesAfter = await venusERC4626.balanceOf(await userSigner.getAddress());

        expect(sharesAfter.sub(sharesBefore)).to.equal(mintShares);
        expect(assetsBefore.sub(assetsAfter)).to.equal(actualAssets);
      });

      it("should redeem the minted shares", async () => {
        // Perform mint
        const depositTx = await venusERC4626.connect(userSigner).mint(mintShares, await userSigner.getAddress());
        const depositReceipt = await depositTx.wait();

        const event = depositReceipt.events?.find(e => e.event === "Deposit");
        const depositAssets = event?.args?.assets;
        const depositShares = event?.args?.shares;

        // Perform redeem
        const redeemTx = await venusERC4626
          .connect(userSigner)
          .redeem(depositShares, await userSigner.getAddress(), await userSigner.getAddress());
        const redeemReceipt = await redeemTx.wait();

        const redeemEvent = redeemReceipt.events?.find(e => e.event === "Withdraw");
        const redeemedAssets = redeemEvent?.args?.assets;
        const redeemedShares = redeemEvent?.args?.shares;

        expect(redeemedShares).to.equal(depositShares);

        // The difference on the withdrawn funds are the accrued interests between the mint and redeem
        expect(redeemedAssets).to.be.gte(depositAssets);
        expect(redeemedAssets).to.be.closeTo(depositAssets, parseUnits("3", 11));
      });

      it("should revert when minting more than max", async () => {
        // Set supply cap to 0 to make maxMint return 0
        await comptroller.connect(adminSigner).setMarketSupplyCaps([VUSDT], [0]);

        const maxShares = await venusERC4626.maxMint(await userSigner.getAddress());
        expect(maxShares).to.equal(0);

        await expect(
          venusERC4626.connect(userSigner).mint(mintShares, await userSigner.getAddress()),
        ).to.be.revertedWithCustomError(venusERC4626, "ERC4626__MintMoreThanMax");
      });

      it("should fail mint zero shares", async () => {
        await expect(venusERC4626.connect(userSigner).mint(0, await userSigner.getAddress()))
          .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
          .withArgs("mint");
      });
    });

    describe("Withdraw Operations", () => {
      const withdrawAmount = parseUnits("50", 18); // 50 USDt

      beforeEach(async () => {
        // First deposit
        await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
      });

      it("should withdraw assets and burn shares with acceptable variance", async () => {
        const sharesBefore = await venusERC4626.balanceOf(await userSigner.getAddress());
        const assetsBefore = await usdt.balanceOf(await userSigner.getAddress());

        // Perform withdrawal and get actual values from event
        const tx = await venusERC4626
          .connect(userSigner)
          .withdraw(withdrawAmount, await userSigner.getAddress(), await userSigner.getAddress());
        const receipt = await tx.wait();

        const withdrawEvent = receipt.events?.find(e => e.event === "Withdraw");
        const actualShares = withdrawEvent?.args?.shares;
        const actualAssets = withdrawEvent?.args?.assets;

        const sharesAfter = await venusERC4626.balanceOf(await userSigner.getAddress());
        const assetsAfter = await usdt.balanceOf(await userSigner.getAddress());

        // User should receive AT LEAST the requested amount
        expect(assetsAfter.sub(assetsBefore)).to.equal(actualAssets);
        expect(actualAssets).to.be.gte(withdrawAmount);
        expect(actualAssets).to.be.closeTo(withdrawAmount, parseUnits("4", 9));

        // Shares burned should match event emission
        expect(sharesBefore.sub(sharesAfter)).to.equal(actualShares);
      });

      it("should revert when withdrawing more than max", async () => {
        const overWithdraw = parseUnits("1000", 18); // 1000 USDT

        await expect(
          venusERC4626
            .connect(userSigner)
            .withdraw(overWithdraw, await userSigner.getAddress(), await userSigner.getAddress()),
        ).to.be.revertedWithCustomError(venusERC4626, "ERC4626__WithdrawMoreThanMax");
      });

      it("should revert when withdrawing zero amount", async () => {
        await expect(
          venusERC4626.connect(userSigner).withdraw(0, await userSigner.getAddress(), await userSigner.getAddress()),
        )
          .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
          .withArgs("withdraw");
      });

      it("should revert when withdrawing less than the value of 1 VToken", async () => {
        await expect(
          venusERC4626.connect(userSigner).withdraw(1, await userSigner.getAddress(), await userSigner.getAddress()),
        ).to.be.revertedWith("redeemAmount is zero");
      });
    });

    describe("Redeem Operations", () => {
      const redeemShares = parseUnits("50", 18); // 50 shares

      beforeEach(async () => {
        // First deposit
        await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
      });

      it("should redeem shares for assets", async () => {
        const sharesBefore = await venusERC4626.balanceOf(await userSigner.getAddress());
        const assetsBefore = await usdt.balanceOf(await userSigner.getAddress());

        const tx = await venusERC4626
          .connect(userSigner)
          .redeem(redeemShares, await userSigner.getAddress(), await userSigner.getAddress());
        const receipt = await tx.wait();

        const redeemEvent = receipt.events?.find(e => e.event === "Withdraw");
        const actualAssets = redeemEvent?.args?.assets;

        const sharesAfter = await venusERC4626.balanceOf(await userSigner.getAddress());
        const assetsAfter = await usdt.balanceOf(await userSigner.getAddress());

        expect(sharesBefore.sub(sharesAfter)).to.equal(redeemShares);
        expect(assetsAfter.sub(assetsBefore)).to.equal(actualAssets);
      });

      it("should revert when redeeming more than max", async () => {
        const overRedeem = parseUnits("1000", 18); // 1000 shares

        await expect(
          venusERC4626
            .connect(userSigner)
            .redeem(overRedeem, await userSigner.getAddress(), await userSigner.getAddress()),
        ).to.be.revertedWithCustomError(venusERC4626, "ERC4626__RedeemMoreThanMax");
      });

      it("should revert when redeeming zero shares", async () => {
        await expect(
          venusERC4626.connect(userSigner).redeem(0, await userSigner.getAddress(), await userSigner.getAddress()),
        )
          .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
          .withArgs("redeem");
      });
    });

    describe("Rewards", () => {
      it("should claim and transfer rewards to protocol share reserve", async () => {
        const depositAmount = parseUnits("1000", 18); // 100 USDT

        // Make a deposit to start earning rewards
        await venusERC4626.connect(userSigner).deposit(depositAmount, await userSigner.getAddress());
        await mine(10000000);

        const distributors = await comptroller.getRewardDistributors();
        if (distributors.length === 0) {
          console.log("No active reward distributors - skipping test");
          return;
        }

        const distributor = await ethers.getContractAt("RewardsDistributor", distributors[0]);
        const rewardTokenAddress = await distributor.rewardToken();
        const rewardToken = await ethers.getContractAt("IERC20Upgradeable", rewardTokenAddress);

        const initialPsrBalance = await rewardToken.balanceOf(PSR);

        await expect(venusERC4626.connect(userSigner).claimRewards()).to.emit(venusERC4626, "ClaimRewards");

        // Check balances (Reward balance will be 0 as the rewardTokenSupplySpeeds is 0 for the reward Token)
        const finalPsrBalance = await rewardToken.balanceOf(PSR);
        expect(finalPsrBalance).to.equal(initialPsrBalance);
      });
    });
  });
}

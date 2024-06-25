import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { Comptroller, ERC20, NativeTokenGateway, VToken } from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const ADMIN = "0x285960C5B22fD66A736C7136967A3eB15e93CC67";
const COMPTROLLER_ADDRESS = "0x687a01ecF6d3907658f7A7c714749fAC32336D1B";
const VWETH = "0x7c8ff7d2A1372433726f879BD945fFb250B94c65";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const VUSDT = "0x8C3e3821259B82fFb32B2450A95d2dcbf161C24E";

const USER1 = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
const USER2 = "0x974CaA59e49682CdA0AD2bbe82983419A2ECC400";
const BLOCK_NUMBER = 19781700;

async function configureTimeLock() {
  impersonatedTimeLock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK;

let user1: Signer;
let user2: Signer;
let impersonatedTimeLock: Signer;
let comptroller: Comptroller;
let vweth: VToken;
let usdt: ERC20;
let vusdt: VToken;
let nativeTokenGateway: NativeTokenGateway;

async function setup() {
  await configureTimeLock();

  user1 = await initMainnetUser(USER1, ethers.utils.parseEther("100"));
  user2 = await initMainnetUser(USER2, ethers.utils.parseEther("100"));

  usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", USDT);

  const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER_ADDRESS);

  vusdt = await ethers.getContractAt("VToken", VUSDT);
  vweth = await ethers.getContractAt("VToken", VWETH);

  await comptroller
    .connect(impersonatedTimeLock)
    .setMarketSupplyCaps([VUSDT, VWETH], [parseUnits("10000", 18), parseUnits("10000", 18)]);

  await comptroller.connect(user1).enterMarkets([vusdt.address, vweth.address]);
  await comptroller.connect(user2).enterMarkets([vusdt.address, vweth.address]);

  const nativeTokenGatewayFactory = await ethers.getContractFactory("NativeTokenGateway");
  const nativeTokenGateway = await nativeTokenGatewayFactory.deploy(VWETH);

  return {
    usdt,
    comptroller,
    vusdt,
    vweth,
    nativeTokenGateway,
  };
}

if (FORK && FORKED_NETWORK === "ethereum") {
  describe("NativeTokenGateway", async () => {
    const supplyAmount = parseUnits("10", 18);
    beforeEach("setup", async () => {
      await setForkBlock(BLOCK_NUMBER);
      ({ usdt, comptroller, vusdt, nativeTokenGateway } = await setup());
    });

    describe("wrapAndSupply", () => {
      it("should wrap and supply eth", async () => {
        const balanceBeforeSupplying = await vweth.balanceOf(await user1.getAddress());
        const tx = await nativeTokenGateway
          .connect(user1)
          .wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
        const balanceAfterSupplying = await vweth.balanceOf(await user1.getAddress());
        await expect(balanceAfterSupplying.sub(balanceBeforeSupplying).toString()).to.closeTo(
          parseUnits("10", 8),
          parseUnits("1", 7),
        );
        await expect(tx).to.changeEtherBalances([user1], [supplyAmount.mul(-1)]);
      });
    });

    describe("redeemUnderlyingAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      });

      it("should redeem underlying tokens and unwrap and send it to the user", async () => {
        const redeemAmount = parseUnits("10", 18);
        await comptroller.connect(user1).updateDelegate(nativeTokenGateway.address, true);

        const ethBalanceBefore = await user1.getBalance();
        await nativeTokenGateway.connect(user1).redeemUnderlyingAndUnwrap(redeemAmount);
        const ethBalanceAfter = await user1.getBalance();

        await expect(ethBalanceAfter.sub(ethBalanceBefore)).to.closeTo(redeemAmount, parseUnits("1", 16));

        expect(await vweth.balanceOf(await user1.getAddress())).to.closeTo(0, 10);
      });
    });

    describe("redeemAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      });

      it("should redeem vTokens and unwrap and send it to the user", async () => {
        const redeemTokens = await vweth.balanceOf(await user1.getAddress());
        await comptroller.connect(user1).updateDelegate(nativeTokenGateway.address, true);

        const ethBalanceBefore = await user1.getBalance();
        await nativeTokenGateway.connect(user1).redeemAndUnwrap(redeemTokens);
        const ethBalanceAfter = await user1.getBalance();

        await expect(ethBalanceAfter.sub(ethBalanceBefore)).to.closeTo(parseUnits("10", 18), parseUnits("1", 16));
        expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
      });
    });

    describe("borrowAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      });

      it("should borrow and unwrap weth and send it to borrower", async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
        await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 6));

        await vusdt.connect(user2).mint(parseUnits("5000", 6));

        await comptroller.connect(user2).updateDelegate(nativeTokenGateway.address, true);

        const borrowAmount = parseUnits("2", 6);
        const tx = await nativeTokenGateway.connect(user2).borrowAndUnwrap(borrowAmount);

        await expect(tx).to.changeEtherBalances([user2], [borrowAmount]);
      });
    });

    describe("wrapAndRepay", () => {
      it("should wrap and repay", async () => {
        const borrowAmount = parseUnits("1", 18);
        const repayAmount = parseUnits("10", 18);
        await usdt.connect(user2).approve(vusdt.address, parseUnits("5000", 6));
        await vusdt.connect(user2).mint(parseUnits("5000", 6));
        await vweth.connect(user2).borrow(borrowAmount);

        const ethBalanceBefore = await user2.getBalance();
        await nativeTokenGateway.connect(user2).wrapAndRepay({ value: repayAmount });
        const ethBalanceAfter = await user2.getBalance();

        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.closeTo(borrowAmount, parseUnits("1", 18));
        expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
      });
    });
  });
}

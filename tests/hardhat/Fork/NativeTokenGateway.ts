import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { Comptroller, ERC20, NativeTokenGateway, VToken } from "../../../typechain";
import { getContractAddresses, initMainnetUser, mineOnZksync, setForkBlock } from "./utils";

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK;

const { ADMIN, BLOCK_NUMBER } = getContractAddresses(FORKED_NETWORK as string);

let VWETH: string;
let USDT: string;
let VUSDT: string;
let NTG: string;
let USER1: string;
let USER2: string;
let COMPTROLLER: string;

if (FORKED_NETWORK === "zksyncsepolia") {
  VWETH = "0x31eb7305f9fE281027028D0ba0d7f57ddA836d49";
  USDT = "0x9Bf62C9C6AaB7AB8e01271f0d7A401306579709B";
  VUSDT = "0x7Bfd185eF8380a72027bF65bFEEAb0242b147778";
  NTG = "0xC2bc5881f2c1ee08a1f0fee65Fbf2BB4C4DD81e9";
  USER1 = "0xEF4B807f9442b0EbD8a051C2cAEA81e5e7BAcFBD";
  USER2 = "0xE8C6Cf867CF962d289305ECE9b139a4116674541";
  COMPTROLLER = "0xC527DE08E43aeFD759F7c0e6aE85433923064669";
}

if (FORKED_NETWORK === "zksyncmainnet") {
  VWETH = "0x1Fa916C27c7C2c4602124A14C77Dbb40a5FF1BE8";
  USDT = "0x493257fd37edb34451f62edf8d2a0c418852ba4c";
  VUSDT = "0x69cDA960E3b20DFD480866fFfd377Ebe40bd0A46";
  NTG = "0xeEDE4e1BDaC489BD851970bE3952B729C4238A68";
  USER1 = "0xE0B015E54d54fc84a6cB9B666099c46adE9335FF";
  USER2 = "0x4bBa932E9792A2b917D47830C93a9BC79320E4f7";
  COMPTROLLER = "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1";
}

if (FORKED_NETWORK === "ethereum") {
  VWETH = "0x7c8ff7d2A1372433726f879BD945fFb250B94c65";
  USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  VUSDT = "0x8C3e3821259B82fFb32B2450A95d2dcbf161C24E";
  USER1 = "0xf89d7b9c864f589bbF53a82105107622B35EaA40";
  USER2 = "0x974CaA59e49682CdA0AD2bbe82983419A2ECC400";
  COMPTROLLER = "0x687a01ecF6d3907658f7A7c714749fAC32336D1B";
}

async function configureTimeLock() {
  impersonatedTimeLock = await initMainnetUser(ADMIN, ethers.utils.parseUnits("2"));
}

let user1: SignerWithAddress;
let user2: SignerWithAddress;
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

  const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
  vusdt = await ethers.getContractAt("VToken", VUSDT);
  vweth = await ethers.getContractAt("VToken", VWETH);
  await comptroller
    .connect(impersonatedTimeLock)
    .setMarketSupplyCaps([VUSDT, VWETH], [parseUnits("10000", 18), parseUnits("10000", 18)]);
  await comptroller.connect(user1).enterMarkets([vusdt.address, vweth.address]);
  await comptroller.connect(user2).enterMarkets([vusdt.address, vweth.address]);
  if (FORKED_NETWORK === "zksyncsepolia" || FORKED_NETWORK === "zksyncmainnet") {
    nativeTokenGateway = await ethers.getContractAt("NativeTokenGateway", NTG);
  } else {
    const nativeTokenGatewayFactory = await ethers.getContractFactory("NativeTokenGateway");
    nativeTokenGateway = await nativeTokenGatewayFactory.deploy(VWETH);
  }
  return {
    usdt,
    comptroller,
    vusdt,
    vweth,
    nativeTokenGateway,
  };
}

if (
  FORK &&
  (FORKED_NETWORK === "ethereum" || FORKED_NETWORK === "zksyncsepolia" || FORKED_NETWORK === "zksyncmainnet")
) {
  describe("NativeTokenGateway", async () => {
    const supplyAmount = parseUnits("10", 18);
    beforeEach("setup", async () => {
      await setForkBlock(BLOCK_NUMBER);
      ({ usdt, comptroller, vusdt, nativeTokenGateway } = await setup());
    });

    describe("wrapAndSupply", () => {
      it("should wrap and supply eth", async () => {
        const balanceBeforeSupplying = await vweth.balanceOf(await user1.getAddress());
        const initialBalance = await user1.getBalance();

        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
        const balanceAfterSupplying = await vweth.balanceOf(await user1.getAddress());
        expect(balanceAfterSupplying.sub(balanceBeforeSupplying).toString()).to.closeTo(
          parseUnits("10", 8),
          parseUnits("1", 7),
        );
        expect(await user1.getBalance()).to.be.equal(initialBalance.sub(supplyAmount));
        await network.provider.request({ method: "hardhat_reset" });
      });
    });

    describe("redeemUnderlyingAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });

        await usdt.connect(user2).approve(VUSDT, parseUnits("2000", 6));
        await expect(vusdt.connect(user2).mint(parseUnits("2000", 6))).to.emit(vusdt, "Mint");

        await vweth.connect(user2).borrow(ethers.utils.parseEther("0.5"));

        if (FORKED_NETWORK == "zksyncsepolia" || FORKED_NETWORK === "zksyncmainnet") {
          await mineOnZksync(1000);
        } else {
          await mine(1000);
        }
      });

      it("should redeem underlying tokens and unwrap and send it to the user", async () => {
        const redeemAmount = parseUnits("10", 18);

        await comptroller.connect(user1).updateDelegate(nativeTokenGateway.address, true);

        const ethBalanceBefore = await user1.getBalance();
        await nativeTokenGateway.connect(user1).redeemUnderlyingAndUnwrap(redeemAmount);

        const ethBalanceAfter = await user1.getBalance();

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.closeTo(redeemAmount, parseUnits("1", 16));

        expect(await vweth.balanceOf(await user1.getAddress())).to.closeTo(0, 10);
        await network.provider.request({ method: "hardhat_reset" });
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

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.closeTo(parseUnits("10", 18), parseUnits("1", 16));
        expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
        await network.provider.request({ method: "hardhat_reset" });
      });
    });

    describe("borrowAndUnwrap", () => {
      beforeEach(async () => {
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });
      });

      it("should borrow and unwrap weth and send it to borrower", async () => {
        const balanceBefore = await user2.getBalance();
        await nativeTokenGateway.connect(user1).wrapAndSupply(await user1.getAddress(), { value: supplyAmount });

        await usdt.connect(user2).approve(vusdt.address, parseUnits("2000", 6));

        await vusdt.connect(user2).mint(parseUnits("2000", 6));

        await comptroller.connect(user2).updateDelegate(nativeTokenGateway.address, true);

        const borrowAmount = parseUnits("2", 6);
        await nativeTokenGateway.connect(user2).borrowAndUnwrap(borrowAmount);

        expect(await user2.getBalance()).to.be.equal(balanceBefore.add(borrowAmount));
        await network.provider.request({ method: "hardhat_reset" });
      });
    });

    describe("wrapAndRepay", () => {
      it("should wrap and repay", async () => {
        const borrowAmount = parseUnits("0.5", 18);
        const repayAmount = parseUnits("0.5", 18);
        await usdt.connect(user2).approve(vusdt.address, parseUnits("2000", 6));
        await vusdt.connect(user2).mint(parseUnits("2000", 6));
        await vweth.connect(user2).borrow(borrowAmount);

        const ethBalanceBefore = await user2.getBalance();
        await nativeTokenGateway.connect(user2).wrapAndRepay({ value: repayAmount });
        const ethBalanceAfter = await user2.getBalance();

        expect(ethBalanceBefore.sub(ethBalanceAfter)).equals(borrowAmount);
        expect(await vweth.balanceOf(await user1.getAddress())).to.eq(0);
        await network.provider.request({ method: "hardhat_reset" });
      });
    });
  });
}

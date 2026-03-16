import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  IERC20__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { ADMIN, ACM, VTOKEN1, VTOKEN2, TOKEN1, TOKEN2, TOKEN1_HOLDER, TOKEN2_HOLDER, BLOCK_NUMBER } =
  getContractAddresses(FORKED_NETWORK as string);

async function findBalanceSlot(tokenAddress: string): Promise<number | null> {
  const probeAddress = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const token = IERC20__factory.connect(tokenAddress, ethers.provider);

  for (let slot = 0; slot <= 10; slot++) {
    const storageSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [probeAddress, slot]),
    );
    const prevValue = await ethers.provider.getStorageAt(tokenAddress, storageSlot);
    await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));
    try {
      const balance = await token.balanceOf(probeAddress);
      await setStorageAt(tokenAddress, storageSlot, prevValue);
      if (balance.eq(probeAmount)) return slot;
    } catch {
      await setStorageAt(tokenAddress, storageSlot, prevValue);
    }
  }
  return null;
}

async function setTokenBalance(tokenAddress: string, account: string, amount: BigNumber, slot: number) {
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]),
  );
  await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

if (FORK) {
  describe("Donation Attack Prevention - Isolated Pools", () => {
    let impersonatedTimelock: Signer;
    let vToken1: VToken;
    let vToken2: VToken;
    let underlying1Addr: string;
    let underlying2Addr: string;

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
      impersonatedTimelock = await initMainnetUser(ADMIN, parseUnits("10"));

      // Read underlying addresses before upgrade
      vToken1 = VToken__factory.connect(VTOKEN1, ethers.provider);
      vToken2 = VToken__factory.connect(VTOKEN2, ethers.provider);
      underlying1Addr = await vToken1.underlying();
      underlying2Addr = await vToken2.underlying();

      // Deploy new VToken implementation and upgrade beacon
      const VTokenFactory = await ethers.getContractFactory("VToken");
      const vTokenImpl = await VTokenFactory.deploy(false, 10512000, BigNumber.from("0.0005e16"));
      await vTokenImpl.deployed();

      // Find the beacon from EIP-1967 beacon slot
      const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
      const beaconSlotValue = await ethers.provider.getStorageAt(VTOKEN1, BEACON_SLOT);
      const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));

      const beacon = UpgradeableBeacon__factory.connect(beaconAddress, impersonatedTimelock);
      await beacon.upgradeTo(vTokenImpl.address);

      // Grant syncCash permission and call it
      const acm = await ethers.getContractAt("AccessControlManager", ACM, impersonatedTimelock);
      await acm.giveCallPermission(VTOKEN1, "syncCash()", ADMIN);
      await acm.giveCallPermission(VTOKEN2, "syncCash()", ADMIN);

      vToken1 = VToken__factory.connect(VTOKEN1, impersonatedTimelock);
      vToken2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);
      await vToken1.syncCash();
      await vToken2.syncCash();
    });

    describe("Before donation: getCash uses internalCash", () => {
      it("getCash equals internalCash (not raw balanceOf)", async () => {
        const cash1 = await vToken1.getCash();
        const internalCash1 = await vToken1.internalCash();
        expect(cash1).to.equal(internalCash1, "vToken1: getCash != internalCash");

        const cash2 = await vToken2.getCash();
        const internalCash2 = await vToken2.internalCash();
        expect(cash2).to.equal(internalCash2, "vToken2: getCash != internalCash");
      });
    });

    describe("Donation attack blocked", () => {
      it("direct token transfer does NOT change exchange rate or getCash", async () => {
        const internalCash = await vToken1.internalCash();
        const totalSupply = await vToken1.totalSupply();
        if (totalSupply.isZero() || internalCash.isZero()) {
          console.log("        Skipping: vToken1 has zero supply or cash");
          return;
        }

        const balanceSlot = await findBalanceSlot(underlying1Addr);
        if (balanceSlot === null) {
          console.log("        Skipping: could not find balance slot for underlying1");
          return;
        }

        // Accrue interest to get clean state
        await vToken1.accrueInterest();

        const exchangeRateBefore = await vToken1.exchangeRateStored();
        const getCashBefore = await vToken1.getCash();
        const internalCashBefore = await vToken1.internalCash();

        // Donate 50% of current cash directly to the vToken
        const donationAmount = internalCash.div(2);
        const [attacker] = await ethers.getSigners();
        await setTokenBalance(underlying1Addr, attacker.address, donationAmount, balanceSlot);
        const underlying = IERC20__factory.connect(underlying1Addr, attacker);
        await underlying.transfer(VTOKEN1, donationAmount);

        // Exchange rate, getCash, and internalCash must all be unchanged
        expect(await vToken1.exchangeRateStored()).to.equal(exchangeRateBefore, "exchange rate changed");
        expect(await vToken1.getCash()).to.equal(getCashBefore, "getCash changed");
        expect(await vToken1.internalCash()).to.equal(internalCashBefore, "internalCash changed");

        // Actual balance increased (tokens are there but ignored)
        const underlying1 = IERC20__factory.connect(underlying1Addr, ethers.provider);
        const actualBalance = await underlying1.balanceOf(VTOKEN1);
        expect(actualBalance).to.be.gt(internalCashBefore, "excess should exist after donation");
      });
    });

    describe("Normal operations after upgrade", () => {
      let snapshotId: string;

      beforeEach(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("mint increases internalCash", async () => {
        const totalSupply = await vToken1.totalSupply();
        if (totalSupply.isZero()) {
          console.log("        Skipping: vToken1 has zero supply");
          return;
        }

        const balanceSlot = await findBalanceSlot(underlying1Addr);
        if (balanceSlot === null) {
          console.log("        Skipping: could not find balance slot");
          return;
        }

        const underlying = IERC20__factory.connect(underlying1Addr, ethers.provider);
        const decimals = await underlying.decimals();
        const mintAmount = parseUnits("1", decimals);

        const [minter] = await ethers.getSigners();
        await setTokenBalance(underlying1Addr, minter.address, mintAmount, balanceSlot);
        await underlying.connect(minter).approve(VTOKEN1, mintAmount);

        const internalCashBefore = await vToken1.internalCash();
        await vToken1.connect(minter).mint(mintAmount);
        const internalCashAfter = await vToken1.internalCash();

        expect(internalCashAfter).to.be.gt(internalCashBefore, "internalCash should increase after mint");

        const actualBalance = await underlying.balanceOf(VTOKEN1);
        expect(internalCashAfter).to.equal(actualBalance, "internalCash != balanceOf after mint");
      });

      it("redeem decreases internalCash", async () => {
        const totalSupply = await vToken1.totalSupply();
        if (totalSupply.isZero()) {
          console.log("        Skipping: vToken1 has zero supply");
          return;
        }

        const balanceSlot = await findBalanceSlot(underlying1Addr);
        if (balanceSlot === null) {
          console.log("        Skipping: could not find balance slot");
          return;
        }

        const underlying = IERC20__factory.connect(underlying1Addr, ethers.provider);
        const decimals = await underlying.decimals();
        const mintAmount = parseUnits("1", decimals);

        const [minter] = await ethers.getSigners();
        await setTokenBalance(underlying1Addr, minter.address, mintAmount, balanceSlot);
        await underlying.connect(minter).approve(VTOKEN1, mintAmount);

        await vToken1.connect(minter).mint(mintAmount);
        const vTokenBalance = await vToken1.balanceOf(minter.address);
        if (vTokenBalance.isZero()) return;

        const internalCashBefore = await vToken1.internalCash();
        await vToken1.connect(minter).redeem(vTokenBalance);
        const internalCashAfter = await vToken1.internalCash();

        expect(internalCashAfter).to.be.lt(internalCashBefore, "internalCash should decrease after redeem");

        const actualBalance = await underlying.balanceOf(VTOKEN1);
        expect(internalCashAfter).to.equal(actualBalance, "internalCash != balanceOf after redeem");
      });
    });
  });
}

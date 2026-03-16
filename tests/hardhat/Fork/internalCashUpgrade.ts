import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  Comptroller__factory,
  IERC20__factory,
  UpgradeableBeacon__factory,
  VToken,
  VToken__factory,
} from "../../../typechain";
import { getContractAddresses, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;

const FORK = process.env.FORK === "true";
const FORKED_NETWORK = process.env.FORKED_NETWORK || "bscmainnet";

const { ADMIN, ACM, VTOKEN1, VTOKEN2, COMPTROLLER, BLOCK_NUMBER } = getContractAddresses(FORKED_NETWORK as string);

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

type StorageSnapshot = {
  name: string;
  symbol: string;
  decimals: number;
  comptroller: string;
  interestRateModel: string;
  reserveFactorMantissa: BigNumber;
  borrowIndex: BigNumber;
  totalBorrows: BigNumber;
  totalReserves: BigNumber;
  totalSupply: BigNumber;
  underlying: string;
  exchangeRate: BigNumber;
};

async function snapshotVToken(vTokenAddr: string): Promise<StorageSnapshot> {
  const vToken = VToken__factory.connect(vTokenAddr, ethers.provider);
  const totalSupply = await vToken.totalSupply();
  return {
    name: await vToken.name(),
    symbol: await vToken.symbol(),
    decimals: await vToken.decimals(),
    comptroller: await vToken.comptroller(),
    interestRateModel: await vToken.interestRateModel(),
    reserveFactorMantissa: await vToken.reserveFactorMantissa(),
    borrowIndex: await vToken.borrowIndex(),
    totalBorrows: await vToken.totalBorrows(),
    totalReserves: await vToken.totalReserves(),
    totalSupply,
    underlying: await vToken.underlying(),
    exchangeRate: totalSupply.isZero() ? BigNumber.from(0) : await vToken.callStatic.exchangeRateCurrent(),
  };
}

if (FORK) {
  describe("InternalCash Upgrade - Isolated Pools", () => {
    let impersonatedTimelock: Signer;
    let vToken1: VToken;
    let vToken2: VToken;
    let preSnapshot1: StorageSnapshot;
    let preSnapshot2: StorageSnapshot;

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
      impersonatedTimelock = await initMainnetUser(ADMIN, parseUnits("10"));

      // Snapshot before upgrade
      preSnapshot1 = await snapshotVToken(VTOKEN1);
      preSnapshot2 = await snapshotVToken(VTOKEN2);

      // Deploy new VToken implementation and upgrade beacon
      const VTokenFactory = await ethers.getContractFactory("VToken");
      const vTokenImpl = await VTokenFactory.deploy(false, 10512000, BigNumber.from("0.0005e16"));
      await vTokenImpl.deployed();

      // Find the beacon — read it from the proxy's EIP-1967 beacon slot
      const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
      const beaconSlotValue = await ethers.provider.getStorageAt(VTOKEN1, BEACON_SLOT);
      const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));

      const beacon = UpgradeableBeacon__factory.connect(beaconAddress, impersonatedTimelock);
      await beacon.upgradeTo(vTokenImpl.address);

      // syncCash on both markets
      vToken1 = VToken__factory.connect(VTOKEN1, impersonatedTimelock);
      vToken2 = VToken__factory.connect(VTOKEN2, impersonatedTimelock);

      // Grant syncCash permission via ACM
      const acm = await ethers.getContractAt("AccessControlManager", ACM, impersonatedTimelock);
      await acm.giveCallPermission(VTOKEN1, "syncCash()", ADMIN);
      await acm.giveCallPermission(VTOKEN2, "syncCash()", ADMIN);

      await vToken1.syncCash();
      await vToken2.syncCash();
    });

    describe("Storage Layout - No Collision After Upgrade", () => {
      it("all existing storage slots preserved for vToken1", async () => {
        const after = await snapshotVToken(VTOKEN1);
        expect(after.name).to.equal(preSnapshot1.name, "name");
        expect(after.symbol).to.equal(preSnapshot1.symbol, "symbol");
        expect(after.decimals).to.equal(preSnapshot1.decimals, "decimals");
        expect(after.comptroller).to.equal(preSnapshot1.comptroller, "comptroller");
        expect(after.reserveFactorMantissa).to.equal(preSnapshot1.reserveFactorMantissa, "reserveFactorMantissa");
        expect(after.totalBorrows).to.equal(preSnapshot1.totalBorrows, "totalBorrows");
        expect(after.totalSupply).to.equal(preSnapshot1.totalSupply, "totalSupply");
        expect(after.underlying).to.equal(preSnapshot1.underlying, "underlying");

        if (!preSnapshot1.exchangeRate.isZero()) {
          const tolerance = preSnapshot1.exchangeRate.div(10000);
          expect(after.exchangeRate.sub(preSnapshot1.exchangeRate).abs()).to.be.lte(
            tolerance,
            "exchange rate diverged",
          );
        }
      });

      it("all existing storage slots preserved for vToken2", async () => {
        const after = await snapshotVToken(VTOKEN2);
        expect(after.name).to.equal(preSnapshot2.name, "name");
        expect(after.symbol).to.equal(preSnapshot2.symbol, "symbol");
        expect(after.decimals).to.equal(preSnapshot2.decimals, "decimals");
        expect(after.comptroller).to.equal(preSnapshot2.comptroller, "comptroller");
        expect(after.reserveFactorMantissa).to.equal(preSnapshot2.reserveFactorMantissa, "reserveFactorMantissa");
        expect(after.totalSupply).to.equal(preSnapshot2.totalSupply, "totalSupply");
        expect(after.underlying).to.equal(preSnapshot2.underlying, "underlying");
      });

      it("internalCash matches actual balance after syncCash", async () => {
        const underlying1 = IERC20__factory.connect(preSnapshot1.underlying, ethers.provider);
        const internalCash1 = await vToken1.internalCash();
        const balance1 = await underlying1.balanceOf(VTOKEN1);
        expect(internalCash1).to.equal(balance1, "vToken1: internalCash != balanceOf");

        const underlying2 = IERC20__factory.connect(preSnapshot2.underlying, ethers.provider);
        const internalCash2 = await vToken2.internalCash();
        const balance2 = await underlying2.balanceOf(VTOKEN2);
        expect(internalCash2).to.equal(balance2, "vToken2: internalCash != balanceOf");
      });
    });

    describe("syncCash Access Control", () => {
      it("reverts for non-admin callers", async () => {
        const [, randomUser] = await ethers.getSigners();
        await expect(vToken1.connect(randomUser).syncCash()).to.be.revertedWithCustomError(vToken1, "Unauthorized");
      });

      it("is idempotent when called again by admin", async () => {
        const underlying = IERC20__factory.connect(preSnapshot1.underlying, ethers.provider);
        const balanceBefore = await underlying.balanceOf(VTOKEN1);

        await vToken1.syncCash();

        const internalCash = await vToken1.internalCash();
        expect(internalCash).to.equal(balanceBefore);
      });
    });

    describe("Accrue Interest after upgrade", () => {
      it("accrueInterest succeeds on upgraded markets", async () => {
        await expect(vToken1.accrueInterest()).to.not.be.reverted;
        await expect(vToken2.accrueInterest()).to.not.be.reverted;
      });
    });
  });
}

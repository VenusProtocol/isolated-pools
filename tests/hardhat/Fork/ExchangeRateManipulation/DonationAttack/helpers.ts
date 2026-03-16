import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { IERC20__factory } from "../../../../../typechain";

export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

export async function findBalanceSlot(tokenAddress: string): Promise<number | null> {
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

export async function setTokenBalance(tokenAddress: string, account: string, amount: BigNumber, slot: number) {
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]),
  );
  await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

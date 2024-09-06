import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { ethers, network } from "hardhat";

import { contractAddresses } from "./constants";

export function getContractAddresses(name: string) {
  return contractAddresses[name];
}

export const forking = (blockNumber: number, fn: () => Promise<void>) => {
  (async () => {
    try {
      console.log(`At block #${blockNumber}`);
      await setForkBlock(blockNumber);
      await fn();
    } catch (e) {
      console.error(e);
    }
  })();
};

export async function setForkBlock(_blockNumber: number) {
  const blockNumber = process.env.FORKED_NETWORK == "zksyncsepolia" ? _blockNumber.toString(16) : _blockNumber;
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK || "bscmainnet"}`],
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

export const initMainnetUser = async (user: string, balance: NumberLike) => {
  await network.provider.send("hardhat_impersonateAccount", [user]);
  const balanceHex = toRpcQuantity(balance);
  await network.provider.send("hardhat_setBalance", [user, balanceHex]);

  return ethers.getSigner(user);
};

const toRpcQuantity = (x: NumberLike): string => {
  let hex: string;
  if (typeof x === "number" || typeof x === "bigint") {
    // TODO: check that number is safe
    hex = `0x${x.toString(16)}`;
  } else if (typeof x === "string") {
    if (!x.startsWith("0x")) {
      throw new Error("Only 0x-prefixed hex-encoded strings are accepted");
    }
    hex = x;
  } else if ("toHexString" in x) {
    hex = x.toHexString();
  } else if ("toString" in x) {
    hex = x.toString(16);
  } else {
    throw new Error(`${x as any} cannot be converted to an RPC quantity`);
  }

  if (hex === "0x0") return hex;

  return hex.startsWith("0x") ? hex.replace(/0x0+/, "0x") : `0x${hex}`;
};

export const mineOnZksync = async (blocks: number) => {
  const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
  // Actual timestamp on which block will get mine (assuming 1 sec/block)
  const timestampOfBlocks = blocks * 1;
  const targetTimestamp = blockTimestamp + timestampOfBlocks;
  await ethers.provider.send("evm_setNextBlockTimestamp", [targetTimestamp]);
  await mineBlocks();
};

export async function mineBlocks(blocks: NumberLike = 1, options: { interval?: NumberLike } = {}): Promise<void> {
  const interval = options.interval ?? 1;
  const blocksHex = toRpcQuantity(blocks);
  const intervalHex = toRpcQuantity(interval);

  await network.provider.request({
    method: "hardhat_mine",
    params: [blocksHex, intervalHex],
  });
}

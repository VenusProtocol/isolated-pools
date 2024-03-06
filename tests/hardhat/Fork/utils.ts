import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { ethers, network } from "hardhat";

import { contractAddresses } from "./constants";

export function getContractAddresses(name: string) {
  return contractAddresses[name];
}

export const forking = (blockNumber: number, fn: () => void) => {
  describe(`At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

export async function setForkBlock(blockNumber: number) {
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
  await impersonateAccount(user);
  await setBalance(user, balance);
  return ethers.getSigner(user);
};

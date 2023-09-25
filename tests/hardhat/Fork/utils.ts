import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { ethers, network } from "hardhat";

import { archiveNodes, contractAddreseses } from "./constants";

function getArchieveNode(name: string) {
  return archiveNodes[name];
}

export function getContractAddresses(name: string) {
  return contractAddreseses[name];
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
          jsonRpcUrl: process.env[getArchieveNode(process.env.NETWORK_NAME || ("bsc" as string))],
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

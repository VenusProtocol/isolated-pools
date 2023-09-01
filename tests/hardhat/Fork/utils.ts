import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { ethers, network } from "hardhat";

import { archiveNodes, contractAddreseses } from "./constants";

function getArchieveNode(name: string) {
  if (name != "") {
    return archiveNodes[name];
  }
  return archiveNodes["bsc"];
}

export function getContractAddresses(name: string) {
  if (name != "") {
    return contractAddreseses[name];
  }
  return contractAddreseses["bsc"];
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
          jsonRpcUrl: process.env[getArchieveNode(process.env.NETWORK_NAME as string)],
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

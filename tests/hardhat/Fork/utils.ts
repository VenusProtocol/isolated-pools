import { JsonRpcProvider } from "@ethersproject/providers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { config, ethers, network } from "hardhat";
import { EthereumProvider, HttpNetworkConfig } from "hardhat/types";

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

const getProvider = () => {
  if (network.name === "zksynctestnode") {
    const networkConfig = config.networks["zksynctestnode"] as HttpNetworkConfig;
    return new ethers.providers.JsonRpcProvider({
      url: networkConfig.url,
      timeout: networkConfig.timeout,
    });
  } else {
    return network.provider;
  }
};

export const setBalance = async (user: string, balance: NumberLike) => {
  const provider = getProvider();
  const balanceHex = toRpcQuantity(balance);
  await provider.send("hardhat_setBalance", [user, balanceHex]);
};

export const initMainnetUser = async (user: string, balance: NumberLike) => {
  const provider: EthereumProvider | JsonRpcProvider = getProvider();
  let signer: SignerWithAddress;

  // zksync test node provider does not support default impersonation
  if (network.name === "zksynctestnode") {
    signer = (provider as JsonRpcProvider).getSigner(user) as unknown as SignerWithAddress;
  } else {
    signer = (await ethers.getSigner(user)) as unknown as SignerWithAddress;
  }

  await provider.send("hardhat_impersonateAccount", [user]);
  await setBalance(user, balance);
  return signer;
};

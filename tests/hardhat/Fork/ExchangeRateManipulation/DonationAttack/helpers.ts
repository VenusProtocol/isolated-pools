import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import fs from "fs";
import { ethers } from "hardhat";
import path from "path";

import { Comptroller__factory, IERC20__factory, UpgradeableBeacon__factory } from "../../../../../typechain";

/** Per-network configuration for donation attack fork tests. */
export interface NetworkTestConfig {
  network: string;
  blockNumber: number;
  vTokenArgs: {
    timeBased: boolean;
    blocksPerYear: number;
    maxBorrowRateMantissa: string;
  };
}

export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

export type BalanceSlot = { slot: number; isVyper: boolean };

// Known ERC20 balance mapping slots per network — avoids slow on-chain probing.
// These are stable (storage layout of deployed token contracts never changes).
const KNOWN_BALANCE_SLOTS: Record<string, Record<string, BalanceSlot>> = {
  arbitrumone: {
    "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f": { slot: 51, isVyper: false }, // WBTC
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": { slot: 51, isVyper: false }, // WETH
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": { slot: 9, isVyper: false }, // USDC
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": { slot: 51, isVyper: false }, // USDT
    "0x912CE59144191C1204E64559FE8253a0e49E6548": { slot: 51, isVyper: false }, // ARB
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": { slot: 0, isVyper: false }, // gmWETH-USDC
    "0x47c031236e19d024b42f8AE6780E44A573170703": { slot: 0, isVyper: false }, // gmBTC-USDC
  },
};

/**
 * Fast balance slot lookup: checks known slots first, falls back to on-chain probing.
 * The known map uses checksummed addresses — input is checksummed before lookup.
 */
export async function getBalanceSlot(tokenAddress: string, network: string): Promise<BalanceSlot | null> {
  const checksummed = ethers.utils.getAddress(tokenAddress);
  const known = KNOWN_BALANCE_SLOTS[network]?.[checksummed];
  if (known) return known;
  return findBalanceSlot(tokenAddress);
}

/**
 * Probes storage to find the ERC20 balance mapping slot.
 * Tries both Solidity layout (mapping key = [address, slot]) and Vyper layout
 * (mapping key = [slot, address]) across a wide slot range to handle bridged
 * tokens and non-standard contracts.
 *
 * Returns { slot, isVyper } or null if not found.
 */
export async function findBalanceSlot(tokenAddress: string): Promise<{ slot: number; isVyper: boolean } | null> {
  const probeAddress = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const token = IERC20__factory.connect(tokenAddress, ethers.provider);

  for (let slot = 0; slot <= 100; slot++) {
    // Standard Solidity: keccak256(abi.encode(address, slot))
    for (const isVyper of [false, true]) {
      const storageSlot = isVyper
        ? ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address"], [slot, probeAddress]))
        : ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [probeAddress, slot]));

      const prevValue = await ethers.provider.getStorageAt(tokenAddress, storageSlot);
      await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));
      try {
        const balance = await token.balanceOf(probeAddress);
        await setStorageAt(tokenAddress, storageSlot, prevValue);
        if (balance.eq(probeAmount)) return { slot, isVyper };
      } catch {
        await setStorageAt(tokenAddress, storageSlot, prevValue);
      }
    }
  }
  return null;
}

export async function setTokenBalance(
  tokenAddress: string,
  account: string,
  amount: BigNumber,
  slot: number,
  isVyper: boolean = false,
) {
  const storageSlot = isVyper
    ? ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address"], [slot, account]))
    : ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]));
  await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

/**
 * Reads the Core pool comptroller address from deployment artifacts.
 * Avoids hardcoding addresses — works for any network that has a `Comptroller_Core.json`.
 */
export function getCoreComptroller(network: string): string {
  const deploymentPath = path.resolve(process.cwd(), `deployments/${network}/Comptroller_Core.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  return deployment.address;
}

// Action indices matching Comptroller.Action enum
export enum Action {
  MINT = 0,
  REDEEM = 1,
  BORROW = 2,
  REPAY = 3,
  SEIZE = 4,
  LIQUIDATE = 5,
  TRANSFER = 6,
  ENTER_MARKET = 7,
  EXIT_MARKET = 8,
}

export type MarketPauseStatus = {
  mintPaused: boolean;
  redeemPaused: boolean;
  borrowPaused: boolean;
  repayPaused: boolean;
};

/**
 * Queries on-chain pause status for a market's key actions.
 * Used to skip tests for paused actions (e.g., if BORROW is paused, repay is also untestable).
 */
export async function getMarketPauseStatus(
  comptrollerAddress: string,
  marketAddress: string,
): Promise<MarketPauseStatus> {
  const comptroller = Comptroller__factory.connect(comptrollerAddress, ethers.provider);
  const [mintPaused, redeemPaused, borrowPaused, repayPaused] = await Promise.all([
    comptroller.actionPaused(marketAddress, Action.MINT),
    comptroller.actionPaused(marketAddress, Action.REDEEM),
    comptroller.actionPaused(marketAddress, Action.BORROW),
    comptroller.actionPaused(marketAddress, Action.REPAY),
  ]);
  return { mintPaused, redeemPaused, borrowPaused, repayPaused };
}

/**
 * Reads the beacon address from a vToken proxy's storage and returns the beacon's owner.
 * Avoids hardcoding the beacon owner — ownership can transfer over time.
 */
export async function getBeaconOwner(vTokenAddress: string): Promise<string> {
  const beaconSlotValue = await ethers.provider.getStorageAt(vTokenAddress, BEACON_SLOT);
  const beaconAddress = ethers.utils.getAddress("0x" + beaconSlotValue.slice(26));
  const beacon = UpgradeableBeacon__factory.connect(beaconAddress, ethers.provider);
  return beacon.owner();
}

/**
 * Reads the comptroller's owner and ACM addresses dynamically.
 * Avoids hardcoding admin/ACM — these can change via governance.
 */
export async function getComptrollerAdmin(comptrollerAddress: string): Promise<{ admin: string; acm: string }> {
  const comptroller = Comptroller__factory.connect(comptrollerAddress, ethers.provider);
  const [admin, acm] = await Promise.all([comptroller.owner(), comptroller.accessControlManager()]);
  return { admin, acm };
}

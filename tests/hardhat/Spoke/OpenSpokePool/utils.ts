import { Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { OptimizedTransparentUpgradeableProxy__factory } from "../../../../typechain";

export const e18 = (value: string) => parseUnits(value, 18);

/// Overrides for a transaction whose fake calls are counted: gas estimation can run it again, and smock records those
/// calls too
export const NO_ESTIMATE = { gasLimit: 10_000_000 };

/// Mirror the enums of `ISpokePoolManager`, in declaration order.
export const RequestType = { Pool: 0, Markets: 1, Tier: 2 };
export const RequestStatus = { None: 0, Pending: 1, Built: 2, Rejected: 3, Settled: 4, Canceled: 5 };
export const PoolStatus = {
  None: 0,
  Live: 1,
  ExitRequested: 2,
  ExitProposed: 3,
  WindingDown: 4,
  Closed: 5,
  HandedOver: 6,
};

/// Puts `implementation` behind a transparent proxy initialized with `initialize(accessControlManager)` by the
/// implementation's signer, which becomes the owner. The proxy admin is the last signer, which no test calls from
export const deployProxy = async <T extends Contract>(implementation: T, accessControlManager: string): Promise<T> => {
  const signers = await ethers.getSigners();
  const proxy = await new OptimizedTransparentUpgradeableProxy__factory(implementation.signer).deploy(
    implementation.address,
    signers[signers.length - 1].address,
    implementation.interface.encodeFunctionData("initialize", [accessControlManager]),
  );
  return implementation.attach(proxy.address) as T;
};

import { parseUnits } from "ethers/lib/utils";

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

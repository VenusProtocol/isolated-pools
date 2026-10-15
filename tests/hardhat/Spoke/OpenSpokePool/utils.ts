import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

export const e18 = (value: string) => parseUnits(value, 18);

/// Overrides for a transaction whose fake calls are counted: gas estimation can run it again, and smock records those
/// calls too
export const NO_ESTIMATE = { gasLimit: 10_000_000 };

/// Mirror the enums of `SpokePoolManagerStorage`, in declaration order.
export const RequestType = { Pool: 0, Markets: 1, Tier: 2 };
export const RequestStatus = { None: 0, Pending: 1, Proposed: 2, Rejected: 3, Settled: 4, Canceled: 5 };
export const PoolStatus = {
  None: 0,
  Live: 1,
  ExitRequested: 2,
  ExitProposed: 3,
  WindingDown: 4,
  Closed: 5,
  TakenOverByGovernance: 6,
};

export const TIER = {
  stakeAmount: e18("1000"),
  maxLiquidityUsd: e18("10000"),
  maxCollateralFactor: e18("0.7"),
  maxLiquidationThreshold: e18("0.8"),
  minLiquidationThreshold: e18("0.5"),
};

export const ZERO_POOL_PARAMS = { closeFactor: 0, liquidationIncentive: 0, minLiquidatableCollateral: 0 };

/// A complete `MarketParams` of a collateral market that fits `TIER`. The validator leaves the interest rate model to
/// `VToken.initialize`, so it is zero unless a test sets one.
export function collateralMarket(asset: string, overrides: object = {}) {
  return {
    asset,
    isLoanMarket: false,
    name: "Venus Collateral",
    symbol: "vCOL",
    collateralFactor: e18("0.6"),
    liquidationThreshold: e18("0.75"),
    supplyCap: e18("1000"),
    borrowCap: 0,
    seed: e18("100"),
    interestRateModel: constants.AddressZero,
    decimals: 8,
    reserveFactor: e18("0.1"),
    seedBurnPercent: e18("0.5"),
    reduceReservesBlockDelta: 28800,
    initialExchangeRate: parseUnits("1", 28),
    ...overrides,
  };
}

/// A complete `MarketParams` of a loan market that fits `TIER`.
export function loanMarket(asset: string, overrides: object = {}) {
  return collateralMarket(asset, {
    isLoanMarket: true,
    name: "Venus Loan",
    symbol: "vLOAN",
    collateralFactor: 0,
    liquidationThreshold: 0,
    supplyCap: e18("4000"),
    borrowCap: e18("3000"),
    ...overrides,
  });
}

/// A complete `Request` as `getRequest` returns it; only the sections a test sets are filled.
export function request(overrides: object = {}) {
  return {
    requestType: RequestType.Pool,
    status: RequestStatus.Pending,
    approved: true,
    deployer: constants.AddressZero,
    comptroller: constants.AddressZero,
    proposalId: 0,
    pool: { tierId: 0, stake: 0, name: "", params: ZERO_POOL_PARAMS },
    markets: [],
    tier: { tierId: 0, termsHash: constants.HashZero },
    ...overrides,
  };
}

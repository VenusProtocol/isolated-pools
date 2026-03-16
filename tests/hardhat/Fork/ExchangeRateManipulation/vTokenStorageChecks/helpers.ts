import { BigNumber } from "ethers";
import chai from "chai";

import { VToken } from "../../../../../typechain";

export { BEACON_SLOT, findBalanceSlot, setTokenBalance } from "../DonationAttack/helpers";

const { expect } = chai;

export type StorageSnapshot = {
  name: string;
  symbol: string;
  decimals: number;
  underlying: string;
  protocolShareReserve: string;
  comptroller: string;
  interestRateModel: string;
  reserveFactorMantissa: BigNumber;
  accrualBlockNumber: BigNumber;
  borrowIndex: BigNumber;
  totalBorrows: BigNumber;
  totalReserves: BigNumber;
  totalSupply: BigNumber;
  badDebt: BigNumber;
  protocolSeizeShareMantissa: BigNumber;
  shortfall: string;
  reduceReservesBlockDelta: BigNumber;
  reduceReservesBlockNumber: BigNumber;
  exchangeRate: BigNumber;
};

export async function takeStorageSnapshot(vToken: VToken): Promise<StorageSnapshot> {
  const [
    name,
    symbol,
    decimals,
    underlying,
    protocolShareReserve,
    comptroller,
    interestRateModel,
    reserveFactorMantissa,
    accrualBlockNumber,
    borrowIndex,
    totalBorrows,
    totalReserves,
    totalSupply,
    badDebt,
    protocolSeizeShareMantissa,
    shortfall,
    reduceReservesBlockDelta,
    reduceReservesBlockNumber,
    exchangeRate,
  ] = await Promise.all([
    vToken.name(),
    vToken.symbol(),
    vToken.decimals(),
    vToken.underlying(),
    vToken.protocolShareReserve(),
    vToken.comptroller(),
    vToken.interestRateModel(),
    vToken.reserveFactorMantissa(),
    vToken.accrualBlockNumber(),
    vToken.borrowIndex(),
    vToken.totalBorrows(),
    vToken.totalReserves(),
    vToken.totalSupply(),
    vToken.badDebt(),
    vToken.protocolSeizeShareMantissa(),
    vToken.shortfall(),
    vToken.reduceReservesBlockDelta(),
    vToken.reduceReservesBlockNumber(),
    vToken.callStatic.exchangeRateCurrent(),
  ]);

  return {
    name,
    symbol,
    decimals,
    underlying,
    protocolShareReserve,
    comptroller,
    interestRateModel,
    reserveFactorMantissa,
    accrualBlockNumber,
    borrowIndex,
    totalBorrows,
    totalReserves,
    totalSupply,
    badDebt,
    protocolSeizeShareMantissa,
    shortfall,
    reduceReservesBlockDelta,
    reduceReservesBlockNumber,
    exchangeRate,
  };
}

export function assertStoragePreserved(before: StorageSnapshot, after: StorageSnapshot, marketName: string) {
  expect(after.name).to.equal(before.name, `${marketName}: name changed`);
  expect(after.symbol).to.equal(before.symbol, `${marketName}: symbol changed`);
  expect(after.decimals).to.equal(before.decimals, `${marketName}: decimals changed`);
  expect(after.underlying).to.equal(before.underlying, `${marketName}: underlying changed`);
  expect(after.protocolShareReserve).to.equal(
    before.protocolShareReserve,
    `${marketName}: protocolShareReserve changed`,
  );
  expect(after.comptroller).to.equal(before.comptroller, `${marketName}: comptroller changed`);
  expect(after.interestRateModel).to.equal(before.interestRateModel, `${marketName}: interestRateModel changed`);
  expect(after.reserveFactorMantissa).to.equal(
    before.reserveFactorMantissa,
    `${marketName}: reserveFactorMantissa changed`,
  );
  expect(after.accrualBlockNumber).to.equal(before.accrualBlockNumber, `${marketName}: accrualBlockNumber changed`);
  expect(after.borrowIndex).to.equal(before.borrowIndex, `${marketName}: borrowIndex changed`);
  expect(after.totalBorrows).to.equal(before.totalBorrows, `${marketName}: totalBorrows changed`);
  expect(after.totalReserves).to.equal(before.totalReserves, `${marketName}: totalReserves changed`);
  expect(after.totalSupply).to.equal(before.totalSupply, `${marketName}: totalSupply changed`);
  expect(after.badDebt).to.equal(before.badDebt, `${marketName}: badDebt changed`);
  expect(after.protocolSeizeShareMantissa).to.equal(
    before.protocolSeizeShareMantissa,
    `${marketName}: protocolSeizeShareMantissa changed`,
  );
  expect(after.shortfall).to.equal(before.shortfall, `${marketName}: shortfall changed`);
  expect(after.reduceReservesBlockDelta).to.equal(
    before.reduceReservesBlockDelta,
    `${marketName}: reduceReservesBlockDelta changed`,
  );
  expect(after.reduceReservesBlockNumber).to.equal(
    before.reduceReservesBlockNumber,
    `${marketName}: reduceReservesBlockNumber changed`,
  );

  // Exchange rate: 0.01% tolerance
  if (!before.exchangeRate.isZero()) {
    const tolerance = before.exchangeRate.div(10000);
    expect(after.exchangeRate.sub(before.exchangeRate).abs()).to.be.lte(
      tolerance,
      `${marketName}: exchangeRate diverged beyond 0.01% tolerance`,
    );
  }
}

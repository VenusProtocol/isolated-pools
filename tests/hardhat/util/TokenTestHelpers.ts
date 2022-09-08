import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, CErc20Harness, ERC20Harness, CErc20Harness__factory, InterestRateModel,
  ERC20Harness__factory, AccessControlManager,
  RiskFund, LiquidatedShareReserve
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";


export type CTokenContracts = {
  cToken: MockContract<CErc20Harness>;
  underlying: MockContract<ERC20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
};

export async function makeCToken({ name, comptroller, accessControlManager, admin }: {
  name: string,
  comptroller: FakeContract<Comptroller>,
  accessControlManager: FakeContract<AccessControlManager>,
  admin: Signer
}): Promise<CTokenContracts> {
  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);
  const underlyingFactory = await smock.mock<ERC20Harness__factory>("ERC20Harness");
  const underlying = await underlyingFactory.deploy(0, name, 18, name);
  const cTokenFactory = await smock.mock<CErc20Harness__factory>("CErc20Harness");
  const riskFund = await smock.fake<RiskFund>("RiskFund");
  const liquidatedShareReserve = await smock.fake<LiquidatedShareReserve>("LiquidatedShareReserve");
  const initialExchangeRateMantissa = convertToUnit("1", 18);
  const cToken = await cTokenFactory.deploy(
    underlying.address,
    comptroller.address,
    interestRateModel.address,
    initialExchangeRateMantissa,
    `v${name}`,
    `v${name}`,
    8,
    await admin.getAddress(),
    accessControlManager.address,
    riskFund.address,
    liquidatedShareReserve.address
  );
  return { cToken, underlying, interestRateModel };
}

export type CTokenTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  cToken: MockContract<CErc20Harness>;
  underlying: MockContract<ERC20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
};

export async function cTokenTestFixture(): Promise<CTokenTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);

  const [admin, ] = await ethers.getSigners();
  const { cToken, interestRateModel, underlying } =
    await makeCToken({ name: "BAT", comptroller, accessControlManager, admin});

  return { accessControlManager, comptroller, cToken, interestRateModel, underlying };
}

type BalancesSnapshot = {
  [cToken: string]: HoldersSnapshot
};

type HoldersSnapshot = {
  [holder: string]: HolderSnapshot
};

type HolderSnapshot = {
  eth: string;
  cash: string;
  tokens: string;
  borrows: string;
  reserves?: string;
}

type BalanceDeltaEntry =
  [MockContract<CErc20Harness>, string, keyof HolderSnapshot, string | number] 
  | [MockContract<CErc20Harness>, keyof HolderSnapshot, string | number];


export async function getBalances(
  cTokens: MockContract<CErc20Harness>[],
  accounts: string[]
): Promise<BalancesSnapshot> {
  const balances: BalancesSnapshot = {};
  for (let cToken of cTokens) {
    const cBalances: HoldersSnapshot = balances[cToken.address] = {};
    const underlying = await ethers.getContractAt("ERC20Harness", await cToken.underlying());
    for (let account of accounts) {
      cBalances[account] = {
        eth: (await ethers.provider.getBalance(account)).toString(),
        cash: (await underlying.balanceOf(account)).toString(),
        tokens: (await cToken.balanceOf(account)).toString(),
        borrows: (await cToken.harnessAccountBorrows(account)).principal.toString()
      };
    }
    cBalances[cToken.address] = {
      eth: (await ethers.provider.getBalance(cToken.address)).toString(),
      cash: (await underlying.balanceOf(cToken.address)).toString(),
      tokens: (await cToken.totalSupply()).toString(),
      borrows: (await cToken.totalBorrows()).toString(),
      reserves: (await cToken.totalReserves()).toString()
    };
  }
  return balances;
}

export function adjustBalances(balances: BalancesSnapshot, deltas: BalanceDeltaEntry[]) {
  for (let delta of deltas) {
    let cToken: MockContract<CErc20Harness>;
    let account: string;
    let key: keyof HolderSnapshot;
    let diff: string | number;
    if (delta.length == 4) {
      ([cToken, account, key, diff] = delta);
    } else {
      ([cToken, key, diff] = delta);
      account = cToken.address;
    }
    balances[cToken.address][account][key] =
      new BigNumber(balances[cToken.address][account][key]!).plus(diff).toString();
  }
  return balances;
}

export async function preApprove(
  erc20: MockContract<ERC20Harness>,
  cToken: MockContract<CErc20Harness>,
  from: Signer,
  amount: BigNumberish,
  opts: { faucet?: boolean } = {}
) {
  if (opts.faucet) {
    await erc20.connect(from).harnessSetBalance(await from.getAddress(), amount);
  }

  return erc20.connect(from).approve(cToken.address, amount);
}

export async function pretendBorrow(
  cToken: MockContract<CErc20Harness>,
  borrower: Signer,
  accountIndex: number,
  marketIndex: number,
  principalRaw: BigNumberish,
  blockNumber: number = 2e7
) {
  await cToken.harnessSetTotalBorrows(principalRaw);
  await cToken.harnessSetAccountBorrows(await borrower.getAddress(), principalRaw, convertToUnit(accountIndex, 18));
  await cToken.harnessSetBorrowIndex(convertToUnit(marketIndex, 18));
  await cToken.harnessSetAccrualBlockNumber(blockNumber);
  await cToken.harnessSetBlockNumber(blockNumber);
}

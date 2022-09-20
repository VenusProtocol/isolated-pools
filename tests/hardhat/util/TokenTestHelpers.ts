import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { Signer, BigNumberish, constants } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, VBep20Harness, ERC20Harness, VBep20Harness__factory, InterestRateModel,
  ERC20Harness__factory, AccessControlManager,
  RiskFund, ProtocolShareReserve
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { Error } from "../util/Errors";


export type VTokenContracts = {
  vToken: MockContract<VBep20Harness>;
  underlying: MockContract<ERC20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
};

export async function makeVToken({ name, comptroller, accessControlManager, admin }: {
  name: string,
  comptroller: FakeContract<Comptroller>,
  accessControlManager: FakeContract<AccessControlManager>,
  admin: Signer
}): Promise<VTokenContracts> {
  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);
  const underlyingFactory = await smock.mock<ERC20Harness__factory>("ERC20Harness");
  const underlying = await underlyingFactory.deploy(0, name, 18, name);
  const vTokenFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
  const riskFund = await smock.fake<RiskFund>("RiskFund");
  const protocolShareReserve = await smock.fake<ProtocolShareReserve>("ProtocolShareReserve");
  const initialExchangeRateMantissa = convertToUnit("1", 18);
  const vToken = await vTokenFactory.deploy(
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
    protocolShareReserve.address
  );
  return { vToken, underlying, interestRateModel };
}

export type VTokenTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  vToken: MockContract<VBep20Harness>;
  underlying: MockContract<ERC20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
};

export async function vTokenTestFixture(): Promise<VTokenTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);

  const [admin, ] = await ethers.getSigners();
  const { vToken, interestRateModel, underlying } =
    await makeVToken({ name: "BAT", comptroller, accessControlManager, admin});

  return { accessControlManager, comptroller, vToken, interestRateModel, underlying };
}

type BalancesSnapshot = {
  [vToken: string]: HoldersSnapshot
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
  [MockContract<VBep20Harness>, string, keyof HolderSnapshot, string | number] 
  | [MockContract<VBep20Harness>, keyof HolderSnapshot, string | number];


export async function getBalances(
  vTokens: MockContract<VBep20Harness>[],
  accounts: string[]
): Promise<BalancesSnapshot> {
  const balances: BalancesSnapshot = {};
  for (let vToken of vTokens) {
    const vBalances: HoldersSnapshot = balances[vToken.address] = {};
    const underlying = await ethers.getContractAt("ERC20Harness", await vToken.underlying());
    for (let account of accounts) {
      vBalances[account] = {
        eth: (await ethers.provider.getBalance(account)).toString(),
        cash: (await underlying.balanceOf(account)).toString(),
        tokens: (await vToken.balanceOf(account)).toString(),
        borrows: (await vToken.harnessAccountBorrows(account)).principal.toString()
      };
    }
    vBalances[vToken.address] = {
      eth: (await ethers.provider.getBalance(vToken.address)).toString(),
      cash: (await underlying.balanceOf(vToken.address)).toString(),
      tokens: (await vToken.totalSupply()).toString(),
      borrows: (await vToken.totalBorrows()).toString(),
      reserves: (await vToken.totalReserves()).toString()
    };
  }
  return balances;
}

export function adjustBalances(balances: BalancesSnapshot, deltas: BalanceDeltaEntry[]) {
  for (let delta of deltas) {
    let vToken: MockContract<VBep20Harness>;
    let account: string;
    let key: keyof HolderSnapshot;
    let diff: string | number;
    if (delta.length == 4) {
      ([vToken, account, key, diff] = delta);
    } else {
      ([vToken, key, diff] = delta);
      account = vToken.address;
    }
    balances[vToken.address][account][key] =
      new BigNumber(balances[vToken.address][account][key]!).plus(diff).toString();
  }
  return balances;
}

export async function preApprove(
  erc20: MockContract<ERC20Harness>,
  vToken: MockContract<VBep20Harness>,
  from: Signer,
  amount: BigNumberish,
  opts: { faucet?: boolean } = {}
) {
  if (opts.faucet) {
    await erc20.connect(from).harnessSetBalance(await from.getAddress(), amount);
  }

  return erc20.connect(from).approve(vToken.address, amount);
}

export async function pretendBorrow(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  accountIndex: number,
  marketIndex: number,
  principalRaw: BigNumberish,
  blockNumber: number = 2e7
) {
  await vToken.harnessSetTotalBorrows(principalRaw);
  await vToken.harnessSetAccountBorrows(await borrower.getAddress(), principalRaw, convertToUnit(accountIndex, 18));
  await vToken.harnessSetBorrowIndex(convertToUnit(marketIndex, 18));
  await vToken.harnessSetAccrualBlockNumber(blockNumber);
  await vToken.harnessSetBlockNumber(blockNumber);
}

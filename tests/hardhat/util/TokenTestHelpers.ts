import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  AccessControlManager,
  Comptroller,
  ERC20Harness,
  ERC20Harness__factory,
  InterestRateModel,
  UpgradeableBeacon,
  VTokenHarness,
  VTokenHarness__factory,
  VToken__factory,
} from "../../../typechain";
import { AddressOrContract, getAddress } from "./AddressOrContract";
import { DeployedContract } from "./types";

chai.use(smock.matchers);

interface VTokenParameters {
  underlying: AddressOrContract;
  comptroller: AddressOrContract;
  interestRateModel: AddressOrContract;
  initialExchangeRateMantissa: BigNumberish;
  name: string;
  symbol: string;
  decimals: BigNumberish;
  admin: AddressOrContract;
  accessControlManager: AddressOrContract;
  shortfall: AddressOrContract;
  protocolShareReserve: AddressOrContract;
  reserveFactorMantissa: BigNumberish;
  beacon: UpgradeableBeacon;
}

const getNameAndSymbol = async (underlying: AddressOrContract): Promise<[string, string]> => {
  const underlying_ = await ethers.getContractAt("ERC20Harness", getAddress(underlying));
  const name = await underlying_.name();
  const symbol = await underlying_.symbol();
  return [name, symbol];
};

export const fakeComptroller = async (): Promise<FakeContract<Comptroller>> => {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  return comptroller;
};

export const mockUnderlying = async (name: string, symbol: string): Promise<MockContract<ERC20Harness>> => {
  const underlyingFactory = await smock.mock<ERC20Harness__factory>("ERC20Harness");
  const underlying = await underlyingFactory.deploy(0, name, 18, symbol);
  return underlying;
};

export const fakeInterestRateModel = async (): Promise<FakeContract<InterestRateModel>> => {
  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);
  return interestRateModel;
};

export const fakeAccessControlManager = async (): Promise<string> => {
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);
  return accessControlManager.address;
};

export type AnyVTokenFactory = VTokenHarness__factory | VToken__factory;

export const deployVTokenBeacon = async <VTokenFactory extends AnyVTokenFactory = VToken__factory>(
  { kind }: { kind: string } = { kind: "VToken" },
): Promise<UpgradeableBeacon> => {
  const VToken = await ethers.getContractFactory<VTokenFactory>(kind);
  const vTokenBeacon = (await upgrades.deployBeacon(VToken)) as UpgradeableBeacon;
  return vTokenBeacon;
};

const deployVTokenDependencies = async <VTokenFactory extends AnyVTokenFactory = VToken__factory>(
  params: Partial<VTokenParameters>,
  { kind }: { kind: string } = { kind: "VToken" },
): Promise<VTokenParameters> => {
  let underlyingName = "SomeMockToken";
  let underlyingSymbol = "MOCK";
  if (params.underlying) {
    [underlyingName, underlyingSymbol] = await getNameAndSymbol(params.underlying);
  }
  return {
    underlying: params.underlying || (await mockUnderlying(underlyingName, underlyingSymbol)),
    comptroller: params.comptroller || (await fakeComptroller()),
    interestRateModel: params.interestRateModel || (await fakeInterestRateModel()),
    name: params.name || `Venus ${underlyingName}`,
    symbol: params.symbol || `v${underlyingSymbol}`,
    decimals: params.decimals || 8,
    admin: params.admin || (await ethers.getSigners())[0],
    accessControlManager: params.accessControlManager || (await fakeAccessControlManager()),
    initialExchangeRateMantissa: params.initialExchangeRateMantissa || parseUnits("1", 18),
    shortfall: params.shortfall || (await smock.fake("Shortfall")),
    protocolShareReserve: params.protocolShareReserve || (await smock.fake("ProtocolShareReserve")),
    reserveFactorMantissa: params.reserveFactorMantissa || parseUnits("0.3", 18),
    beacon: params.beacon || (await deployVTokenBeacon<VTokenFactory>({ kind })),
  };
};

export const makeVToken = async <VTokenFactory extends AnyVTokenFactory = VToken__factory>(
  params: Partial<VTokenParameters>,
  { kind }: { kind: string } = { kind: "VToken" },
): Promise<DeployedContract<VTokenFactory>> => {
  const params_ = await deployVTokenDependencies<VTokenFactory>(params, { kind });
  const VToken = await ethers.getContractFactory<VTokenFactory>(kind);

  const vToken = (await upgrades.deployBeaconProxy(params_.beacon, VToken, [
    getAddress(params_.underlying),
    getAddress(params_.comptroller),
    getAddress(params_.interestRateModel),
    params_.initialExchangeRateMantissa,
    params_.name,
    params_.symbol,
    params_.decimals,
    getAddress(params_.admin),
    getAddress(params_.accessControlManager),
    {
      shortfall: getAddress(params_.shortfall),
      protocolShareReserve: getAddress(params_.protocolShareReserve),
    },
    params_.reserveFactorMantissa,
  ])) as DeployedContract<VTokenFactory>;
  return vToken;
};

export type VTokenTestFixture = {
  accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  vToken: VTokenHarness;
  underlying: MockContract<ERC20Harness>;
  interestRateModel: FakeContract<InterestRateModel>;
};

export async function vTokenTestFixture(): Promise<VTokenTestFixture> {
  const comptroller = await fakeComptroller();
  const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  accessControlManager.isAllowedToCall.returns(true);

  const [admin] = await ethers.getSigners();
  const underlying = await mockUnderlying("BAT", "BAT");
  const interestRateModel = await fakeInterestRateModel();
  const vToken = await makeVToken<VTokenHarness__factory>(
    {
      underlying,
      comptroller,
      accessControlManager,
      admin,
      interestRateModel,
    },
    { kind: "VTokenHarness" },
  );

  return { accessControlManager, comptroller, vToken, interestRateModel, underlying };
}

type BalancesSnapshot = {
  [vToken: string]: HoldersSnapshot;
};

type HoldersSnapshot = {
  [holder: string]: HolderSnapshot;
};

type HolderSnapshot = {
  eth: string;
  cash: string;
  tokens: string;
  borrows: string;
  reserves?: string;
};

type BalanceDeltaEntry =
  | [VTokenHarness, string, keyof HolderSnapshot, string | number]
  | [VTokenHarness, keyof HolderSnapshot, string | number];

export async function getBalances(vTokens: VTokenHarness[], accounts: string[]): Promise<BalancesSnapshot> {
  const balances: BalancesSnapshot = {};
  for (const vToken of vTokens) {
    const vBalances: HoldersSnapshot = (balances[vToken.address] = {});
    const underlying = await ethers.getContractAt("ERC20Harness", await vToken.underlying());
    for (const account of accounts) {
      vBalances[account] = {
        eth: (await ethers.provider.getBalance(account)).toString(),
        cash: (await underlying.balanceOf(account)).toString(),
        tokens: (await vToken.balanceOf(account)).toString(),
        borrows: (await vToken.harnessAccountBorrows(account)).principal.toString(),
      };
    }
    vBalances[vToken.address] = {
      eth: (await ethers.provider.getBalance(vToken.address)).toString(),
      cash: (await underlying.balanceOf(vToken.address)).toString(),
      tokens: (await vToken.totalSupply()).toString(),
      borrows: (await vToken.totalBorrows()).toString(),
      reserves: (await vToken.totalReserves()).toString(),
    };
  }
  return balances;
}

export function adjustBalances(balances: BalancesSnapshot, deltas: BalanceDeltaEntry[]) {
  for (const delta of deltas) {
    let vToken: VTokenHarness;
    let account: string;
    let key: keyof HolderSnapshot;
    let diff: string | number;
    if (delta.length == 4) {
      [vToken, account, key, diff] = delta;
    } else {
      [vToken, key, diff] = delta;
      account = vToken.address;
    }
    balances[vToken.address][account][key] = new BigNumber(balances[vToken.address][account][key]!)
      .plus(diff)
      .toString();
  }
  return balances;
}

export async function preApprove(
  erc20: MockContract<ERC20Harness>,
  vToken: VTokenHarness,
  from: Signer,
  amount: BigNumberish,
  opts: { faucet?: boolean } = {},
) {
  if (opts.faucet) {
    await erc20.connect(from).harnessSetBalance(await from.getAddress(), amount);
  }

  return erc20.connect(from).approve(vToken.address, amount);
}

export async function pretendBorrow(
  vToken: VTokenHarness,
  borrower: Signer,
  accountIndex: number,
  marketIndex: number,
  principalRaw: BigNumberish,
  blockNumber: number = 2e7,
) {
  await vToken.harnessSetTotalBorrows(principalRaw);
  await vToken.harnessSetAccountBorrows(await borrower.getAddress(), principalRaw, convertToUnit(accountIndex, 18));
  await vToken.harnessSetBorrowIndex(convertToUnit(marketIndex, 18));
  await vToken.harnessSetAccrualBlockNumber(blockNumber);
  await vToken.harnessSetBlockNumber(blockNumber);
}

import { mine, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract, ContractReceipt } from "ethers";
import { ethers } from "hardhat";

import { MockToken, ResilientOracleInterface, SpokeComptroller, VToken } from "../../../../../typechain";
import { bscmainnet } from "../../HubSpoke/constants";
import { initMainnetUser } from "../../utils";
import {
  MAX_STALE_PERIOD,
  OpenSpokeFixture,
  SourceType,
  TIER_ONE,
  TIER_ONE_BOND_USD,
  TIER_ONE_LIMITS,
  UpdateStatus,
  XVS,
  XVS_BOND_FACTOR,
  deployMockFeed,
  e18,
  fundUsdt,
  fundXvs,
  setPrice,
} from "./fixture";

export const EXP_SCALE = e18("1");
export const MIN_SEED_USD = e18("10");
export const ZERO = ethers.constants.AddressZero;
export const NO_FEED = { oracle: ZERO, feed: ZERO, maxStalePeriod: 0 };
export const Action = { MINT: 0, REDEEM: 1, BORROW: 2, REPAY: 3, LIQUIDATE: 5, ENTER_MARKET: 7 };
/// The default pool's exit: its collateral market's threshold, then its loan market's, which the builder leaves alone
export const EXIT_LIQUIDATION_THRESHOLDS = [e18("0.6"), 0];
export const HUB_ABI = [
  "function accessControlManager() view returns (address)",
  "function pauseHub()",
  "function unpauseHub()",
  "function balanceOf(address) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
];

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
export const ProposalState = { Executed: 7 };

export interface CollateralToken {
  token: MockToken;
  feed: Contract;
}

export interface OracleFeed {
  oracle: string;
  feed: string;
  maxStalePeriod: BigNumberish;
}

export interface CollateralMarketParams {
  asset: string;
  collateralFactor: BigNumberish;
  liquidationThreshold: BigNumberish;
  supplyCap: BigNumberish;
  feeds: [OracleFeed, OracleFeed, OracleFeed];
}

export interface LoanMarketParams {
  asset: string;
  interestRateModel: string;
}

export interface PoolRequest {
  tierId?: number;
  bondAsset?: string;
  bondAmount?: BigNumber;
  collateralMarkets: CollateralMarketParams[];
  loanMarkets: LoanMarketParams[];
}

export interface OpenPool {
  requestId: number;
  comptroller: SpokeComptroller;
  collateralVTokens: VToken[];
  loanVTokens: VToken[];
  bondAccount: Contract;
}

/// An 18-decimal-feed test token with its own mock feed, priced at `usd` per whole token
export async function newCollateralToken(
  f: OpenSpokeFixture,
  symbol: string,
  usd: string,
  decimals = 18,
): Promise<CollateralToken> {
  const token = (await (
    await ethers.getContractFactory("MockToken", f.admin)
  ).deploy(`${symbol} Token`, symbol, decimals)) as MockToken;
  f.testTokens.add(token.address);
  return { token, feed: await deployMockFeed(f, usd) };
}

export function collateralMarket(
  collateral: CollateralToken,
  overrides: Partial<CollateralMarketParams> = {},
): CollateralMarketParams {
  return {
    asset: collateral.token.address,
    collateralFactor: e18("0.5"),
    liquidationThreshold: e18("0.6"),
    supplyCap: e18("100000"),
    feeds: [
      { oracle: bscmainnet.CHAINLINK_ORACLE, feed: collateral.feed.address, maxStalePeriod: MAX_STALE_PERIOD },
      NO_FEED,
      NO_FEED,
    ],
    ...overrides,
  };
}

export const usdtLoanMarket = (f: OpenSpokeFixture): LoanMarketParams => ({
  asset: bscmainnet.USDT,
  interestRateModel: f.loanInterestRateModel.address,
});

/// The XVS a tier's bond needs at the pinned $5 XVS price
export const xvsBondFor = (bondUsd: BigNumber, xvsPriceUsd = 5) =>
  bondUsd.mul(XVS_BOND_FACTOR).div(EXP_SCALE).div(xvsPriceUsd);

export const TIER_ONE_XVS_BOND = xvsBondFor(TIER_ONE_BOND_USD);

/// Funds and approves `deployer`'s bond, plus enough of every market's asset for its seed
export async function fundDeployer(f: OpenSpokeFixture, deployer: SignerWithAddress, request: PoolRequest) {
  const bondAsset = request.bondAsset ?? XVS;
  const bondAmount = request.bondAmount ?? TIER_ONE_XVS_BOND;
  if (bondAsset === XVS) await fundXvs(f.xvs, deployer.address, bondAmount);
  else await fundUsdt(f.usdt, deployer.address, bondAmount);
  await approveSeeds(f, deployer, request);
  const bondToken = await ethers.getContractAt("MockToken", bondAsset);
  await bondToken.connect(deployer).approve(f.manager.address, ethers.constants.MaxUint256);
}

/// Mints each test collateral token to `deployer` and approves every seed; a live asset must be funded beforehand
export async function approveSeeds(f: OpenSpokeFixture, deployer: SignerWithAddress, request: PoolRequest) {
  for (const market of request.collateralMarkets) {
    const token = (await ethers.getContractAt("MockToken", market.asset)) as MockToken;
    if (f.testTokens.has(market.asset)) await token.connect(deployer).faucet(e18("1000000"));
    await token.connect(deployer).approve(f.manager.address, ethers.constants.MaxUint256);
  }
  if (request.loanMarkets.length != 0) {
    await fundUsdt(f.usdt, deployer.address, e18("1000"));
    await f.usdt.connect(deployer).approve(f.manager.address, ethers.constants.MaxUint256);
  }
}

export async function requestPool(f: OpenSpokeFixture, deployer: SignerWithAddress, request: PoolRequest) {
  await fundDeployer(f, deployer, request);
  await f.manager
    .connect(deployer)
    .requestPool(
      request.tierId ?? TIER_ONE,
      request.bondAsset ?? XVS,
      request.bondAmount ?? TIER_ONE_XVS_BOND,
      request.collateralMarkets,
      request.loanMarkets,
    );
  return (await f.manager.requestCount()).toNumber();
}

/// Builds the request's VIP as the team; returns the deployed markets, collateral first, from `RequestBuilt`
export async function buildRequest(f: OpenSpokeFixture, requestId: number) {
  const tx = await f.manager.connect(f.team).buildRequestProposal(requestId, `Request ${requestId}`);
  const receipt = await tx.wait();
  const built = receipt.events?.find(event => event.event === "RequestBuilt");
  const vTokens: string[] = built ? (built.args?.vTokens as string[]) : [];
  const request = await f.manager.getRequest(requestId);
  return { comptroller: request.comptroller, vTokens, payload: await f.manager.requestProposals(requestId) };
}

/// Moves time forward and refreshes every mock feed at its current price, so no price goes stale
export async function advanceTime(f: OpenSpokeFixture, seconds: number) {
  await time.increase(seconds);
  for (const feed of f.feeds) await feed.updateAnswer(await feed.latestAnswer());
}

/// Proposes `payload`, a stored GovernorBravo `propose` call, as the team, votes it through and executes it
export async function executeVip(f: OpenSpokeFixture, payload: string): Promise<ContractReceipt> {
  const proposalId = await proposeAndQueue(f, payload);
  const receipt = await (await f.governor.execute(proposalId)).wait();
  expect(await f.governor.state(proposalId)).to.equal(ProposalState.Executed);
  return receipt;
}

/// Proposes and queues `payload`; the caller executes it, so it can assert a failed execution
export async function proposeAndQueue(f: OpenSpokeFixture, payload: string): Promise<BigNumber> {
  await f.team.sendTransaction({ to: f.governor.address, data: payload });
  const proposalId: BigNumber = await f.governor.proposalCount();
  const { votingDelay, votingPeriod } = await f.governor.proposalConfigs(0);
  await mine(votingDelay.toNumber() + 1);
  await f.governor.castVote(proposalId, 1);
  await mine(votingPeriod.toNumber());
  await f.governor.queue(proposalId);
  const timelock = new ethers.Contract(
    bscmainnet.NORMAL_TIMELOCK,
    ["function delay() view returns (uint256)"],
    f.admin,
  );
  await advanceTime(f, (await timelock.delay()).toNumber() + 1);
  return proposalId;
}

export async function openPool(
  f: OpenSpokeFixture,
  deployer: SignerWithAddress,
  request: PoolRequest,
): Promise<OpenPool> {
  const requestId = await requestPool(f, deployer, request);
  const { comptroller, vTokens, payload } = await buildRequest(f, requestId);
  await executeVip(f, payload);
  const collateralCount = request.collateralMarkets.length;
  const asVToken = (address: string) => ethers.getContractAt("VToken", address) as Promise<VToken>;
  return {
    requestId,
    comptroller: (await ethers.getContractAt("SpokeComptroller", comptroller)) as SpokeComptroller,
    collateralVTokens: await Promise.all(vTokens.slice(0, collateralCount).map(asVToken)),
    loanVTokens: await Promise.all(vTokens.slice(collateralCount).map(asVToken)),
    bondAccount: await ethers.getContractAt("IBondAccount", await f.bondManager.bondAccounts(comptroller)),
  };
}

/// One new collateral asset priced at `usd` and a USDT loan market, on tier one with an XVS bond
export async function openDefaultPool(f: OpenSpokeFixture, deployer = f.deployer, usd = "2") {
  const collateral = await newCollateralToken(f, "COL", usd);
  const pool = await openPool(f, deployer, {
    collateralMarkets: [collateralMarket(collateral)],
    loanMarkets: [usdtLoanMarket(f)],
  });
  return { ...pool, collateral, collateralVToken: pool.collateralVTokens[0], loanVToken: pool.loanVTokens[0] };
}

export type DefaultPool = Awaited<ReturnType<typeof openDefaultPool>>;

/// Supplies USDT to the Hub, which routes it through the spoke YieldGroup into the pool's loan markets
export async function depositToHub(f: OpenSpokeFixture, amount: BigNumber) {
  await fundUsdt(f.usdt, f.hubDepositor.address, amount);
  await f.usdt.connect(f.hubDepositor).approve(f.hub.address, amount);
  await f.hub.connect(f.hubDepositor).deposit(amount, f.hubDepositor.address);
}

export async function supplyCollateral(
  user: SignerWithAddress,
  collateral: CollateralToken,
  vToken: VToken,
  amount: BigNumber,
) {
  await collateral.token.connect(user).faucet(amount);
  await collateral.token.connect(user).approve(vToken.address, amount);
  await vToken.connect(user).mint(amount);
  const comptroller = (await ethers.getContractAt("SpokeComptroller", await vToken.comptroller())) as SpokeComptroller;
  await comptroller.connect(user).enterMarkets([vToken.address]);
}

/// The latest update the manager published for `vToken`, processed by the keeper and executed once it unlocks
export async function applyLatestUpdate(f: OpenSpokeFixture, updateType: string, vToken: string) {
  const updateId = await f.riskOracle.getLatestUpdateIdByTypeAndMarket(updateType, vToken);
  await f.receiver.connect(f.keeper).processUpdate(updateId);
  const update = await f.receiver.updates(updateId);
  if (update.status === UpdateStatus.Pending) {
    const now = await time.latest();
    if (update.unlockTime.gt(now)) await advanceTime(f, update.unlockTime.sub(now).toNumber());
    await f.receiver.connect(f.keeper).executeRegisteredUpdate(updateId);
  }
  return updateId as BigNumber;
}

export const usdValue = (amount: BigNumber, priceMantissa: BigNumber) => amount.mul(priceMantissa).div(EXP_SCALE);

/// $10 of an asset at `price`, rounded up, as the manager sizes a seed
export const seedFor = (price: BigNumber) => MIN_SEED_USD.mul(EXP_SCALE).add(price).sub(1).div(price);

/// Puts the loan markets in the YieldGroup's inner queues so Hub deposits reach them, as the Hub operator does after
/// a listing VIP
export async function wireHubQueues(f: OpenSpokeFixture, loanVTokens: string[]) {
  await f.yieldGroup.connect(f.timelock).setInnerDepositQueue(loanVTokens);
  await f.yieldGroup.connect(f.timelock).setInnerWithdrawQueue(loanVTokens);
}

/// The default pool with its loan market wired on the Hub and `liquidity` USDT deposited through it
export async function openFundedPool(f: OpenSpokeFixture, liquidity = e18("500000"), deployer = f.deployer, usd = "2") {
  const pool = await openDefaultPool(f, deployer, usd);
  await wireHubQueues(f, [pool.loanVToken.address]);
  await depositToHub(f, liquidity);
  return pool;
}

export async function borrow(user: SignerWithAddress, vToken: VToken, amount: BigNumber) {
  await vToken.connect(user).borrow(amount);
}

/// Decodes a stored VIP payload into its actions
export function vipActions(payload: string) {
  const governor = new ethers.utils.Interface([
    "function propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string description, uint8 proposalType)",
  ]);
  const { targets, signatures, calldatas } = governor.decodeFunctionData("propose", payload);
  return (targets as string[]).map((target, i) => ({
    target,
    signature: signatures[i] as string,
    calldata: calldatas[i] as string,
  }));
}

/// A collateral asset's price mantissa as the oracles scale it: 36 decimals minus the asset's
export const priceMantissa = (usd: string, assetDecimals = 18) => ethers.utils.parseUnits(usd, 36 - assetDecimals);

/// The resilient oracle every pool prices through
export async function resilientOracle() {
  return (await ethers.getContractAt(
    "ResilientOracleInterface",
    bscmainnet.RESILIENT_ORACLE,
  )) as ResilientOracleInterface;
}

export async function xvsPrice() {
  return (await resilientOracle()).getPrice(XVS);
}

/// A signer for `address`, impersonated and given gas money
export const impersonate = (address: string) => initMainnetUser(address, ethers.utils.parseUnits("1"));

/// Rewrites a tier with `overrides` on top of its current terms, as the timelock
export async function updateTier(
  f: OpenSpokeFixture,
  tierId: number,
  overrides: { enabled?: boolean; minTierBondUsd?: BigNumberish; limits?: Partial<typeof TIER_ONE_LIMITS> },
) {
  const tier = await f.policyRegistry.getTier(tierId);
  await f.policyRegistry.connect(f.timelock).setTier(tierId, {
    enabled: overrides.enabled ?? tier.enabled,
    minTierBondUsd: overrides.minTierBondUsd ?? tier.minTierBondUsd,
    limits: { ...tier.limits, ...overrides.limits },
  });
}

/// One liquidation threshold per listed market, in `getAllMarkets` order; the builder ignores the loan markets' entries
export async function exitLiquidationThresholds(comptroller: SpokeComptroller, collateralThreshold: BigNumber) {
  const markets = await comptroller.getAllMarkets();
  return Promise.all(
    markets.map(async market =>
      (await comptroller.isSupplyAllowlistEnabled(market)) ? BigNumber.from(0) : collateralThreshold,
    ),
  );
}

/// The team builds the pool's exit with `collateralThreshold` on every collateral market; returns its VIP payload
export async function buildExit(f: OpenSpokeFixture, comptroller: SpokeComptroller, collateralThreshold: BigNumber) {
  const liquidationThresholds = await exitLiquidationThresholds(comptroller, collateralThreshold);
  await f.manager.connect(f.team).buildExitProposal(comptroller.address, liquidationThresholds, "Exit");
  return f.manager.exitProposals(comptroller.address);
}

/// Builds the pool's exit with `buildExit` and executes its VIP
export async function exitPool(f: OpenSpokeFixture, comptroller: SpokeComptroller, collateralThreshold = e18("0.6")) {
  return executeVip(f, await buildExit(f, comptroller, collateralThreshold));
}

/// Crashes the pool's collateral so `borrower` falls under the minimum liquidatable collateral, then heals it as
/// the liquidator; returns the loan market's bad debt
export async function crashAndHeal(
  f: OpenSpokeFixture,
  pool: Pick<DefaultPool, "comptroller" | "collateral" | "loanVToken">,
  borrower: SignerWithAddress,
  crashUsd = "0.001",
) {
  await setPrice(pool.collateral.feed, crashUsd);
  const owed = await pool.loanVToken.callStatic.borrowBalanceCurrent(borrower.address);
  await fundUsdt(f.usdt, f.liquidator.address, owed);
  await f.usdt.connect(f.liquidator).approve(pool.loanVToken.address, owed);
  await pool.comptroller.connect(f.liquidator).healAccount(borrower.address);
  return pool.loanVToken.badDebt();
}

/// The recoverer repays `amount` of the loan market's bad debt and is paid from the XVS bond; returns the bond it received
export async function recoverFromBond(
  f: OpenSpokeFixture,
  pool: Pick<DefaultPool, "comptroller" | "loanVToken">,
  amount: BigNumber,
) {
  const { comptroller, loanVToken } = pool;
  const oracle = await resilientOracle();
  const seized = amount.mul(await oracle.getUnderlyingPrice(loanVToken.address)).div(await oracle.getPrice(XVS));
  await fundUsdt(f.usdt, f.recoverer.address, amount);
  await f.usdt.connect(f.recoverer).approve(f.shortfall.address, amount);
  const xvsBefore = await f.xvs.balanceOf(f.recoverer.address);
  await expect(f.shortfall.connect(f.recoverer).recoverBadDebt(loanVToken.address, amount))
    .to.emit(f.shortfall, "BadDebtRecovered")
    .withArgs(comptroller.address, loanVToken.address, f.recoverer.address, amount, seized);
  expect((await f.xvs.balanceOf(f.recoverer.address)).sub(xvsBefore)).to.equal(seized);
  return seized;
}

/// Has the bond manager keep USDT bonds in the Liquidity Hub
export async function useLiquidityHubBonds(f: OpenSpokeFixture) {
  await f.bondManager
    .connect(f.timelock)
    .setAssetConfig(bscmainnet.USDT, { sourceType: SourceType.LiquidityHub, source: f.hub.address });
}

/// Replays a stored VIP's actions as the Normal Timelock and returns the first one that reverts, with Hardhat's revert
/// reason; undefined when all succeed. Rewinds the chain afterwards
export async function vipFailure(f: OpenSpokeFixture, payload: string) {
  const snapshot = await takeSnapshot();
  try {
    for (const [index, action] of vipActions(payload).entries()) {
      const data = ethers.utils.id(action.signature).slice(0, 10) + action.calldata.slice(2);
      try {
        await f.timelock.sendTransaction({ to: action.target, data });
      } catch (error) {
        return { index, target: action.target, signature: action.signature, reason: (error as Error).message };
      }
    }
    return undefined;
  } finally {
    await snapshot.restore();
  }
}

let invariantsWaived = false;

/// Skips the invariant check after the current test, for a test that breaks an invariant on purpose
export const waiveInvariants = () => {
  invariantsWaived = true;
};

/// Checks what must hold after any sequence of actions: the manager holds exactly the escrow of open requests (pool
/// bonds while pending or built, seeds once built), and a deployer's active pool is the one pool of theirs still
/// running. Called from each suite's `afterEach` for passing tests
export async function assertInvariants(f: OpenSpokeFixture) {
  if (invariantsWaived) {
    invariantsWaived = false;
    return;
  }
  const escrow = new Map<string, BigNumber>([
    [XVS, BigNumber.from(0)],
    [bscmainnet.USDT, BigNumber.from(0)],
  ]);
  const add = (asset: string, amount: BigNumber) =>
    escrow.set(asset, (escrow.get(asset) ?? BigNumber.from(0)).add(amount));
  const runningStatuses = [PoolStatus.Live, PoolStatus.ExitRequested, PoolStatus.ExitProposed, PoolStatus.WindingDown];
  const requestCount = (await f.manager.requestCount()).toNumber();
  for (let requestId = 1; requestId <= requestCount; ++requestId) {
    const request = await f.manager.getRequest(requestId);
    const isPoolRequest = request.requestType === 0;
    if (request.status === RequestStatus.Pending || request.status === RequestStatus.Built) {
      if (isPoolRequest) add(request.bondAsset, request.bondAmount);
      if (request.status === RequestStatus.Built) {
        for (const market of [...request.collateralMarkets, ...request.loanMarkets]) {
          add(market.asset, await f.manager.requestSeeds(requestId, market.asset));
        }
      }
    }
    if (isPoolRequest && request.status === RequestStatus.Settled) {
      const pool = await f.manager.getPool(request.comptroller);
      const activePool = await f.manager.activePools(request.deployer);
      if (runningStatuses.includes(pool.status)) {
        expect(activePool, `active pool of ${request.deployer}`).to.equal(request.comptroller);
      } else {
        expect(activePool, `active pool of ${request.deployer}`).to.not.equal(request.comptroller);
      }
    }
  }
  for (const [asset, amount] of escrow) {
    const token = await ethers.getContractAt("MockToken", asset);
    expect(await token.balanceOf(f.manager.address), `manager's ${asset} escrow`).to.equal(amount);
  }
}

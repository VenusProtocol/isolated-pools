// Fork run: drives every Open Spoke Pool path through real GovernorBravo votes.
import { SnapshotRestorer, mine, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import {
  IERC20,
  SpokeComptroller,
  SpokePoolFactory,
  SpokePoolManager,
  SpokePoolProposer,
  SpokePoolShortfall,
  VToken,
} from "../../../../typechain";
import { bscmainnet } from "../HubSpoke/constants";
import {
  REGISTRY_ROLES,
  SpokeStack,
  deployHubSide,
  deploySpokeStack,
  fundFrom,
  grant,
  pointProtocolShareReserveAtSpokeRegistry,
  registerOnHub,
} from "../HubSpoke/fixture";

const FORK = process.env.FORK === "true";

const XVS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const USDC_HOLDER = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8"; // core-pool vUSDC
const XVS_VAULT = "0x051100480289e704d20e9DB4804837068f3f9204";
const GOVERNOR_BRAVO = "0x2d56dC077072B53571b8252008C60e945108c75a";
const VTREASURY = "0xF322942f644A996A617BD29c16bd7d231d9F35E9";
const XVS_WHALES = ["0xF977814e90dA44bFA03b6295A0616a897441aceC", "0x5a52E96BAcdaBb82fd05763E25335261B270Efcb"];
const VAULT_ARTIFACT =
  "/Users/rajdiwate/Desktop/venus/venus-protocol/artifacts/contracts/XVSVault/XVSVault.sol/XVSVault.json";
const BLOCKS_PER_YEAR = 42_048_000;
const BURN = ethers.constants.AddressZero;
const NEW_POOL = ethers.constants.AddressZero;

const e18 = (v: string) => ethers.utils.parseUnits(v, 18);
const Action = { MINT: 0, BORROW: 2, ENTER_MARKET: 7 };

const GOV_ABI = [
  "function state(uint256) view returns (uint8)",
  "function castVote(uint256,uint8)",
  "function queue(uint256)",
  "function execute(uint256)",
  "function proposalConfigs(uint256) view returns (uint256 votingDelay, uint256 votingPeriod, uint256 proposalThreshold)",
  "function getActions(uint256) view returns (address[] targets, uint256[] values, string[] signatures, bytes[] calldatas)",
  "function proposals(uint256) view returns (uint256 id, address proposer, uint256 eta, uint256 startBlock, uint256 endBlock, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool canceled, bool executed, uint8 proposalType)",
];
const VAULT_ABI = [
  "function admin() view returns (address)",
  "function _setPendingImplementation(address) returns (uint256)",
  "function _become(address)",
  "function deposit(address,uint256,uint256)",
  "function requestWithdrawal(address,uint256,uint256)",
  "function delegate(address)",
  "function getUserInfo(address,uint256,address) view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals)",
  "function lockedStakes(address) view returns (uint256)",
  "function getCurrentVotes(address) view returns (uint96)",
  "function lock(address,uint256)",
];

interface Ctx {
  s: SpokeStack;
  hub: Contract;
  spokeSource: Contract;
  adapter: Contract;
  manager: SpokePoolManager;
  factory: SpokePoolFactory;
  proposer: SpokePoolProposer;
  shortfall: SpokePoolShortfall;
  vault: Contract;
  gov: Contract;
  xvs: IERC20;
  team: SignerWithAddress;
  project: SignerWithAddress;
  voter: SignerWithAddress;
  coverer: SignerWithAddress;
  irm: string;
}

/// Fork-only: enable bounded pricing for an asset in the DeviationBoundedOracle, initializing it first if needed.
async function enableBoundedPricing(timelock: Signer, asset: string) {
  const acm = await ethers.getContractAt("AccessControlManager", bscmainnet.ACM, timelock);
  const dbo = await ethers.getContractAt("IDeviationBoundedOracle", bscmainnet.DEVIATION_BOUNDED_ORACLE, timelock);
  const initialized = (await dbo.getInitializedAssets()).some(a => a.toLowerCase() === asset.toLowerCase());
  if (initialized) {
    const sig = "setAssetBoundedPricingEnabled(address,bool)";
    await acm.giveCallPermission(dbo.address, sig, bscmainnet.NORMAL_TIMELOCK);
    await dbo.setAssetBoundedPricingEnabled(asset, true);
  } else {
    const sig = "setTokenConfig((address,uint64,uint256,uint256,bool,bool))";
    await acm.giveCallPermission(dbo.address, sig, bscmainnet.NORMAL_TIMELOCK);
    await dbo.setTokenConfig({
      asset,
      cooldownPeriod: 3600,
      triggerThreshold: e18("0.1"),
      resetThreshold: e18("0.05"),
      enableBoundedPricing: true,
      enableCaching: false,
    });
  }
}

/// Fork-only: price every asset from its main (Chainlink) feed with a long staleness budget, so multi-day governance
/// time jumps do not fail on the RedStone pivot or the fallback.
async function pinOraclesToMain(timelock: Signer, assets: string[]) {
  const acm = await ethers.getContractAt("AccessControlManager", bscmainnet.ACM, timelock);
  await acm.giveCallPermission(
    bscmainnet.RESILIENT_ORACLE,
    "enableOracle(address,uint8,bool)",
    bscmainnet.NORMAL_TIMELOCK,
  );
  await acm.giveCallPermission(bscmainnet.CHAINLINK_ORACLE, "setTokenConfig(TokenConfig)", bscmainnet.NORMAL_TIMELOCK);
  const resilient = await ethers.getContractAt(
    ["function enableOracle(address,uint8,bool)"],
    bscmainnet.RESILIENT_ORACLE,
    timelock,
  );
  const chainlink = await ethers.getContractAt(
    [
      "function tokenConfigs(address) view returns (address asset, address feed, uint256 maxStalePeriod)",
      "function setTokenConfig((address asset, address feed, uint256 maxStalePeriod))",
    ],
    bscmainnet.CHAINLINK_ORACLE,
    timelock,
  );
  for (const asset of assets) {
    const { feed } = await chainlink.tokenConfigs(asset);
    await chainlink.setTokenConfig({ asset, feed, maxStalePeriod: 10 * 365 * 24 * 3600 });
    await resilient.enableOracle(asset, 1, false);
    await resilient.enableOracle(asset, 2, false);
  }
}

async function fundXvs(xvs: IERC20, to: string, amount: BigNumber) {
  let left = amount;
  for (const whale of XVS_WHALES) {
    if (left.isZero()) return;
    const bal = await xvs.balanceOf(whale);
    const take = bal.lt(left) ? bal : left;
    await fundFrom(xvs, whale, to, take);
    left = left.sub(take);
  }
  if (!left.isZero()) throw new Error("not enough XVS in whales");
}

async function stake(c: Ctx, who: SignerWithAddress, amount: BigNumber) {
  await fundXvs(c.xvs, who.address, amount);
  await c.xvs.connect(who).approve(XVS_VAULT, amount);
  await c.vault.connect(who).deposit(XVS, 0, amount);
}

/// Vote, queue and execute a proposal through the live GovernorBravo and Normal Timelock.
async function pass(c: Ctx, proposalId: BigNumber, whileQueued?: () => Promise<void>) {
  const { votingDelay, votingPeriod } = await c.gov.proposalConfigs(0);
  await mine(votingDelay.toNumber() + 1);
  await c.gov.connect(c.voter).castVote(proposalId, 1);
  await mine(votingPeriod.toNumber());
  await c.gov.queue(proposalId);
  if (whileQueued) await whileQueued();
  await time.increase(172800 + 1);
  await c.gov.execute(proposalId);
  expect(await c.gov.state(proposalId)).to.equal(7); // Executed
}

function poolParams(c: Ctx) {
  return {
    name: "Open Spoke (fork)",
    closeFactor: e18("0.5"),
    liquidationIncentive: e18("1.1"),
    minLiquidatableCollateral: e18("100"),
    markets: [
      {
        asset: bscmainnet.USDT,
        interestRateModel: c.irm,
        name: "Venus USDT (Open Spoke)",
        symbol: "vUSDT_OpenSpoke",
        decimals: 8,
        isLoanMarket: true,
        collateralFactor: 0,
        liquidationThreshold: 0,
        supplyCap: e18("400000"),
        borrowCap: e18("300000"),
        reserveFactor: e18("0.1"),
        seed: e18("1000"),
        seedBurnShare: e18("0.1"),
        initialExchangeRate: ethers.utils.parseUnits("1", 28),
      },
      {
        asset: bscmainnet.BTCB,
        interestRateModel: c.irm,
        name: "Venus BTCB (Open Spoke)",
        symbol: "vBTCB_OpenSpoke",
        decimals: 8,
        isLoanMarket: false,
        collateralFactor: e18("0.5"),
        liquidationThreshold: e18("0.65"),
        supplyCap: e18("100"),
        borrowCap: 0,
        reserveFactor: e18("0.1"),
        seed: e18("0.01"),
        seedBurnShare: e18("0.1"),
        initialExchangeRate: ethers.utils.parseUnits("1", 28),
      },
    ],
  };
}

async function fundSeeds(c: Ctx, who: SignerWithAddress) {
  await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, who.address, e18("1000"));
  await fundFrom(c.s.btcb, bscmainnet.BTCB_HOLDER, who.address, e18("0.01"));
  await c.s.usdt.connect(who).approve(c.manager.address, e18("1000"));
  await c.s.btcb.connect(who).approve(c.manager.address, e18("0.01"));
}

async function badDebtSlot(): Promise<number> {
  const hre = await import("hardhat");
  const buildInfo = await hre.artifacts.getBuildInfo("contracts/VToken.sol:VToken");
  const layout = (buildInfo!.output.contracts["contracts/VToken.sol"].VToken as any).storageLayout.storage;
  return Number(layout.find((v: any) => v.label === "badDebt").slot);
}

async function setup(): Promise<Ctx> {
  const s = await deploySpokeStack(false);
  const [, , , , , team, project, voter, coverer, daoStaker, project2] = await ethers.getSigners();
  await pinOraclesToMain(s.timelock, [bscmainnet.USDT, bscmainnet.BTCB, USDC, XVS]);

  // Phase 1 governance state the manager builds on: registry owned and permissioned, PSR pointed at it.
  await s.registry.connect(s.timelock).acceptOwnership();
  for (const sig of Object.values(REGISTRY_ROLES))
    await grant(s.acm, s.timelock, s.registry.address, sig, bscmainnet.NORMAL_TIMELOCK);
  await pointProtocolShareReserveAtSpokeRegistry(s);
  const hubSide = await deployHubSide(s);
  await registerOnHub({ ...s, ...hubSide } as any, e18("2000000"));

  // XVSVault upgrade from venus-protocol feat/vpd-2196.
  const artifact = require(VAULT_ARTIFACT); // eslint-disable-line @typescript-eslint/no-var-requires
  const vaultImpl = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, s.deployer).deploy();
  const vault = new ethers.Contract(XVS_VAULT, VAULT_ABI, s.deployer);
  await vault.connect(s.timelock)._setPendingImplementation(vaultImpl.address);
  await new ethers.Contract(vaultImpl.address, VAULT_ABI, s.timelock)._become(XVS_VAULT);

  const irmFactory = await ethers.getContractFactory("JumpRateModelV2");
  const irm = await irmFactory.deploy(0, e18("0.1"), e18("2"), e18("0.8"), bscmainnet.ACM, false, BLOCKS_PER_YEAR);

  // Deploy order: manager, shortfall (names the manager), factory (names both), proposer (names the manager).
  const proxyFactory = await ethers.getContractFactory(
    "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol:OptimizedTransparentUpgradeableProxy",
  );
  const deployProxy = async (impl: Contract) =>
    proxyFactory.deploy(
      impl.address,
      bscmainnet.DEFAULT_PROXY_ADMIN,
      impl.interface.encodeFunctionData("initialize", [bscmainnet.ACM]),
    );
  const managerImpl = await (
    await ethers.getContractFactory("SpokePoolManager")
  ).deploy(
    XVS_VAULT,
    GOVERNOR_BRAVO,
    s.registry.address,
    bscmainnet.RESILIENT_ORACLE,
    bscmainnet.DEVIATION_BOUNDED_ORACLE,
    10,
  );
  const manager = (await ethers.getContractAt(
    "SpokePoolManager",
    (
      await deployProxy(managerImpl)
    ).address,
  )) as SpokePoolManager;
  const shortfallImpl = await (await ethers.getContractFactory("SpokePoolShortfall")).deploy(manager.address, XVS);
  const shortfall = (await ethers.getContractAt(
    "SpokePoolShortfall",
    (
      await deployProxy(shortfallImpl)
    ).address,
  )) as SpokePoolShortfall;
  const factory = (await (
    await ethers.getContractFactory("SpokePoolFactory")
  ).deploy(
    manager.address,
    s.spokeBeacon.address,
    s.vTokenBeacon.address,
    bscmainnet.PSR,
    shortfall.address,
  )) as SpokePoolFactory;
  const proposerImpl = await (await ethers.getContractFactory("SpokePoolProposer")).deploy(manager.address, VTREASURY);
  const proposer = (await ethers.getContractAt(
    "SpokePoolProposer",
    (
      await deployProxy(proposerImpl)
    ).address,
  )) as SpokePoolProposer;

  // The setup VIP: vault roles to the manager, the manager's record and seize roles to the proposer and the
  // shortfall, roles to the team / Timelock / coverer, configuration.
  for (const sig of ["lock(address,uint256)", "unlock(address,uint256)", "seizeLocked(address,uint256,address)"]) {
    await grant(s.acm, s.timelock, XVS_VAULT, sig, manager.address);
  }
  for (const sig of [
    "recordRequestProposal(uint256,MarketParams[],uint256)",
    "recordExitProposal(address,uint256)",
    "recordForceCloseProposal(address,uint256)",
  ]) {
    await grant(s.acm, s.timelock, manager.address, sig, proposer.address);
  }
  await grant(s.acm, s.timelock, manager.address, "seizeStake(address,uint256,address)", shortfall.address);
  for (const sig of [
    "proposeCreatePool(uint256,PoolParams,string)",
    "proposeAddMarkets(uint256,PoolParams,string)",
    "proposeExit(address,uint256[],string)",
    "proposeForceClose(address,string)",
  ]) {
    await grant(s.acm, s.timelock, proposer.address, sig, team.address);
  }
  for (const sig of [
    "rejectRequest(uint256)",
    "setPoolTier(address,uint256)",
    "setDeployerActionsPaused(address,bool)",
    "rejectExit(address)",
    "releaseStake(address)",
  ]) {
    await grant(s.acm, s.timelock, manager.address, sig, team.address);
  }
  for (const sig of [
    "setTier(uint256,Tier)",
    "setFactory(address)",
    "setSpokeSource(address,address)",
    "setSpokeAdapter(address)",
    "setMinSeedUsd(uint256)",
    "setLiquidationThresholdDelay(uint256)",
    "setLiquidationThresholdBufferPeriod(uint256)",
    "setRepaymentWindow(uint256)",
    "setMaxResidualDebtUsd(uint256)",
    "startWindDown(address)",
    "takeOverPool(address)",
  ]) {
    await grant(s.acm, s.timelock, manager.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }
  for (const sig of ["setCoverIncentive(uint256)", "repayBadDebt(address,uint256)"]) {
    await grant(s.acm, s.timelock, shortfall.address, sig, bscmainnet.NORMAL_TIMELOCK);
  }
  await grant(s.acm, s.timelock, shortfall.address, "coverBadDebt(address,uint256)", coverer.address);
  await grant(s.acm, s.timelock, factory.address, "createPool(uint256,PoolParams)", bscmainnet.NORMAL_TIMELOCK);
  await grant(s.acm, s.timelock, factory.address, "addMarkets(uint256,address,PoolParams)", bscmainnet.NORMAL_TIMELOCK);

  const m = manager.connect(s.timelock);
  await m.setFactory(factory.address);
  await m.setSpokeSource(bscmainnet.USDT, hubSide.spokeSource.address);
  await m.setSpokeAdapter(hubSide.adapter.address);
  await m.setTier(0, {
    stakeAmount: e18("100000"),
    maxLiquidityUsd: e18("500000"),
    maxCollateralFactor: e18("0.5"),
    maxLiquidationThreshold: e18("0.65"),
    minLiquidationThreshold: e18("0.3"),
  });
  await m.setMinSeedUsd(e18("100"));
  await m.setRepaymentWindow(24 * 3600);
  await m.setLiquidationThresholdDelay(24 * 3600);
  await m.setLiquidationThresholdBufferPeriod(24 * 3600);
  await m.setMaxResidualDebtUsd(e18("1"));
  await shortfall.connect(s.timelock).setCoverIncentive(e18("1.1"));

  const c: Ctx = {
    s,
    hub: hubSide.hub,
    spokeSource: hubSide.spokeSource,
    adapter: hubSide.adapter,
    manager,
    factory,
    proposer,
    shortfall,
    vault,
    gov: new ethers.Contract(GOVERNOR_BRAVO, GOV_ABI, s.deployer),
    xvs: (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", XVS)) as IERC20,
    team,
    project,
    voter,
    coverer,
    irm: irm.address,
  };

  // Proposal rights by delegation: a DAO staker delegates the Normal threshold to the proposer. A separate voter
  // carries quorum.
  await stake(c, daoStaker, e18("1050000"));
  await c.vault.connect(daoStaker).delegate(proposer.address);
  await stake(c, voter, e18("1550000"));
  await c.vault.connect(voter).delegate(voter.address);
  await stake(c, project, e18("150000"));
  await stake(c, project2, e18("100000"));
  await mine(1);
  (c as any).project2 = project2;
  return c;
}

if (FORK) {
  describe("Open Spoke Pool: every path on a bscmainnet fork", function () {
    this.timeout(0);
    let c: Ctx;
    let comptroller: SpokeComptroller;
    let vUSDT: VToken;
    let vBTCB: VToken;
    let live: SnapshotRestorer;

    before(async () => {
      c = await setup();
    });

    it("rejects requests outside the tier", async () => {
      await fundSeeds(c, c.project);
      const params = poolParams(c);
      params.markets[1].collateralFactor = e18("0.55");
      await expect(c.manager.connect(c.project).submitRequest(NEW_POOL, 0, params)).to.be.revertedWithCustomError(
        c.manager,
        "ExceedsTierLimit",
      );
      const tooMuch = poolParams(c);
      tooMuch.markets[0].supplyCap = e18("600000");
      await expect(c.manager.connect(c.project).submitRequest(NEW_POOL, 0, tooMuch)).to.be.revertedWithCustomError(
        c.manager,
        "ExceedsTierLimit",
      );
      const overBurn = poolParams(c);
      overBurn.markets[0].seedBurnShare = e18("1.01");
      await expect(c.manager.connect(c.project).submitRequest(NEW_POOL, 0, overBurn))
        .to.be.revertedWithCustomError(c.manager, "InvalidMarketParams")
        .withArgs(bscmainnet.USDT);
    });

    it("rejects a pending request and unlocks the stake", async () => {
      const project2 = (c as any).project2 as SignerWithAddress;
      await fundSeeds(c, project2);
      await c.manager.connect(project2).submitRequest(NEW_POOL, 0, poolParams(c));
      expect(await c.vault.lockedStakes(project2.address)).to.equal(e18("100000"));
      await expect(c.vault.connect(project2).requestWithdrawal(XVS, 0, 1)).to.be.revertedWith(
        "requested amount is invalid",
      );

      await c.manager.connect(c.team).rejectRequest(1);
      expect(await c.vault.lockedStakes(project2.address)).to.equal(0);
      expect(await c.s.usdt.balanceOf(project2.address)).to.equal(e18("1000"));
      expect(await c.s.btcb.balanceOf(project2.address)).to.equal(e18("0.01"));
      await c.vault.connect(project2).requestWithdrawal(XVS, 0, e18("100000"));
    });

    it("locks the tier stake on submit and leaves the seeds with the project", async () => {
      await c.manager.connect(c.project).submitRequest(NEW_POOL, 0, poolParams(c));
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(e18("100000"));
      expect(await c.s.usdt.balanceOf(c.project.address)).to.equal(e18("1000"));
      expect(await c.s.btcb.balanceOf(c.project.address)).to.equal(e18("0.01"));
      // 150k staked, 100k locked: only 50k can be requested.
      await expect(c.vault.connect(c.project).requestWithdrawal(XVS, 0, e18("50001"))).to.be.revertedWith(
        "requested amount is invalid",
      );
      await c.vault.connect(c.project).requestWithdrawal(XVS, 0, e18("1000"));
      // Votes still count the locked stake.
      expect(await c.vault.getCurrentVotes(c.project.address)).to.equal(0); // never delegated
    });

    it("creates, lists and Hub-wires the pool through one proposer-submitted VIP", async () => {
      const requestId = 2;
      const params = poolParams(c);
      const [predicted, predictedVTokens] = await c.factory.predictAddresses(requestId, 2);
      await c.proposer.connect(c.team).proposeCreatePool(requestId, params, "Open Spoke Pool: create fork pool");
      const request = await c.manager.requests(requestId);
      const proposalId = request.proposalId;
      expect(request.status).to.equal(2); // Proposed
      const proposal = await c.gov.proposals(proposalId);
      expect(proposal.proposer).to.equal(c.proposer.address);
      const actions = await c.gov.getActions(proposalId);
      console.log(`      creation VIP: ${actions.targets.length} actions`);
      await expect(c.factory.connect(c.voter).createPool(requestId, params)).to.be.revertedWithCustomError(
        c.factory,
        "Unauthorized",
      );

      await expect(c.manager.connect(c.team).recordExitProposal(predicted, proposalId)).to.be.revertedWithCustomError(
        c.manager,
        "Unauthorized",
      );
      // A queued proposal can still execute, so the request cannot be proposed again.
      await pass(c, proposalId, async () => {
        await expect(c.proposer.connect(c.team).proposeCreatePool(requestId, params, "again"))
          .to.be.revertedWithCustomError(c.manager, "ProposalNotFailed")
          .withArgs(proposalId);
      });
      // A second project's request, proposed later.
      await fundSeeds(c, c.voter);
      await c.manager.connect(c.voter).submitRequest(NEW_POOL, 0, poolParams(c));

      comptroller = (await ethers.getContractAt("SpokeComptroller", predicted)) as SpokeComptroller;
      vUSDT = (await ethers.getContractAt("VToken", predictedVTokens[0])) as VToken;
      vBTCB = (await ethers.getContractAt("VToken", predictedVTokens[1])) as VToken;

      expect((await c.manager.requests(requestId)).status).to.equal(4); // Executed
      const pool = await c.manager.pools(predicted);
      expect(pool.deployer).to.equal(c.project.address);
      expect(pool.status).to.equal(1); // Live
      expect(await c.manager.isLoanMarket(vUSDT.address)).to.equal(true);
      expect(await c.manager.isLoanMarket(vBTCB.address)).to.equal(false);

      expect(await comptroller.owner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
      expect(await comptroller.oracle()).to.equal(bscmainnet.RESILIENT_ORACLE);
      expect(await comptroller.deviationBoundedOracle()).to.equal(bscmainnet.DEVIATION_BOUNDED_ORACLE);
      expect((await c.s.registry.getPoolByComptroller(predicted)).comptroller).to.equal(predicted);
      expect(await c.s.registry.getVTokenForAsset(predicted, bscmainnet.USDT)).to.equal(vUSDT.address);
      const btcbMarket = await comptroller.markets(vBTCB.address);
      expect(btcbMarket.collateralFactorMantissa).to.equal(e18("0.5"));
      expect(btcbMarket.liquidationThresholdMantissa).to.equal(e18("0.65"));
      expect(await vUSDT.owner()).to.equal(bscmainnet.NORMAL_TIMELOCK);
      expect(await vUSDT.shortfall()).to.equal(c.shortfall.address);
      expect(await comptroller.isSupplyAllowlistEnabled(vUSDT.address)).to.equal(true);
      expect(await comptroller.isAllowedSupplier(vUSDT.address, c.spokeSource.address)).to.equal(true);
      expect(await c.spokeSource.resources()).to.include(vUSDT.address);

      // Seeds: 10% of each market's vTokens burned, the rest at the treasury, nothing left with the Timelock.
      for (const v of [vUSDT, vBTCB]) {
        const burned = await v.balanceOf(BURN);
        const treasury = await v.balanceOf(VTREASURY);
        expect(burned).to.be.gt(0);
        expect(treasury).to.equal(burned.mul(9));
        expect(await v.balanceOf(bscmainnet.NORMAL_TIMELOCK)).to.equal(0);
      }
      // The seeds were pulled from the project at execution; request 3's stay with its project.
      expect(await c.s.usdt.balanceOf(c.project.address)).to.equal(0);
      expect(await c.s.usdt.balanceOf(c.voter.address)).to.equal(e18("1000"));
      expect(await c.s.usdt.balanceOf(c.manager.address)).to.equal(0);
    });

    it("re-proposes a request with revised parameters once its proposal fails", async () => {
      const snapshot = await takeSnapshot();
      await c.proposer.connect(c.team).proposeCreatePool(3, poolParams(c), "Open Spoke Pool: defeated");
      const proposalId = (await c.manager.requests(3)).proposalId;
      const revised = poolParams(c);
      revised.name = "Open Spoke (revised)";
      // GovernorBravo allows one live proposal per proposer, so a pending proposal blocks the re-proposal first.
      await expect(c.proposer.connect(c.team).proposeCreatePool(3, revised, "revised")).to.be.revertedWith(
        "GovernorBravo::propose: one live proposal per proposer, found an already pending proposal",
      );
      const { votingDelay, votingPeriod } = await c.gov.proposalConfigs(0);
      await mine(votingDelay.toNumber() + votingPeriod.toNumber() + 2);
      expect(await c.gov.state(proposalId)).to.equal(3); // Defeated

      // Rejecting instead unlocks the stake; the seeds stay in the manager until claimed.
      const beforeReject = await takeSnapshot();
      await expect(c.manager.claimSeeds(3)).to.be.revertedWithCustomError(c.manager, "InvalidRequestStatus");
      await c.manager.connect(c.team).rejectRequest(3);
      expect(await c.vault.lockedStakes(c.voter.address)).to.equal(0);
      expect(await c.s.usdt.balanceOf(c.manager.address)).to.equal(e18("1000"));
      await expect(c.manager.claimSeeds(3)).to.emit(c.manager, "SeedsClaimed").withArgs(3);
      expect(await c.s.usdt.balanceOf(c.voter.address)).to.equal(e18("1000"));
      expect(await c.s.usdt.balanceOf(c.manager.address)).to.equal(0);
      await beforeReject.restore();

      // The defeated proposal's seeds go back to the project, which approves the seeds again for the new one.
      await c.s.usdt.connect(c.voter).approve(c.manager.address, e18("1000"));
      await c.s.btcb.connect(c.voter).approve(c.manager.address, e18("0.01"));
      await c.proposer.connect(c.team).proposeCreatePool(3, revised, "revised");
      expect(await c.s.usdt.balanceOf(c.manager.address)).to.equal(e18("1000"));
      const request = await c.manager.requests(3);
      expect(request.status).to.equal(2); // Proposed
      expect(request.proposalId).to.not.equal(proposalId);
      await snapshot.restore();
    });

    it("lets the Hub fund the loan market and the project borrow against collateral", async () => {
      const lp = c.voter;
      await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, lp.address, e18("100000"));
      await c.s.usdt.connect(lp).approve(c.hub.address, e18("100000"));
      const cashBefore = await vUSDT.getCash();
      await c.hub.connect(lp).deposit(e18("100000"), lp.address);
      // The market is in none of the source's queues, so the deposit goes to the next Hub group; the operator then
      // moves it into the market.
      expect(await vUSDT.getCash()).to.equal(cashBefore);

      const reallocate = "reallocate((address,address,uint256)[],(address,address,uint256)[])";
      await grant(c.s.acm, c.s.timelock, c.hub.address, reallocate, c.team.address);
      const leg = "(address yieldGroup, address resource, uint256 amount)[]";
      const hub = new ethers.Contract(
        c.hub.address,
        [`function reallocate(${leg} withdraws, ${leg} deposits)`],
        c.team,
      );
      const [, fundedGroup] = await c.hub.outerDepositQueue();
      await hub.reallocate(
        [{ yieldGroup: fundedGroup, resource: ethers.constants.AddressZero, amount: e18("100000") }],
        [{ yieldGroup: c.spokeSource.address, resource: vUSDT.address, amount: e18("100000") }],
      );
      expect(await vUSDT.getCash()).to.equal(cashBefore.add(e18("100000")));
      expect(await vUSDT.balanceOf(c.spokeSource.address)).to.be.gt(0);

      // The project posts BTCB and borrows USDT.
      await fundFrom(c.s.btcb, bscmainnet.BTCB_HOLDER, c.project.address, e18("1"));
      await c.s.btcb.connect(c.project).approve(vBTCB.address, e18("1"));
      await vBTCB.connect(c.project).mint(e18("1"));
      await comptroller.connect(c.project).enterMarkets([vBTCB.address]);
      await vUSDT.connect(c.project).borrow(e18("20000"));
      expect(await vUSDT.borrowBalanceStored(c.project.address)).to.equal(e18("20000"));
    });

    it("lets the deployer tune within its tier, and nobody else", async () => {
      const m = c.manager.connect(c.project);
      await m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.65"));
      expect((await comptroller.markets(vBTCB.address)).collateralFactorMantissa).to.equal(e18("0.45"));
      // A lower liquidation threshold waits out the delay, so borrowers can adjust first.
      await expect(
        m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "InvalidLiquidationThreshold");
      await m.scheduleLiquidationThresholdDecrease(comptroller.address, vBTCB.address, e18("0.55"));
      await expect(
        m.applyLiquidationThresholdDecrease(comptroller.address, vBTCB.address),
      ).to.be.revertedWithCustomError(c.manager, "LiquidationThresholdDelayNotElapsed");
      await time.increase(24 * 3600);
      await m.applyLiquidationThresholdDecrease(comptroller.address, vBTCB.address);
      expect((await comptroller.markets(vBTCB.address)).liquidationThresholdMantissa).to.equal(e18("0.55"));
      // Raising the threshold cancels a scheduled decrease, and a decrease left past its buffer period expires.
      await m.scheduleLiquidationThresholdDecrease(comptroller.address, vBTCB.address, e18("0.5"));
      await expect(m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6")))
        .to.emit(c.manager, "LiquidationThresholdDecreaseCancelled")
        .withArgs(comptroller.address, vBTCB.address);
      await m.scheduleLiquidationThresholdDecrease(comptroller.address, vBTCB.address, e18("0.55"));
      await time.increase(2 * 24 * 3600 + 1);
      await expect(
        m.applyLiquidationThresholdDecrease(comptroller.address, vBTCB.address),
      ).to.be.revertedWithCustomError(c.manager, "LiquidationThresholdDecreaseExpired");
      expect((await comptroller.markets(vBTCB.address)).liquidationThresholdMantissa).to.equal(e18("0.6"));
      await expect(
        m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.51"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "ExceedsTierLimit");
      await expect(
        m.setCollateralFactor(comptroller.address, vBTCB.address, 0, e18("0.2")),
      ).to.be.revertedWithCustomError(c.manager, "ExceedsTierLimit");
      await expect(m.setCollateralFactor(comptroller.address, vUSDT.address, 0, 0)).to.be.revertedWithCustomError(
        c.manager,
        "NotCollateralMarket",
      );
      await expect(
        c.manager.connect(c.voter).setCollateralFactor(comptroller.address, vBTCB.address, e18("0.4"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "NotDeployer");

      await m.setMarketSupplyCaps(comptroller.address, [vUSDT.address, vBTCB.address], [e18("450000"), e18("500")]);
      expect(await comptroller.supplyCaps(vUSDT.address)).to.equal(e18("450000"));
      await expect(
        m.setMarketSupplyCaps(comptroller.address, [vUSDT.address], [e18("510000")]),
      ).to.be.revertedWithCustomError(c.manager, "ExceedsTierLimit");
      await expect(
        m.setMarketSupplyCaps(comptroller.address, [bscmainnet.COMPTROLLER_STABLECOINS], [1]),
      ).to.be.revertedWithCustomError(c.manager, "MarketNotInPool");

      await m.setMarketBorrowCaps(comptroller.address, [vUSDT.address], [e18("350000")]);
      expect(await comptroller.borrowCaps(vUSDT.address)).to.equal(e18("350000"));
      await expect(m.setMarketBorrowCaps(comptroller.address, [vBTCB.address], [1])).to.be.revertedWithCustomError(
        c.manager,
        "NotLoanMarket",
      );

      await c.manager.connect(c.team).setDeployerActionsPaused(comptroller.address, true);
      await expect(
        m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "DeployerActionsPaused");
      await expect(m.requestExit(comptroller.address)).to.be.revertedWithCustomError(
        c.manager,
        "DeployerActionsPaused",
      );
      await c.manager.connect(c.team).setDeployerActionsPaused(comptroller.address, false);
      await m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6"));

      live = await takeSnapshot();
    });

    it("adds a collateral market to a live pool through a request", async () => {
      const usdcMarket = {
        ...poolParams(c).markets[1],
        asset: USDC,
        name: "Venus USDC (Open Spoke)",
        symbol: "vUSDC_OpenSpoke",
        collateralFactor: e18("0.5"),
        liquidationThreshold: e18("0.6"),
        supplyCap: e18("100000"),
        seed: e18("101"),
        seedBurnShare: e18("0.1"),
      };
      const params = { ...poolParams(c), markets: [usdcMarket] };
      const usdc = c.s.usdt.attach(USDC);
      await fundFrom(usdc, USDC_HOLDER, c.project.address, e18("101"));
      await usdc.connect(c.project).approve(c.manager.address, e18("101"));
      await expect(
        c.manager.connect(c.voter).submitRequest(comptroller.address, 0, params),
      ).to.be.revertedWithCustomError(c.manager, "NotDeployer");
      await expect(c.manager.connect(c.project).submitRequest(comptroller.address, 0, params))
        .to.be.revertedWithCustomError(c.manager, "BoundedPricingDisabled")
        .withArgs(USDC);
      await enableBoundedPricing(c.s.timelock, USDC);
      await c.manager.connect(c.project).submitRequest(comptroller.address, 0, params);
      const requestId = await c.manager.requestCount();
      expect((await c.manager.requests(requestId)).tierId).to.equal(0);

      const [, [vUSDCAddress]] = await c.factory.predictAddresses(requestId, 1);
      const id = await c.proposer.connect(c.team).callStatic.proposeAddMarkets(requestId, params, "add USDC");
      await c.proposer.connect(c.team).proposeAddMarkets(requestId, params, "add USDC");
      await pass(c, id);
      const vUSDC = (await ethers.getContractAt("VToken", vUSDCAddress)) as VToken;
      expect((await c.manager.requests(requestId)).status).to.equal(4); // Executed
      expect(await comptroller.isMarketListed(vUSDC.address)).to.equal(true);
      expect(await c.s.registry.getVTokenForAsset(comptroller.address, USDC)).to.equal(vUSDC.address);
      expect(await c.manager.isLoanMarket(vUSDC.address)).to.equal(false);
      expect(await vUSDC.balanceOf(VTREASURY)).to.equal((await vUSDC.balanceOf(BURN)).mul(9));

      await live.restore();
    });

    it("path 3: Venus takes the pool over and unlocks the stake", async () => {
      await c.manager.connect(c.s.timelock).takeOverPool(comptroller.address);
      expect((await c.manager.pools(comptroller.address)).status).to.equal(6); // TakenOver
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(0);
      await expect(
        c.manager.connect(c.project).setCollateralFactor(comptroller.address, vBTCB.address, e18("0.4"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "NotDeployer");
      await live.restore();
    });

    it("blocks an under-staked deployer until it tops up its stake", async () => {
      await c.manager.connect(c.s.timelock).setTier(0, {
        stakeAmount: e18("120000"),
        maxLiquidityUsd: e18("500000"),
        maxCollateralFactor: e18("0.5"),
        maxLiquidationThreshold: e18("0.65"),
        minLiquidationThreshold: e18("0.3"),
      });
      const m = c.manager.connect(c.project);
      await expect(m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6")))
        .to.be.revertedWithCustomError(c.manager, "InsufficientLockedStake")
        .withArgs(e18("120000"), e18("100000"));

      await m.topUpStake(comptroller.address);
      expect((await c.manager.pools(comptroller.address)).lockedStake).to.equal(e18("120000"));
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(e18("120000"));
      await m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6"));
      await live.restore();
    });

    it("moves the pool to another tier once its risk parameters fit that tier", async () => {
      const tier = {
        stakeAmount: e18("140000"),
        maxLiquidityUsd: e18("500000"),
        maxCollateralFactor: e18("0.4"),
        maxLiquidationThreshold: e18("0.6"),
        minLiquidationThreshold: e18("0.3"),
      };
      await expect(c.manager.connect(c.s.timelock).setTier(2, tier)).to.be.revertedWithCustomError(
        c.manager,
        "InvalidTier",
      );
      await c.manager.connect(c.s.timelock).setTier(1, tier);
      expect(await c.manager.tierCount()).to.equal(2);
      const m = c.manager.connect(c.project);
      await m.requestTierChange(comptroller.address, 1);

      // BTCB's 0.45 collateral factor is above tier 1's 0.4 maximum until the deployer lowers it.
      await expect(c.manager.connect(c.team).setPoolTier(comptroller.address, 1)).to.be.revertedWithCustomError(
        c.manager,
        "ExceedsTierLimit",
      );
      await m.setCollateralFactor(comptroller.address, vBTCB.address, e18("0.4"), e18("0.6"));
      await c.manager.connect(c.team).setPoolTier(comptroller.address, 1);

      const pool = await c.manager.pools(comptroller.address);
      expect(pool.tierId).to.equal(1);
      expect(pool.lockedStake).to.equal(e18("140000"));
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(e18("140000"));
      await expect(c.manager.connect(c.team).setPoolTier(comptroller.address, 1)).to.be.revertedWithCustomError(
        c.manager,
        "InvalidTier",
      );
      await live.restore();
    });

    it("path 2: debt-free exit after the repayment window", async () => {
      await exitAndWindDown(true);

      await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, c.project.address, e18("21000"));
      await c.s.usdt.connect(c.project).approve(vUSDT.address, ethers.constants.MaxUint256);
      await vUSDT.connect(c.project).repayBorrow(ethers.constants.MaxUint256);
      console.log(`      totalBorrows after full repay: ${await vUSDT.totalBorrows()}`);

      await time.increase(24 * 3600);
      await expect(
        c.proposer.connect(c.team).proposeForceClose(comptroller.address, "force close"),
      ).to.be.revertedWithCustomError(c.proposer, "NoOutstandingBorrows");
      await c.manager.connect(c.team).releaseStake(comptroller.address);
      expect((await c.manager.pools(comptroller.address)).status).to.equal(5); // Closed
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(0);
      await c.vault.connect(c.project).requestWithdrawal(XVS, 0, e18("149000"));
      await live.restore();
    });

    it("path 1: team-started liquidation exit, then bad debt covered from the locked stake", async () => {
      await exitAndWindDown(false);

      await expect(
        c.proposer.connect(c.team).proposeForceClose(comptroller.address, "force close"),
      ).to.be.revertedWithCustomError(c.manager, "RepaymentWindowNotElapsed");
      await time.increase(24 * 3600);
      const id = await c.proposer.connect(c.team).callStatic.proposeForceClose(comptroller.address, "force close");
      await c.proposer.connect(c.team).proposeForceClose(comptroller.address, "force close");
      await pass(c, id);
      expect(await comptroller.isForcedLiquidationEnabled(vUSDT.address)).to.equal(true);
      expect((await comptroller.markets(vBTCB.address)).liquidationThresholdMantissa).to.equal(0);

      // A liquidator closes the borrow in full, which forced liquidation allows on a healthy account.
      const liquidator = c.s.liquidator;
      await vUSDT.accrueInterest();
      const debt = await vUSDT.borrowBalanceStored(c.project.address);
      await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, liquidator.address, debt.mul(2));
      await c.s.usdt.connect(liquidator).approve(vUSDT.address, ethers.constants.MaxUint256);
      await vUSDT.accrueInterest();
      const owed = await vUSDT.borrowBalanceStored(c.project.address);
      await vUSDT.connect(liquidator).liquidateBorrow(c.project.address, owed, vBTCB.address);
      // Interest accrued between reading the debt and liquidating it; anyone can clear such dust.
      await vUSDT.connect(liquidator).repayBorrowBehalf(c.project.address, ethers.constants.MaxUint256);
      expect(await vUSDT.borrowBalanceStored(c.project.address)).to.equal(0);
      console.log(`      totalBorrows after forced liquidation: ${await vUSDT.totalBorrows()}`);

      // Bad debt as healAccount would record it.
      const badDebt = e18("5000");
      const slot = await badDebtSlot();
      await ethers.provider.send("hardhat_setStorageAt", [
        vUSDT.address,
        ethers.utils.hexValue(slot),
        ethers.utils.hexZeroPad(badDebt.toHexString(), 32),
      ]);
      await expect(c.manager.connect(c.team).releaseStake(comptroller.address)).to.be.revertedWithCustomError(
        c.manager,
        "OutstandingDebt",
      );

      await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, c.coverer.address, badDebt);
      await c.s.usdt.connect(c.coverer).approve(c.shortfall.address, badDebt);
      const lockedBefore = await c.vault.lockedStakes(c.project.address);
      const stakeBefore = (await c.vault.getUserInfo(XVS, 0, c.project.address)).amount;
      const xvsBefore = await c.xvs.balanceOf(c.coverer.address);
      const cashBefore = await vUSDT.getCash();

      await c.shortfall.connect(c.coverer).coverBadDebt(vUSDT.address, badDebt);

      const xvsPaid = (await c.xvs.balanceOf(c.coverer.address)).sub(xvsBefore);
      const oracle = await ethers.getContractAt("ResilientOracleInterface", bscmainnet.RESILIENT_ORACLE);
      const expected = badDebt
        .mul(await oracle.getUnderlyingPrice(vUSDT.address))
        .mul(e18("1.1"))
        .div((await oracle.getPrice(XVS)).mul(e18("1")));
      expect(xvsPaid).to.equal(expected);
      console.log(`      covered 5000 USDT bad debt for ${ethers.utils.formatUnits(xvsPaid)} XVS`);
      expect(await vUSDT.badDebt()).to.equal(0);
      expect(await vUSDT.getCash()).to.equal(cashBefore.add(badDebt));
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(lockedBefore.sub(xvsPaid));
      expect((await c.vault.getUserInfo(XVS, 0, c.project.address)).amount).to.equal(stakeBefore.sub(xvsPaid));
      expect((await c.manager.pools(comptroller.address)).lockedStake).to.equal(lockedBefore.sub(xvsPaid));

      // The dust left in totalBorrows no longer blocks the release.
      await c.manager.connect(c.team).releaseStake(comptroller.address);
      expect((await c.manager.pools(comptroller.address)).status).to.equal(5); // Closed
      expect((await c.manager.pools(comptroller.address)).lockedStake).to.equal(0);
      expect(await c.vault.lockedStakes(c.project.address)).to.equal(0);
      const left = (await c.vault.getUserInfo(XVS, 0, c.project.address)).amount;
      await c.vault.connect(c.project).requestWithdrawal(XVS, 0, left.sub(e18("1000")));

      // With no stake left, coverers are not paid, so Venus repays the bad debt with its own funds.
      const lateBadDebt = e18("1000");
      await ethers.provider.send("hardhat_setStorageAt", [
        vUSDT.address,
        ethers.utils.hexValue(slot),
        ethers.utils.hexZeroPad(lateBadDebt.toHexString(), 32),
      ]);
      await expect(
        c.shortfall.connect(c.coverer).coverBadDebt(vUSDT.address, lateBadDebt),
      ).to.be.revertedWithCustomError(c.manager, "InsufficientLockedStake");
      await fundFrom(c.s.usdt, bscmainnet.USDT_HOLDER, bscmainnet.NORMAL_TIMELOCK, lateBadDebt);
      await c.s.usdt.connect(c.s.timelock).approve(c.shortfall.address, lateBadDebt);
      await expect(c.shortfall.connect(c.s.timelock).repayBadDebt(vUSDT.address, lateBadDebt))
        .to.emit(c.shortfall, "BadDebtRepaid")
        .withArgs(comptroller.address, vUSDT.address, bscmainnet.NORMAL_TIMELOCK, lateBadDebt);
      expect(await vUSDT.badDebt()).to.equal(0);
    });

    async function exitAndWindDown(requested: boolean) {
      if (requested) {
        await c.manager.connect(c.project).requestExit(comptroller.address);
        expect((await c.manager.pools(comptroller.address)).status).to.equal(2); // ExitRequested
        // The team can turn a request down; the pool is live again.
        await c.manager.connect(c.team).rejectExit(comptroller.address);
        expect((await c.manager.pools(comptroller.address)).status).to.equal(1); // Live
        await c.manager.connect(c.project).requestExit(comptroller.address);
        // Rights stay until the team starts the exit.
        await c.manager
          .connect(c.project)
          .setCollateralFactor(comptroller.address, vBTCB.address, e18("0.45"), e18("0.6"));
      }
      const lts = [0, e18("0.55")];
      const id = await c.proposer.connect(c.team).callStatic.proposeExit(comptroller.address, lts, "exit");
      await c.proposer.connect(c.team).proposeExit(comptroller.address, lts, "exit");
      await expect(
        c.manager.connect(c.project).setCollateralFactor(comptroller.address, vBTCB.address, e18("0.4"), e18("0.6")),
      ).to.be.revertedWithCustomError(c.manager, "NotDeployer");
      await pass(c, id);

      expect((await c.manager.pools(comptroller.address)).status).to.equal(4); // WindingDown
      for (const action of [Action.MINT, Action.BORROW, Action.ENTER_MARKET]) {
        expect(await comptroller.actionPaused(vUSDT.address, action)).to.equal(true);
        expect(await comptroller.actionPaused(vBTCB.address, action)).to.equal(true);
      }
      for (const vToken of [vUSDT, vBTCB]) {
        expect(await comptroller.supplyCaps(vToken.address)).to.equal(0);
        expect(await comptroller.borrowCaps(vToken.address)).to.equal(0);
      }
      const btcb = await comptroller.markets(vBTCB.address);
      expect(btcb.collateralFactorMantissa).to.equal(0);
      expect(btcb.liquidationThresholdMantissa).to.equal(e18("0.55"));
    }
  });
}

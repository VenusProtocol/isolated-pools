import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish, Contract, constants } from "ethers";
import { defaultAbiCoder, parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  AccessControlManager,
  IDeviationBoundedOracle,
  IGovernorBravo,
  IGovernorBravo__factory,
  InterestRateModel,
  MockToken,
  MockToken__factory,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokePoolManager,
  SpokePoolProposer,
  SpokePoolProposer__factory,
  VToken,
} from "../../../../typechain";
import { deployVTokenBeacon, fakeInterestRateModel } from "../../util/TokenTestHelpers";
import { RequestType, collateralMarket, e18, loanMarket, request } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);
upgrades.silenceWarnings();

const REQUEST_ID = 3;
const DESCRIPTION = "# Open spoke pool";
const PROPOSAL_MAX_OPERATIONS = 100;
/// (100 - POOL_CREATION_ACTIONS) / MAX_ACTIONS_PER_MARKET
const MAX_FITTING_MARKETS = 13;
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const Action = { MINT: 0, BORROW: 2, ENTER_MARKET: 7 };

/// One governance action, as the tests expect it in a proposal.
interface ProposalAction {
  target: string;
  signature: string;
  data: string;
}

const action = (target: string, signature: string, types: string[] = [], values: unknown[] = []): ProposalAction => ({
  target,
  signature,
  data: defaultAbiCoder.encode(types, values),
});

describe("SpokePoolProposer", () => {
  let deployer: SignerWithAddress;
  let executor: SignerWithAddress;
  let stranger: SignerWithAddress;
  let treasury: SignerWithAddress;
  let spokeAdapter: SignerWithAddress;
  let protocolShareReserve: SignerWithAddress;
  let shortfall: SignerWithAddress;
  let poolRegistry: SignerWithAddress;
  let spokeSource: SignerWithAddress;
  let manager: FakeContract<SpokePoolManager>;
  let governor: FakeContract<IGovernorBravo>;
  let acm: FakeContract<AccessControlManager>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let comptrollerBeacon: Contract;
  let vTokenBeacon: Contract;
  let collateralAsset: MockToken;
  let loanAsset: MockToken;
  let proposer: SpokePoolProposer;

  const deployProposer = (overrides: Partial<Record<string, string>> = {}) => {
    const args = {
      manager: manager.address,
      treasury: treasury.address,
      spokeAdapter: spokeAdapter.address,
      comptrollerBeacon: comptrollerBeacon.address,
      vTokenBeacon: vTokenBeacon.address,
      protocolShareReserve: protocolShareReserve.address,
      shortfall: shortfall.address,
      ...overrides,
    };
    return new SpokePoolProposer__factory(deployer).deploy(
      args.manager,
      args.treasury,
      args.spokeAdapter,
      args.comptrollerBeacon,
      args.vTokenBeacon,
      args.protocolShareReserve,
      args.shortfall,
    );
  };

  const decodeProposal = (proposal: string) =>
    IGovernorBravo__factory.createInterface().decodeFunctionData("propose", proposal);

  /// Decodes a built proposal and checks it is a Normal-route `propose` of exactly `actions`.
  const expectProposal = (proposal: string, actions: ProposalAction[]) => {
    const [targets, values, signatures, calldatas, description, proposalType] = decodeProposal(proposal);
    expect(targets).to.deep.equal(actions.map(a => a.target));
    expect(values).to.deep.equal(actions.map(() => BigNumber.from(0)));
    expect(signatures).to.deep.equal(actions.map(a => a.signature));
    expect(calldatas).to.deep.equal(actions.map(a => a.data));
    expect(description).to.equal(DESCRIPTION);
    expect(proposalType).to.equal(0);
  };

  /// The four actions that list a market with `seed`, mint its vTokens to the executor and split them.
  const listingActions = (
    asset: string,
    vToken: string,
    market: ReturnType<typeof collateralMarket>,
    burned: BigNumberish,
    kept: BigNumberish,
  ) => [
    action(asset, "approve(address,uint256)", ["address", "uint256"], [poolRegistry.address, market.seed]),
    action(
      poolRegistry.address,
      "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
      ["tuple(address,uint256,uint256,uint256,address,uint256,uint256)"],
      [
        [
          vToken,
          market.collateralFactor,
          market.liquidationThreshold,
          market.seed,
          executor.address,
          market.supplyCap,
          market.borrowCap,
        ],
      ],
    ),
    action(vToken, "transfer(address,uint256)", ["address", "uint256"], [constants.AddressZero, burned]),
    action(vToken, "transfer(address,uint256)", ["address", "uint256"], [treasury.address, kept]),
  ];

  const hubActions = (comptroller: string, vToken: string) => [
    action(comptroller, "setSupplyAllowlistEnabled(address,bool)", ["address", "bool"], [vToken, true]),
    action(
      comptroller,
      "setAllowedSupplier(address,address,bool)",
      ["address", "address", "bool"],
      [vToken, spokeSource.address, true],
    ),
    action(spokeSource.address, "addResource(address,address)", ["address", "address"], [vToken, spokeAdapter.address]),
  ];

  const settleAction = () => action(manager.address, "settleRequest(uint256)", ["uint256"], [REQUEST_ID]);

  beforeEach(async () => {
    [deployer, executor, stranger, treasury, spokeAdapter, protocolShareReserve, shortfall, poolRegistry, spokeSource] =
      await ethers.getSigners();
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    governor = await smock.fake<IGovernorBravo>("IGovernorBravo");
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    interestRateModel = await fakeInterestRateModel();

    governor.proposalMaxOperations.returns(PROPOSAL_MAX_OPERATIONS);
    governor.proposalTimelocks.whenCalledWith(0).returns(executor.address);
    manager.MAX_POOL_MARKETS.returns(MAX_FITTING_MARKETS);
    manager.GOVERNOR_BRAVO.returns(governor.address);
    manager.POOL_REGISTRY.returns(poolRegistry.address);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.DEVIATION_BOUNDED_ORACLE.returns(boundedOracle.address);
    manager.accessControlManager.returns(acm.address);
    manager.spokeSources.returns(spokeSource.address);
    await setBalance(manager.address, parseEther("1"));

    comptrollerBeacon = await upgrades.deployBeacon(await ethers.getContractFactory("SpokeComptroller"), {
      constructorArgs: [poolRegistry.address],
    });
    vTokenBeacon = await deployVTokenBeacon();
    collateralAsset = await new MockToken__factory(deployer).deploy("Collateral", "COL", 18);
    loanAsset = await new MockToken__factory(deployer).deploy("Loan", "LOAN", 6);

    proposer = await deployProposer();
  });

  describe("constructor", () => {
    for (const name of [
      "manager",
      "treasury",
      "spokeAdapter",
      "comptrollerBeacon",
      "vTokenBeacon",
      "protocolShareReserve",
      "shortfall",
    ]) {
      it(`reverts when the ${name} is the zero address`, async () => {
        await expect(deployProposer({ [name]: constants.AddressZero })).to.be.revertedWithCustomError(
          proposer,
          "ZeroAddressNotAllowed",
        );
      });
    }

    it("reverts when a pool of the manager's most markets cannot fit in one proposal", async () => {
      manager.MAX_POOL_MARKETS.returns(MAX_FITTING_MARKETS + 1);
      await expect(deployProposer())
        .to.be.revertedWithCustomError(proposer, "TooManyMarkets")
        .withArgs(MAX_FITTING_MARKETS + 1, MAX_FITTING_MARKETS);
    });

    it("stores its addresses", async () => {
      expect(await proposer.SPOKE_POOL_MANAGER()).to.equal(manager.address);
      expect(await proposer.TREASURY()).to.equal(treasury.address);
      expect(await proposer.SPOKE_ADAPTER()).to.equal(spokeAdapter.address);
      expect(await proposer.COMPTROLLER_BEACON()).to.equal(comptrollerBeacon.address);
      expect(await proposer.VTOKEN_BEACON()).to.equal(vTokenBeacon.address);
      expect(await proposer.PROTOCOL_SHARE_RESERVE()).to.equal(protocolShareReserve.address);
      expect(await proposer.SHORTFALL()).to.equal(shortfall.address);
    });
  });

  describe("buildRequestProposal", () => {
    /// 100 COL at one vToken per COL is 100e8 vTokens, a third of them burned
    const collateral = () =>
      collateralMarket(collateralAsset.address, {
        interestRateModel: interestRateModel.address,
        seedBurnPercent: parseUnits("0.333333333333333333", 18),
      });
    /// 100 LOAN of 6 decimals at one vToken per LOAN, half of them burned
    const loan = () =>
      loanMarket(loanAsset.address, {
        interestRateModel: interestRateModel.address,
        seed: parseUnits("100", 6),
        supplyCap: parseUnits("4000", 6),
        borrowCap: parseUnits("3000", 6),
        initialExchangeRate: parseUnits("1", 16),
        reserveFactor: e18("0.2"),
      });

    const build = () => proposer.connect(manager.wallet).callStatic.buildRequestProposal(REQUEST_ID, DESCRIPTION);

    it("reverts unless the manager calls", async () => {
      await expect(proposer.connect(stranger).buildRequestProposal(REQUEST_ID, DESCRIPTION))
        .to.be.revertedWithCustomError(proposer, "NotManager")
        .withArgs(stranger.address);
    });

    describe("a pool request", () => {
      beforeEach(async () => {
        manager.getRequest.whenCalledWith(REQUEST_ID).returns(
          request({
            pool: { tierId: 1, stake: e18("1000"), name: "Open Pool", params: POOL_PARAMS },
            markets: [collateral(), loan()],
          }),
        );
      });

      it("lists the new pool, settles the request, and lists and splits each market's seed", async () => {
        const [comptroller, vTokens, proposal] = await build();

        expect(vTokens).to.have.length(2);
        const [vCollateral, vLoan] = vTokens;
        expectProposal(proposal, [
          action(comptroller, "acceptOwnership()"),
          action(
            poolRegistry.address,
            "addPool(string,address,uint256,uint256,uint256)",
            ["string", "address", "uint256", "uint256", "uint256"],
            [
              "Open Pool",
              comptroller,
              POOL_PARAMS.closeFactor,
              POOL_PARAMS.liquidationIncentive,
              POOL_PARAMS.minLiquidatableCollateral,
            ],
          ),
          settleAction(),
          // The burn rounds down: 1e10 * 0.333.. = 3,333,333,333.3
          ...listingActions(collateralAsset.address, vCollateral, collateral(), 3_333_333_333, 6_666_666_667),
          ...listingActions(loanAsset.address, vLoan, loan(), 5_000_000_000, 5_000_000_000),
          ...hubActions(comptroller, vLoan),
        ]);
      });

      it("deploys the comptroller behind the beacon, owned by the proposer until the executor accepts", async () => {
        const [address] = await build();
        await proposer.connect(manager.wallet).buildRequestProposal(REQUEST_ID, DESCRIPTION);

        const comptroller = (await ethers.getContractAt("SpokeComptroller", address)) as SpokeComptroller;
        expect(await ethers.provider.getStorageAt(address, BEACON_SLOT)).to.equal(
          defaultAbiCoder.encode(["address"], [comptrollerBeacon.address]),
        );
        expect(await comptroller.owner()).to.equal(proposer.address);
        expect(await comptroller.pendingOwner()).to.equal(executor.address);
        expect(await comptroller.accessControlManager()).to.equal(acm.address);
        expect(await comptroller.maxLoopsLimit()).to.equal(await proposer.MAX_LOOPS_LIMIT());
        expect(await comptroller.oracle()).to.equal(oracle.address);
        expect(await comptroller.deviationBoundedOracle()).to.equal(boundedOracle.address);
      });

      it("deploys each market behind the beacon with the request's parameters, owned by the executor", async () => {
        const [comptroller, vTokens] = await build();
        await proposer.connect(manager.wallet).buildRequestProposal(REQUEST_ID, DESCRIPTION);

        for (const [index, market] of [collateral(), loan()].entries()) {
          const vToken = (await ethers.getContractAt("VToken", vTokens[index])) as VToken;
          expect(await ethers.provider.getStorageAt(vToken.address, BEACON_SLOT)).to.equal(
            defaultAbiCoder.encode(["address"], [vTokenBeacon.address]),
          );
          expect(await vToken.underlying()).to.equal(market.asset);
          expect(await vToken.comptroller()).to.equal(comptroller);
          expect(await vToken.interestRateModel()).to.equal(interestRateModel.address);
          expect(await vToken.exchangeRateStored()).to.equal(market.initialExchangeRate);
          expect(await vToken.name()).to.equal(market.name);
          expect(await vToken.symbol()).to.equal(market.symbol);
          expect(await vToken.decimals()).to.equal(market.decimals);
          expect(await vToken.owner()).to.equal(executor.address);
          expect(await vToken.accessControlManager()).to.equal(acm.address);
          expect(await vToken.shortfall()).to.equal(shortfall.address);
          expect(await vToken.protocolShareReserve()).to.equal(protocolShareReserve.address);
          expect(await vToken.reserveFactorMantissa()).to.equal(market.reserveFactor);
        }
      });
    });

    it("adds a live pool's markets to its comptroller without deploying another", async () => {
      const comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
      comptroller.isComptroller.returns(true);
      manager.getRequest
        .whenCalledWith(REQUEST_ID)
        .returns(request({ requestType: RequestType.Markets, comptroller: comptroller.address, markets: [loan()] }));

      const [returned, vTokens, proposal] = await build();

      expect(returned).to.equal(comptroller.address);
      expectProposal(proposal, [
        settleAction(),
        ...listingActions(loanAsset.address, vTokens[0], loan(), 5_000_000_000, 5_000_000_000),
        ...hubActions(comptroller.address, vTokens[0]),
      ]);
    });
  });

  describe("exit proposals", () => {
    let comptroller: FakeContract<SpokeComptroller>;
    let vCollateral: FakeContract<VToken>;
    let vLoan: FakeContract<VToken>;
    let vIdleLoan: FakeContract<VToken>;
    let vUnlisted: FakeContract<VToken>;

    beforeEach(async () => {
      comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
      vCollateral = await smock.fake<VToken>("VToken");
      vLoan = await smock.fake<VToken>("VToken");
      vIdleLoan = await smock.fake<VToken>("VToken");
      vUnlisted = await smock.fake<VToken>("VToken");

      comptroller.getAllMarkets.returns([vCollateral.address, vUnlisted.address, vLoan.address, vIdleLoan.address]);
      comptroller.markets.whenCalledWith(vCollateral.address).returns([true, e18("0.6"), e18("0.75")]);
      comptroller.markets.whenCalledWith(vLoan.address).returns([true, 0, 0]);
      comptroller.markets.whenCalledWith(vIdleLoan.address).returns([true, 0, 0]);
      comptroller.markets.whenCalledWith(vUnlisted.address).returns([false, e18("0.5"), e18("0.6")]);
      manager.isLoanMarket.whenCalledWith(vLoan.address).returns(true);
      manager.isLoanMarket.whenCalledWith(vIdleLoan.address).returns(true);
      vLoan.totalBorrows.returns(1);
    });

    describe("buildExitProposal", () => {
      const build = (liquidationThresholds: BigNumberish[]) =>
        proposer.connect(manager.wallet).buildExitProposal(comptroller.address, liquidationThresholds, DESCRIPTION);

      it("reverts unless the manager calls", async () => {
        await expect(proposer.connect(stranger).buildExitProposal(comptroller.address, [], DESCRIPTION))
          .to.be.revertedWithCustomError(proposer, "NotManager")
          .withArgs(stranger.address);
      });

      it("reverts unless there is one threshold per listed market", async () => {
        for (const thresholds of [
          [0, 0],
          [0, 0, 0, 0],
        ]) {
          await expect(build(thresholds)).to.be.revertedWithCustomError(proposer, "InvalidArrayLength");
        }
      });

      it("pauses and uncaps the listed markets, zeroes collateral factors, then starts the wind-down", async () => {
        const listed = [vCollateral.address, vLoan.address, vIdleLoan.address];
        const zeroCaps = [0, 0, 0];

        // The loan markets' thresholds are ignored
        const proposal = await build([e18("0.7"), constants.MaxUint256, 0]);

        expectProposal(proposal, [
          action(
            comptroller.address,
            "setActionsPaused(address[],uint8[],bool)",
            ["address[]", "uint8[]", "bool"],
            [listed, [Action.MINT, Action.BORROW, Action.ENTER_MARKET], true],
          ),
          action(
            comptroller.address,
            "setMarketSupplyCaps(address[],uint256[])",
            ["address[]", "uint256[]"],
            [listed, zeroCaps],
          ),
          action(
            comptroller.address,
            "setMarketBorrowCaps(address[],uint256[])",
            ["address[]", "uint256[]"],
            [listed, zeroCaps],
          ),
          action(
            comptroller.address,
            "setCollateralFactor(address,uint256,uint256)",
            ["address", "uint256", "uint256"],
            [vCollateral.address, 0, e18("0.7")],
          ),
          action(manager.address, "startWindDown(address)", ["address"], [comptroller.address]),
        ]);
      });

      it("accepts a threshold equal to the market's current one", async () => {
        const [, , , calldatas] = decodeProposal(await build([e18("0.75"), 0, 0]));
        expect(calldatas[3]).to.equal(
          defaultAbiCoder.encode(["address", "uint256", "uint256"], [vCollateral.address, 0, e18("0.75")]),
        );
      });

      it("reverts on a threshold above the market's current one", async () => {
        await expect(build([e18("0.75").add(1), 0, 0]))
          .to.be.revertedWithCustomError(proposer, "InvalidLiquidationThreshold")
          .withArgs(vCollateral.address);
      });

      it("only starts the wind-down of a pool without listed markets", async () => {
        comptroller.getAllMarkets.returns([vUnlisted.address]);

        expectProposal(await build([]), [
          action(manager.address, "startWindDown(address)", ["address"], [comptroller.address]),
        ]);
      });
    });

    describe("buildForceCloseProposal", () => {
      const build = () => proposer.connect(manager.wallet).buildForceCloseProposal(comptroller.address, DESCRIPTION);

      it("reverts unless the manager calls", async () => {
        await expect(proposer.connect(stranger).buildForceCloseProposal(comptroller.address, DESCRIPTION))
          .to.be.revertedWithCustomError(proposer, "NotManager")
          .withArgs(stranger.address);
      });

      it("zeroes listed collateral and forces liquidation of loan markets with borrows", async () => {
        expectProposal(await build(), [
          action(
            comptroller.address,
            "setCollateralFactor(address,uint256,uint256)",
            ["address", "uint256", "uint256"],
            [vCollateral.address, 0, 0],
          ),
          action(comptroller.address, "setForcedLiquidation(address,bool)", ["address", "bool"], [vLoan.address, true]),
        ]);
      });

      it("reverts when no loan market has borrows", async () => {
        vLoan.totalBorrows.returns(0);
        await expect(build()).to.be.revertedWithCustomError(proposer, "NoOutstandingBorrows");
      });
    });
  });
});

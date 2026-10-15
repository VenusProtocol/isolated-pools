import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  IDeviationBoundedOracle,
  IRiskOracle,
  IRiskStewardReceiver,
  PoolRegistry,
  ResilientOracleInterface,
  SpokeComptroller,
  SpokePoolManager,
  SpokePoolValidator,
  SpokePoolValidator__factory,
  VToken,
} from "../../../../typechain";
import { NO_ESTIMATE, PoolStatus, RequestType, TIER, collateralMarket, e18, loanMarket, request } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const REQUEST_ID = 7;
const POOL_TIER_ID = 2;
const MAX_POOL_MARKETS = 4;
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const SUPPLY_CAP_UPDATE = "supplyCap";
const UpdateStatus = { None: 0, Pending: 1, Executed: 2 };

/// The pool under test lists a collateral market (CF 0.6, LT 0.75) and a loan market capped at $4,000 at $1.
const LISTED_LOAN_CAP = e18("4000");

describe("SpokePoolValidator", () => {
  let collateralAsset: SignerWithAddress;
  let loanAsset: SignerWithAddress;
  let newAsset: SignerWithAddress;
  let spokeSource: SignerWithAddress;
  let unlistedVToken: SignerWithAddress;
  /// Distinct assets for market-count checks
  let assets: string[];
  let manager: FakeContract<SpokePoolManager>;
  let registry: FakeContract<PoolRegistry>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let boundedOracle: FakeContract<IDeviationBoundedOracle>;
  let riskOracle: FakeContract<IRiskOracle>;
  let receiver: FakeContract<IRiskStewardReceiver>;
  let comptroller: FakeContract<SpokeComptroller>;
  let collateralVToken: FakeContract<VToken>;
  let loanVToken: FakeContract<VToken>;
  let validator: SpokePoolValidator;

  const poolRequest = (overrides: object = {}) =>
    request({
      pool: { tierId: 0, stake: TIER.stakeAmount, name: "Pool", params: POOL_PARAMS },
      markets: [collateralMarket(collateralAsset.address), loanMarket(loanAsset.address)],
      ...overrides,
    });

  const marketsRequest = (markets: object[]) =>
    request({ requestType: RequestType.Markets, comptroller: comptroller.address, markets });

  const verify = (req: object) => {
    manager.getRequest.whenCalledWith(REQUEST_ID).returns(req);
    return validator.verifyRequest(REQUEST_ID);
  };

  /// Makes the RiskOracle hold a published supply cap of the loan market with the receiver at `status`.
  const publishSupplyCap = (updateId: number, supplyCap: BigNumberish, status: number) => {
    riskOracle.getLatestUpdateIdByTypeAndMarket.whenCalledWith(SUPPLY_CAP_UPDATE, loanVToken.address).returns(updateId);
    setUpdate(updateId, supplyCap, status);
  };

  /// Makes the receiver hold a registered supply cap of the loan market at `status`.
  const registerSupplyCap = (updateId: number, supplyCap: BigNumberish, status: number) => {
    receiver.getLastRegisteredUpdate.whenCalledWith(SUPPLY_CAP_UPDATE, loanVToken.address).returns(updateId);
    setUpdate(updateId, supplyCap, status);
  };

  const setUpdate = (updateId: number, supplyCap: BigNumberish, status: number) => {
    riskOracle.getUpdateById.whenCalledWith(updateId).returns({
      referenceId: "",
      updateId,
      market: loanVToken.address,
      updateType: SUPPLY_CAP_UPDATE,
      updateTypeKey: constants.HashZero,
      newValue: defaultAbiCoder.encode(["uint256"], [supplyCap]),
      previousValue: "0x",
      timestamp: 0,
      publisher: manager.address,
      poolId: 0,
      destLzEid: 0,
      additionalData: "0x",
    });
    receiver.updates.whenCalledWith(updateId).returns({
      updateId,
      unlockTime: 0,
      status,
      executor: constants.AddressZero,
      executedAt: 0,
    });
  };

  beforeEach(async () => {
    const [deployer, ...others] = await ethers.getSigners();
    [collateralAsset, loanAsset, newAsset, spokeSource, unlistedVToken] = others;
    assets = others.slice(5).map(signer => signer.address);
    manager = await smock.fake<SpokePoolManager>("SpokePoolManager");
    registry = await smock.fake<PoolRegistry>("PoolRegistry");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    boundedOracle = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
    riskOracle = await smock.fake<IRiskOracle>("IRiskOracle");
    receiver = await smock.fake<IRiskStewardReceiver>("IRiskStewardReceiver");
    comptroller = await smock.fake<SpokeComptroller>("SpokeComptroller");
    collateralVToken = await smock.fake<VToken>("VToken");
    loanVToken = await smock.fake<VToken>("VToken");

    manager.POOL_REGISTRY.returns(registry.address);
    manager.RESILIENT_ORACLE.returns(oracle.address);
    manager.DEVIATION_BOUNDED_ORACLE.returns(boundedOracle.address);
    manager.RISK_ORACLE.returns(riskOracle.address);
    manager.MAX_POOL_MARKETS.returns(MAX_POOL_MARKETS);
    manager.getTier.returns(TIER);
    manager.spokeSources.returns(spokeSource.address);
    manager.isLoanMarket.whenCalledWith(loanVToken.address).returns(true);
    manager.getPool.whenCalledWith(comptroller.address).returns({
      deployer: deployer.address,
      status: PoolStatus.Live,
      deployerPaused: false,
      tierId: POOL_TIER_ID,
      windDownStartedAt: 0,
      lockedStake: TIER.stakeAmount,
    });
    oracle.getPrice.returns(e18("1"));
    oracle.getUnderlyingPrice.returns(e18("1"));
    boundedOracle.isBoundedPricingEnabled.returns(true);

    comptroller.getAllMarkets.returns([collateralVToken.address, loanVToken.address]);
    comptroller.isMarketListed.whenCalledWith(collateralVToken.address).returns(true);
    comptroller.isMarketListed.whenCalledWith(loanVToken.address).returns(true);
    comptroller.markets.whenCalledWith(collateralVToken.address).returns([true, e18("0.6"), e18("0.75")]);
    comptroller.markets.whenCalledWith(loanVToken.address).returns([true, 0, 0]);
    comptroller.supplyCaps.whenCalledWith(loanVToken.address).returns(LISTED_LOAN_CAP);

    validator = await new SpokePoolValidator__factory(deployer).deploy(manager.address, receiver.address);
  });

  describe("constructor", () => {
    it("reverts when the manager is the zero address", async () => {
      const factory = await ethers.getContractFactory<SpokePoolValidator__factory>("SpokePoolValidator");
      await expect(factory.deploy(constants.AddressZero, receiver.address)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("reverts when the receiver is the zero address", async () => {
      const factory = await ethers.getContractFactory<SpokePoolValidator__factory>("SpokePoolValidator");
      await expect(factory.deploy(manager.address, constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("stores the manager and receiver and copies the manager's registry and oracles", async () => {
      expect(await validator.SPOKE_POOL_MANAGER()).to.equal(manager.address);
      expect(await validator.RISK_STEWARD_RECEIVER()).to.equal(receiver.address);
      expect(await validator.POOL_REGISTRY()).to.equal(registry.address);
      expect(await validator.RESILIENT_ORACLE()).to.equal(oracle.address);
      expect(await validator.DEVIATION_BOUNDED_ORACLE()).to.equal(boundedOracle.address);
      expect(await validator.RISK_ORACLE()).to.equal(riskOracle.address);
    });
  });

  describe("accrueAndCheckResidualDebt", () => {
    beforeEach(async () => {
      // $800 of debt: 300 borrowed and 100 bad debt at $2
      loanVToken.totalBorrowsCurrent.returns(e18("300"));
      loanVToken.badDebt.returns(e18("100"));
      oracle.getUnderlyingPrice.whenCalledWith(loanVToken.address).returns(e18("2"));
    });

    it("accrues every market and passes when the debt equals the limit", async () => {
      manager.maxResidualPoolDebtUsd.returns(e18("800"));

      await validator.accrueAndCheckResidualDebt(comptroller.address, NO_ESTIMATE);

      expect(collateralVToken.totalBorrowsCurrent).to.have.been.calledOnce;
      expect(loanVToken.totalBorrowsCurrent).to.have.been.calledOnce;
      expect(oracle.getUnderlyingPrice).to.have.been.calledOnceWith(loanVToken.address);
    });

    it("reverts with the pool's debt when it exceeds the limit", async () => {
      manager.maxResidualPoolDebtUsd.returns(e18("800").sub(1));

      await expect(validator.accrueAndCheckResidualDebt(comptroller.address))
        .to.be.revertedWithCustomError(validator, "ResidualDebtExceeded")
        .withArgs(e18("800"));
    });

    it("passes a pool without markets under a zero limit", async () => {
      comptroller.getAllMarkets.returns([]);

      await expect(validator.accrueAndCheckResidualDebt(comptroller.address)).to.not.be.reverted;
    });
  });

  describe("verifyRequest", () => {
    describe("pool requests", () => {
      it("passes a request whose markets fit the tier, without reading any pool", async () => {
        await expect(verify(poolRequest())).to.not.be.reverted;

        expect(manager.getTier).to.have.been.calledOnceWith(0);
        expect(manager.getPool).to.not.have.been.called;
        expect(comptroller.getAllMarkets).to.not.have.been.called;
        expect(registry.getVTokenForAsset).to.not.have.been.called;
      });

      it("reverts when the close factor is zero", async () => {
        const pool = { tierId: 0, stake: TIER.stakeAmount, name: "Pool", params: { ...POOL_PARAMS, closeFactor: 0 } };
        await expect(verify(poolRequest({ pool }))).to.be.revertedWithCustomError(validator, "InvalidPoolParams");
      });

      it("reverts when the liquidation incentive is zero", async () => {
        const params = { ...POOL_PARAMS, liquidationIncentive: 0 };
        const pool = { tierId: 0, stake: TIER.stakeAmount, name: "Pool", params };
        await expect(verify(poolRequest({ pool }))).to.be.revertedWithCustomError(validator, "InvalidPoolParams");
      });

      it("reverts when the locked stake is no longer the tier's", async () => {
        const pool = { tierId: 1, stake: TIER.stakeAmount.sub(1), name: "Pool", params: POOL_PARAMS };
        await expect(verify(poolRequest({ pool })))
          .to.be.revertedWithCustomError(validator, "InvalidTier")
          .withArgs(1);
      });

      it("passes as many markets as the pool may have", async () => {
        const markets = assets.slice(0, MAX_POOL_MARKETS).map(asset => collateralMarket(asset));
        await expect(verify(poolRequest({ markets }))).to.not.be.reverted;
      });

      it("reverts when the markets exceed the pool's limit", async () => {
        const markets = assets.slice(0, MAX_POOL_MARKETS + 1).map(asset => collateralMarket(asset));
        await expect(verify(poolRequest({ markets })))
          .to.be.revertedWithCustomError(validator, "TooManyMarkets")
          .withArgs(5, MAX_POOL_MARKETS);
      });

      it("reverts when two markets share an asset", async () => {
        const markets = [
          collateralMarket(collateralAsset.address),
          loanMarket(loanAsset.address),
          loanMarket(collateralAsset.address),
        ];
        await expect(verify(poolRequest({ markets })))
          .to.be.revertedWithCustomError(validator, "DuplicateAsset")
          .withArgs(collateralAsset.address);
      });

      it("passes loan supply caps worth exactly the tier's liquidity", async () => {
        oracle.getPrice.whenCalledWith(loanAsset.address).returns(e18("2"));
        const markets = [loanMarket(loanAsset.address, { supplyCap: e18("5000") })];

        await expect(verify(poolRequest({ markets }))).to.not.be.reverted;
      });

      it("reverts when the loan supply caps exceed the tier's liquidity", async () => {
        oracle.getPrice.whenCalledWith(loanAsset.address).returns(e18("2"));
        const markets = [loanMarket(loanAsset.address, { supplyCap: e18("5000").add(1) })];

        await expect(verify(poolRequest({ markets }))).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });
    });

    describe("market checks", () => {
      const verifyMarket = (market: object) => verify(poolRequest({ markets: [market] }));

      const invalidParams: [string, object][] = [
        ["an empty name", { name: "" }],
        ["an empty symbol", { symbol: "" }],
        ["zero decimals", { decimals: 0 }],
        ["a seed above the supply cap", { seed: e18("1000").add(1) }],
        ["a zero seed burn share", { seedBurnPercent: 0 }],
        ["a seed burn share above 100%", { seedBurnPercent: e18("1").add(1) }],
      ];
      for (const [description, overrides] of invalidParams) {
        it(`reverts on ${description}`, async () => {
          await expect(verifyMarket(collateralMarket(collateralAsset.address, overrides)))
            .to.be.revertedWithCustomError(validator, "InvalidMarketParams")
            .withArgs(collateralAsset.address);
        });
      }

      it("passes a seed equal to the supply cap and a full seed burn", async () => {
        const market = collateralMarket(collateralAsset.address, { seed: e18("1000"), seedBurnPercent: e18("1") });
        await expect(verifyMarket(market)).to.not.be.reverted;
      });

      it("reverts on a loan market with a collateral factor", async () => {
        await expect(verifyMarket(loanMarket(loanAsset.address, { collateralFactor: 1 })))
          .to.be.revertedWithCustomError(validator, "InvalidMarketParams")
          .withArgs(loanAsset.address);
      });

      it("reverts on a loan market with a liquidation threshold", async () => {
        await expect(verifyMarket(loanMarket(loanAsset.address, { liquidationThreshold: 1 })))
          .to.be.revertedWithCustomError(validator, "InvalidMarketParams")
          .withArgs(loanAsset.address);
      });

      it("reverts on a loan market whose asset has no Hub source", async () => {
        manager.spokeSources.whenCalledWith(loanAsset.address).returns(constants.AddressZero);
        await expect(verifyMarket(loanMarket(loanAsset.address)))
          .to.be.revertedWithCustomError(validator, "UnsupportedAsset")
          .withArgs(loanAsset.address);
      });

      it("does not check a loan market's bounded pricing", async () => {
        boundedOracle.isBoundedPricingEnabled.returns(false);
        await expect(verifyMarket(loanMarket(loanAsset.address))).to.not.be.reverted;
      });

      it("reverts on a collateral market with a borrow cap", async () => {
        await expect(verifyMarket(collateralMarket(collateralAsset.address, { borrowCap: 1 })))
          .to.be.revertedWithCustomError(validator, "InvalidMarketParams")
          .withArgs(collateralAsset.address);
      });

      it("reverts on a collateral factor above the liquidation threshold", async () => {
        const market = collateralMarket(collateralAsset.address, {
          collateralFactor: e18("0.7"),
          liquidationThreshold: e18("0.6"),
        });
        await expect(verifyMarket(market))
          .to.be.revertedWithCustomError(validator, "InvalidMarketParams")
          .withArgs(collateralAsset.address);
      });

      it("passes a collateral market at the tier's bounds", async () => {
        const market = collateralMarket(collateralAsset.address, {
          collateralFactor: TIER.maxCollateralFactor,
          liquidationThreshold: TIER.maxLiquidationThreshold,
        });
        await expect(verifyMarket(market)).to.not.be.reverted;
        expect(boundedOracle.isBoundedPricingEnabled).to.have.been.calledOnceWith(collateralAsset.address);
      });

      it("reverts on a collateral factor above the tier's", async () => {
        const market = collateralMarket(collateralAsset.address, { collateralFactor: TIER.maxCollateralFactor.add(1) });
        await expect(verifyMarket(market)).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });

      it("reverts on a collateral market without bounded pricing", async () => {
        boundedOracle.isBoundedPricingEnabled.whenCalledWith(collateralAsset.address).returns(false);
        await expect(verifyMarket(collateralMarket(collateralAsset.address)))
          .to.be.revertedWithCustomError(validator, "UnsupportedAsset")
          .withArgs(collateralAsset.address);
      });
    });

    describe("requests on a live pool", () => {
      it("reverts when the pool is not live", async () => {
        manager.getPool.whenCalledWith(comptroller.address).returns({
          deployer: constants.AddressZero,
          status: PoolStatus.ExitRequested,
          deployerPaused: false,
          tierId: POOL_TIER_ID,
          windDownStartedAt: 0,
          lockedStake: 0,
        });
        await expect(verify(marketsRequest([collateralMarket(newAsset.address)])))
          .to.be.revertedWithCustomError(validator, "InvalidPoolStatus")
          .withArgs(comptroller.address);
      });

      it("reverts a tier request before reading its pool", async () => {
        await expect(verify(request({ requestType: RequestType.Tier, comptroller: comptroller.address })))
          .to.be.revertedWithCustomError(validator, "InvalidRequestType")
          .withArgs(REQUEST_ID);
        expect(manager.getPool).to.not.have.been.called;
      });
    });

    describe("markets requests", () => {
      it("reverts without markets", async () => {
        await expect(verify(marketsRequest([]))).to.be.revertedWithCustomError(validator, "InvalidArrayLength");
      });

      it("checks the markets against the pool's tier and listed assets", async () => {
        await expect(verify(marketsRequest([collateralMarket(newAsset.address)]))).to.not.be.reverted;

        expect(manager.getTier).to.have.been.calledOnceWith(POOL_TIER_ID);
        expect(registry.getVTokenForAsset).to.have.been.calledOnceWith(comptroller.address, newAsset.address);
      });

      it("passes as many markets as the pool may have, counting its listed ones", async () => {
        const markets = assets.slice(0, 2).map(asset => collateralMarket(asset));
        await expect(verify(marketsRequest(markets))).to.not.be.reverted;
      });

      it("reverts when the new and listed markets exceed the pool's limit", async () => {
        const markets = assets.slice(0, 3).map(asset => collateralMarket(asset));
        await expect(verify(marketsRequest(markets)))
          .to.be.revertedWithCustomError(validator, "TooManyMarkets")
          .withArgs(5, MAX_POOL_MARKETS);
      });

      it("reverts on an asset the pool already lists", async () => {
        registry.getVTokenForAsset
          .whenCalledWith(comptroller.address, newAsset.address)
          .returns(collateralVToken.address);
        await expect(verify(marketsRequest([collateralMarket(newAsset.address)])))
          .to.be.revertedWithCustomError(validator, "DuplicateAsset")
          .withArgs(newAsset.address);
      });

      it("passes new loan liquidity that fills the tier together with the pool's", async () => {
        await expect(verify(marketsRequest([loanMarket(newAsset.address, { supplyCap: e18("6000") })]))).to.not.be
          .reverted;
      });

      it("reverts when new loan liquidity and the pool's exceed the tier", async () => {
        await expect(
          verify(marketsRequest([loanMarket(newAsset.address, { supplyCap: e18("6000").add(1) })])),
        ).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });

      it("does not count the pool's loan liquidity when only collateral markets are added", async () => {
        comptroller.supplyCaps.whenCalledWith(loanVToken.address).returns(TIER.maxLiquidityUsd.add(1));

        await expect(verify(marketsRequest([collateralMarket(newAsset.address)]))).to.not.be.reverted;
        expect(comptroller.supplyCaps).to.not.have.been.called;
      });
    });
  });

  describe("checkPoolFitsTier", () => {
    it("passes a pool whose markets fit the tier", async () => {
      await expect(validator.checkPoolFitsTier(comptroller.address, 3)).to.not.be.reverted;
      expect(manager.getTier).to.have.been.calledOnceWith(3);
    });

    it("reverts when a listed collateral market exceeds the tier", async () => {
      comptroller.markets.whenCalledWith(collateralVToken.address).returns([true, e18("0.7").add(1), e18("0.75")]);
      await expect(validator.checkPoolFitsTier(comptroller.address, 3)).to.be.revertedWithCustomError(
        validator,
        "ExceedsTierLimit",
      );
    });

    it("skips an unlisted collateral market", async () => {
      comptroller.markets.whenCalledWith(collateralVToken.address).returns([false, e18("0.9"), e18("0.95")]);
      await expect(validator.checkPoolFitsTier(comptroller.address, 3)).to.not.be.reverted;
    });

    it("does not read a loan market's collateral parameters", async () => {
      await validator.checkPoolFitsTier(comptroller.address, 3);
      expect(comptroller.markets).to.have.been.calledOnceWith(collateralVToken.address);
    });

    it("reverts when a market has bad debt", async () => {
      collateralVToken.badDebt.returns(1);
      await expect(validator.checkPoolFitsTier(comptroller.address, 3))
        .to.be.revertedWithCustomError(validator, "BadDebtOutstanding")
        .withArgs(collateralVToken.address);
    });

    it("reverts when the loan liquidity exceeds the tier", async () => {
      comptroller.supplyCaps.whenCalledWith(loanVToken.address).returns(TIER.maxLiquidityUsd.add(1));
      await expect(validator.checkPoolFitsTier(comptroller.address, 3)).to.be.revertedWithCustomError(
        validator,
        "ExceedsTierLimit",
      );
    });

    describe("pending supply caps", () => {
      const ABOVE_TIER = TIER.maxLiquidityUsd.add(1);
      const check = () => validator.checkPoolFitsTier(comptroller.address, 3);

      it("reads the loan market's latest published supply cap", async () => {
        await check();
        expect(riskOracle.getLatestUpdateIdByTypeAndMarket).to.have.been.calledOnceWith(
          SUPPLY_CAP_UPDATE,
          loanVToken.address,
        );
        expect(receiver.getLastRegisteredUpdate).to.have.been.calledOnceWith(SUPPLY_CAP_UPDATE, loanVToken.address);
      });

      it("counts a published cap the receiver has not processed", async () => {
        publishSupplyCap(11, ABOVE_TIER, UpdateStatus.None);
        await expect(check()).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });

      it("ignores a published cap the receiver has processed", async () => {
        publishSupplyCap(11, ABOVE_TIER, UpdateStatus.Executed);
        await expect(check()).to.not.be.reverted;
      });

      it("counts a registered cap still pending", async () => {
        registerSupplyCap(12, ABOVE_TIER, UpdateStatus.Pending);
        await expect(check()).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });

      it("ignores a registered cap no longer pending", async () => {
        registerSupplyCap(12, ABOVE_TIER, UpdateStatus.Executed);
        await expect(check()).to.not.be.reverted;
      });

      it("keeps the published cap when the registered one is lower", async () => {
        publishSupplyCap(11, ABOVE_TIER, UpdateStatus.None);
        registerSupplyCap(12, e18("1"), UpdateStatus.Pending);
        await expect(check()).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
      });

      it("keeps the applied cap when the pending ones are lower", async () => {
        comptroller.supplyCaps.whenCalledWith(loanVToken.address).returns(TIER.maxLiquidityUsd);
        publishSupplyCap(11, e18("1"), UpdateStatus.None);
        registerSupplyCap(12, e18("2"), UpdateStatus.Pending);
        await expect(check()).to.not.be.reverted;
      });

      it("reverts on an uncapped loan market", async () => {
        comptroller.supplyCaps.whenCalledWith(loanVToken.address).returns(constants.MaxUint256);
        await expect(check()).to.be.revertedWithPanic(0x11);
      });
    });
  });

  describe("checkCollateralFactor", () => {
    const check = (collateralFactor: BigNumberish, liquidationThreshold: BigNumberish) =>
      validator.checkCollateralFactor(
        comptroller.address,
        collateralVToken.address,
        collateralFactor,
        liquidationThreshold,
      );

    it("passes values at the bounds of the pool's tier", async () => {
      await expect(check(TIER.maxCollateralFactor, TIER.maxLiquidationThreshold)).to.not.be.reverted;
      await expect(check(0, TIER.minLiquidationThreshold)).to.not.be.reverted;
      expect(manager.getTier).to.have.been.calledWith(POOL_TIER_ID);
    });

    it("reverts on a market the pool does not list", async () => {
      await expect(validator.checkCollateralFactor(comptroller.address, unlistedVToken.address, 0, 0))
        .to.be.revertedWithCustomError(validator, "MarketNotListed")
        .withArgs(unlistedVToken.address);
    });

    it("reverts on a loan market", async () => {
      await expect(validator.checkCollateralFactor(comptroller.address, loanVToken.address, 0, 0))
        .to.be.revertedWithCustomError(validator, "InvalidMarketType")
        .withArgs(loanVToken.address);
    });

    it("reverts on a collateral factor above the liquidation threshold", async () => {
      await expect(check(e18("0.6").add(1), e18("0.6")))
        .to.be.revertedWithCustomError(validator, "InvalidLiquidationThreshold")
        .withArgs(collateralVToken.address);
    });

    it("reverts on a collateral factor above the tier's", async () => {
      await expect(check(TIER.maxCollateralFactor.add(1), TIER.maxLiquidationThreshold)).to.be.revertedWithCustomError(
        validator,
        "ExceedsTierLimit",
      );
    });

    it("reverts on a liquidation threshold above the tier's", async () => {
      await expect(check(e18("0.6"), TIER.maxLiquidationThreshold.add(1))).to.be.revertedWithCustomError(
        validator,
        "ExceedsTierLimit",
      );
    });

    it("reverts on a liquidation threshold below the tier's", async () => {
      await expect(check(0, TIER.minLiquidationThreshold.sub(1))).to.be.revertedWithCustomError(
        validator,
        "ExceedsTierLimit",
      );
    });
  });

  describe("checkSupplyCap", () => {
    const check = (supplyCap: BigNumberish) =>
      validator.checkSupplyCap(comptroller.address, loanVToken.address, supplyCap);

    it("reverts on a market the pool does not list", async () => {
      await expect(validator.checkSupplyCap(comptroller.address, unlistedVToken.address, 0))
        .to.be.revertedWithCustomError(validator, "MarketNotListed")
        .withArgs(unlistedVToken.address);
    });

    it("passes any cap of a collateral market", async () => {
      await expect(validator.checkSupplyCap(comptroller.address, collateralVToken.address, constants.MaxUint256)).to.not
        .be.reverted;
      expect(manager.getTier).to.not.have.been.called;
    });

    it("passes a cut of a loan market's cap without pricing it", async () => {
      await expect(check(LISTED_LOAN_CAP)).to.not.be.reverted;
      expect(oracle.getUnderlyingPrice).to.not.have.been.called;
    });

    it("passes a raise that fills the pool's tier", async () => {
      oracle.getUnderlyingPrice.whenCalledWith(loanVToken.address).returns(e18("2"));
      await expect(check(e18("5000"))).to.not.be.reverted;
      expect(manager.getTier).to.have.been.calledOnceWith(POOL_TIER_ID);
    });

    it("reverts on a raise above the pool's tier", async () => {
      oracle.getUnderlyingPrice.whenCalledWith(loanVToken.address).returns(e18("2"));
      await expect(check(e18("5000").add(1))).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
    });

    it("leaves out the market's own pending cap and counts the other loan markets'", async () => {
      const otherLoanVToken = await smock.fake<VToken>("VToken");
      manager.isLoanMarket.whenCalledWith(otherLoanVToken.address).returns(true);
      comptroller.getAllMarkets.returns([collateralVToken.address, loanVToken.address, otherLoanVToken.address]);
      comptroller.supplyCaps.whenCalledWith(otherLoanVToken.address).returns(e18("3000"));
      publishSupplyCap(11, constants.MaxUint256, UpdateStatus.None);

      await expect(check(e18("7000"))).to.not.be.reverted;
      await expect(check(e18("7000").add(1))).to.be.revertedWithCustomError(validator, "ExceedsTierLimit");
    });
  });

  describe("checkLoanMarket", () => {
    it("passes a listed loan market", async () => {
      await expect(validator.checkLoanMarket(comptroller.address, loanVToken.address)).to.not.be.reverted;
    });

    it("reverts on a market the pool does not list", async () => {
      await expect(validator.checkLoanMarket(comptroller.address, unlistedVToken.address))
        .to.be.revertedWithCustomError(validator, "MarketNotListed")
        .withArgs(unlistedVToken.address);
    });

    it("reverts on a collateral market", async () => {
      await expect(validator.checkLoanMarket(comptroller.address, collateralVToken.address))
        .to.be.revertedWithCustomError(validator, "InvalidMarketType")
        .withArgs(collateralVToken.address);
    });
  });
});

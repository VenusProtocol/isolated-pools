import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import { AccessControlManager, SpokePoolPolicyRegistry, SpokePoolPolicyRegistry__factory } from "../../../../typechain";
import { deployProxy, e18, resetFakes } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const ONE = e18("1");
/// The registry's bounds on a new pool's close factor and liquidation incentive
const MIN_CLOSE_FACTOR = e18("0.05");
const MAX_CLOSE_FACTOR = e18("0.9");
const MIN_LIQUIDATION_INCENTIVE = e18("1.05");

const MIN_TIER_BOND_USD = e18("100000");
/// Fields in `ISpokePoolPolicyRegistry.PoolLimits` declaration order, so `Object.values` gives the struct tuple. The same
/// holds for every params object below
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
  loanSupplyCapUsd: e18("500000"),
};
/// Each limit above `LIMITS`, but the minimum coverage ratio
const HIGHER_LIMITS = {
  ...LIMITS,
  maxCollateralFactor: e18("0.6"),
  maxLiquidationThreshold: e18("0.7"),
  maxCollateralMarkets: 4,
  maxCollateralSupplyCapUsd: e18("2000000"),
  loanSupplyCapUsd: e18("1000000"),
};
const ZERO_TIER = [false, 0, [0, 0, 0, 0, 0, 0]];
const POOL_PARAMS = {
  closeFactor: e18("0.5"),
  liquidationIncentive: e18("1.1"),
  minLiquidatableCollateral: e18("100"),
};
const NEW_POOL_PARAMS = {
  closeFactor: e18("0.4"),
  liquidationIncentive: e18("1.2"),
  minLiquidatableCollateral: e18("50"),
};
const MARKET_PARAMS = (irm: string) => ({
  collateralInterestRateModel: irm,
  reserveFactor: e18("0.1"),
  reduceReservesBlockDelta: 28800,
});
const ORACLE_PARAMS = {
  deviationBoundedOracleEnabled: true,
  cooldownPeriod: 60 * 60,
  triggerThreshold: e18("0.1"),
  resetThreshold: e18("0.05"),
  boundDeviation: e18("0.05"),
};

type Tier = { enabled: boolean; minTierBondUsd: BigNumberish; limits: typeof LIMITS };

/// The tuple a getter or event returns for `tier`
const tierTuple = (tier: Tier) => [tier.enabled, tier.minTierBondUsd, Object.values(tier.limits)];
/// A loan asset config, in `ISpokePoolPolicyRegistry.LoanAssetConfig` field order
const loanConfig = (factor: BigNumberish, interestRateModels: string[]) => ({ factor, interestRateModels });

/// A `withArgs` predicate deep-comparing a struct event argument with `expected`
const deepEquals = (expected: unknown) => (actual: unknown) => {
  expect(actual).to.deep.equal(expected);
  return true;
};

describe("SpokePoolPolicyRegistry", () => {
  let owner: SignerWithAddress;
  let usdt: SignerWithAddress;
  let usdc: SignerWithAddress;
  let irm: SignerWithAddress;
  let otherIrm: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let registry: SpokePoolPolicyRegistry;
  let tier: Tier;

  const deployFixture = async () => {
    [owner, usdt, usdc, irm, otherIrm, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    registry = await deployProxy(await new SpokePoolPolicyRegistry__factory(owner).deploy(), acm.address);
  };

  beforeEach(async () => {
    await loadFixture(deployFixture);
    resetFakes(acm);
    acm.isAllowedToCall.returns(true);

    tier = { enabled: true, minTierBondUsd: MIN_TIER_BOND_USD, limits: LIMITS };
  });

  describe("initialize", () => {
    it("stores the owner and access control manager", async () => {
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.accessControlManager()).to.equal(acm.address);
    });

    it("cannot be initialized twice", async () => {
      await expect(registry.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("cannot initialize the implementation", async () => {
      const implementation = await new SpokePoolPolicyRegistry__factory(owner).deploy();
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("access control", () => {
    const restricted: { signature: string; call: () => Promise<unknown> }[] = [
      { signature: "setTier(uint256,Tier)", call: () => registry.connect(other).setTier(1, tier) },
      {
        signature: "setLoanAssetConfig(address,LoanAssetConfig)",
        call: () => registry.connect(other).setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address])),
      },
      {
        signature: "setLoanAssetFactor(address,uint256)",
        call: () => registry.connect(other).setLoanAssetFactor(usdt.address, ONE),
      },
      {
        signature: "addInterestRateModel(address,address)",
        call: () => registry.connect(other).addInterestRateModel(usdt.address, otherIrm.address),
      },
      {
        signature: "setBondAssetFactor(address,uint256)",
        call: () => registry.connect(other).setBondAssetFactor(usdt.address, ONE),
      },
      { signature: "setPoolParams(PoolParams)", call: () => registry.connect(other).setPoolParams(POOL_PARAMS) },
      {
        signature: "setMarketParams(ProtocolMarketParams)",
        call: () => registry.connect(other).setMarketParams(MARKET_PARAMS(irm.address)),
      },
      {
        signature: "setOracleParams(OracleParams)",
        call: () => registry.connect(other).setOracleParams(ORACLE_PARAMS),
      },
    ];
    for (const { signature, call } of restricted) {
      it(`${signature} needs the ACM role`, async () => {
        acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
        await expect(call())
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(other.address, registry.address, signature);
      });
    }
  });

  describe("setTier", () => {
    it("stores a tier and emits TierUpdated from an unset tier", async () => {
      await expect(registry.setTier(1, tier))
        .to.emit(registry, "TierUpdated")
        .withArgs(1, deepEquals(ZERO_TIER), deepEquals(tierTuple(tier)));
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
      expect(await registry.getTier(2)).to.deep.equal(ZERO_TIER);
    });

    it("replaces a tier, emitting the previous one", async () => {
      await registry.setTier(1, tier);

      const updated = { ...tier, limits: { ...LIMITS, loanSupplyCapUsd: e18("750000") } };
      await expect(registry.setTier(1, updated))
        .to.emit(registry, "TierUpdated")
        .withArgs(1, deepEquals(tierTuple(tier)), deepEquals(tierTuple(updated)));
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(updated));
    });

    it("lists each tier id once, in the order first set", async () => {
      await registry.setTier(3, tier);
      await registry.setTier(1, tier);
      await registry.setTier(3, { ...tier, enabled: false });
      expect(await registry.getTierIds()).to.deep.equal([3, 1]);
    });

    it("accepts limits at their bounds: a 100% coverage ratio and liquidation threshold, and a collateral factor equal to it", async () => {
      tier.limits = { ...LIMITS, minCoverageRatio: ONE, maxCollateralFactor: ONE, maxLiquidationThreshold: ONE };
      await registry.setTier(1, tier);
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
    });

    const invalidTiers: { name: string; change: Partial<Tier> }[] = [
      { name: "a zero minimum bond", change: { minTierBondUsd: 0 } },
      { name: "a zero minimum bond, even when disabled", change: { enabled: false, minTierBondUsd: 0 } },
      { name: "a zero minimum coverage ratio", change: { limits: { ...LIMITS, minCoverageRatio: constants.Zero } } },
      { name: "a minimum coverage ratio above 100%", change: { limits: { ...LIMITS, minCoverageRatio: ONE.add(1) } } },
      {
        name: "a maximum liquidation threshold above 100%",
        change: { limits: { ...LIMITS, maxLiquidationThreshold: ONE.add(1) } },
      },
      {
        name: "a maximum collateral factor above the maximum liquidation threshold",
        change: { limits: { ...LIMITS, maxCollateralFactor: LIMITS.maxLiquidationThreshold.add(1) } },
      },
      { name: "a zero loan supply cap", change: { limits: { ...LIMITS, loanSupplyCapUsd: constants.Zero } } },
    ];
    for (const { name, change } of invalidTiers) {
      it(`rejects ${name}`, async () => {
        await expect(registry.setTier(1, { ...tier, ...change }))
          .to.be.revertedWithCustomError(registry, "InvalidTier")
          .withArgs(1);
      });
    }
  });

  describe("loan asset configs", () => {
    it("lists a loan asset with its factor and models, and emits LoanAssetConfigUpdated", async () => {
      await expect(registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address, otherIrm.address])))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(usdt.address, deepEquals([0, []]), deepEquals([ONE, [irm.address, otherIrm.address]]));
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address]);
      expect(await registry.getLoanAssetConfig(usdt.address)).to.deep.equal([ONE, [irm.address, otherIrm.address]]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(true);
      expect(await registry.isAllowedInterestRateModel(usdc.address, irm.address)).to.equal(false);
    });

    it("updates a listed asset in place, and delists it by moving the last asset into its place", async () => {
      for (const asset of [usdt, usdc, other]) {
        await registry.setLoanAssetConfig(asset.address, loanConfig(ONE, [irm.address]));
      }

      await registry.setLoanAssetConfig(usdt.address, loanConfig(e18("0.5"), [otherIrm.address]));
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address, usdc.address, other.address]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, irm.address)).to.equal(false);

      await registry.setLoanAssetConfig(usdt.address, loanConfig(0, []));
      expect(await registry.getLoanAssets()).to.deep.equal([other.address, usdc.address]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(false);

      await registry.setLoanAssetConfig(usdc.address, loanConfig(0, []));
      expect(await registry.getLoanAssets()).to.deep.equal([other.address]);
    });

    it("scales a tier's loan supply cap by the factor, and gives zero to an asset not lent", async () => {
      await registry.setTier(1, tier);
      await registry.setLoanAssetConfig(usdt.address, loanConfig(e18("0.5"), [irm.address]));
      expect(await registry.getLoanSupplyCapUsd(1, usdt.address)).to.equal(e18("250000"));
      expect(await registry.getLoanSupplyCapUsd(1, usdc.address)).to.equal(0);
      expect(await registry.getLoanSupplyCapUsd(2, usdt.address)).to.equal(0);
    });

    const invalidConfigs = [
      { name: "a factor without a model", config: () => loanConfig(ONE, []) },
      { name: "a model without a factor", config: () => loanConfig(0, [irm.address]) },
    ];
    for (const { name, config } of invalidConfigs) {
      it(`rejects ${name}`, async () => {
        await expect(registry.setLoanAssetConfig(usdt.address, config()))
          .to.be.revertedWithCustomError(registry, "InvalidLoanAssetConfig")
          .withArgs(usdt.address);
      });
    }

    const zeroAddressConfigs = [
      { name: "a zero loan asset", asset: () => constants.AddressZero, models: () => [irm.address] },
      {
        name: "a zero interest rate model",
        asset: () => usdt.address,
        models: () => [irm.address, constants.AddressZero],
      },
    ];
    for (const { name, asset, models } of zeroAddressConfigs) {
      it(`rejects ${name}`, async () => {
        await expect(registry.setLoanAssetConfig(asset(), loanConfig(ONE, models()))).to.be.revertedWithCustomError(
          registry,
          "ZeroAddressNotAllowed",
        );
      });
    }

    it("rejects a model listed twice", async () => {
      await expect(
        registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address, otherIrm.address, irm.address])),
      )
        .to.be.revertedWithCustomError(registry, "DuplicateInterestRateModel")
        .withArgs(usdt.address, irm.address);
    });

    it("setLoanAssetFactor changes a listed asset's factor and keeps its models", async () => {
      await registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address]));
      await expect(registry.setLoanAssetFactor(usdt.address, e18("0.5")))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(usdt.address, deepEquals([ONE, [irm.address]]), deepEquals([e18("0.5"), [irm.address]]));
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address]);
    });

    it("setLoanAssetFactor rejects a zero factor and an unlisted asset", async () => {
      await registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address]));
      await expect(registry.setLoanAssetFactor(usdt.address, 0))
        .to.be.revertedWithCustomError(registry, "InvalidLoanAssetConfig")
        .withArgs(usdt.address);
      await expect(registry.setLoanAssetFactor(usdc.address, ONE))
        .to.be.revertedWithCustomError(registry, "LoanAssetNotListed")
        .withArgs(usdc.address);
    });

    it("addInterestRateModel adds a model to a listed asset", async () => {
      await registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address]));
      await expect(registry.addInterestRateModel(usdt.address, otherIrm.address))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(usdt.address, deepEquals([ONE, [irm.address]]), deepEquals([ONE, [irm.address, otherIrm.address]]));
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(true);
    });

    it("addInterestRateModel rejects a repeated or zero model and an unlisted asset", async () => {
      await registry.setLoanAssetConfig(usdt.address, loanConfig(ONE, [irm.address]));
      await expect(registry.addInterestRateModel(usdt.address, irm.address))
        .to.be.revertedWithCustomError(registry, "DuplicateInterestRateModel")
        .withArgs(usdt.address, irm.address);
      await expect(registry.addInterestRateModel(usdt.address, constants.AddressZero)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddressNotAllowed",
      );
      await expect(registry.addInterestRateModel(usdc.address, irm.address))
        .to.be.revertedWithCustomError(registry, "LoanAssetNotListed")
        .withArgs(usdc.address);
    });
  });

  describe("bond asset factors", () => {
    it("sets, overwrites and resets a bond asset's factor, emitting the old and new factor", async () => {
      await expect(registry.setBondAssetFactor(usdt.address, e18("1.5")))
        .to.emit(registry, "BondAssetFactorUpdated")
        .withArgs(usdt.address, 0, e18("1.5"));
      expect(await registry.bondAssetFactors(usdt.address)).to.equal(e18("1.5"));

      await expect(registry.setBondAssetFactor(usdt.address, e18("0.8")))
        .to.emit(registry, "BondAssetFactorUpdated")
        .withArgs(usdt.address, e18("1.5"), e18("0.8"));
      expect(await registry.bondAssetFactors(usdt.address)).to.equal(e18("0.8"));

      await expect(registry.setBondAssetFactor(usdt.address, 0))
        .to.emit(registry, "BondAssetFactorUpdated")
        .withArgs(usdt.address, e18("0.8"), 0);
      expect(await registry.bondAssetFactors(usdt.address)).to.equal(0);
    });

    it("lists the bond assets with a factor, and drops one set to zero", async () => {
      for (const asset of [usdt, usdc, other]) {
        await registry.setBondAssetFactor(asset.address, ONE);
      }
      await registry.setBondAssetFactor(usdt.address, e18("2"));
      expect(await registry.getBondAssets()).to.deep.equal([usdt.address, usdc.address, other.address]);

      await registry.setBondAssetFactor(usdt.address, 0);
      expect(await registry.getBondAssets()).to.deep.equal([other.address, usdc.address]);
    });

    it("rejects a zero asset", async () => {
      await expect(registry.setBondAssetFactor(constants.AddressZero, ONE)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddressNotAllowed",
      );
    });
  });

  describe("getRequiredBondUsd", () => {
    beforeEach(async () => {
      await registry.setTier(1, tier);
    });

    it("returns the tier's minimum bond times the asset's factor, and zero for an unset tier", async () => {
      await registry.setBondAssetFactor(usdt.address, e18("1.5"));
      await registry.setBondAssetFactor(usdc.address, e18("0.8"));
      expect(await registry.getRequiredBondUsd(1, usdt.address)).to.equal(e18("150000"));
      expect(await registry.getRequiredBondUsd(1, usdc.address)).to.equal(e18("80000"));
      expect(await registry.getRequiredBondUsd(2, usdt.address)).to.equal(0);
    });

    it("rounds down", async () => {
      await registry.setTier(1, { ...tier, minTierBondUsd: 3 });
      await registry.setBondAssetFactor(usdt.address, e18("0.5"));
      expect(await registry.getRequiredBondUsd(1, usdt.address)).to.equal(1);
    });

    it("reverts for an asset never given a factor or reset to zero", async () => {
      await expect(registry.getRequiredBondUsd(1, usdt.address))
        .to.be.revertedWithCustomError(registry, "BondAssetNotAllowed")
        .withArgs(usdt.address);

      await registry.setBondAssetFactor(usdt.address, ONE);
      await registry.setBondAssetFactor(usdt.address, 0);
      await expect(registry.getRequiredBondUsd(1, usdt.address))
        .to.be.revertedWithCustomError(registry, "BondAssetNotAllowed")
        .withArgs(usdt.address);
    });
  });

  describe("setPoolParams", () => {
    it("sets new pools' params, emitting the old and new params", async () => {
      await expect(registry.setPoolParams(POOL_PARAMS))
        .to.emit(registry, "PoolParamsUpdated")
        .withArgs(deepEquals([0, 0, 0]), deepEquals(Object.values(POOL_PARAMS)));
      expect(await registry.poolParams()).to.deep.equal(Object.values(POOL_PARAMS));

      await expect(registry.setPoolParams(NEW_POOL_PARAMS))
        .to.emit(registry, "PoolParamsUpdated")
        .withArgs(deepEquals(Object.values(POOL_PARAMS)), deepEquals(Object.values(NEW_POOL_PARAMS)));
      expect(await registry.poolParams()).to.deep.equal(Object.values(NEW_POOL_PARAMS));
    });

    const bounds = [
      { name: "the minimum close factor", change: { closeFactor: MIN_CLOSE_FACTOR } },
      { name: "the maximum close factor", change: { closeFactor: MAX_CLOSE_FACTOR } },
      { name: "the minimum liquidation incentive", change: { liquidationIncentive: MIN_LIQUIDATION_INCENTIVE } },
    ];
    for (const { name, change } of bounds) {
      it(`accepts ${name}`, async () => {
        const params = { ...POOL_PARAMS, ...change };
        await registry.setPoolParams(params);
        expect(await registry.poolParams()).to.deep.equal(Object.values(params));
      });
    }

    const outOfBounds = [
      { name: "a close factor below the minimum", change: { closeFactor: MIN_CLOSE_FACTOR.sub(1) } },
      { name: "a close factor above the maximum", change: { closeFactor: MAX_CLOSE_FACTOR.add(1) } },
      {
        name: "a liquidation incentive below the minimum",
        change: { liquidationIncentive: MIN_LIQUIDATION_INCENTIVE.sub(1) },
      },
    ];
    for (const { name, change } of outOfBounds) {
      it(`rejects ${name}`, async () => {
        await expect(registry.setPoolParams({ ...POOL_PARAMS, ...change })).to.be.revertedWithCustomError(
          registry,
          "InvalidPoolParams",
        );
      });
    }
  });

  describe("setMarketParams", () => {
    it("sets new markets' params, emitting the old and new params", async () => {
      const first = MARKET_PARAMS(irm.address);
      await expect(registry.setMarketParams(first))
        .to.emit(registry, "MarketParamsUpdated")
        .withArgs(deepEquals([constants.AddressZero, 0, 0]), deepEquals(Object.values(first)));
      expect(await registry.marketParams()).to.deep.equal(Object.values(first));

      const second = MARKET_PARAMS(otherIrm.address);
      await expect(registry.setMarketParams(second))
        .to.emit(registry, "MarketParamsUpdated")
        .withArgs(deepEquals(Object.values(first)), deepEquals(Object.values(second)));
      expect(await registry.marketParams()).to.deep.equal(Object.values(second));
    });

    it("accepts a 100% reserve factor", async () => {
      const params = { ...MARKET_PARAMS(irm.address), reserveFactor: ONE };
      await registry.setMarketParams(params);
      expect(await registry.marketParams()).to.deep.equal(Object.values(params));
    });

    const invalid = [
      { name: "a zero collateral interest rate model", change: { collateralInterestRateModel: constants.AddressZero } },
      { name: "a reserve factor above 100%", change: { reserveFactor: ONE.add(1) } },
      { name: "a zero reduce reserves block delta", change: { reduceReservesBlockDelta: 0 } },
    ];
    for (const { name, change } of invalid) {
      it(`rejects ${name}`, async () => {
        await expect(
          registry.setMarketParams({ ...MARKET_PARAMS(irm.address), ...change }),
        ).to.be.revertedWithCustomError(registry, "InvalidProtocolMarketParams");
      });
    }
  });

  describe("setOracleParams", () => {
    it("sets new collateral assets' oracle configs, emitting the old and new params", async () => {
      await expect(registry.setOracleParams(ORACLE_PARAMS))
        .to.emit(registry, "OracleParamsUpdated")
        .withArgs(deepEquals([false, 0, 0, 0, 0]), deepEquals(Object.values(ORACLE_PARAMS)));
      expect(await registry.oracleParams()).to.deep.equal(Object.values(ORACLE_PARAMS));

      const params = { ...ORACLE_PARAMS, deviationBoundedOracleEnabled: false, boundDeviation: e18("0.1") };
      await expect(registry.setOracleParams(params))
        .to.emit(registry, "OracleParamsUpdated")
        .withArgs(deepEquals(Object.values(ORACLE_PARAMS)), deepEquals(Object.values(params)));
      expect(await registry.oracleParams()).to.deep.equal(Object.values(params));
    });

    it("accepts a bound deviation just below 100%", async () => {
      const params = { ...ORACLE_PARAMS, boundDeviation: ONE.sub(1) };
      await registry.setOracleParams(params);
      expect(await registry.oracleParams()).to.deep.equal(Object.values(params));
    });

    for (const { name, boundDeviation } of [
      { name: "a zero bound deviation", boundDeviation: constants.Zero },
      { name: "a bound deviation of 100%", boundDeviation: ONE },
    ]) {
      it(`rejects ${name}`, async () => {
        await expect(registry.setOracleParams({ ...ORACLE_PARAMS, boundDeviation })).to.be.revertedWithCustomError(
          registry,
          "InvalidOracleParams",
        );
      });
    }
  });

  describe("isUpgrade", () => {
    let higherTier: Tier;

    beforeEach(async () => {
      higherTier = {
        enabled: true,
        minTierBondUsd: e18("200000"),
        limits: HIGHER_LIMITS,
      };
      await registry.setTier(1, tier);
      await registry.setTier(2, higherTier);
    });

    it("is an upgrade to an enabled tier with a higher bond and no lower limits", async () => {
      expect(await registry.isUpgrade(1, 2)).to.equal(true);
    });

    it("is an upgrade to a tier with a higher bond and the same limits", async () => {
      await registry.setTier(3, { ...higherTier, limits: LIMITS });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);
    });

    it("is an upgrade to a tier asking a higher minimum coverage ratio", async () => {
      // The upgrade's top-up already covers the higher tier's full requirement
      await registry.setTier(3, { ...higherTier, limits: { ...HIGHER_LIMITS, minCoverageRatio: e18("0.9") } });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);
    });

    it("is an upgrade from an unset or a disabled tier", async () => {
      expect(await registry.isUpgrade(9, 2)).to.equal(true);

      await registry.setTier(1, { ...tier, enabled: false });
      expect(await registry.isUpgrade(1, 2)).to.equal(true);
    });

    it("is not an upgrade to the same, a lower or an unset tier", async () => {
      expect(await registry.isUpgrade(1, 1)).to.equal(false);
      expect(await registry.isUpgrade(2, 1)).to.equal(false);
      expect(await registry.isUpgrade(1, 9)).to.equal(false);
    });

    const nonUpgrades: { name: string; change: Partial<Tier> }[] = [
      { name: "a disabled tier", change: { enabled: false } },
      { name: "a tier with the same minimum bond", change: { minTierBondUsd: MIN_TIER_BOND_USD } },
      {
        name: "a tier with a lower maximum collateral factor",
        change: { limits: { ...HIGHER_LIMITS, maxCollateralFactor: LIMITS.maxCollateralFactor.sub(1) } },
      },
      {
        name: "a tier with a lower maximum liquidation threshold",
        change: { limits: { ...HIGHER_LIMITS, maxLiquidationThreshold: LIMITS.maxLiquidationThreshold.sub(1) } },
      },
      {
        name: "a tier with fewer collateral markets",
        change: { limits: { ...HIGHER_LIMITS, maxCollateralMarkets: LIMITS.maxCollateralMarkets - 1 } },
      },
      {
        name: "a tier with a lower collateral supply cap",
        change: { limits: { ...HIGHER_LIMITS, maxCollateralSupplyCapUsd: LIMITS.maxCollateralSupplyCapUsd.sub(1) } },
      },
      {
        name: "a tier with a lower loan supply cap",
        change: { limits: { ...HIGHER_LIMITS, loanSupplyCapUsd: LIMITS.loanSupplyCapUsd.sub(1) } },
      },
    ];
    for (const { name, change } of nonUpgrades) {
      it(`is not an upgrade to ${name}`, async () => {
        await registry.setTier(3, { ...higherTier, ...change });
        expect(await registry.isUpgrade(1, 3)).to.equal(false);
      });
    }
  });
});

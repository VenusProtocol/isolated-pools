import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import { AccessControlManager, SpokePoolPolicyRegistry, SpokePoolPolicyRegistry__factory } from "../../../../typechain";
import { deployProxy, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

/// Fields in `ISpokePoolPolicyRegistry.PoolLimits` declaration order, so `Object.values` gives the struct tuple.
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
  loanSupplyCapUsd: e18("500000"),
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

/// Checks each field of `expected` on a struct returned by a getter.
const expectFields = (actual: object, expected: object) => {
  for (const [key, value] of Object.entries(expected)) {
    expect((actual as Record<string, unknown>)[key]).to.equal(value);
  }
};

type Tier = { enabled: boolean; minTierBondUsd: BigNumberish; limits: typeof LIMITS };

const tierTuple = (tier: Tier) => [tier.enabled, tier.minTierBondUsd, Object.values(tier.limits)];

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

  beforeEach(async () => {
    [owner, usdt, usdc, irm, otherIrm, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    registry = await deployProxy(await new SpokePoolPolicyRegistry__factory(owner).deploy(), acm.address);

    tier = { enabled: true, minTierBondUsd: e18("100000"), limits: LIMITS };
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

  describe("setTier", () => {
    it("stores a tier and emits TierUpdated", async () => {
      await expect(registry.setTier(1, tier))
        .to.emit(registry, "TierUpdated")
        .withArgs(
          1,
          (oldTier: unknown) => expect(oldTier).to.deep.equal(ZERO_TIER),
          (newTier: unknown) => expect(newTier).to.deep.equal(tierTuple(tier)),
        );
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
      expect(await registry.getTier(2)).to.deep.equal(ZERO_TIER);
    });

    it("replaces a tier, emitting the previous one", async () => {
      await registry.setTier(1, tier);

      const updated = { ...tier, limits: { ...LIMITS, loanSupplyCapUsd: e18("750000") } };
      await expect(registry.setTier(1, updated))
        .to.emit(registry, "TierUpdated")
        .withArgs(
          1,
          (oldTier: unknown) => expect(oldTier).to.deep.equal(tierTuple(tier)),
          (newTier: unknown) => expect(newTier).to.deep.equal(tierTuple(updated)),
        );
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(updated));
    });

    it("lists each tier id once, in the order first set", async () => {
      await registry.setTier(3, tier);
      await registry.setTier(1, tier);
      await registry.setTier(3, { ...tier, enabled: false });
      expect(await registry.getTierIds()).to.deep.equal([3, 1]);
    });

    it("rejects inconsistent limits", async () => {
      const invalidTiers = [
        { ...tier, limits: { ...LIMITS, maxLiquidationThreshold: e18("1.01") } },
        { ...tier, limits: { ...LIMITS, maxCollateralFactor: e18("0.66") } },
        { ...tier, minTierBondUsd: 0 },
        { ...tier, minTierBondUsd: 0, enabled: false },
        { ...tier, limits: { ...LIMITS, minCoverageRatio: 0 } },
        { ...tier, limits: { ...LIMITS, minCoverageRatio: 0 }, enabled: false },
        { ...tier, limits: { ...LIMITS, minCoverageRatio: e18("1").add(1) } },
        { ...tier, limits: { ...LIMITS, loanSupplyCapUsd: 0 } },
      ];
      for (const invalidTier of invalidTiers) {
        await expect(registry.setTier(1, invalidTier))
          .to.be.revertedWithCustomError(registry, "InvalidTier")
          .withArgs(1);
      }
    });

    it("accepts a maximum liquidation threshold of 100% and a collateral factor equal to it", async () => {
      tier.limits = { ...LIMITS, maxCollateralFactor: e18("1"), maxLiquidationThreshold: e18("1") };
      await registry.setTier(1, tier);
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
    });

    it("needs the ACM role", async () => {
      const signature = "setTier(uint256,Tier)";
      acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
      await expect(registry.connect(other).setTier(1, tier))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, signature);
    });
  });

  describe("setLoanAssetConfig", () => {
    const config = (factor: BigNumberish, interestRateModels: string[]) => ({ factor, interestRateModels });

    it("lists a loan asset with its factor and models, and emits LoanAssetConfigUpdated", async () => {
      await expect(registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address, otherIrm.address])))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(
          usdt.address,
          (oldConfig: unknown) => expect(oldConfig).to.deep.equal([0, []]),
          (newConfig: unknown) => expect(newConfig).to.deep.equal([e18("1"), [irm.address, otherIrm.address]]),
        );
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address]);
      expect(await registry.getLoanAssetConfig(usdt.address)).to.deep.equal([
        e18("1"),
        [irm.address, otherIrm.address],
      ]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(true);
      expect(await registry.isAllowedInterestRateModel(usdc.address, irm.address)).to.equal(false);
    });

    it("updates a listed asset in place, and delists it by moving the last asset into its place", async () => {
      for (const asset of [usdt, usdc, other]) {
        await registry.setLoanAssetConfig(asset.address, config(e18("1"), [irm.address]));
      }

      await registry.setLoanAssetConfig(usdt.address, config(e18("0.5"), [otherIrm.address]));
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address, usdc.address, other.address]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, irm.address)).to.equal(false);

      await registry.setLoanAssetConfig(usdt.address, config(0, []));
      expect(await registry.getLoanAssets()).to.deep.equal([other.address, usdc.address]);
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(false);

      await registry.setLoanAssetConfig(usdc.address, config(0, []));
      expect(await registry.getLoanAssets()).to.deep.equal([other.address]);
    });

    it("scales a tier's loan supply cap by the factor, and gives zero to an asset not lent", async () => {
      await registry.setTier(1, tier);
      await registry.setLoanAssetConfig(usdt.address, config(e18("0.5"), [irm.address]));
      expect(await registry.getLoanSupplyCapUsd(1, usdt.address)).to.equal(e18("250000"));
      expect(await registry.getLoanSupplyCapUsd(1, usdc.address)).to.equal(0);
    });

    it("rejects a factor without a model, or a model without a factor", async () => {
      for (const invalid of [config(e18("1"), []), config(0, [irm.address])]) {
        await expect(registry.setLoanAssetConfig(usdt.address, invalid))
          .to.be.revertedWithCustomError(registry, "InvalidLoanAssetConfig")
          .withArgs(usdt.address);
      }
    });

    it("rejects a zero asset or model", async () => {
      const calls = [
        () => registry.setLoanAssetConfig(constants.AddressZero, config(e18("1"), [irm.address])),
        () => registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address, constants.AddressZero])),
      ];
      for (const call of calls) {
        await expect(call()).to.be.revertedWithCustomError(registry, "ZeroAddressNotAllowed");
      }
    });

    it("rejects a model listed twice", async () => {
      await expect(
        registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address, otherIrm.address, irm.address])),
      )
        .to.be.revertedWithCustomError(registry, "DuplicateInterestRateModel")
        .withArgs(usdt.address, irm.address);
    });

    it("setLoanAssetFactor changes a listed asset's factor and keeps its models", async () => {
      await registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address]));
      await expect(registry.setLoanAssetFactor(usdt.address, e18("0.5")))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(
          usdt.address,
          (oldConfig: unknown) => expect(oldConfig).to.deep.equal([e18("1"), [irm.address]]),
          (newConfig: unknown) => expect(newConfig).to.deep.equal([e18("0.5"), [irm.address]]),
        );
      expect(await registry.getLoanAssets()).to.deep.equal([usdt.address]);

      await expect(registry.setLoanAssetFactor(usdt.address, 0))
        .to.be.revertedWithCustomError(registry, "InvalidLoanAssetConfig")
        .withArgs(usdt.address);
      await expect(registry.setLoanAssetFactor(usdc.address, e18("1")))
        .to.be.revertedWithCustomError(registry, "LoanAssetNotListed")
        .withArgs(usdc.address);
    });

    it("addInterestRateModel adds a model to a listed asset", async () => {
      await registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address]));
      await expect(registry.addInterestRateModel(usdt.address, otherIrm.address))
        .to.emit(registry, "LoanAssetConfigUpdated")
        .withArgs(
          usdt.address,
          (oldConfig: unknown) => expect(oldConfig).to.deep.equal([e18("1"), [irm.address]]),
          (newConfig: unknown) => expect(newConfig).to.deep.equal([e18("1"), [irm.address, otherIrm.address]]),
        );
      expect(await registry.isAllowedInterestRateModel(usdt.address, otherIrm.address)).to.equal(true);

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

    it("needs the ACM role", async () => {
      await registry.setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address]));
      const calls: [string, () => Promise<unknown>][] = [
        [
          "setLoanAssetConfig(address,LoanAssetConfig)",
          () => registry.connect(other).setLoanAssetConfig(usdt.address, config(e18("1"), [irm.address])),
        ],
        ["setLoanAssetFactor(address,uint256)", () => registry.connect(other).setLoanAssetFactor(usdt.address, 1)],
        [
          "addInterestRateModel(address,address)",
          () => registry.connect(other).addInterestRateModel(usdt.address, otherIrm.address),
        ],
      ];
      for (const [signature, call] of calls) {
        acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
        await expect(call())
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(other.address, registry.address, signature);
      }
    });
  });

  describe("bond asset factors", () => {
    it("sets a bond asset's factor and emits BondAssetFactorUpdated", async () => {
      await expect(registry.setBondAssetFactor(usdt.address, e18("1.5")))
        .to.emit(registry, "BondAssetFactorUpdated")
        .withArgs(usdt.address, 0, e18("1.5"));
      expect(await registry.bondAssetFactors(usdt.address)).to.equal(e18("1.5"));
    });

    it("lists the bond assets with a factor, and drops one set to zero", async () => {
      for (const asset of [usdt, usdc, other]) {
        await registry.setBondAssetFactor(asset.address, e18("1"));
      }
      await registry.setBondAssetFactor(usdt.address, e18("2"));
      expect(await registry.getBondAssets()).to.deep.equal([usdt.address, usdc.address, other.address]);

      await registry.setBondAssetFactor(usdt.address, 0);
      expect(await registry.getBondAssets()).to.deep.equal([other.address, usdc.address]);
    });

    it("rejects a zero asset", async () => {
      await expect(registry.setBondAssetFactor(constants.AddressZero, e18("1"))).to.be.revertedWithCustomError(
        registry,
        "ZeroAddressNotAllowed",
      );
    });

    it("needs the ACM role", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(registry.connect(other).setBondAssetFactor(usdt.address, e18("1")))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, "setBondAssetFactor(address,uint256)");
    });

    it("returns the bond a tier requires in an asset: its minimum times the asset's factor", async () => {
      await registry.setTier(1, tierTuple(tier));
      await registry.setBondAssetFactor(usdt.address, e18("1.5"));
      await registry.setBondAssetFactor(usdc.address, e18("0.8"));
      expect(await registry.getRequiredBondUsd(1, usdt.address)).to.equal(e18("150000"));
      expect(await registry.getRequiredBondUsd(1, usdc.address)).to.equal(e18("80000"));
      expect(await registry.getRequiredBondUsd(2, usdt.address)).to.equal(0);
    });

    it("reverts for an asset with no factor", async () => {
      await registry.setTier(1, tierTuple(tier));
      await expect(registry.getRequiredBondUsd(1, usdt.address))
        .to.be.revertedWithCustomError(registry, "BondAssetNotAllowed")
        .withArgs(usdt.address);
      await registry.setBondAssetFactor(usdt.address, e18("1"));
      await registry.setBondAssetFactor(usdt.address, 0);
      await expect(registry.getRequiredBondUsd(1, usdt.address))
        .to.be.revertedWithCustomError(registry, "BondAssetNotAllowed")
        .withArgs(usdt.address);
    });
  });

  describe("pool, market and oracle params", () => {
    it("setPoolParams sets new pools' params within the comptroller's bounds", async () => {
      await registry.setPoolParams(POOL_PARAMS);
      await expect(registry.setPoolParams(NEW_POOL_PARAMS))
        .to.emit(registry, "PoolParamsUpdated")
        .withArgs(Object.values(POOL_PARAMS), Object.values(NEW_POOL_PARAMS));
      expectFields(await registry.poolParams(), NEW_POOL_PARAMS);

      const bounds = [
        { ...POOL_PARAMS, closeFactor: e18("0.05") },
        { ...POOL_PARAMS, closeFactor: e18("0.9") },
        { ...POOL_PARAMS, liquidationIncentive: e18("1.05") },
      ];
      for (const params of bounds) {
        await registry.setPoolParams(params);
      }
      for (const params of [
        { ...POOL_PARAMS, closeFactor: e18("0.049") },
        { ...POOL_PARAMS, closeFactor: e18("0.91") },
        { ...POOL_PARAMS, liquidationIncentive: e18("1.049") },
      ]) {
        await expect(registry.setPoolParams(params)).to.be.revertedWithCustomError(registry, "InvalidPoolParams");
      }
    });

    it("setMarketParams sets new markets' params", async () => {
      await registry.setMarketParams(MARKET_PARAMS(irm.address));
      const params = { ...MARKET_PARAMS(otherIrm.address), reserveFactor: e18("1") };
      await expect(registry.setMarketParams(params))
        .to.emit(registry, "MarketParamsUpdated")
        .withArgs(Object.values(MARKET_PARAMS(irm.address)), Object.values(params));
      expectFields(await registry.marketParams(), params);
      for (const invalid of [
        MARKET_PARAMS(constants.AddressZero),
        { ...params, reserveFactor: e18("1").add(1) },
        { ...params, reduceReservesBlockDelta: 0 },
      ]) {
        await expect(registry.setMarketParams(invalid)).to.be.revertedWithCustomError(
          registry,
          "InvalidProtocolMarketParams",
        );
      }
    });

    it("setOracleParams sets new collateral assets' oracle configs", async () => {
      await registry.setOracleParams(ORACLE_PARAMS);
      const params = { ...ORACLE_PARAMS, deviationBoundedOracleEnabled: false, boundDeviation: e18("0.1") };
      await expect(registry.setOracleParams(params))
        .to.emit(registry, "OracleParamsUpdated")
        .withArgs(Object.values(ORACLE_PARAMS), Object.values(params));
      expectFields(await registry.oracleParams(), params);
      for (const boundDeviation of [0, e18("1")]) {
        await expect(registry.setOracleParams({ ...params, boundDeviation })).to.be.revertedWithCustomError(
          registry,
          "InvalidOracleParams",
        );
      }
    });

    it("need the ACM role", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(registry.connect(other).setPoolParams(POOL_PARAMS))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, "setPoolParams(PoolParams)");
      await expect(registry.connect(other).setMarketParams(MARKET_PARAMS(irm.address)))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, "setMarketParams(ProtocolMarketParams)");
      await expect(registry.connect(other).setOracleParams(ORACLE_PARAMS))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, "setOracleParams(OracleParams)");
    });
  });

  describe("isUpgrade", () => {
    const HIGHER_LIMITS = {
      ...LIMITS,
      maxCollateralFactor: e18("0.6"),
      maxLiquidationThreshold: e18("0.7"),
      maxCollateralSupplyCapUsd: e18("2000000"),
      loanSupplyCapUsd: e18("1000000"),
    };
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

    it("tells an upgrade from the pool's tier", async () => {
      expect(await registry.isUpgrade(1, 2)).to.equal(true);
      expect(await registry.isUpgrade(2, 1)).to.equal(false);
      expect(await registry.isUpgrade(1, 1)).to.equal(false);

      await registry.setTier(3, { ...higherTier, limits: LIMITS });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);

      // A higher tier may ask for a thicker cushion: the upgrade's top-up already covers its full requirement
      await registry.setTier(3, { ...higherTier, limits: { ...LIMITS, minCoverageRatio: e18("0.9") } });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);

      const nonUpgrades = [
        { tier: { enabled: false } },
        { tier: { minTierBondUsd: tier.minTierBondUsd } },
        { limits: { maxCollateralFactor: e18("0.4") } },
        { limits: { maxLiquidationThreshold: e18("0.6") } },
        { limits: { maxCollateralMarkets: 2 } },
        { limits: { maxCollateralSupplyCapUsd: e18("999999") } },
        { limits: { loanSupplyCapUsd: e18("499999") } },
      ];
      for (const { tier: tierChange, limits } of nonUpgrades) {
        await registry.setTier(3, { ...higherTier, ...tierChange, limits: { ...LIMITS, ...limits } });
        expect(await registry.isUpgrade(1, 3)).to.equal(false);
      }
    });

    it("is not an upgrade to an unset tier", async () => {
      expect(await registry.isUpgrade(1, 9)).to.equal(false);
    });
  });
});

import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import { AccessControlManager, TierRegistry, TierRegistry__factory } from "../../../../typechain";
import { deployProxy, e18 } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

/// Fields in `ITierRegistry.PoolLimits` declaration order, so `Object.values` gives the struct tuple.
const LIMITS = {
  minCoverageRatio: e18("0.8"),
  maxCollateralFactor: e18("0.5"),
  maxLiquidationThreshold: e18("0.65"),
  maxCollateralMarkets: 3,
  maxCollateralSupplyCapUsd: e18("1000000"),
};
const ZERO_TIER = [false, 0, [0, 0, 0, 0, 0], []];

type LoanAsset = { asset: string; supplyCap: BigNumberish; interestRateModels: string[] };
type Tier = { enabled: boolean; minBondUsd: BigNumberish; limits: typeof LIMITS; loanAssets: LoanAsset[] };

const tierTuple = (tier: Tier) => [
  tier.enabled,
  tier.minBondUsd,
  Object.values(tier.limits),
  tier.loanAssets.map(({ asset, supplyCap, interestRateModels }) => [asset, supplyCap, interestRateModels]),
];

describe("TierRegistry", () => {
  let owner: SignerWithAddress;
  let usdt: SignerWithAddress;
  let usdc: SignerWithAddress;
  let irm: SignerWithAddress;
  let otherIrm: SignerWithAddress;
  let other: SignerWithAddress;
  let acm: FakeContract<AccessControlManager>;
  let registry: TierRegistry;
  let usdtAsset: LoanAsset;
  let usdcAsset: LoanAsset;
  let tier: Tier;

  beforeEach(async () => {
    [owner, usdt, usdc, irm, otherIrm, other] = await ethers.getSigners();
    acm = await smock.fake<AccessControlManager>("AccessControlManager");
    acm.isAllowedToCall.returns(true);
    registry = await deployProxy(await new TierRegistry__factory(owner).deploy(), acm.address);

    usdtAsset = { asset: usdt.address, supplyCap: e18("500000"), interestRateModels: [irm.address] };
    usdcAsset = {
      asset: usdc.address,
      supplyCap: e18("250000"),
      interestRateModels: [irm.address, otherIrm.address],
    };
    tier = { enabled: true, minBondUsd: e18("100000"), limits: LIMITS, loanAssets: [usdtAsset] };
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
      const implementation = await new TierRegistry__factory(owner).deploy();
      await expect(implementation.initialize(acm.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("setTier", () => {
    it("stores a tier with its loan assets and emits TierUpdated", async () => {
      tier.loanAssets = [usdtAsset, usdcAsset];
      await expect(registry.setTier(1, tier))
        .to.emit(registry, "TierUpdated")
        .withArgs(
          1,
          (oldTier: unknown) => expect(oldTier).to.deep.equal(ZERO_TIER),
          (newTier: unknown) => expect(newTier).to.deep.equal(tierTuple(tier)),
        );
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
    });

    it("replaces the previous loan assets", async () => {
      const previous = { ...tier, loanAssets: [usdtAsset, usdcAsset] };
      await registry.setTier(1, previous);

      tier.loanAssets = [usdcAsset];
      await expect(registry.setTier(1, tier))
        .to.emit(registry, "TierUpdated")
        .withArgs(
          1,
          (oldTier: unknown) => expect(oldTier).to.deep.equal(tierTuple(previous)),
          (newTier: unknown) => expect(newTier).to.deep.equal(tierTuple(tier)),
        );
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
      expect(await registry.getLoanSupplyCap(1, usdt.address)).to.equal(0);
      expect(await registry.isAllowedInterestRateModel(1, usdt.address, irm.address)).to.equal(false);
    });

    it("stores a tier without loan assets", async () => {
      tier.loanAssets = [];
      await registry.setTier(1, tier);
      expect(await registry.getTier(1)).to.deep.equal(tierTuple(tier));
    });

    it("rejects inconsistent limits", async () => {
      const invalidTiers = [
        { ...tier, limits: { ...LIMITS, maxLiquidationThreshold: e18("1.01") } },
        { ...tier, limits: { ...LIMITS, maxCollateralFactor: e18("0.66") } },
        { ...tier, minBondUsd: 0 },
        { ...tier, minBondUsd: 0, enabled: false },
        { ...tier, limits: { ...LIMITS, minCoverageRatio: 0 } },
        { ...tier, limits: { ...LIMITS, minCoverageRatio: 0 }, enabled: false },
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

    it("rejects a zero loan asset or interest rate model", async () => {
      const invalidAssets = [
        { ...usdtAsset, asset: constants.AddressZero },
        { ...usdtAsset, interestRateModels: [irm.address, constants.AddressZero] },
      ];
      for (const loanAsset of invalidAssets) {
        await expect(registry.setTier(1, { ...tier, loanAssets: [loanAsset] })).to.be.revertedWithCustomError(
          registry,
          "ZeroAddressNotAllowed",
        );
      }
    });

    it("rejects a loan asset with a zero supply cap or no interest rate model", async () => {
      const invalidAssets = [
        { ...usdcAsset, supplyCap: 0 },
        { ...usdcAsset, interestRateModels: [] },
      ];
      for (const loanAsset of invalidAssets) {
        await expect(registry.setTier(1, { ...tier, loanAssets: [usdtAsset, loanAsset] }))
          .to.be.revertedWithCustomError(registry, "InvalidLoanAsset")
          .withArgs(1, usdc.address);
      }
    });

    it("rejects a loan asset listed twice", async () => {
      tier.loanAssets = [usdtAsset, usdcAsset, { ...usdtAsset, supplyCap: e18("1") }];
      await expect(registry.setTier(1, tier))
        .to.be.revertedWithCustomError(registry, "DuplicateLoanAsset")
        .withArgs(1, usdt.address);
    });

    it("needs the ACM role", async () => {
      const signature = "setTier(uint256,Tier)";
      acm.isAllowedToCall.whenCalledWith(other.address, signature).returns(false);
      await expect(registry.connect(other).setTier(1, tier))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(other.address, registry.address, signature);
    });
  });

  describe("loan asset views", () => {
    beforeEach(async () => {
      await registry.setTier(1, { ...tier, loanAssets: [usdtAsset, usdcAsset] });
    });

    it("returns a tier's terms without its loan assets, and zeros for an unset tier", async () => {
      const [enabled, minBondUsd, limits] = await registry.getTierTerms(1);
      expect(enabled).to.equal(true);
      expect(minBondUsd).to.equal(tier.minBondUsd);
      expect(limits).to.deep.equal(Object.values(LIMITS));

      const [unsetEnabled, unsetMinBondUsd, unsetLimits] = await registry.getTierTerms(2);
      expect(unsetEnabled).to.equal(false);
      expect(unsetMinBondUsd).to.equal(0);
      expect(unsetLimits).to.deep.equal([0, 0, 0, 0, 0]);
    });

    it("returns a loan asset's supply cap, and zero for an asset the tier does not offer", async () => {
      expect(await registry.getLoanSupplyCap(1, usdt.address)).to.equal(usdtAsset.supplyCap);
      expect(await registry.getLoanSupplyCap(1, usdc.address)).to.equal(usdcAsset.supplyCap);
      expect(await registry.getLoanSupplyCap(1, other.address)).to.equal(0);
      expect(await registry.getLoanSupplyCap(2, usdt.address)).to.equal(0);
    });

    it("tells whether a tier allows an interest rate model for a loan asset", async () => {
      expect(await registry.isAllowedInterestRateModel(1, usdt.address, irm.address)).to.equal(true);
      expect(await registry.isAllowedInterestRateModel(1, usdc.address, irm.address)).to.equal(true);
      expect(await registry.isAllowedInterestRateModel(1, usdc.address, otherIrm.address)).to.equal(true);

      expect(await registry.isAllowedInterestRateModel(1, usdt.address, otherIrm.address)).to.equal(false);
      expect(await registry.isAllowedInterestRateModel(1, other.address, irm.address)).to.equal(false);
      expect(await registry.isAllowedInterestRateModel(2, usdt.address, irm.address)).to.equal(false);
    });
  });

  describe("isUpgrade", () => {
    const HIGHER_LIMITS = {
      ...LIMITS,
      maxCollateralFactor: e18("0.6"),
      maxLiquidationThreshold: e18("0.7"),
      maxCollateralSupplyCapUsd: e18("2000000"),
    };
    let higherTier: Tier;

    beforeEach(async () => {
      higherTier = {
        enabled: true,
        minBondUsd: e18("200000"),
        limits: HIGHER_LIMITS,
        loanAssets: [{ ...usdtAsset, supplyCap: e18("1000000") }],
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
        { tier: { minBondUsd: tier.minBondUsd } },
        { limits: { maxCollateralFactor: e18("0.4") } },
        { limits: { maxLiquidationThreshold: e18("0.6") } },
        { limits: { maxCollateralMarkets: 2 } },
        { limits: { maxCollateralSupplyCapUsd: e18("999999") } },
      ];
      for (const { tier: tierChange, limits } of nonUpgrades) {
        await registry.setTier(3, { ...higherTier, ...tierChange, limits: { ...LIMITS, ...limits } });
        expect(await registry.isUpgrade(1, 3)).to.equal(false);
      }
    });

    it("needs every loan asset of the pool's tier at a supply cap at least as high", async () => {
      await registry.setTier(3, { ...higherTier, loanAssets: [usdtAsset] });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);

      await registry.setTier(3, { ...higherTier, loanAssets: [usdcAsset, { ...usdtAsset, supplyCap: e18("600000") }] });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);

      await registry.setTier(3, {
        ...higherTier,
        loanAssets: [{ ...usdtAsset, interestRateModels: [otherIrm.address] }],
      });
      expect(await registry.isUpgrade(1, 3)).to.equal(true);

      const nonUpgrades = [[{ ...usdtAsset, supplyCap: e18("499999") }], [usdcAsset], []];
      for (const loanAssets of nonUpgrades) {
        await registry.setTier(3, { ...higherTier, loanAssets });
        expect(await registry.isUpgrade(1, 3)).to.equal(false);
      }
    });

    it("is not an upgrade to an unset tier", async () => {
      expect(await registry.isUpgrade(1, 9)).to.equal(false);
    });
  });
});

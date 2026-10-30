// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokePoolPolicyRegistry } from "../../../../contracts/Spoke/OpenSpokePool/SpokePoolPolicyRegistry.sol";
import { ISpokePoolPolicyRegistry } from "../../../../contracts/Spoke/interfaces/ISpokePoolPolicyRegistry.sol";
import { OpenSpokeFuzzBase } from "./OpenSpokeFuzzBase.t.sol";

/**
 * @title SpokePoolPolicyRegistryFuzzTest
 * @notice Stateless fuzz of the policy registry's tier rules, tier ordering and factor-scaled amounts
 */
contract SpokePoolPolicyRegistryFuzzTest is OpenSpokeFuzzBase {
    uint256 internal constant TIER_A = 1;
    uint256 internal constant TIER_B = 2;
    uint256 internal constant TIER_C = 3;
    uint256 internal constant MAX_USD = 1e30;

    SpokePoolPolicyRegistry internal registry;
    address internal asset = makeAddr("asset");
    address internal interestRateModel = makeAddr("interestRateModel");

    function setUp() public override {
        super.setUp();
        registry = SpokePoolPolicyRegistry(
            _proxy(address(new SpokePoolPolicyRegistry()), abi.encodeCall(SpokePoolPolicyRegistry.initialize, (acm)))
        );
    }

    // ----- helpers -----

    /// @dev Bounds `tier` to what `setTier` accepts
    function _valid(
        ISpokePoolPolicyRegistry.Tier memory tier
    ) internal pure returns (ISpokePoolPolicyRegistry.Tier memory) {
        ISpokePoolPolicyRegistry.PoolLimits memory limits = tier.limits;
        tier.minTierBondUsd = bound(tier.minTierBondUsd, 1, MAX_USD);
        limits.minCoverageRatio = bound(limits.minCoverageRatio, 1, 1e18);
        limits.maxLiquidationThreshold = bound(limits.maxLiquidationThreshold, 0, 1e18);
        limits.maxCollateralFactor = bound(limits.maxCollateralFactor, 0, limits.maxLiquidationThreshold);
        limits.maxCollateralMarkets = bound(limits.maxCollateralMarkets, 0, 50);
        limits.maxCollateralSupplyCapUsd = bound(limits.maxCollateralSupplyCapUsd, 0, MAX_USD);
        limits.loanSupplyCapUsd = bound(limits.loanSupplyCapUsd, 1, MAX_USD);
        return tier;
    }

    /// @dev An enabled copy of `tier` with a strictly higher bond and every compared limit kept or raised
    function _raised(
        ISpokePoolPolicyRegistry.Tier memory tier,
        uint256[6] memory raise
    ) internal pure returns (ISpokePoolPolicyRegistry.Tier memory raised) {
        ISpokePoolPolicyRegistry.PoolLimits memory from = tier.limits;
        raised.enabled = true;
        raised.minTierBondUsd = tier.minTierBondUsd + bound(raise[0], 1, MAX_USD);
        raised.limits.minCoverageRatio = from.minCoverageRatio;
        raised.limits.maxLiquidationThreshold =
            from.maxLiquidationThreshold +
            bound(raise[2], 0, 1e18 - from.maxLiquidationThreshold);
        raised.limits.maxCollateralFactor =
            from.maxCollateralFactor +
            bound(raise[1], 0, raised.limits.maxLiquidationThreshold - from.maxCollateralFactor);
        raised.limits.maxCollateralMarkets = from.maxCollateralMarkets + bound(raise[3], 0, 50);
        raised.limits.maxCollateralSupplyCapUsd = from.maxCollateralSupplyCapUsd + bound(raise[4], 0, MAX_USD);
        raised.limits.loanSupplyCapUsd = from.loanSupplyCapUsd + bound(raise[5], 0, MAX_USD);
    }

    // ----- isUpgrade -----

    /// @notice `isUpgrade` is irreflexive, antisymmetric and transitive over any valid tiers
    function testFuzz_isUpgradeIsAStrictOrder(
        ISpokePoolPolicyRegistry.Tier memory a,
        ISpokePoolPolicyRegistry.Tier memory b,
        ISpokePoolPolicyRegistry.Tier memory c
    ) public {
        registry.setTier(TIER_A, _valid(a));
        registry.setTier(TIER_B, _valid(b));
        registry.setTier(TIER_C, _valid(c));

        assertFalse(registry.isUpgrade(TIER_A, TIER_A));
        assertFalse(registry.isUpgrade(TIER_A, TIER_B) && registry.isUpgrade(TIER_B, TIER_A));
        if (registry.isUpgrade(TIER_A, TIER_B) && registry.isUpgrade(TIER_B, TIER_C)) {
            assertTrue(registry.isUpgrade(TIER_A, TIER_C));
        }
    }

    /// @notice A chain of tiers that each raise the bond and keep every limit is an upgrade at every step and overall
    function testFuzz_raisedTiersAreUpgrades(
        ISpokePoolPolicyRegistry.Tier memory a,
        uint256[6] memory firstRaise,
        uint256[6] memory secondRaise
    ) public {
        a = _valid(a);
        ISpokePoolPolicyRegistry.Tier memory b = _raised(a, firstRaise);
        ISpokePoolPolicyRegistry.Tier memory c = _raised(b, secondRaise);
        registry.setTier(TIER_A, a);
        registry.setTier(TIER_B, b);
        registry.setTier(TIER_C, c);

        assertTrue(registry.isUpgrade(TIER_A, TIER_B));
        assertTrue(registry.isUpgrade(TIER_B, TIER_C));
        assertTrue(registry.isUpgrade(TIER_A, TIER_C));
        assertFalse(registry.isUpgrade(TIER_C, TIER_A));

        c.enabled = false;
        registry.setTier(TIER_C, c);
        assertFalse(registry.isUpgrade(TIER_A, TIER_C));
        assertFalse(registry.isUpgrade(TIER_B, TIER_C));
    }

    /// @notice A target that lowers any one limit, or does not raise the bond, is never an upgrade
    function testFuzz_lowerLimitIsNeverAnUpgrade(
        ISpokePoolPolicyRegistry.Tier memory a,
        uint256[6] memory raise,
        uint256 field,
        uint256 cut
    ) public {
        a = _valid(a);
        ISpokePoolPolicyRegistry.Tier memory target = _raised(a, raise);
        ISpokePoolPolicyRegistry.PoolLimits memory limits = target.limits;
        field = bound(field, 0, 5);
        if (field == 0) {
            // An equal bond is not an upgrade either
            target.minTierBondUsd = a.minTierBondUsd - bound(cut, 0, a.minTierBondUsd - 1);
        } else if (field == 1) {
            vm.assume(a.limits.maxCollateralFactor != 0);
            limits.maxCollateralFactor = a.limits.maxCollateralFactor - bound(cut, 1, a.limits.maxCollateralFactor);
        } else if (field == 2) {
            vm.assume(a.limits.maxLiquidationThreshold != 0);
            limits.maxLiquidationThreshold =
                a.limits.maxLiquidationThreshold -
                bound(cut, 1, a.limits.maxLiquidationThreshold);
            if (limits.maxCollateralFactor > limits.maxLiquidationThreshold) {
                limits.maxCollateralFactor = limits.maxLiquidationThreshold;
            }
        } else if (field == 3) {
            vm.assume(a.limits.maxCollateralMarkets != 0);
            limits.maxCollateralMarkets = a.limits.maxCollateralMarkets - bound(cut, 1, a.limits.maxCollateralMarkets);
        } else if (field == 4) {
            vm.assume(a.limits.maxCollateralSupplyCapUsd != 0);
            limits.maxCollateralSupplyCapUsd =
                a.limits.maxCollateralSupplyCapUsd -
                bound(cut, 1, a.limits.maxCollateralSupplyCapUsd);
        } else {
            vm.assume(a.limits.loanSupplyCapUsd > 1);
            limits.loanSupplyCapUsd = a.limits.loanSupplyCapUsd - bound(cut, 1, a.limits.loanSupplyCapUsd - 1);
        }
        registry.setTier(TIER_A, a);
        registry.setTier(TIER_B, target);

        assertFalse(registry.isUpgrade(TIER_A, TIER_B));
    }

    // ----- setTier -----

    /// @notice `setTier` accepts a tier exactly when it breaks none of the rules
    function testFuzz_setTierRejectsExactlyTheInvalidTiers(ISpokePoolPolicyRegistry.Tier memory tier) public {
        ISpokePoolPolicyRegistry.PoolLimits memory limits = tier.limits;
        tier.minTierBondUsd = bound(tier.minTierBondUsd, 0, MAX_USD);
        limits.minCoverageRatio = bound(limits.minCoverageRatio, 0, 2e18);
        limits.maxCollateralFactor = bound(limits.maxCollateralFactor, 0, 2e18);
        limits.maxLiquidationThreshold = bound(limits.maxLiquidationThreshold, 0, 2e18);
        limits.loanSupplyCapUsd = bound(limits.loanSupplyCapUsd, 0, MAX_USD);
        bool invalid = tier.minTierBondUsd == 0 ||
            limits.minCoverageRatio == 0 ||
            limits.minCoverageRatio > 1e18 ||
            limits.maxLiquidationThreshold > 1e18 ||
            limits.maxCollateralFactor > limits.maxLiquidationThreshold ||
            limits.loanSupplyCapUsd == 0;

        if (invalid) {
            vm.expectRevert(abi.encodeWithSelector(ISpokePoolPolicyRegistry.InvalidTier.selector, TIER_A));
            registry.setTier(TIER_A, tier);
        } else {
            registry.setTier(TIER_A, tier);
            assertEq(abi.encode(registry.getTier(TIER_A)), abi.encode(tier));
        }
    }

    // ----- bond and loan cap scaling -----

    /// @notice The required bond is the tier's bond scaled by the asset's factor, rising with both
    function testFuzz_requiredBondScalesWithTheFactor(
        ISpokePoolPolicyRegistry.Tier memory tier,
        uint256 factor,
        uint256 bondRaise,
        uint256 factorRaise
    ) public {
        tier = _valid(tier);
        factor = bound(factor, 1, 10e18);
        registry.setTier(TIER_A, tier);
        registry.setBondAssetFactor(asset, factor);
        uint256 required = registry.getRequiredBondUsd(TIER_A, asset);
        assertEq(required, (tier.minTierBondUsd * factor) / 1e18);

        tier.minTierBondUsd += bound(bondRaise, 0, MAX_USD);
        registry.setTier(TIER_B, tier);
        registry.setBondAssetFactor(asset, factor + bound(factorRaise, 0, 10e18));
        assertGe(registry.getRequiredBondUsd(TIER_B, asset), required);

        address unlisted = makeAddr("unlisted");
        vm.expectRevert(abi.encodeWithSelector(ISpokePoolPolicyRegistry.BondAssetNotAllowed.selector, unlisted));
        registry.getRequiredBondUsd(TIER_A, unlisted);
    }

    /// @notice A loan asset's cap is the tier's cap scaled by its factor, never above the tier's for a factor up to 1
    function testFuzz_loanSupplyCapScalesWithTheFactor(
        ISpokePoolPolicyRegistry.Tier memory tier,
        uint256 factor
    ) public {
        tier = _valid(tier);
        factor = bound(factor, 1, 10e18);
        registry.setTier(TIER_A, tier);
        assertEq(registry.getLoanSupplyCapUsd(TIER_A, asset), 0);

        address[] memory models = new address[](1);
        models[0] = interestRateModel;
        registry.setLoanAssetConfig(asset, ISpokePoolPolicyRegistry.LoanAssetConfig(factor, models));
        uint256 cap = registry.getLoanSupplyCapUsd(TIER_A, asset);
        assertEq(cap, (tier.limits.loanSupplyCapUsd * factor) / 1e18);
        if (factor <= 1e18) {
            assertLe(cap, tier.limits.loanSupplyCapUsd);
        }
    }
}

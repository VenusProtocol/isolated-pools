// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { TokenErrorReporter } from "../../../contracts/ErrorReporter.sol";
import { SpokeComptrollerInterface } from "../../../contracts/Spoke/SpokeComptrollerInterface.sol";
import { VToken } from "../../../contracts/VToken.sol";
import { MockToken } from "../../../contracts/test/Mocks/MockToken.sol";
import { SpokeFuzzBase, liquidationRoundingAllowance } from "./SpokeFuzzBase.t.sol";

/**
 * @title SpokeFuzzTest
 * @notice Stateless fuzz tests: one scenario per test, with the fuzzer choosing the numbers
 */
contract SpokeFuzzTest is SpokeFuzzBase {
    function setUp() public override {
        super.setUp();
        _supply(hub, LIQUIDITY, 10_000_000e18);
    }

    // ----- liquidation incentive floors -----

    /// @notice The pool-wide incentive is accepted exactly when it is at least 1e18 plus the default 5% seize share
    function testFuzz_poolIncentiveFloor(uint256 incentive) public {
        incentive = bound(incentive, 0, 3e18);
        if (incentive < 1.05e18) {
            vm.expectRevert(SpokeComptrollerInterface.InvalidLiquidationIncentive.selector);
            comptroller.setLiquidationIncentive(incentive);
        } else {
            comptroller.setLiquidationIncentive(incentive);
            assertEq(comptroller.effectiveLiquidationIncentive(address(markets[COLLATERAL_A])), incentive);
        }
    }

    /// @notice A market's own incentive and its seize share each cap the other, so `incentive >= 1e18 + share` holds
    /// whichever of the two is set last
    function testFuzz_marketIncentiveAndSeizeShareBoundEachOther(
        uint256 share,
        uint256 incentive,
        uint256 laterShare
    ) public {
        VToken market = markets[COLLATERAL_A];
        // Up to 0.1e18, which the pool's 1.1e18 incentive allows before the market has an incentive of its own.
        share = bound(share, 0, 0.1e18);
        market.setProtocolSeizeShare(share);

        incentive = bound(incentive, 0, 3e18);
        if (incentive < 1e18 + share) {
            vm.expectRevert(SpokeComptrollerInterface.InvalidLiquidationIncentive.selector);
            comptroller.setMarketLiquidationIncentive(address(market), incentive);
            return;
        }
        comptroller.setMarketLiquidationIncentive(address(market), incentive);
        assertEq(comptroller.effectiveLiquidationIncentive(address(market)), incentive);

        laterShare = bound(laterShare, 0, 1e18);
        if (laterShare + 1e18 > incentive) {
            vm.expectRevert(TokenErrorReporter.ProtocolSeizeShareTooBig.selector);
            market.setProtocolSeizeShare(laterShare);
        } else {
            market.setProtocolSeizeShare(laterShare);
        }
        assertGe(
            comptroller.effectiveLiquidationIncentive(address(market)),
            1e18 + market.protocolSeizeShareMantissa()
        );
    }

    // ----- liquidation payout -----

    /// @notice After a 15% to 45% collateral price drop, a liquidator keeps vTokens worth at least what it repaid, for
    /// any seize share and any incentive the setters accept
    function testFuzz_liquidatorReceivesAtLeastTheDebtRepaid(
        uint256 share,
        bool marketHasOwnIncentive,
        uint256 ownIncentive,
        uint256 priceDropBps,
        uint256 repay
    ) public {
        VToken collateral = markets[COLLATERAL_A];
        share = bound(share, 0, 0.1e18);
        collateral.setProtocolSeizeShare(share);
        if (marketHasOwnIncentive) {
            comptroller.setMarketLiquidationIncentive(address(collateral), bound(ownIncentive, 1e18 + share, 1.5e18));
        }

        _supply(alice, COLLATERAL_A, 10_000e18);
        _enter(alice, COLLATERAL_A);
        vm.prank(alice);
        markets[LIQUIDITY].borrow(6_900e18);

        // A 15% drop takes 6,900 of debt past the 80% threshold on 10,000 of collateral. At 45% the collateral still
        // covers the largest seizure: half the debt at a 1.5x incentive.
        uint256 collateralPrice = (1e18 * (10_000 - bound(priceDropBps, 1_500, 4_500))) / 10_000;
        _setPrice(COLLATERAL_A, collateralPrice);

        uint256 borrowBalance = markets[LIQUIDITY].borrowBalanceStored(alice);
        repay = bound(repay, 1e18, (borrowBalance * CLOSE_FACTOR) / 1e18);

        MockToken usdt = MockToken(markets[LIQUIDITY].underlying());
        vm.startPrank(liquidator);
        usdt.faucet(repay);
        usdt.approve(address(markets[LIQUIDITY]), repay);
        markets[LIQUIDITY].liquidateBorrow(alice, repay, collateral);
        vm.stopPrank();

        uint256 exchangeRate = collateral.exchangeRateStored();
        uint256 receivedValue = ((collateral.balanceOf(liquidator) * exchangeRate) / 1e18) * collateralPrice;
        assertGe(
            receivedValue + liquidationRoundingAllowance(repay, exchangeRate, collateralPrice),
            repay * INITIAL_PRICE,
            "liquidator repaid more than it received"
        );
    }

    // ----- bounded pricing -----

    /// @notice Alice borrows against two collateral markets, then all three prices move three times, each move
    /// recorded by the bounded oracle
    function _openPositionAndMovePrices(uint256 borrowAmount, uint256[9] memory prices) internal {
        _supply(alice, COLLATERAL_A, 10_000e18);
        _supply(alice, COLLATERAL_B, 5_000e18);
        _enter(alice, COLLATERAL_A);
        _enter(alice, COLLATERAL_B);
        vm.prank(alice);
        markets[LIQUIDITY].borrow(bound(borrowAmount, 1e18, 10_000e18));

        for (uint256 step; step < 3; ++step) {
            _movePrice(COLLATERAL_A, bound(prices[step * 3], 0.3e18, 3e18));
            _movePrice(COLLATERAL_B, bound(prices[step * 3 + 1], 0.3e18, 3e18));
            _movePrice(LIQUIDITY, bound(prices[step * 3 + 2], 0.5e18, 2e18));
        }
    }

    /// @notice Borrowing power under bounded prices never exceeds the same position at spot, and equals it when no
    /// price is bounded
    function testFuzz_boundedBorrowingPowerNeverExceedsSpot(uint256 borrowAmount, uint256[9] memory prices) public {
        _openPositionAndMovePrices(borrowAmount, prices);

        int256 bounded = _borrowingNet(alice);
        int256 spot = _spotBorrowingNet(alice);
        assertLe(bounded, spot, "bounded pricing raised borrowing power");

        bool anyBounded;
        for (uint256 i; i < MARKET_COUNT; ++i) {
            (uint256 collateralPrice, uint256 debtPrice) = boundedOracle.getBoundedPricesView(address(markets[i]));
            uint256 spotPrice = oracle.getUnderlyingPrice(address(markets[i]));
            assertLe(collateralPrice, spotPrice, "collateral priced above spot");
            assertGe(debtPrice, spotPrice, "debt priced below spot");
            if (collateralPrice != spotPrice || debtPrice != spotPrice) anyBounded = true;
        }
        if (!anyBounded) assertEq(bounded, spot, "spot replica drifted from the comptroller");
    }

    /// @notice Any borrow that succeeds after the prices move stays within the collateral-factor limit at spot
    function testFuzz_borrowNeverExceedsSpotCapacity(
        uint256 borrowAmount,
        uint256[9] memory prices,
        uint256 extraBorrow
    ) public {
        _openPositionAndMovePrices(borrowAmount, prices);

        extraBorrow = bound(extraBorrow, 1, 20_000e18);
        vm.prank(alice);
        try markets[LIQUIDITY].borrow(extraBorrow) {
            assertGe(_spotBorrowingNet(alice), 0, "borrow accepted beyond spot capacity");
        } catch {}
    }
}

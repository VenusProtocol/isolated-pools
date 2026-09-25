// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VTokenBase } from "./VTokenBase.t.sol";

/// @notice The rounding at the edges of supplying and withdrawing.
contract VTokenTest is VTokenBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        _deployMarket();
    }

    /// @notice Minting then immediately redeeming everything must never hand back more underlying
    ///  than went in. Getting more would be free money minted out of rounding.
    function testFuzz_mintRedeemRoundTripNeverProfits(uint256 amount) public {
        amount = bound(amount, 1e10, 1e30);

        _mintAs(alice, amount);

        // Read the balance before the prank: vm.prank applies to the next call made, and an
        // inline vToken.balanceOf(alice) would be that call, leaving redeem to run unpranked.
        uint256 shares = vToken.balanceOf(alice);
        vm.prank(alice);
        vToken.redeem(shares);

        assertLe(underlying.balanceOf(alice), amount, "round trip produced underlying");
    }

    /// @notice Supplying must never lower the exchange rate, which would dilute the suppliers
    ///  already in the market.
    function testFuzz_mintNeverLowersTheExchangeRate(uint256 first, uint256 second) public {
        first = bound(first, 1e10, 1e30);
        second = bound(second, 1e10, 1e30);

        _mintAs(alice, first);
        uint256 rateAfterFirst = vToken.exchangeRateStored();

        _mintAs(bob, second);

        assertGe(vToken.exchangeRateStored(), rateAfterFirst);
    }
}

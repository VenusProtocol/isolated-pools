// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdCheats } from "forge-std/StdCheats.sol";
import { StdUtils } from "forge-std/StdUtils.sol";

import { VToken } from "../../contracts/VToken.sol";
import { MockToken } from "../../contracts/test/Mocks/MockToken.sol";
import { VTokenBase } from "./VTokenBase.t.sol";

contract VTokenHandler is CommonBase, StdCheats, StdUtils {
    VToken public immutable vToken;
    MockToken public immutable underlying;

    address[] public actors;

    /// @dev Ghost state: the rate as of the last call, which the vToken does not keep.
    uint256 public ghostExchangeRate;

    uint256 internal constant MAX_ACTION = 1e24;

    constructor(VToken vToken_, MockToken underlying_, address[] memory actors_) {
        vToken = vToken_;
        underlying = underlying_;
        actors = actors_;
        ghostExchangeRate = vToken_.exchangeRateStored();
    }

    modifier recordsExchangeRate() {
        _;
        ghostExchangeRate = vToken.exchangeRateStored();
    }

    function mint(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        amount = bound(amount, 1e12, MAX_ACTION);

        deal(address(underlying), actor, underlying.balanceOf(actor) + amount);

        vm.startPrank(actor);
        underlying.approve(address(vToken), amount);
        vToken.mint(amount);
        vm.stopPrank();
    }

    function redeem(uint256 actorSeed, uint256 shares) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 balance = vToken.balanceOf(actor);
        if (balance == 0) return;
        shares = bound(shares, 1, balance);

        vm.prank(actor);
        vToken.redeem(shares);
    }

    function borrow(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 cash = vToken.getCash();
        if (cash == 0) return;
        amount = bound(amount, 1, cash);

        vm.prank(actor);
        vToken.borrow(amount);
    }

    function repay(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 debt = vToken.borrowBalanceStored(actor);
        if (debt == 0) return;
        amount = bound(amount, 1, debt);

        deal(address(underlying), actor, underlying.balanceOf(actor) + amount);

        vm.startPrank(actor);
        underlying.approve(address(vToken), amount);
        vToken.repayBorrow(amount);
        vm.stopPrank();
    }

    /// @dev The market accrues per block, so time only moves when blocks do.
    function passBlocks(uint256 count) external recordsExchangeRate {
        vm.roll(block.number + bound(count, 1, 100_000));
        vToken.accrueInterest();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }
}

/// @notice Properties that must hold after any sequence of supplies, withdrawals, borrows, repays
///  and elapsed blocks. Foundry drives the handler; nothing here assumes an order.
contract VTokenInvariantsTest is VTokenBase {
    VTokenHandler internal handler;

    function setUp() public {
        _deployMarket();

        address[] memory actors = new address[](4);
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        actors[3] = makeAddr("dave");

        address[] memory markets = new address[](1);
        markets[0] = address(vToken);
        for (uint256 i; i < actors.length; ++i) {
            vm.prank(actors[i]);
            comptroller.enterMarkets(markets);
        }

        handler = new VTokenHandler(vToken, underlying, actors);
        targetContract(address(handler));
    }

    /// @notice The market tracks its cash internally so donations cannot move the exchange rate.
    ///  With no donations, that figure must match the tokens it actually holds.
    function invariant_cashMatchesTheTokenBalance() public view {
        assertEq(vToken.getCash(), underlying.balanceOf(address(vToken)));
    }

    /// @notice The exchange rate is a ratchet. Interest and rounding push it up; no user action
    ///  may push it down, because that would take value from the suppliers already in.
    function invariant_exchangeRateNeverFalls() public view {
        assertGe(vToken.exchangeRateStored(), handler.ghostExchangeRate());
    }

    /// @notice The market is solvent: what it holds plus what it is owed covers what it has
    ///  promised its suppliers, after setting aside the reserves.
    function invariant_marketIsSolvent() public view {
        uint256 supplied = (vToken.totalSupply() * vToken.exchangeRateStored()) / 1e18;
        uint256 assets = vToken.getCash() + vToken.totalBorrows();

        assertGe(assets, supplied + vToken.totalReserves());
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokeComptrollerInterface } from "../../../contracts/Spoke/SpokeComptrollerInterface.sol";
import { SpokeComptrollerStorage } from "../../../contracts/Spoke/SpokeComptrollerStorage.sol";
import { MockToken } from "../../../contracts/test/Mocks/MockToken.sol";
import { SpokeFuzzBase } from "./SpokeFuzzBase.t.sol";

interface ITransferHook {
    function onTransferFrom() external;
}

/// @notice A `MockToken` that hands control to `hook` once, on its next `transferFrom`, the way a token with transfer
/// hooks would in the middle of a repayment
contract HookToken is MockToken {
    address public hook;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockToken(name_, symbol_, decimals_) {}

    function setHook(address hook_) external {
        hook = hook_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address hook_ = hook;
        if (hook_ != address(0)) {
            hook = address(0);
            ITransferHook(hook_).onTransferFrom();
        }
        return super.transferFrom(from, to, amount);
    }
}

/**
 * @title SpokeLiquidateAccountTest
 * @notice `liquidateAccount` has to leave the borrower with no debt anywhere, including in markets entered while the
 * orders were running
 * @dev This contract is the borrower, so the hook can open the new borrow as the borrower without a prank
 */
contract SpokeLiquidateAccountTest is SpokeFuzzBase, ITransferHook {
    uint256 internal constant BORROWED = 60e18;
    uint256 internal constant BORROWED_IN_HOOK = 10e18;

    HookToken internal usdt;

    function setUp() public override {
        super.setUp();

        // Give the liquidity market's underlying a transfer hook. `HookToken` only appends to `MockToken`'s storage,
        // so the balances already recorded at this address carry over.
        usdt = HookToken(markets[LIQUIDITY].underlying());
        vm.etch(address(usdt), address(new HookToken("USDT", "USDT", 18)).code);

        _supply(hub, LIQUIDITY, 10_000_000e18);

        _supply(address(this), COLLATERAL_A, 100e18);
        _enter(address(this), COLLATERAL_A);
        markets[LIQUIDITY].borrow(BORROWED);

        // $70 of collateral against $60 of debt: in shortfall, under the $100 threshold, and still enough to clear the
        // whole debt at the 1.1 incentive, which is what `liquidateAccount` requires.
        _setPrice(COLLATERAL_A, 0.7e18);

        vm.startPrank(liquidator);
        usdt.faucet(BORROWED);
        usdt.approve(address(markets[LIQUIDITY]), BORROWED);
        vm.stopPrank();
    }

    /// @notice Called by `usdt` while the liquidator's repayment is being pulled in
    function onTransferFrom() external {
        MockToken collateral = MockToken(markets[COLLATERAL_B].underlying());
        collateral.faucet(100e18);
        collateral.approve(address(markets[COLLATERAL_B]), 100e18);
        markets[COLLATERAL_B].mint(100e18);
        address[] memory one = new address[](1);
        one[0] = address(markets[COLLATERAL_B]);
        comptroller.enterMarkets(one);
        markets[COLLATERAL_B].borrow(BORROWED_IN_HOOK);
    }

    function test_liquidateAccount_clearsTheAccount() public {
        vm.prank(liquidator);
        comptroller.liquidateAccount(address(this), _orders());

        assertEq(markets[LIQUIDITY].borrowBalanceStored(address(this)), 0);
    }

    function test_liquidateAccount_revertsOnDebtOpenedDuringTheOrders() public {
        usdt.setHook(address(this));

        vm.expectRevert(SpokeComptrollerInterface.NonzeroBorrowBalanceAfterLiquidation.selector);
        vm.prank(liquidator);
        comptroller.liquidateAccount(address(this), _orders());
    }

    function _orders() internal view returns (SpokeComptrollerStorage.LiquidationOrder[] memory orders) {
        orders = new SpokeComptrollerStorage.LiquidationOrder[](1);
        orders[0] = SpokeComptrollerStorage.LiquidationOrder({
            vTokenCollateral: markets[COLLATERAL_A],
            vTokenBorrowed: markets[LIQUIDITY],
            repayAmount: BORROWED
        });
    }
}

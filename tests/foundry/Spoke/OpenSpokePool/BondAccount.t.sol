// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { BondAccount } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/Accounts/BondAccount.sol";
import { LiquidityHubBondAccount } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/Accounts/LiquidityHubBondAccount.sol";
import { IBondAccount } from "../../../../contracts/Spoke/interfaces/IBondAccount.sol";
import { MockLiquidityHub } from "../../../../contracts/test/Mocks/MockLiquidityHub.sol";
import { MockToken } from "../../../../contracts/test/Mocks/MockToken.sol";
import { OpenSpokeFuzzBase } from "./OpenSpokeFuzzBase.t.sol";

/**
 * @title BondAccountFuzzTest
 * @notice Stateless fuzz of the idle and Liquidity Hub bond accounts, with this contract as their bond manager. The
 * Hub account's position is moved by yield, losses, fee-share dilution and an exit fee before each payout
 */
contract BondAccountFuzzTest is OpenSpokeFuzzBase {
    /// @notice The Hub position's moves, applied after the bond is deposited
    struct HubMoves {
        uint256 supplied;
        uint256 yield;
        uint256 loss;
        uint256 feeShares;
        uint256 redeemFeeBps;
    }

    uint256 internal constant MAX_TOKENS = 1e9;

    address internal holder = makeAddr("holder");
    address internal receiver = makeAddr("receiver");
    address internal hubSupplier = makeAddr("hubSupplier");

    address internal idleImplementation;
    address internal hubImplementation;

    MockToken internal token;
    MockLiquidityHub internal hub;
    IBondAccount internal account;

    function setUp() public override {
        super.setUp();
        idleImplementation = address(new BondAccount(address(this)));
        hubImplementation = address(new LiquidityHubBondAccount(address(this)));
    }

    // ----- helpers -----

    function _newIdleAccount(uint8 decimals) internal returns (uint256 unit) {
        unit = _newToken(decimals);
        account = _clone(idleImplementation, address(0));
    }

    function _newHubAccount(uint8 decimals) internal returns (uint256 unit) {
        unit = _newToken(decimals);
        hub = new MockLiquidityHub(token);
        account = _clone(hubImplementation, address(hub));
    }

    function _newToken(uint8 decimals) internal returns (uint256 unit) {
        decimals = uint8(bound(decimals, 6, 18));
        token = new MockToken("Bond", "BOND", decimals);
        unit = 10 ** decimals;
    }

    function _clone(address implementation, address source) internal returns (IBondAccount clone) {
        clone = IBondAccount(Clones.clone(implementation));
        clone.initialize(holder, IERC20Upgradeable(address(token)), source);
    }

    /// @dev Sends `amount` to the account and deposits it, as the bond manager does on creation
    function _fund(uint256 amount) internal {
        token.faucet(amount);
        token.transfer(address(account), amount);
        account.depositInSource();
    }

    /// @dev Another supplier joins the Hub, which then gains yield, loses assets and mints fee shares once, and charges
    /// an exit fee. Fee shares are minted here, so the account's own accrual adds none
    function _moveHub(HubMoves memory moves, uint256 unit) internal {
        moves.supplied = bound(moves.supplied, 0, MAX_TOKENS * unit);
        if (moves.supplied != 0) {
            vm.startPrank(hubSupplier);
            token.faucet(moves.supplied);
            token.approve(address(hub), moves.supplied);
            hub.deposit(moves.supplied, hubSupplier);
            vm.stopPrank();
        }

        uint256 totalAssets = hub.totalAssets();
        moves.yield = bound(moves.yield, 0, totalAssets);
        token.faucet(moves.yield);
        token.transfer(address(hub), moves.yield);
        hub.lose(bound(moves.loss, 0, (totalAssets + moves.yield) / 2));

        hub.setFeeSharesPerBlock(bound(moves.feeShares, 0, hub.totalSupply() / 10));
        hub.accrueFees();
        hub.setFeeSharesPerBlock(0);
        hub.setRedeemFeeBps(bound(moves.redeemFeeBps, 0, 1000));
    }

    /// @dev Withdraws above `floor` and checks the revert or the exact payout against the bond's `assets`
    function _expectWithdrawExcess(uint256 assets, uint256 floor) internal {
        uint256 holderBefore = token.balanceOf(holder);
        if (assets <= floor) {
            vm.expectRevert(abi.encodeWithSelector(IBondAccount.NoExcessBond.selector, assets, floor));
            account.withdrawExcess(floor);
            return;
        }

        uint256 amount = account.withdrawExcess(floor);
        assertEq(amount, assets - floor);
        assertEq(token.balanceOf(holder) - holderBefore, amount);
    }

    // ----- withdrawExcess -----

    /// @notice An idle bond pays exactly what it holds above the floor and keeps the floor
    function testFuzz_idleWithdrawExcessPaysAboveTheFloor(
        uint8 decimals,
        uint256 deposit,
        uint256 donation,
        uint256 seizure,
        uint256 floor
    ) public {
        uint256 unit = _newIdleAccount(decimals);
        deposit = bound(deposit, 1, MAX_TOKENS * unit);
        donation = bound(donation, 0, MAX_TOKENS * unit);
        _fund(deposit);
        token.faucet(donation);
        token.transfer(address(account), donation);
        seizure = bound(seizure, 0, deposit + donation);
        account.seize(seizure, receiver);

        uint256 assets = deposit + donation - seizure;
        assertEq(account.currentBondAmount(), assets);
        floor = bound(floor, 0, 2 * assets + 1);
        _expectWithdrawExcess(assets, floor);
        if (assets > floor) {
            assertEq(account.currentBondAmount(), floor);
        }
    }

    /// @notice A Hub bond pays exactly what it holds above the floor and ends at most one Hub share plus 2 wei below it
    /// @dev Accepted: the Hub burns shares rounded up and values the rest rounded down; the deployer tops up the dust
    function testFuzz_hubWithdrawExcessKeepsTheFloor(
        uint8 decimals,
        uint256 deposit,
        uint256 idle,
        HubMoves memory moves,
        uint256 floor
    ) public {
        uint256 unit = _newHubAccount(decimals);
        deposit = bound(deposit, 1, MAX_TOKENS * unit);
        _fund(deposit);
        _moveHub(moves, unit);
        idle = bound(idle, 0, MAX_TOKENS * unit);
        token.faucet(idle);
        token.transfer(address(account), idle);

        uint256 assets = account.currentBondAmount();
        floor = bound(floor, 0, 2 * assets + 1);
        _expectWithdrawExcess(assets, floor);
        if (assets > floor) {
            assertGe(account.currentBondAmount() + hub.convertToAssets(1) + 2, floor);
        }
    }

    // ----- seize -----

    /// @notice A seizure pays the receiver exactly the amount, or reverts and moves nothing when the bond is short
    function testFuzz_seizePaysExactlyOrReverts(
        bool inHub,
        uint8 decimals,
        uint256 deposit,
        HubMoves memory moves,
        uint256 amount
    ) public {
        uint256 unit = inHub ? _newHubAccount(decimals) : _newIdleAccount(decimals);
        deposit = bound(deposit, 1, MAX_TOKENS * unit);
        _fund(deposit);
        if (inHub) _moveHub(moves, unit);

        uint256 assets = account.currentBondAmount();
        amount = bound(amount, 0, 2 * assets + 1);
        if (amount > assets) {
            vm.expectRevert(abi.encodeWithSelector(IBondAccount.InsufficientFunds.selector, amount, assets));
            account.seize(amount, receiver);
            assertEq(account.currentBondAmount(), assets);
            assertEq(token.balanceOf(receiver), 0);
            return;
        }

        account.seize(amount, receiver);
        assertEq(token.balanceOf(receiver), amount);
        if (!inHub) assertEq(account.currentBondAmount(), assets - amount);
    }

    // ----- release -----

    /// @notice A release pays the holder everything the bond holds and leaves nothing to deposit
    function testFuzz_releasePaysEverything(
        bool inHub,
        uint8 decimals,
        uint256 deposit,
        uint256 donation,
        HubMoves memory moves
    ) public {
        uint256 unit = inHub ? _newHubAccount(decimals) : _newIdleAccount(decimals);
        deposit = bound(deposit, 1, MAX_TOKENS * unit);
        _fund(deposit);
        if (inHub) _moveHub(moves, unit);
        donation = bound(donation, 0, MAX_TOKENS * unit);
        token.faucet(donation);
        token.transfer(address(account), donation);

        uint256 assets = account.currentBondAmount();
        account.release();
        assertEq(token.balanceOf(holder), assets);
        assertEq(account.currentBondAmount(), 0);
        vm.expectRevert(IBondAccount.BondAlreadyReleased.selector);
        account.depositInSource();
    }

    // ----- depositInSource -----

    /// @notice A deposit the Hub refuses stays idle and counted, and a later deposit moves it into the Hub
    function testFuzz_refusedDepositStaysIdleUntilDeposited(
        bool paused,
        uint8 decimals,
        uint256 deposit,
        uint256 cap
    ) public {
        uint256 unit = _newHubAccount(decimals);
        deposit = bound(deposit, 1, MAX_TOKENS * unit);
        if (paused) {
            hub.setPaused(true);
        } else {
            hub.setDepositCap(bound(cap, 0, deposit - 1));
        }

        token.faucet(deposit);
        token.transfer(address(account), deposit);
        vm.expectEmit(address(account));
        emit IBondAccount.SourceDepositRefused(deposit);
        account.depositInSource();
        assertEq(token.balanceOf(address(account)), deposit);
        assertEq(hub.balanceOf(address(account)), 0);
        assertEq(account.currentBondAmount(), deposit);

        hub.setPaused(false);
        hub.setDepositCap(type(uint256).max);
        account.depositInSource();
        assertEq(token.balanceOf(address(account)), 0);
        assertEq(account.currentBondAmount(), deposit);
    }
}

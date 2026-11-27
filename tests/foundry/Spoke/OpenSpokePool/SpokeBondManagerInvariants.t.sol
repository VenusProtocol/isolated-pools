// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { console } from "forge-std/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { BondAccount } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/Accounts/BondAccount.sol";
import { LiquidityHubBondAccount } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/Accounts/LiquidityHubBondAccount.sol";
import { SpokeBondManager } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/SpokeBondManager.sol";
import { IBondAccount } from "../../../../contracts/Spoke/interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../../../contracts/Spoke/interfaces/ISpokeBondManager.sol";
import { MockLiquidityHub } from "../../../../contracts/test/Mocks/MockLiquidityHub.sol";
import { MockToken } from "../../../../contracts/test/Mocks/MockToken.sol";
import { OpenSpokeFuzzBase } from "./OpenSpokeFuzzBase.t.sol";

/**
 * @title BondManagerHandler
 * @notice Bounded actor for the bond manager invariant fuzz. It is also the bond manager's `SPOKE_POOL_MANAGER`, so
 * it creates, tops up, seizes, withdraws and releases bonds directly, and moves the Hub under the Hub bonds.
 * @dev A broken rule is stored as a message under its rule id, so a failing run says what broke.
 */
contract BondManagerHandler is CommonBase, StdUtils {
    /// @notice One bond account ever created, with what went in and what was paid out of it
    struct Bond {
        address comptroller;
        address holder;
        bool inHub;
        bool released;
        uint256 paidIn;
        uint256 paidOut;
    }

    bytes32 public constant FLOOR_KEPT = "floorKept";
    bytes32 public constant EXACT_PAYOUT = "exactPayout";

    uint256 public constant COMPTROLLER_COUNT = 3;
    uint256 internal constant MAX_AMOUNT = 1_000_000e18;

    SpokeBondManager public bondManager;
    MockToken public idleAsset;
    MockToken public hubAsset;
    MockLiquidityHub public hub;

    address[] public accounts;
    mapping(address account => Bond bond) public bonds;
    mapping(address comptroller => address account) public activeAccounts;
    mapping(bytes32 rule => string message) public violations;

    uint256 public hubYieldAdded;

    // Ghost counters, logged by `SpokeBondManagerInvariantTest.afterInvariant` to show which paths a run reached.
    uint256 public creates;
    uint256 public topUps;
    uint256 public donations;
    uint256 public seizures;
    uint256 public withdrawals;
    uint256 public releases;
    uint256 public sourceDeposits;

    constructor(MockToken idleAsset_, MockToken hubAsset_, MockLiquidityHub hub_) {
        idleAsset = idleAsset_;
        hubAsset = hubAsset_;
        hub = hub_;
    }

    function setBondManager(SpokeBondManager bondManager_) external {
        bondManager = bondManager_;
    }

    // ----- helpers -----

    function accountCount() external view returns (uint256) {
        return accounts.length;
    }

    function comptrollerOf(uint256 seed) public pure returns (address) {
        return address(uint160(0xA0000 + (seed % COMPTROLLER_COUNT)));
    }

    function _fund(MockToken asset, uint256 amount) internal {
        asset.faucet(amount);
        asset.approve(address(bondManager), amount);
    }

    function _asset(address account) internal view returns (MockToken) {
        return bonds[account].inHub ? hubAsset : idleAsset;
    }

    function _checkPayout(uint256 received, uint256 reported, string memory action) internal {
        if (received != reported) {
            _flag(
                EXACT_PAYOUT,
                string.concat(action, " paid ", vm.toString(received), " but reported ", vm.toString(reported))
            );
        }
    }

    function _flag(bytes32 rule, string memory message) internal {
        if (bytes(violations[rule]).length == 0) violations[rule] = message;
    }

    // ----- spoke pool manager -----

    function createBond(uint256 comptrollerSeed, bool inHub, uint256 amount) external {
        address comptroller = comptrollerOf(comptrollerSeed);
        if (activeAccounts[comptroller] != address(0)) return;
        MockToken asset = inHub ? hubAsset : idleAsset;
        amount = bound(amount, 0, MAX_AMOUNT);
        address holder = address(uint160(uint256(keccak256(abi.encode("holder", accounts.length)))));

        _fund(asset, amount);
        address account = bondManager.createBond(comptroller, holder, address(asset), amount);

        accounts.push(account);
        activeAccounts[comptroller] = account;
        bonds[account] = Bond(comptroller, holder, inHub, false, amount, 0);
        ++creates;
    }

    function topUp(uint256 comptrollerSeed, uint256 amount) external {
        address account = activeAccounts[comptrollerOf(comptrollerSeed)];
        if (account == address(0)) return;
        amount = bound(amount, 0, MAX_AMOUNT);

        _fund(_asset(account), amount);
        bondManager.topUp(bonds[account].comptroller, amount);
        bonds[account].paidIn += amount;
        ++topUps;
    }

    function donate(uint256 comptrollerSeed, uint256 amount) external {
        address account = activeAccounts[comptrollerOf(comptrollerSeed)];
        if (account == address(0)) return;
        amount = bound(amount, 0, MAX_AMOUNT);

        MockToken asset = _asset(account);
        asset.faucet(amount);
        asset.transfer(account, amount);
        bonds[account].paidIn += amount;
        ++donations;
    }

    function seize(uint256 comptrollerSeed, uint256 amount, uint256 receiverSeed) external {
        address account = activeAccounts[comptrollerOf(comptrollerSeed)];
        if (account == address(0)) return;
        // Up to twice the bond, so a seizure larger than the bond is also tried
        amount = bound(amount, 0, IBondAccount(account).currentBondAmount() * 2);
        address receiver = address(uint160(0xC0000 + (receiverSeed % 3)));
        MockToken asset = _asset(account);
        uint256 before = asset.balanceOf(receiver);

        try bondManager.seize(bonds[account].comptroller, amount, receiver) {
            _checkPayout(asset.balanceOf(receiver) - before, amount, "seize");
            bonds[account].paidOut += amount;
            ++seizures;
        } catch {}
    }

    function withdrawExcess(uint256 comptrollerSeed, uint256 floor) external {
        address account = activeAccounts[comptrollerOf(comptrollerSeed)];
        if (account == address(0)) return;
        floor = bound(floor, 0, IBondAccount(account).currentBondAmount() * 2);
        Bond storage bond = bonds[account];
        MockToken asset = _asset(account);
        uint256 before = asset.balanceOf(bond.holder);

        try bondManager.withdrawExcess(bond.comptroller, floor) returns (uint256 amount) {
            _checkPayout(asset.balanceOf(bond.holder) - before, amount, "withdrawExcess");
            uint256 left = IBondAccount(account).currentBondAmount();
            // Accepted: a Hub withdrawal can leave the bond up to one share plus 2 wei under, from the Hub's rounding
            uint256 allowance = asset == hubAsset ? hub.convertToAssets(1) + 2 : 0;
            if (left + allowance < floor) {
                _flag(
                    FLOOR_KEPT,
                    string.concat("withdrawExcess left ", vm.toString(left), " under the floor ", vm.toString(floor))
                );
            }
            bond.paidOut += amount;
            ++withdrawals;
        } catch {}
    }

    function release(uint256 comptrollerSeed) external {
        address comptroller = comptrollerOf(comptrollerSeed);
        address account = activeAccounts[comptroller];
        if (account == address(0)) return;
        Bond storage bond = bonds[account];
        MockToken asset = _asset(account);
        uint256 before = asset.balanceOf(bond.holder);

        try bondManager.release(comptroller) {
            uint256 paid = asset.balanceOf(bond.holder) - before;
            // Hub shares left behind are dust the Hub values at nothing, which `release` skips paying
            if (asset.balanceOf(account) != 0 || hub.previewRedeem(hub.balanceOf(account)) != 0) {
                _flag(EXACT_PAYOUT, "release left funds in the account");
            }
            bond.paidOut += paid;
            bond.released = true;
            activeAccounts[comptroller] = address(0);
            ++releases;
        } catch {}
    }

    function depositInSource(uint256 comptrollerSeed) external {
        address account = activeAccounts[comptrollerOf(comptrollerSeed)];
        if (account == address(0)) return;
        try bondManager.depositInSource(account) {
            ++sourceDeposits;
        } catch {}
    }

    // ----- Hub -----

    function addHubYield(uint256 amount) external {
        // Yield on an empty Hub would only go to whoever deposits next
        if (hub.totalSupply() == 0) return;
        amount = bound(amount, 0, MAX_AMOUNT / 10);
        hubAsset.faucet(amount);
        hubAsset.transfer(address(hub), amount);
        hubYieldAdded += amount;
    }

    function loseHubAssets(uint256 amount) external {
        hub.lose(bound(amount, 0, hubAsset.balanceOf(address(hub)) / 10));
    }

    function setHubPaused(bool paused) external {
        hub.setPaused(paused);
    }

    function setHubDepositCap(uint256 cap) external {
        hub.setDepositCap(bound(cap, 0, MAX_AMOUNT));
    }

    function setHubFees(uint256 feeSharesPerBlock, uint256 redeemFeeBps) external {
        hub.setFeeSharesPerBlock(bound(feeSharesPerBlock, 0, 1_000e18));
        hub.setRedeemFeeBps(bound(redeemFeeBps, 0, 100));
    }

    function passBlocks(uint256 blocks) external {
        vm.roll(block.number + bound(blocks, 1, 100));
    }
}

/**
 * @title SpokeBondManagerInvariantTest
 * @notice Stateful invariant fuzz over the bond manager and its Idle and Liquidity Hub bond accounts. The fuzzer drives
 * only `BondManagerHandler`, and every `invariant_` below must hold after each call.
 */
contract SpokeBondManagerInvariantTest is OpenSpokeFuzzBase {
    BondManagerHandler internal handler;
    SpokeBondManager internal bondManager;
    MockToken internal idleAsset;
    MockToken internal hubAsset;
    MockLiquidityHub internal hub;

    function setUp() public override {
        super.setUp();

        idleAsset = new MockToken("XVS", "XVS", 18);
        hubAsset = new MockToken("USDT", "USDT", 18);
        hub = new MockLiquidityHub(IERC20(address(hubAsset)));
        handler = new BondManagerHandler(idleAsset, hubAsset, hub);

        bondManager = SpokeBondManager(
            _proxy(address(new SpokeBondManager(address(handler))), abi.encodeCall(SpokeBondManager.initialize, (acm)))
        );
        handler.setBondManager(bondManager);
        bondManager.setAccountImplementation(
            ISpokeBondManager.SourceType.Idle,
            address(new BondAccount(address(bondManager)))
        );
        bondManager.setAccountImplementation(
            ISpokeBondManager.SourceType.LiquidityHub,
            address(new LiquidityHubBondAccount(address(bondManager)))
        );
        bondManager.setAssetConfig(
            address(idleAsset),
            ISpokeBondManager.AssetConfig(ISpokeBondManager.SourceType.Idle, address(0))
        );
        bondManager.setAssetConfig(
            address(hubAsset),
            ISpokeBondManager.AssetConfig(ISpokeBondManager.SourceType.LiquidityHub, address(hub))
        );

        targetContract(address(handler));
        bytes4[] memory actions = new bytes4[](12);
        actions[0] = BondManagerHandler.createBond.selector;
        actions[1] = BondManagerHandler.topUp.selector;
        actions[2] = BondManagerHandler.donate.selector;
        actions[3] = BondManagerHandler.seize.selector;
        actions[4] = BondManagerHandler.withdrawExcess.selector;
        actions[5] = BondManagerHandler.release.selector;
        actions[6] = BondManagerHandler.depositInSource.selector;
        actions[7] = BondManagerHandler.addHubYield.selector;
        actions[8] = BondManagerHandler.loseHubAssets.selector;
        actions[9] = BondManagerHandler.setHubPaused.selector;
        actions[10] = BondManagerHandler.setHubDepositCap.selector;
        actions[11] = BondManagerHandler.setHubFees.selector;
        // Without this the fuzzer also spends calls on the handler's getters.
        targetSelector(FuzzSelector({ addr: address(handler), selectors: actions }));
    }

    // ----- rules recorded by the handler -----

    /// @notice A successful excess withdrawal never leaves an Idle bond under its floor, nor a Hub bond more than one
    /// Hub share plus 2 wei under it
    function invariant_withdrawalKeepsTheFloor() public view {
        assertEq(handler.violations(handler.FLOOR_KEPT()), "");
    }

    /// @notice Every payout reaches its receiver in full, as reported, and a release empties the account
    function invariant_payoutsAreExact() public view {
        assertEq(handler.violations(handler.EXACT_PAYOUT()), "");
    }

    // ----- state -----

    /// @notice The bond manager only routes bonds: it never holds a bond asset or Hub shares
    function invariant_bondManagerHoldsNothing() public view {
        assertEq(idleAsset.balanceOf(address(bondManager)), 0);
        assertEq(hubAsset.balanceOf(address(bondManager)), 0);
        assertEq(hub.balanceOf(address(bondManager)), 0);
    }

    /// @notice An Idle bond holds exactly what went in minus what was paid out, and reads 0 once released
    function invariant_idleBondIsConserved() public view {
        for (uint256 i; i < handler.accountCount(); ++i) {
            address account = handler.accounts(i);
            (, , bool inHub, bool released, uint256 paidIn, uint256 paidOut) = handler.bonds(account);
            if (inHub) continue;
            assertEq(idleAsset.balanceOf(account), paidIn - paidOut);
            assertEq(IBondAccount(account).currentBondAmount(), released ? 0 : paidIn - paidOut);
        }
    }

    /// @notice The Hub bonds together never pay out more than went into them plus all the yield ever added to the Hub
    /// @dev Summed, as an exit fee one bond pays stays in the Hub and raises the other bonds' share price
    function invariant_hubBondsNeverPayMoreThanTheirInputsAndYield() public view {
        uint256 paidIn;
        uint256 paidOut;
        for (uint256 i; i < handler.accountCount(); ++i) {
            (, , bool inHub, , uint256 accountIn, uint256 accountOut) = handler.bonds(handler.accounts(i));
            if (!inHub) continue;
            paidIn += accountIn;
            paidOut += accountOut;
        }
        assertLe(paidOut, paidIn + handler.hubYieldAdded());
    }

    /// @notice A released account reads 0 and is no longer its comptroller's bond, but stays a known bond account
    function invariant_releasedAccountIsDetached() public view {
        for (uint256 i; i < handler.accountCount(); ++i) {
            address account = handler.accounts(i);
            (address comptroller, , , bool released, , ) = handler.bonds(account);
            assertTrue(bondManager.isBondAccount(account));
            if (!released) continue;
            assertEq(IBondAccount(account).currentBondAmount(), 0);
            assertTrue(bondManager.bondAccounts(comptroller) != account);
        }
    }

    /// @notice A comptroller has a bond account exactly while it has a created, unreleased bond
    function invariant_comptrollerBondMatchesItsLiveBond() public view {
        for (uint256 i; i < handler.COMPTROLLER_COUNT(); ++i) {
            address comptroller = handler.comptrollerOf(i);
            assertEq(bondManager.bondAccounts(comptroller), handler.activeAccounts(comptroller));
        }
    }

    /// @notice Each handler action succeeds from a fresh state, so an invariant run can reach every path
    function test_everyActionIsReachable() public {
        handler.createBond(0, false, 1_000e18);
        handler.createBond(1, true, 1_000e18);
        handler.topUp(0, 100e18);
        handler.topUp(1, 100e18);
        handler.donate(0, 50e18);
        handler.donate(1, 50e18);
        handler.depositInSource(1);
        handler.setHubFees(1e18, 10);
        handler.passBlocks(1);
        handler.addHubYield(10e18);
        handler.loseHubAssets(1e18);
        handler.seize(0, 100e18, 0);
        handler.seize(1, 100e18, 1);
        handler.withdrawExcess(0, 500e18);
        handler.withdrawExcess(1, 500e18);
        handler.setHubPaused(true);
        handler.setHubPaused(false);
        handler.setHubDepositCap(0);
        handler.topUp(1, 10e18);
        handler.release(0);
        handler.release(1);

        assertEq(handler.creates(), 2, "createBond");
        assertEq(handler.topUps(), 3, "topUp");
        assertEq(handler.donations(), 2, "donate");
        assertEq(handler.sourceDeposits(), 1, "depositInSource");
        assertEq(handler.seizures(), 2, "seize");
        assertEq(handler.withdrawals(), 2, "withdrawExcess");
        assertEq(handler.releases(), 2, "release");
        invariant_withdrawalKeepsTheFloor();
        invariant_payoutsAreExact();
        invariant_idleBondIsConserved();
        invariant_releasedAccountIsDetached();
        invariant_comptrollerBondMatchesItsLiveBond();
    }

    /// @notice Logs how often each path was reached. Shown with `-vv`
    function afterInvariant() public view {
        console.log("creates", handler.creates(), "topUps", handler.topUps());
        console.log("donations", handler.donations(), "seizures", handler.seizures());
        console.log("withdrawals", handler.withdrawals(), "releases", handler.releases());
        console.log("source deposits", handler.sourceDeposits(), "hub yield", handler.hubYieldAdded());
    }
}

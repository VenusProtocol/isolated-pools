// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { console } from "forge-std/console.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { Comptroller } from "../../../contracts/Comptroller.sol";
import { SpokeComptroller } from "../../../contracts/Spoke/SpokeComptroller.sol";
import { SpokeComptrollerInterface } from "../../../contracts/Spoke/SpokeComptrollerInterface.sol";
import { SpokeComptrollerStorage } from "../../../contracts/Spoke/SpokeComptrollerStorage.sol";
import { VToken } from "../../../contracts/VToken.sol";
import { SpokePoolLens } from "../../../contracts/Lens/SpokePoolLens.sol";
import { PoolRegistryInterface } from "../../../contracts/Pool/PoolRegistryInterface.sol";
import { RewardsDistributor } from "../../../contracts/Rewards/RewardsDistributor.sol";
import { MockToken } from "../../../contracts/test/Mocks/MockToken.sol";
import { MockPriceOracle } from "../../../contracts/test/Mocks/MockPriceOracle.sol";
import { SpokeFuzzBase, liquidationRoundingAllowance } from "./SpokeFuzzBase.t.sol";

/**
 * @title SpokeHandler
 * @notice Bounded actor for the stateful invariant fuzz. Each action bounds its inputs, catches the pool's rejections,
 * and checks every call that succeeds against the rules `SpokeInvariantTest` asserts.
 * @dev A broken rule is stored as a message under its rule id, so a failing run says what broke.
 */
contract SpokeHandler is CommonBase, StdUtils {
    bytes32 public constant SUPPLY_ALLOWLIST = "supplyAllowlist";
    bytes32 public constant LIQUIDATION_ALLOWLIST = "liquidationAllowlist";
    bytes32 public constant BATCH_ROUTING = "batchRouting";
    bytes32 public constant LIQUIDATOR_PAYOUT = "liquidatorPayout";
    bytes32 public constant NO_SHORTFALL = "noShortfall";
    bytes32 public constant LENS_REWARDS = "lensRewards";

    SpokeComptroller internal comptroller;
    VToken[3] internal markets;
    MockPriceOracle internal oracle;
    RewardsDistributor internal distributor;
    SpokePoolLens internal lens;
    address[] internal accounts;
    /// @notice Subset of `accounts` used for positions small enough to sit inside the batch-liquidation band
    address[] internal smallAccounts;

    mapping(bytes32 => string) public violations;

    // Ghost counters, logged by `SpokeInvariantTest.afterInvariant` to show which paths a run reached.
    uint256 public mints;
    uint256 public borrows;
    uint256 public redeems;
    uint256 public liquidations;
    uint256 public liquidateAccounts;
    uint256 public heals;
    uint256 public probesLiquidateAccountAccepted;
    uint256 public probesHealAccepted;
    uint256 public probesBothRejected;
    uint256 public claims;

    constructor(
        SpokeComptroller comptroller_,
        VToken[3] memory markets_,
        MockPriceOracle oracle_,
        RewardsDistributor distributor_,
        SpokePoolLens lens_,
        address[] memory accounts_,
        address[] memory smallAccounts_
    ) {
        comptroller = comptroller_;
        markets = markets_;
        oracle = oracle_;
        distributor = distributor_;
        lens = lens_;
        accounts = accounts_;
        smallAccounts = smallAccounts_;
    }

    // ----- users -----

    function supply(uint256 minterSeed, uint256 marketSeed, uint256 amount, bool onBehalf, uint256 payerSeed) external {
        address minter = _account(minterSeed);
        address payer = onBehalf ? _account(payerSeed) : minter;
        VToken market = markets[marketSeed % 3];
        amount = bound(amount, 1e6, 1_000_000e18);

        _fund(payer, market, amount);
        vm.startPrank(payer);
        bool ok;
        if (onBehalf) {
            try market.mintBehalf(minter, amount) {
                ok = true;
            } catch {}
        } else {
            try market.mint(amount) {
                ok = true;
            } catch {}
        }
        vm.stopPrank();
        if (!ok) return;

        ++mints;
        if (
            comptroller.isSupplyAllowlistEnabled(address(market)) &&
            !comptroller.isAllowedSupplier(address(market), minter)
        ) {
            _flag(SUPPLY_ALLOWLIST, "a mint credited an account that is not on the market's supply allowlist");
        }
    }

    function enterMarket(uint256 accountSeed, uint256 marketSeed) external {
        address[] memory one = new address[](1);
        one[0] = address(markets[marketSeed % 3]);
        vm.prank(_account(accountSeed));
        try comptroller.enterMarkets(one) {} catch {}
    }

    function exitMarket(uint256 accountSeed, uint256 marketSeed) external {
        address account = _account(accountSeed);
        VToken market = markets[marketSeed % 3];
        // Only a member is liquidity-checked on exit, so only a member's result says anything about the check.
        bool wasMember = comptroller.checkMembership(account, market);
        vm.prank(account);
        try comptroller.exitMarket(address(market)) {
            if (wasMember) _checkNoShortfall(account, "exitMarket");
        } catch {}
    }

    function redeem(uint256 accountSeed, uint256 marketSeed, uint256 fractionBps) external {
        address account = _account(accountSeed);
        VToken market = markets[marketSeed % 3];
        uint256 tokens = (market.balanceOf(account) * bound(fractionBps, 1, 10_000)) / 10_000;
        if (tokens == 0) return;
        bool wasMember = comptroller.checkMembership(account, market);
        vm.prank(account);
        try market.redeem(tokens) {
            ++redeems;
            if (wasMember) _checkNoShortfall(account, "redeem");
        } catch {}
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 marketSeed, uint256 fractionBps) external {
        address from = _account(fromSeed);
        address to = _account(toSeed);
        VToken market = markets[marketSeed % 3];
        uint256 tokens = (market.balanceOf(from) * bound(fractionBps, 1, 10_000)) / 10_000;
        if (tokens == 0 || from == to) return;
        bool wasMember = comptroller.checkMembership(from, market);
        vm.prank(from);
        try market.transfer(to, tokens) {
            if (wasMember) _checkNoShortfall(from, "transfer");
        } catch {}
    }

    function borrow(uint256 accountSeed, uint256 amount) external {
        address account = _account(accountSeed);
        amount = bound(amount, 1e6, 500_000e18);
        vm.prank(account);
        try markets[0].borrow(amount) {
            ++borrows;
            _checkNoShortfall(account, "borrow");
        } catch {}
    }

    function repay(uint256 accountSeed, uint256 fractionBps) external {
        address account = _account(accountSeed);
        markets[0].accrueInterest();
        uint256 amount = (markets[0].borrowBalanceStored(account) * bound(fractionBps, 1, 10_000)) / 10_000;
        if (amount == 0) return;
        _fund(account, markets[0], amount);
        vm.prank(account);
        try markets[0].repayBorrow(amount) {} catch {}
    }

    /// @notice Supplies at most 150 collateral tokens and borrows up to the limit. The batch paths serve only positions
    /// at or under `minLiquidatableCollateral`, which random supplies rarely produce
    function openSmallPosition(
        uint256 accountSeed,
        uint256 collateralSeed,
        uint256 amount,
        uint256 borrowBps
    ) external {
        address account = smallAccounts[accountSeed % smallAccounts.length];
        VToken collateral = markets[1 + (collateralSeed % 2)];
        amount = bound(amount, 1e18, 40e18);
        _fund(account, collateral, amount);
        address[] memory one = new address[](1);
        one[0] = address(collateral);
        vm.startPrank(account);
        try collateral.mint(amount) {} catch {
            vm.stopPrank();
            return;
        }
        comptroller.enterMarkets(one);
        vm.stopPrank();

        (, uint256 liquidity, ) = comptroller.getBorrowingPower(account);
        uint256 price = oracle.getUnderlyingPrice(address(markets[0]));
        uint256 amountToBorrow = (((liquidity * 1e18) / price) * bound(borrowBps, 1, 10_000)) / 10_000;
        if (amountToBorrow == 0) return;
        vm.prank(account);
        try markets[0].borrow(amountToBorrow) {
            ++borrows;
            _checkNoShortfall(account, "borrow");
        } catch {}
    }

    function claimRewards(uint256 accountSeed) external {
        address account = _account(accountSeed);
        SpokePoolLens.RewardSummary[] memory summary = lens.getPendingRewards(account, address(comptroller));
        uint256 expected = summary[0].totalRewards;
        for (uint256 i; i < summary[0].pendingRewards.length; ++i) {
            expected += summary[0].pendingRewards[i].amount;
        }

        IERC20Upgradeable rewardToken = distributor.rewardToken();
        uint256 balanceBefore = rewardToken.balanceOf(account);
        distributor.claimRewardToken(account);
        ++claims;

        // Anything the distributor could not pay stays accrued, so it still counts as received.
        uint256 received = rewardToken.balanceOf(account) - balanceBefore + distributor.rewardTokenAccrued(account);
        if (received != expected) {
            _flag(LENS_REWARDS, "SpokePoolLens.getPendingRewards disagreed with what claimRewardToken paid");
        }
    }

    // ----- liquidators -----

    function liquidateBorrow(
        uint256 liquidatorSeed,
        uint256 borrowerSeed,
        uint256 collateralSeed,
        uint256 fractionBps
    ) external {
        address liquidator = _account(liquidatorSeed);
        address borrower = _underwaterAccount(borrowerSeed);
        if (borrower == address(0)) return;
        VToken collateral = markets[1 + (collateralSeed % 2)];
        markets[0].accrueInterest();
        collateral.accrueInterest();

        uint256 maxClose = (markets[0].borrowBalanceStored(borrower) * comptroller.closeFactorMantissa()) / 1e18;
        uint256 repayAmount = (maxClose * bound(fractionBps, 1, 10_000)) / 10_000;
        if (repayAmount == 0 || liquidator == borrower) return;

        _fund(liquidator, markets[0], repayAmount);
        uint256 tokensBefore = collateral.balanceOf(liquidator);
        vm.prank(liquidator);
        try markets[0].liquidateBorrow(borrower, repayAmount, collateral) {
            ++liquidations;
            _checkLiquidatorAllowed(liquidator, "liquidateBorrow");
            _checkLiquidatorPaid(collateral, collateral.balanceOf(liquidator) - tokensBefore, repayAmount);
        } catch {}
    }

    function liquidateAccount(uint256 liquidatorSeed, uint256 borrowerSeed, uint256 collateralSeed) external {
        address liquidator = _account(liquidatorSeed);
        address borrower = _smallUnderwaterAccount(borrowerSeed);
        if (borrower == address(0)) return;
        // Accrued here so the debt repaid below is the debt the comptroller sees after its own refresh.
        for (uint256 i; i < 3; ++i) markets[i].accrueInterest();
        uint256 debt = markets[0].borrowBalanceStored(borrower);
        if (debt == 0 || liquidator == borrower) return;

        SpokeComptrollerStorage.LiquidationOrder[] memory orders = new SpokeComptrollerStorage.LiquidationOrder[](1);
        orders[0] = SpokeComptrollerStorage.LiquidationOrder({
            vTokenCollateral: markets[1 + (collateralSeed % 2)],
            vTokenBorrowed: markets[0],
            repayAmount: debt
        });
        _fund(liquidator, markets[0], debt);
        vm.prank(liquidator);
        try comptroller.liquidateAccount(borrower, orders) {
            ++liquidateAccounts;
            _checkLiquidatorAllowed(liquidator, "liquidateAccount");
        } catch {}
    }

    function healAccount(uint256 liquidatorSeed, uint256 borrowerSeed) external {
        address liquidator = _account(liquidatorSeed);
        address borrower = _smallUnderwaterAccount(borrowerSeed);
        if (borrower == address(0) || liquidator == borrower) return;
        _fund(liquidator, markets[0], 10_000_000e18);
        vm.prank(liquidator);
        try comptroller.healAccount(borrower) {
            ++heals;
            _checkLiquidatorAllowed(liquidator, "healAccount");
        } catch {}
    }

    /**
     * @notice Asks `liquidateAccount` and `healAccount` about the same account in the same state, and records which of
     * them passes routing
     * @dev Each call runs from a snapshot that is then restored, with the liquidation allowlist switched off inside it
     * so the allowlist cannot decide the outcome. `liquidateAccount` gets no orders, so once past routing it stops at
     * its final balance check, which still counts as accepted.
     */
    function probeBatchRouting(uint256 borrowerSeed) external {
        address borrower = _smallUnderwaterAccount(borrowerSeed);
        if (borrower == address(0)) return;
        address prober = address(0xB0B0);
        uint256 snapshot = vm.snapshotState();

        _prepareProbe(prober);
        bool liquidateAccepted;
        bool liquidateSaysHeal;
        vm.prank(prober);
        try comptroller.liquidateAccount(borrower, new SpokeComptrollerStorage.LiquidationOrder[](0)) {
            liquidateAccepted = true;
        } catch (bytes memory reason) {
            bytes4 selector = bytes4(reason);
            liquidateSaysHeal = selector == SpokeComptrollerInterface.DebtExceedsClearableAmount.selector;
            liquidateAccepted =
                !liquidateSaysHeal &&
                selector != SpokeComptrollerInterface.CollateralExceedsThreshold.selector &&
                selector != SpokeComptrollerInterface.InsufficientShortfall.selector;
        }
        vm.revertToState(snapshot);

        _prepareProbe(prober);
        bool healAccepted;
        bool healSaysLiquidate;
        vm.prank(prober);
        try comptroller.healAccount(borrower) {
            healAccepted = true;
        } catch (bytes memory reason) {
            bytes4 selector = bytes4(reason);
            healSaysLiquidate = selector == SpokeComptrollerInterface.CollateralCoversDebt.selector;
            healAccepted =
                !healSaysLiquidate &&
                selector != SpokeComptrollerInterface.CollateralExceedsThreshold.selector &&
                selector != SpokeComptrollerInterface.InsufficientShortfall.selector;
        }
        vm.revertToStateAndDelete(snapshot);

        if (liquidateAccepted && healAccepted) {
            _flag(BATCH_ROUTING, "liquidateAccount and healAccount both accepted the same account");
        }
        if (liquidateSaysHeal && healSaysLiquidate) {
            _flag(BATCH_ROUTING, "liquidateAccount and healAccount each sent the same account to the other");
        }
        if (liquidateAccepted) ++probesLiquidateAccountAccepted;
        else if (healAccepted) ++probesHealAccepted;
        else ++probesBothRejected;
    }

    // ----- market and governance -----

    /// @notice Random walk: each move is 50% to 150% of the current price, within $0.01 to $10 ($0.50 to $2 for USDT)
    function movePrice(uint256 marketSeed, uint256 factor) external {
        uint256 index = marketSeed % 3;
        address underlying = markets[index].underlying();
        uint256 price = (oracle.getPrice(underlying) * bound(factor, 0.5e18, 1.5e18)) / 1e18;
        price = index == 0 ? bound(price, 0.5e18, 2e18) : bound(price, 0.01e18, 10e18);
        oracle.setPrice(underlying, price);
    }

    function passTime(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 3 days));
    }

    function setLiquidationAllowlist(bool enabled) external {
        comptroller.setLiquidationAllowlistEnabled(enabled);
    }

    function setAllowedLiquidator(uint256 accountSeed, bool allowed) external {
        comptroller.setAllowedLiquidator(_account(accountSeed), allowed);
    }

    function setSupplyAllowlist(uint256 marketSeed, bool enabled) external {
        comptroller.setSupplyAllowlistEnabled(address(markets[marketSeed % 3]), enabled);
    }

    function setAllowedSupplier(uint256 marketSeed, uint256 accountSeed, bool allowed) external {
        comptroller.setAllowedSupplier(address(markets[marketSeed % 3]), _account(accountSeed), allowed);
    }

    function setMarketLiquidationIncentive(uint256 marketSeed, uint256 incentive) external {
        VToken market = markets[1 + (marketSeed % 2)];
        uint256 floor = 1e18 + market.protocolSeizeShareMantissa();
        comptroller.setMarketLiquidationIncentive(address(market), bound(incentive, floor, 1.5e18));
    }

    // ----- rules checked after a call succeeds -----

    function _checkNoShortfall(address account, string memory action) internal {
        (, , uint256 shortfall) = comptroller.getBorrowingPower(account);
        if (shortfall > 0) {
            _flag(NO_SHORTFALL, string.concat(action, " succeeded and left the account over its limit"));
        }
    }

    function _checkLiquidatorAllowed(address liquidator, string memory action) internal {
        if (comptroller.isLiquidationAllowlistEnabled() && !comptroller.isAllowedLiquidator(liquidator)) {
            _flag(LIQUIDATION_ALLOWLIST, string.concat(action, " succeeded for a liquidator not on the allowlist"));
        }
    }

    function _checkLiquidatorPaid(VToken collateral, uint256 tokensReceived, uint256 repaid) internal {
        uint256 collateralPrice = oracle.getUnderlyingPrice(address(collateral));
        uint256 exchangeRate = collateral.exchangeRateStored();
        uint256 receivedValue = ((tokensReceived * exchangeRate) / 1e18) * collateralPrice;
        uint256 allowance = liquidationRoundingAllowance(repaid, exchangeRate, collateralPrice);
        if (receivedValue + allowance < repaid * oracle.getUnderlyingPrice(address(markets[0]))) {
            _flag(LIQUIDATOR_PAYOUT, "a liquidator received less collateral value than the debt it repaid");
        }
    }

    // ----- helpers -----

    function _account(uint256 seed) internal view returns (address) {
        return accounts[seed % accounts.length];
    }

    /// @notice The first account from `seed` onwards in shortfall at the liquidation threshold, else `address(0)`.
    /// Only picks the target: the call is still checked in full
    function _underwaterAccount(uint256 seed) internal view returns (address) {
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[((seed % accounts.length) + i) % accounts.length];
            (, , uint256 shortfall) = comptroller.getAccountLiquidity(account);
            if (shortfall > 0) return account;
        }
        return address(0);
    }

    /// @notice As `_underwaterAccount`, limited to accounts with collateral at or under `minLiquidatableCollateral`
    function _smallUnderwaterAccount(uint256 seed) internal view returns (address) {
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[((seed % accounts.length) + i) % accounts.length];
            (, , uint256 shortfall) = comptroller.getAccountLiquidity(account);
            if (shortfall > 0 && _collateralValue(account) <= comptroller.minLiquidatableCollateral()) return account;
        }
        return address(0);
    }

    /// @notice Spot value of the markets `account` has entered, as the comptroller's `totalCollateral` counts it
    function _collateralValue(address account) internal view returns (uint256 value) {
        VToken[] memory assets = comptroller.getAssetsIn(account);
        for (uint256 i; i < assets.length; ++i) {
            uint256 vTokenPrice = (assets[i].exchangeRateStored() * oracle.getUnderlyingPrice(address(assets[i]))) /
                1e18;
            value += (vTokenPrice * assets[i].balanceOf(account)) / 1e18;
        }
    }

    function _prepareProbe(address prober) internal {
        comptroller.setLiquidationAllowlistEnabled(false);
        _fund(prober, markets[0], 10_000_000e18);
    }

    function _fund(address account, VToken market, uint256 amount) internal {
        MockToken underlying = MockToken(market.underlying());
        vm.startPrank(account);
        underlying.faucet(amount);
        underlying.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function _flag(bytes32 rule, string memory message) internal {
        if (bytes(violations[rule]).length == 0) violations[rule] = message;
    }
}

/**
 * @title SpokeInvariantTest
 * @notice Stateful invariant fuzz over a spoke pool with a rewards distributor and the spoke lens. The fuzzer drives
 * only `SpokeHandler`, and every `invariant_` below must hold after each call.
 */
contract SpokeInvariantTest is SpokeFuzzBase {
    uint256 internal constant SUPPLY_SPEED = 1e15;
    uint256 internal constant BORROW_SPEED = 1e15;

    address internal outsider = makeAddr("outsider");
    /// @notice Never seeded, so a small position opened on either stays small
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");
    address[] internal accounts;
    address[] internal smallAccounts;
    /// @notice Collateral for a `smallAccounts` position, kept under `MIN_LIQUIDATABLE_COLLATERAL` (100e18)
    uint256 internal constant SMALL_COLLATERAL = 60e18;
    /// @notice `COLLATERAL_A` price after seeding: puts the `smallAccounts` positions just into shortfall
    uint256 internal constant SMALL_POSITION_START_PRICE = 0.85e18;

    SpokeHandler internal handler;
    SpokePoolLens internal lens;
    RewardsDistributor internal distributor;
    MockToken internal rewardToken;
    uint256 internal rewardsStart;

    function setUp() public override {
        super.setUp();

        // In a spoke pool only the liquidity side is borrowable.
        VToken[] memory collateralMarkets = new VToken[](2);
        collateralMarkets[0] = markets[COLLATERAL_A];
        collateralMarkets[1] = markets[COLLATERAL_B];
        comptroller.setMarketBorrowCaps(collateralMarkets, new uint256[](2));
        comptroller.setAllowedLiquidator(liquidator, true);

        _deployRewards();
        _deployLens();

        accounts = [hub, alice, bob, carol, liquidator, outsider, dave, erin];

        // Runs start from a pool with open positions rather than an empty one.
        _supply(hub, LIQUIDITY, 10_000_000e18);
        address[3] memory users = [alice, bob, carol];
        for (uint256 i; i < users.length; ++i) {
            _supply(users[i], COLLATERAL_A, 20_000e18);
            _supply(users[i], COLLATERAL_B, 10_000e18);
            _enter(users[i], COLLATERAL_A);
            _enter(users[i], COLLATERAL_B);
            vm.prank(users[i]);
            markets[LIQUIDITY].borrow(5_000e18);
        }

        // Two accounts seeded inside the batch-liquidation band: collateral below `minLiquidatableCollateral`
        // (100e18) and a borrow at the edge of the collateral factor, so an ordinary price move puts them in
        // shortfall. Without these no account ever satisfies `_smallUnderwaterAccount`, and `liquidateAccount`
        // and `healAccount` are never reached.
        smallAccounts = [dave, erin];
        for (uint256 i; i < smallAccounts.length; ++i) {
            _supply(smallAccounts[i], COLLATERAL_A, SMALL_COLLATERAL);
            _enter(smallAccounts[i], COLLATERAL_A);
            // Borrowed to within 0.01% of what the collateral factor allows, at $1 a unit, so a short
            // `passTime` is enough to put the account in shortfall. Without that these accounts sit healthy for
            // the whole run and the batch-liquidation paths are never reachable.
            vm.prank(smallAccounts[i]);
            markets[LIQUIDITY].borrow((((SMALL_COLLATERAL * COLLATERAL_FACTOR) / 1e18) * 9_999) / 10_000);
        }

        // A borrow is capped by the collateral factor (0.7) while shortfall is measured at the liquidation
        // threshold (0.8), so no account can borrow itself into shortfall. This one price step does it, and
        // leaves the larger positions above healthy. Without it `_smallUnderwaterAccount` has nothing to
        // return and the batch-liquidation paths stay unreachable.
        _setPrice(COLLATERAL_A, SMALL_POSITION_START_PRICE);

        handler = new SpokeHandler(
            comptroller,
            [markets[0], markets[1], markets[2]],
            oracle,
            distributor,
            lens,
            accounts,
            smallAccounts
        );
        targetContract(address(handler));

        bytes4[] memory actions = new bytes4[](20);
        actions[0] = SpokeHandler.supply.selector;
        actions[1] = SpokeHandler.enterMarket.selector;
        actions[2] = SpokeHandler.exitMarket.selector;
        actions[3] = SpokeHandler.redeem.selector;
        actions[4] = SpokeHandler.transfer.selector;
        actions[5] = SpokeHandler.borrow.selector;
        actions[6] = SpokeHandler.repay.selector;
        actions[7] = SpokeHandler.openSmallPosition.selector;
        actions[8] = SpokeHandler.claimRewards.selector;
        actions[9] = SpokeHandler.liquidateBorrow.selector;
        actions[10] = SpokeHandler.liquidateAccount.selector;
        actions[11] = SpokeHandler.healAccount.selector;
        actions[12] = SpokeHandler.probeBatchRouting.selector;
        actions[13] = SpokeHandler.movePrice.selector;
        actions[14] = SpokeHandler.passTime.selector;
        actions[15] = SpokeHandler.setLiquidationAllowlist.selector;
        actions[16] = SpokeHandler.setAllowedLiquidator.selector;
        actions[17] = SpokeHandler.setSupplyAllowlist.selector;
        actions[18] = SpokeHandler.setAllowedSupplier.selector;
        actions[19] = SpokeHandler.setMarketLiquidationIncentive.selector;
        // Without this the fuzzer also spends calls on the handler's getters.
        targetSelector(FuzzSelector({ addr: address(handler), selectors: actions }));
    }

    function _deployRewards() internal {
        rewardToken = new MockToken("XVS", "XVS", 18);
        distributor = RewardsDistributor(
            address(
                new TransparentUpgradeableProxy(
                    address(new RewardsDistributor(true, 0)),
                    proxyAdmin,
                    abi.encodeCall(
                        RewardsDistributor.initialize,
                        (Comptroller(address(comptroller)), IERC20Upgradeable(address(rewardToken)), MAX_LOOPS, acm)
                    )
                )
            )
        );
        vm.prank(address(distributor));
        rewardToken.faucet(1e30);
        comptroller.addRewardsDistributor(distributor);

        VToken[] memory all = new VToken[](3);
        uint256[] memory supplySpeeds = new uint256[](3);
        uint256[] memory borrowSpeeds = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            all[i] = markets[i];
            supplySpeeds[i] = SUPPLY_SPEED;
        }
        borrowSpeeds[LIQUIDITY] = BORROW_SPEED;
        distributor.setRewardTokenSpeeds(all, supplySpeeds, borrowSpeeds);
        rewardsStart = block.timestamp;
    }

    function _deployLens() internal {
        lens = new SpokePoolLens(true, 0);
        // `getSpokePoolData` reads metadata from the registry, which has no code in this harness.
        vm.etch(poolRegistry, hex"00");
        vm.mockCall(
            poolRegistry,
            abi.encodeCall(PoolRegistryInterface.getVenusPoolMetadata, (address(comptroller))),
            abi.encode(PoolRegistryInterface.VenusPoolMetaData("", "", ""))
        );
    }

    // ----- rules recorded by the handler -----

    /// @notice No mint credits an account that is off the market's supply allowlist while it is enabled
    function invariant_supplyAllowlistIsNeverBypassed() public view {
        assertEq(handler.violations(handler.SUPPLY_ALLOWLIST()), "");
    }

    /// @notice No liquidation of any kind succeeds for a liquidator off the allowlist while it is enabled
    function invariant_liquidationAllowlistIsNeverBypassed() public view {
        assertEq(handler.violations(handler.LIQUIDATION_ALLOWLIST()), "");
    }

    /// @notice `liquidateAccount` and `healAccount` never both accept an account, nor each defer it to the other
    function invariant_batchLiquidationPathsNeverOverlap() public view {
        assertEq(handler.violations(handler.BATCH_ROUTING()), "");
    }

    /// @notice A liquidator never receives less collateral value than the debt it repaid, beyond rounding
    function invariant_liquidatorIsNeverUnderpaid() public view {
        assertEq(handler.violations(handler.LIQUIDATOR_PAYOUT()), "");
    }

    /// @notice No borrow, redeem, transfer or market exit that succeeds leaves the account in shortfall
    function invariant_noSuccessfulActionLeavesShortfall() public view {
        assertEq(handler.violations(handler.NO_SHORTFALL()), "");
    }

    /// @notice `SpokePoolLens.getPendingRewards` reports exactly what a claim pays
    function invariant_lensPendingRewardsMatchClaims() public view {
        assertEq(handler.violations(handler.LENS_REWARDS()), "");
    }

    // ----- rules checked against state -----

    /// @notice Borrowing power under bounded prices is never above the same position at spot
    function invariant_boundedBorrowingPowerNeverAboveSpot() public view {
        for (uint256 i; i < accounts.length; ++i) {
            assertLe(
                _borrowingNet(accounts[i]),
                _spotBorrowingNet(accounts[i]),
                "bounded pricing raised borrowing power"
            );
        }
    }

    /// @notice Each market's vToken supply equals the sum of its holders' balances
    function invariant_vTokenSupplyEqualsHolderBalances() public view {
        for (uint256 m; m < MARKET_COUNT; ++m) {
            uint256 held;
            for (uint256 i; i < accounts.length; ++i) held += markets[m].balanceOf(accounts[i]);
            assertEq(held, markets[m].totalSupply(), "vToken supply does not match holder balances");
        }
    }

    /// @notice The cash a market counts is always held by the market
    function invariant_marketCashIsBacked() public view {
        for (uint256 m; m < MARKET_COUNT; ++m) {
            MockToken underlying = MockToken(markets[m].underlying());
            assertGe(underlying.balanceOf(address(markets[m])), markets[m].getCash(), "market counts cash it lacks");
        }
    }

    /// @notice Rewards paid or accrued never exceed what the speeds have emitted since they were set
    function invariant_rewardsNeverExceedEmission() public view {
        uint256 emitted = (block.timestamp - rewardsStart) * (SUPPLY_SPEED * MARKET_COUNT + BORROW_SPEED);
        uint256 distributed;
        for (uint256 i; i < accounts.length; ++i) {
            distributed += rewardToken.balanceOf(accounts[i]) + distributor.rewardTokenAccrued(accounts[i]);
        }
        assertLe(distributed, emitted, "rewards distributed beyond emission");
    }

    /// @notice Every field `SpokePoolLens` reports for the pool and its markets equals the direct read
    function invariant_lensMatchesPool() public view {
        VToken[] memory all = comptroller.getAllMarkets();
        SpokePoolLens.SpokePoolData memory pool = lens.getSpokePoolData(
            poolRegistry,
            PoolRegistryInterface.VenusPool("Spoke", address(this), address(comptroller), 0, 0)
        );
        assertEq(pool.priceOracle, address(comptroller.oracle()));
        assertEq(pool.closeFactor, comptroller.closeFactorMantissa());
        assertEq(pool.poolLiquidationIncentiveMantissa, comptroller.liquidationIncentiveMantissa());
        assertEq(pool.minLiquidatableCollateral, comptroller.minLiquidatableCollateral());
        assertEq(pool.deviationBoundedOracle, address(comptroller.deviationBoundedOracle()));
        assertEq(pool.liquidationAllowlistEnabled, comptroller.isLiquidationAllowlistEnabled());
        assertEq(pool.vTokens.length, all.length);

        for (uint256 i; i < all.length; ++i) {
            SpokePoolLens.SpokeVTokenMetadata memory meta = pool.vTokens[i];
            VToken market = all[i];
            (bool isListed, uint256 collateralFactor, uint256 liquidationThreshold) = comptroller.markets(
                address(market)
            );
            assertEq(meta.vToken, address(market));
            assertEq(meta.isListed, isListed);
            assertEq(meta.collateralFactorMantissa, collateralFactor);
            assertEq(meta.liquidationThresholdMantissa, liquidationThreshold);
            assertEq(meta.supplyCaps, comptroller.supplyCaps(address(market)));
            assertEq(meta.borrowCaps, comptroller.borrowCaps(address(market)));
            assertEq(meta.totalBorrows, market.totalBorrows());
            assertEq(meta.totalReserves, market.totalReserves());
            assertEq(meta.totalSupply, market.totalSupply());
            assertEq(meta.totalCash, market.getCash());
            assertEq(meta.exchangeRateCurrent, market.exchangeRateStored());
            assertEq(meta.underlyingAssetAddress, market.underlying());
            assertEq(
                meta.effectiveLiquidationIncentiveMantissa,
                comptroller.effectiveLiquidationIncentive(address(market))
            );
            assertEq(meta.ownLiquidationIncentiveMantissa, comptroller.liquidationIncentives(address(market)));
            assertEq(meta.supplyAllowlistEnabled, comptroller.isSupplyAllowlistEnabled(address(market)));
            assertEq(meta.forcedLiquidationEnabled, comptroller.isForcedLiquidationEnabled(address(market)));
        }
    }

    /// @notice Each liquidation path is reachable from the seeded state, through the same handler the fuzzer uses
    /// @dev Four of the invariants below only assert inside a liquidation: `_checkLiquidatorAllowed` and
    /// `_checkLiquidatorPaid` run nowhere else. A run that reaches no liquidation passes them without testing
    /// anything, which is what this test rules out. `afterInvariant` prints the per-run counts.
    function test_liquidationPathsAreReachable() public {
        uint256 daveSeed = 6; // accounts[6]

        handler.liquidateAccount(4, daveSeed, 0);
        assertGt(handler.liquidateAccounts(), 0, "liquidateAccount unreachable");

        // Erin's collateral still covers her debt, so `healAccount` would revert `CollateralCoversDebt`.
        // This step is what leaves a position the batch path can only heal.
        _setPrice(COLLATERAL_A, 0.1e18);

        handler.healAccount(4, daveSeed + 1);
        assertGt(handler.heals(), 0, "healAccount unreachable");

        // Alice holds both collateral markets and is far above `minLiquidatableCollateral`, so she routes to
        // the single-market path. Both prices have to fall for her to be in shortfall at all.
        _setPrice(COLLATERAL_B, 0.1e18);
        handler.liquidateBorrow(4, 1, 0, 5_000);
        assertGt(handler.liquidations(), 0, "liquidateBorrow unreachable");
    }

    /// @notice Logs how often each path was reached. Shown with `-vv`
    function afterInvariant() public view {
        console.log("mints", handler.mints(), "borrows", handler.borrows());
        console.log("redeems", handler.redeems(), "liquidateBorrow", handler.liquidations());
        console.log("liquidateAccount", handler.liquidateAccounts(), "healAccount", handler.heals());
        console.log("probe: liquidateAccount accepted", handler.probesLiquidateAccountAccepted());
        console.log("probe: healAccount accepted", handler.probesHealAccepted());
        console.log("probe: both rejected", handler.probesBothRejected(), "claims", handler.claims());
    }
}

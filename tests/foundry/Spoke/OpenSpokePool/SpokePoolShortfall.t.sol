// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { SpokeBondManager } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/SpokeBondManager.sol";
import { BondAccount } from "../../../../contracts/Spoke/OpenSpokePool/BondVault/Accounts/BondAccount.sol";
import { SpokePoolShortfall } from "../../../../contracts/Spoke/OpenSpokePool/SpokePoolShortfall.sol";
import { VToken } from "../../../../contracts/VToken.sol";
import { IBondAccount } from "../../../../contracts/Spoke/interfaces/IBondAccount.sol";
import { ISpokeBondManager } from "../../../../contracts/Spoke/interfaces/ISpokeBondManager.sol";
import { ISpokePoolManager } from "../../../../contracts/Spoke/interfaces/ISpokePoolManager.sol";
import { ISpokePoolShortfall } from "../../../../contracts/Spoke/interfaces/ISpokePoolShortfall.sol";
import { MockToken } from "../../../../contracts/test/Mocks/MockToken.sol";
import { OpenSpokeFuzzBase } from "./OpenSpokeFuzzBase.t.sol";

/// @notice Comptroller stand-in: every market asked about is listed
contract ComptrollerStub {
    function isMarketListed(address) external pure returns (bool) {
        return true;
    }
}

/// @notice VToken stand-in holding only what the shortfall reads and writes
contract VTokenStub {
    address public comptroller;
    address public underlying;
    uint256 public badDebt;

    constructor(address comptroller_, address underlying_, uint256 badDebt_) {
        comptroller = comptroller_;
        underlying = underlying_;
        badDebt = badDebt_;
    }

    function badDebtRecovered(uint256 amount) external {
        badDebt -= amount;
    }
}

/// @notice SpokePoolManager stand-in for both the shortfall and the bond manager
contract SpokePoolManagerStub {
    ISpokeBondManager public bondManager;
    address public RESILIENT_ORACLE;

    constructor(address oracle) {
        RESILIENT_ORACLE = oracle;
    }

    function setBondManager(ISpokeBondManager bondManager_) external {
        bondManager = bondManager_;
    }

    function seizeBond(address comptroller, uint256 amount, address receiver) external {
        bondManager.seize(comptroller, amount, receiver);
    }

    function createBond(address comptroller, MockToken asset, uint256 amount) external returns (address) {
        asset.faucet(amount);
        asset.approve(address(bondManager), amount);
        return bondManager.createBond(comptroller, address(this), address(asset), amount);
    }
}

/**
 * @title SpokePoolShortfallFuzzTest
 * @notice Stateless fuzz of `recoverBadDebt` on the real shortfall and bond manager, with an idle bond account: what
 * the recoverer repays and what the bond pays them, across asset decimals and prices
 */
contract SpokePoolShortfallFuzzTest is OpenSpokeFuzzBase {
    struct Market {
        uint8 debtDecimals;
        uint8 bondDecimals;
        uint256 debtPrice;
        uint256 bondPrice;
        uint256 badDebt;
    }

    address internal recoverer = makeAddr("recoverer");

    SpokePoolManagerStub internal manager;
    SpokeBondManager internal bondManager;
    SpokePoolShortfall internal shortfall;
    ComptrollerStub internal comptroller;

    MockToken internal debtToken;
    MockToken internal bondToken;
    VTokenStub internal vToken;
    address internal bondAccount;

    function setUp() public override {
        super.setUp();
        manager = new SpokePoolManagerStub(address(oracle));
        bondManager = SpokeBondManager(
            _proxy(address(new SpokeBondManager(address(manager))), abi.encodeCall(SpokeBondManager.initialize, (acm)))
        );
        manager.setBondManager(bondManager);
        bondManager.setAccountImplementation(
            ISpokeBondManager.SourceType.Idle,
            address(new BondAccount(address(bondManager)))
        );
        shortfall = SpokePoolShortfall(
            _proxy(
                address(new SpokePoolShortfall(ISpokePoolManager(address(manager)))),
                abi.encodeCall(SpokePoolShortfall.initialize, (acm))
            )
        );
        comptroller = new ComptrollerStub();
    }

    // ----- helpers -----

    /// @dev Bounds `market` to 6-18 decimal assets worth $0.000001-$1,000,000 per whole token, with bad debt of up to
    /// a billion whole tokens and at least `minBadDebt` units, and lists the debt market and bond asset
    function _list(Market memory market, uint256 minBadDebt) internal {
        market.debtDecimals = uint8(bound(market.debtDecimals, 6, 18));
        market.bondDecimals = uint8(bound(market.bondDecimals, 6, 18));
        market.debtPrice = _price(bound(market.debtPrice, 1e12, 1e24), market.debtDecimals);
        market.bondPrice = _price(bound(market.bondPrice, 1e12, 1e24), market.bondDecimals);
        market.badDebt = bound(market.badDebt, minBadDebt, 1e9 * 10 ** market.debtDecimals);

        debtToken = new MockToken("Debt", "DEBT", market.debtDecimals);
        bondToken = new MockToken("Bond", "BOND", market.bondDecimals);
        vToken = new VTokenStub(address(comptroller), address(debtToken), market.badDebt);
        oracle.setUnderlyingPrice(address(vToken), market.debtPrice);
        oracle.setPrice(address(bondToken), market.bondPrice);
        bondManager.setAssetConfig(
            address(bondToken),
            ISpokeBondManager.AssetConfig({ sourceType: ISpokeBondManager.SourceType.Idle, source: address(0) })
        );
    }

    function _createBond(uint256 amount) internal {
        bondAccount = manager.createBond(address(comptroller), bondToken, amount);
    }

    function _fundRecoverer(uint256 amount) internal {
        vm.startPrank(recoverer);
        debtToken.faucet(amount);
        IERC20(address(debtToken)).approve(address(shortfall), amount);
        vm.stopPrank();
    }

    // ----- recoverBadDebt -----

    /// @notice Repays `min(amount, badDebt)` and pays the recoverer its value in bond tokens, rounded down by less than
    /// one bond token unit
    function testFuzz_paysTheRepaidValueFromTheBond(Market memory market, uint256 amount, uint256 spareBond) public {
        _list(market, 0);
        amount = bound(amount, 0, market.badDebt * 2);
        uint256 repaid = amount < market.badDebt ? amount : market.badDebt;
        uint256 seized = (repaid * market.debtPrice) / market.bondPrice;
        _createBond(seized + bound(spareBond, 0, 1e30));
        uint256 bondBefore = bondToken.balanceOf(bondAccount);

        _fundRecoverer(amount);
        vm.prank(recoverer);
        uint256 seizedAmount = shortfall.recoverBadDebt(VToken(address(vToken)), amount);

        assertEq(seizedAmount, seized);
        assertEq(debtToken.balanceOf(address(vToken)), repaid);
        assertEq(debtToken.balanceOf(recoverer), amount - repaid);
        assertEq(vToken.badDebt(), market.badDebt - repaid);
        assertEq(bondToken.balanceOf(recoverer), seized);
        assertEq(bondToken.balanceOf(bondAccount), bondBefore - seized);
        assertLe(seized * market.bondPrice, repaid * market.debtPrice);
        assertLt(repaid * market.debtPrice, (seized + 1) * market.bondPrice);
    }

    /// @notice A recovery worth more than the bond reverts whole: nothing is repaid and nothing is seized
    function testFuzz_revertsWhenTheBondIsShort(Market memory market, uint256 amount, uint256 bond) public {
        _list(market, 1);
        amount = bound(amount, 1, market.badDebt);
        uint256 seized = (amount * market.debtPrice) / market.bondPrice;
        vm.assume(seized != 0);
        bond = bound(bond, 0, seized - 1);
        _createBond(bond);

        _fundRecoverer(amount);
        vm.expectRevert(abi.encodeWithSelector(IBondAccount.InsufficientFunds.selector, seized, bond));
        vm.prank(recoverer);
        shortfall.recoverBadDebt(VToken(address(vToken)), amount);

        assertEq(debtToken.balanceOf(recoverer), amount);
        assertEq(debtToken.balanceOf(address(vToken)), 0);
        assertEq(vToken.badDebt(), market.badDebt);
        assertEq(bondToken.balanceOf(bondAccount), bond);
        assertEq(bondToken.balanceOf(recoverer), 0);
    }

    /// @notice A repayment worth less than one bond token unit still repays, and seizes nothing
    function testFuzz_repaysWithoutSeizingDust(Market memory market, uint256 amount, uint256 bond) public {
        _list(market, 1);
        // The largest repayment whose value rounds down to no bond token
        uint256 maxDust = (market.bondPrice - 1) / market.debtPrice;
        vm.assume(maxDust != 0);
        amount = bound(amount, 1, maxDust < market.badDebt ? maxDust : market.badDebt);
        bond = bound(bond, 0, 1e30);
        _createBond(bond);

        _fundRecoverer(amount);
        vm.expectEmit(address(shortfall));
        emit ISpokePoolShortfall.BadDebtRecovered(address(comptroller), address(vToken), recoverer, amount, 0);
        vm.prank(recoverer);
        assertEq(shortfall.recoverBadDebt(VToken(address(vToken)), amount), 0);

        assertEq(vToken.badDebt(), market.badDebt - amount);
        assertEq(debtToken.balanceOf(address(vToken)), amount);
        assertEq(bondToken.balanceOf(bondAccount), bond);
        assertEq(bondToken.balanceOf(recoverer), 0);
    }
}

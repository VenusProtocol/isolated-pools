// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AccessControlManager } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlManager.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { Test } from "forge-std/Test.sol";

import { Comptroller } from "../../contracts/Comptroller.sol";
import { ComptrollerInterface } from "../../contracts/ComptrollerInterface.sol";
import { InterestRateModel } from "../../contracts/InterestRateModel.sol";
import { TwoKinksInterestRateModel } from "../../contracts/TwoKinksInterestRateModel.sol";
import { VToken } from "../../contracts/VToken.sol";
import { VTokenInterface } from "../../contracts/VTokenInterfaces.sol";
import { MockPriceOracle } from "../../contracts/test/Mocks/MockPriceOracle.sol";
import { MockToken } from "../../contracts/test/Mocks/MockToken.sol";

/// @notice One real VToken listed on a real Comptroller, both behind proxies as deployed. Only the
///  oracle is a double.
abstract contract VTokenBase is Test {
    Comptroller internal comptroller;
    VToken internal vToken;
    MockToken internal underlying;
    MockPriceOracle internal oracle;

    /// @dev Comptroller.supportMarket may only be called by the pool registry.
    address internal poolRegistry = makeAddr("poolRegistry");

    /// @dev BSC block cadence, and the max borrow rate the Hardhat fixture uses.
    uint256 internal constant BLOCKS_PER_YEAR = 70_080_000;
    uint256 internal constant MAX_BORROW_RATE = 0.0005e16;

    /// @dev With an 18-decimal underlying and an 8-decimal vToken, one whole vToken is one whole token.
    uint256 internal constant INITIAL_EXCHANGE_RATE = 1e28;

    function _deployMarket() internal {
        AccessControlManager acm = new AccessControlManager();
        acm.giveCallPermission(address(0), "setMarketSupplyCaps(address[],uint256[])", address(this));
        acm.giveCallPermission(address(0), "setMarketBorrowCaps(address[],uint256[])", address(this));
        acm.giveCallPermission(address(0), "setCollateralFactor(address,uint256,uint256)", address(this));
        acm.giveCallPermission(address(0), "setReduceReservesBlockDelta(uint256)", address(this));

        comptroller = Comptroller(
            address(
                new ERC1967Proxy(
                    address(new Comptroller(poolRegistry)),
                    abi.encodeCall(Comptroller.initialize, (100, address(acm)))
                )
            )
        );
        oracle = new MockPriceOracle();
        comptroller.setPriceOracle(ResilientOracleInterface(address(oracle)));

        underlying = new MockToken("Mock Token", "MOCK", 18);
        oracle.setPrice(address(underlying), 1e18);

        // The kinks the core pool markets are configured with.
        TwoKinksInterestRateModel rateModel = new TwoKinksInterestRateModel({
            baseRatePerYear_: 0,
            multiplierPerYear_: 0.15e18,
            kink1_: 0.8e18,
            multiplier2PerYear_: 0.9e18,
            baseRate2PerYear_: 0,
            kink2_: 0.9e18,
            jumpMultiplierPerYear_: 3e18,
            timeBased_: false,
            blocksPerYear_: BLOCKS_PER_YEAR
        });

        bytes memory initialize = abi.encodeCall(
            VToken.initialize,
            (
                address(underlying),
                ComptrollerInterface(address(comptroller)),
                InterestRateModel(address(rateModel)),
                INITIAL_EXCHANGE_RATE,
                "Venus Mock",
                "vMOCK",
                8,
                address(this),
                address(acm),
                VTokenInterface.RiskManagementInit({
                    shortfall: makeAddr("shortfall"),
                    protocolShareReserve: payable(makeAddr("protocolShareReserve"))
                }),
                0.1e18
            )
        );
        vToken = VToken(
            address(new ERC1967Proxy(address(new VToken(false, BLOCKS_PER_YEAR, MAX_BORROW_RATE)), initialize))
        );

        // Keeps reserves in the market. By default every accrual sweeps them to the protocol share
        // reserve, which is out of scope here.
        vToken.setReduceReservesBlockDelta(type(uint256).max);

        vm.prank(poolRegistry);
        comptroller.supportMarket(vToken);

        VToken[] memory markets = new VToken[](1);
        markets[0] = vToken;
        uint256[] memory caps = new uint256[](1);
        caps[0] = type(uint256).max;
        comptroller.setMarketSupplyCaps(markets, caps);
        comptroller.setMarketBorrowCaps(markets, caps);
        comptroller.setCollateralFactor(vToken, 0.8e18, 0.9e18);
    }

    /// @dev Funds `who`, enters the market on their behalf and mints `amount` of underlying.
    function _mintAs(address who, uint256 amount) internal {
        deal(address(underlying), who, amount);

        address[] memory markets = new address[](1);
        markets[0] = address(vToken);

        vm.startPrank(who);
        comptroller.enterMarkets(markets);
        underlying.approve(address(vToken), amount);
        vToken.mint(amount);
        vm.stopPrank();
    }
}

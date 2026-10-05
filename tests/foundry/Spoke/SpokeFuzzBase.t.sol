// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { SpokeComptroller } from "../../../contracts/Spoke/SpokeComptroller.sol";
import { ComptrollerInterface } from "../../../contracts/ComptrollerInterface.sol";
import { VToken } from "../../../contracts/VToken.sol";
import { VTokenInterface } from "../../../contracts/VTokenInterfaces.sol";
import { InterestRateModel } from "../../../contracts/InterestRateModel.sol";
import { WhitePaperInterestRateModel } from "../../../contracts/WhitePaperInterestRateModel.sol";
import { MockToken } from "../../../contracts/test/Mocks/MockToken.sol";
import { MockPriceOracle } from "../../../contracts/test/Mocks/MockPriceOracle.sol";

/**
 * @notice Value a liquidator can lose to rounding, in the same 1e36 scale as `underlying amount * price`
 * @dev `liquidateCalculateSeizeTokens` truncates the incentive-weighted price ratio short by at most two units, and
 * each unit costs `repayAmount / 1e18` seized vTokens, plus one when the product is truncated. Converting the received
 * vTokens back to underlying truncates once more. The protocol's cut rounds down, which only helps the liquidator.
 */
function liquidationRoundingAllowance(
    uint256 repayAmount,
    uint256 exchangeRate,
    uint256 collateralPrice
) pure returns (uint256) {
    uint256 lostVTokens = (2 * repayAmount) / 1e18 + 1;
    return ((lostVTokens * exchangeRate) / 1e18 + 1) * collateralPrice;
}

/// @notice Access control stand-in that allows every call, as the Hardhat spoke fixture does
contract AllowAllAccessControl {
    function isAllowedToCall(address, string calldata) external pure returns (bool) {
        return true;
    }
}

/// @notice Protocol share reserve stand-in. `VToken` sends the protocol's cut here and then calls this hook
contract NoopProtocolShareReserve {
    function updateAssetsState(address, address, uint8) external {}
}

/**
 * @title SpokeFuzzBase
 * @notice A spoke pool built from the real `SpokeComptroller`, three real `VToken` markets on a beacon and the
 * published `DeviationBoundedOracle`. Only the spot price feed, access control, the protocol share reserve and the
 * underlying tokens are mocks.
 * @dev Market 0 is the liquidity side: collateral factor 0 and supply allowlisted to `hub`. Markets 1 and 2 are the
 * collateral side: collateral factor 70%, liquidation threshold 80%, open supply. A price carries `36 - decimals`
 * decimals, so for an 18-decimal underlying `1e18` is $1.
 */
abstract contract SpokeFuzzBase is Test {
    uint256 internal constant LIQUIDITY = 0;
    uint256 internal constant COLLATERAL_A = 1;
    uint256 internal constant COLLATERAL_B = 2;
    uint256 internal constant MARKET_COUNT = 3;

    uint256 internal constant MAX_LOOPS = 150;
    /// @notice Per-second cap `helpers/deploymentConfig.ts` uses on time-based networks
    uint256 internal constant MAX_BORROW_RATE = 0.00016667e16;
    /// @notice 1 vToken (8 decimals) is worth 1 underlying token (18 decimals) at listing
    uint256 internal constant INITIAL_EXCHANGE_RATE = 1e28;
    uint256 internal constant COLLATERAL_FACTOR = 0.7e18;
    uint256 internal constant LIQUIDATION_THRESHOLD = 0.8e18;
    uint256 internal constant POOL_LIQUIDATION_INCENTIVE = 1.1e18;
    uint256 internal constant CLOSE_FACTOR = 0.5e18;
    uint256 internal constant MIN_LIQUIDATABLE_COLLATERAL = 100e18;
    uint256 internal constant INITIAL_PRICE = 1e18;

    /// @notice The bounded oracle's native-market address. Must not match any market under test
    address internal constant UNRELATED_NATIVE_MARKET = address(0x1111);

    address internal poolRegistry = makeAddr("poolRegistry");
    address internal proxyAdmin = makeAddr("proxyAdmin");
    address internal shortfall = makeAddr("shortfall");
    address internal hub = makeAddr("hub");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal liquidator = makeAddr("liquidator");

    address internal acm;
    address internal protocolShareReserve;
    SpokeComptroller internal comptroller;
    MockPriceOracle internal oracle;
    IDeviationBoundedOracle internal boundedOracle;
    InterestRateModel internal rateModel;
    UpgradeableBeacon internal vTokenBeacon;
    VToken[MARKET_COUNT] internal markets;

    function setUp() public virtual {
        // Interest and the bounded oracle's cooldown both run on timestamps.
        vm.warp(1_700_000_000);

        acm = address(new AllowAllAccessControl());
        protocolShareReserve = address(new NoopProtocolShareReserve());
        oracle = new MockPriceOracle();
        rateModel = new WhitePaperInterestRateModel(0.02e18, 0.1e18, true, 0);
        vTokenBeacon = new UpgradeableBeacon(address(new VToken(true, 0, MAX_BORROW_RATE)));

        comptroller = SpokeComptroller(
            address(
                new TransparentUpgradeableProxy(
                    address(new SpokeComptroller(poolRegistry)),
                    proxyAdmin,
                    abi.encodeCall(SpokeComptroller.initialize, (MAX_LOOPS, acm))
                )
            )
        );
        comptroller.setPriceOracle(oracle);
        comptroller.setLiquidationIncentive(POOL_LIQUIDATION_INCENTIVE);
        comptroller.setCloseFactor(CLOSE_FACTOR);
        comptroller.setMinLiquidatableCollateral(MIN_LIQUIDATABLE_COLLATERAL);

        markets[LIQUIDITY] = _listMarket("USDT", 18, INITIAL_EXCHANGE_RATE);
        markets[COLLATERAL_A] = _listMarket("RWA", 18, INITIAL_EXCHANGE_RATE);
        markets[COLLATERAL_B] = _listMarket("STK", 18, INITIAL_EXCHANGE_RATE);

        // Seeds each asset's price window from spot, so it has to run after every price is set.
        boundedOracle = _deployBoundedOracle();
        comptroller.setDeviationBoundedOracle(boundedOracle);

        comptroller.setCollateralFactor(markets[COLLATERAL_A], COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);
        comptroller.setCollateralFactor(markets[COLLATERAL_B], COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);

        comptroller.setSupplyAllowlistEnabled(address(markets[LIQUIDITY]), true);
        comptroller.setAllowedSupplier(address(markets[LIQUIDITY]), hub, true);
    }

    function _listMarket(
        string memory symbol,
        uint8 decimals,
        uint256 initialExchangeRate
    ) internal returns (VToken vToken) {
        vToken = _deployMarket(symbol, decimals, initialExchangeRate);

        vm.prank(poolRegistry);
        comptroller.supportMarket(vToken);

        VToken[] memory one = new VToken[](1);
        one[0] = vToken;
        uint256[] memory uncapped = new uint256[](1);
        uncapped[0] = type(uint256).max;
        comptroller.setMarketSupplyCaps(one, uncapped);
        comptroller.setMarketBorrowCaps(one, uncapped);
    }

    /// @notice A market on the pool's beacon with its underlying priced at $1, not yet listed
    function _deployMarket(
        string memory symbol,
        uint8 decimals,
        uint256 initialExchangeRate
    ) internal returns (VToken vToken) {
        MockToken underlying = new MockToken(symbol, symbol, decimals);
        vToken = VToken(
            address(
                new BeaconProxy(
                    address(vTokenBeacon),
                    abi.encodeCall(
                        VToken.initialize,
                        (
                            address(underlying),
                            ComptrollerInterface(address(comptroller)),
                            rateModel,
                            initialExchangeRate,
                            string.concat("Venus ", symbol),
                            string.concat("v", symbol),
                            8,
                            address(this),
                            acm,
                            VTokenInterface.RiskManagementInit(shortfall, payable(protocolShareReserve)),
                            0.1e18
                        )
                    )
                )
            )
        );
        // Prices carry `36 - decimals` decimals, so a whole token is worth `INITIAL_PRICE` whatever its decimals.
        oracle.setPrice(address(underlying), INITIAL_PRICE * 10 ** (18 - decimals));
    }

    function _deployBoundedOracle() internal returns (IDeviationBoundedOracle bounded) {
        // The published artifact, as in the Hardhat fixture, so the tests run the bytecode that ships.
        address implementation = deployCode(
            "node_modules/@venusprotocol/oracle/artifacts/contracts/DeviationBoundedOracle.sol/DeviationBoundedOracle.json",
            abi.encode(address(oracle), UNRELATED_NATIVE_MARKET, address(0))
        );
        // A transparent proxy refuses to forward its own admin's calls, so the admin is not this contract.
        bounded = IDeviationBoundedOracle(
            address(
                new TransparentUpgradeableProxy(
                    implementation,
                    proxyAdmin,
                    abi.encodeWithSignature("initialize(address)", acm)
                )
            )
        );
        for (uint256 i; i < MARKET_COUNT; ++i) {
            bounded.setTokenConfig(_boundedPricingConfig(markets[i].underlying()));
        }
    }

    function _boundedPricingConfig(
        address asset
    ) internal pure returns (IDeviationBoundedOracle.TokenConfigInput memory) {
        return
            IDeviationBoundedOracle.TokenConfigInput({
                asset: asset,
                cooldownPeriod: 3600,
                triggerThreshold: 0.2e18,
                resetThreshold: 0.05e18,
                enableBoundedPricing: true,
                enableCaching: true
            });
    }

    function _supply(address account, uint256 marketIndex, uint256 amount) internal {
        VToken vToken = markets[marketIndex];
        MockToken underlying = MockToken(vToken.underlying());
        vm.startPrank(account);
        underlying.faucet(amount);
        underlying.approve(address(vToken), amount);
        vToken.mint(amount);
        vm.stopPrank();
    }

    function _enter(address account, uint256 marketIndex) internal {
        address[] memory one = new address[](1);
        one[0] = address(markets[marketIndex]);
        vm.prank(account);
        comptroller.enterMarkets(one);
    }

    function _setPrice(uint256 marketIndex, uint256 price) internal {
        oracle.setPrice(markets[marketIndex].underlying(), price);
    }

    /// @notice Sets a price and records it in the bounded oracle's window, as a borrow or redeem on the asset would
    function _movePrice(uint256 marketIndex, uint256 price) internal {
        _setPrice(marketIndex, price);
        boundedOracle.updateProtectionState(address(markets[marketIndex]));
    }

    /**
     * @notice `account`'s collateral-factor liquidity at spot prices: positive is spare capacity, negative is shortfall
     * @dev Repeats `getBorrowingPower`'s arithmetic, truncation included, so the two are equal whenever no price is
     * bounded
     */
    function _spotBorrowingNet(address account) internal view returns (int256) {
        VToken[] memory assets = comptroller.getAssetsIn(account);
        uint256 weightedCollateral;
        uint256 borrows;
        for (uint256 i; i < assets.length; ++i) {
            (, uint256 balance, uint256 borrowBalance, uint256 exchangeRate) = assets[i].getAccountSnapshot(account);
            uint256 price = oracle.getUnderlyingPrice(address(assets[i]));
            (, uint256 collateralFactor, ) = comptroller.markets(address(assets[i]));
            uint256 vTokenPrice = (exchangeRate * price) / 1e18;
            uint256 weightedVTokenPrice = (collateralFactor * vTokenPrice) / 1e18;
            weightedCollateral += (weightedVTokenPrice * balance) / 1e18;
            borrows += (price * borrowBalance) / 1e18;
        }
        return int256(weightedCollateral) - int256(borrows);
    }

    /// @notice The same measure as `_spotBorrowingNet`, read from the comptroller, so priced through the bounded oracle
    function _borrowingNet(address account) internal view returns (int256) {
        (, uint256 liquidity, uint256 shortfallValue) = comptroller.getBorrowingPower(account);
        return int256(liquidity) - int256(shortfallValue);
    }
}

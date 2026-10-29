// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { SpokePoolValidationLib } from "../../../../contracts/Spoke/OpenSpokePool/Libraries/SpokePoolValidationLib.sol";
import { SpokePoolPolicyRegistry } from "../../../../contracts/Spoke/OpenSpokePool/SpokePoolPolicyRegistry.sol";
import { ISpokeBondManager } from "../../../../contracts/Spoke/interfaces/ISpokeBondManager.sol";
import { ISpokePoolManager } from "../../../../contracts/Spoke/interfaces/ISpokePoolManager.sol";
import { ISpokePoolPolicyRegistry } from "../../../../contracts/Spoke/interfaces/ISpokePoolPolicyRegistry.sol";
import { ISpokePoolProposalBuilder } from "../../../../contracts/Spoke/interfaces/ISpokePoolProposalBuilder.sol";
import { IRiskOracle } from "../../../../contracts/Spoke/interfaces/external/IRiskOracle.sol";
import { IRiskStewardReceiver } from "../../../../contracts/Spoke/interfaces/external/IRiskStewardReceiver.sol";
import { MockToken } from "../../../../contracts/test/Mocks/MockToken.sol";
import { OpenSpokeFuzzBase } from "./OpenSpokeFuzzBase.t.sol";

/// @notice Bond account stand-in: the asset and amount the library reads
contract BondAccountStub {
    address public asset;
    uint256 public currentBondAmount;

    constructor(address asset_) {
        asset = asset_;
    }

    function setAmount(uint256 amount) external {
        currentBondAmount = amount;
    }
}

/// @notice Bond manager stand-in: the one comptroller's bond account
contract BondManagerStub {
    mapping(address comptroller => address account) public bondAccounts;

    function setAccount(address comptroller, address account) external {
        bondAccounts[comptroller] = account;
    }
}

/// @notice Chainlink feed stand-in with a settable answer and decimals
contract FeedStub {
    uint8 public decimals;
    int256 private answer;
    uint256 private updatedAt;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setAnswer(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, answer, 0, updatedAt, 0);
    }
}

/**
 * @title SpokePoolValidationLibFuzzTest
 * @notice Stateless fuzz of the validation library's maths: the bond floor, the seeds and the supply cap's USD value
 */
contract SpokePoolValidationLibFuzzTest is OpenSpokeFuzzBase {
    uint256 internal constant TIER = 1;
    uint256 internal constant MIN_SEED_USD = 10e18;

    address internal comptroller = makeAddr("comptroller");
    address internal bondAsset = makeAddr("bondAsset");
    address internal collateralAsset = makeAddr("collateralAsset");
    address internal loanAsset = makeAddr("loanAsset");
    address internal interestRateModel = makeAddr("interestRateModel");

    SpokePoolPolicyRegistry internal registry;
    BondManagerStub internal bondManager;
    BondAccountStub internal bondAccount;
    ISpokePoolManager.Request internal request;

    function setUp() public override {
        super.setUp();
        registry = SpokePoolPolicyRegistry(
            _proxy(address(new SpokePoolPolicyRegistry()), abi.encodeCall(SpokePoolPolicyRegistry.initialize, (acm)))
        );
        bondManager = new BondManagerStub();
        bondAccount = new BondAccountStub(bondAsset);
        bondManager.setAccount(comptroller, address(bondAccount));
    }

    // ----- helpers -----

    // External, so a test can expect the library's reverts
    function validateBond() external view {
        SpokePoolValidationLib.validateBond(_contracts(), comptroller, TIER);
    }

    function computeSeeds() external view returns (address[] memory, uint256[] memory) {
        return SpokePoolValidationLib.computeSeeds(_contracts(), request);
    }

    function checkSupplyCapUsd(ISpokePoolManager.CollateralMarketRequestParams memory market) external view {
        SpokePoolValidationLib.checkSupplyCapUsd(_contracts(), TIER, market);
    }

    /// @notice The library reads the manager's supported oracles from the caller, which is this contract
    function supportedOracles(uint256 index) public pure returns (address) {
        return address(uint160(0x5000 + index));
    }

    function _contracts() internal view returns (ISpokePoolManager.Contracts memory) {
        return
            ISpokePoolManager.Contracts({
                resilientOracle: ResilientOracleInterface(address(oracle)),
                riskOracle: IRiskOracle(address(0)),
                riskStewardReceiver: IRiskStewardReceiver(address(0)),
                policyRegistry: ISpokePoolPolicyRegistry(address(registry)),
                bondManager: ISpokeBondManager(address(bondManager)),
                proposalBuilder: ISpokePoolProposalBuilder(address(0))
            });
    }

    function _setTier(uint256 minTierBondUsd, uint256 maxCollateralSupplyCapUsd, uint256 loanSupplyCapUsd) internal {
        registry.setTier(
            TIER,
            ISpokePoolPolicyRegistry.Tier({
                enabled: true,
                minTierBondUsd: minTierBondUsd,
                limits: ISpokePoolPolicyRegistry.PoolLimits({
                    minCoverageRatio: 1e18,
                    maxCollateralFactor: 0.7e18,
                    maxLiquidationThreshold: 0.8e18,
                    maxCollateralMarkets: 5,
                    maxCollateralSupplyCapUsd: maxCollateralSupplyCapUsd,
                    loanSupplyCapUsd: loanSupplyCapUsd
                })
            })
        );
    }

    function _collateralMarket(
        address asset,
        uint256 supplyCap
    ) internal pure returns (ISpokePoolManager.CollateralMarketRequestParams memory market) {
        market.asset = asset;
        market.collateralFactor = 0.5e18;
        market.liquidationThreshold = 0.6e18;
        market.supplyCap = supplyCap;
    }

    // ----- bond floor -----

    /// @notice The floor an excess withdrawal keeps is the least bond `validateBond` accepts, and clears any coverage ratio
    function testFuzz_requiredBondIsTheLeastAcceptedBond(
        uint256 minTierBondUsd,
        uint256 factor,
        uint256 usdPerToken,
        uint8 decimals,
        uint256 coverageRatio
    ) public {
        minTierBondUsd = bound(minTierBondUsd, 1e18, 1e27);
        factor = bound(factor, 0.01e18, 10e18);
        usdPerToken = bound(usdPerToken, 1e9, 1e27);
        decimals = uint8(bound(decimals, 6, 18));
        coverageRatio = bound(coverageRatio, 1, 1e18);
        _setTier(minTierBondUsd, 0, 1e18);
        registry.setBondAssetFactor(bondAsset, factor);
        uint256 price = _price(usdPerToken, decimals);
        oracle.setPrice(bondAsset, price);

        uint256 floor = SpokePoolValidationLib.requiredBondAmount(_contracts(), TIER, comptroller);
        uint256 requiredUsd = registry.getRequiredBondUsd(TIER, bondAsset);

        bondAccount.setAmount(floor);
        this.validateBond();
        // As SpokePoolGovernanceLib checks a deployer's risk change against the tier's coverage ratio
        uint256 bondUsd = (floor * price) / 1e18;
        assertGe(bondUsd * 1e18, requiredUsd * coverageRatio);

        bondAccount.setAmount(floor - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ISpokePoolManager.InsufficientBondValue.selector,
                ((floor - 1) * price) / 1e18,
                requiredUsd
            )
        );
        this.validateBond();
    }

    // ----- seeds -----

    /// @notice Each seed is the least amount worth $10, and one that does not fit its market's cap is refused
    function testFuzz_seedIsTheLeastAmountWorthTenDollars(
        uint256 collateralPrice,
        uint256 collateralCap,
        uint256 loanPrice,
        uint256 loanCapUsd,
        uint256 loanFactor
    ) public {
        collateralPrice = bound(collateralPrice, 1e6, 1e40);
        collateralCap = bound(collateralCap, 0, type(uint128).max);
        loanPrice = bound(loanPrice, 1e6, 1e40);
        loanCapUsd = bound(loanCapUsd, 1, 1e30);
        loanFactor = bound(loanFactor, 1, 10e18);
        _setTier(1e18, 0, loanCapUsd);
        address[] memory models = new address[](1);
        models[0] = interestRateModel;
        registry.setLoanAssetConfig(loanAsset, ISpokePoolPolicyRegistry.LoanAssetConfig(loanFactor, models));
        oracle.setPrice(collateralAsset, collateralPrice);
        oracle.setPrice(loanAsset, loanPrice);
        request.tierId = TIER;
        // Set in place: the compiler cannot copy a struct with a fixed-size struct array from memory to storage
        ISpokePoolManager.CollateralMarketRequestParams storage collateralMarket = request.collateralMarkets.push();
        collateralMarket.asset = collateralAsset;
        collateralMarket.supplyCap = collateralCap;
        request.loanMarkets.push(ISpokePoolManager.LoanMarketRequestParams(loanAsset, interestRateModel));

        uint256 loanCapUsdForAsset = registry.getLoanSupplyCapUsd(TIER, loanAsset);
        uint256 loanCap = (loanCapUsdForAsset * 1e18) / loanPrice;
        assertLe((loanCap * loanPrice) / 1e18, loanCapUsdForAsset);

        // `value = seed * price / 1e18 >= $10` exactly when `seed * price >= 10e36`
        uint256 collateralSeed = (MIN_SEED_USD * 1e18 + collateralPrice - 1) / collateralPrice;
        uint256 loanSeed = (MIN_SEED_USD * 1e18 + loanPrice - 1) / loanPrice;
        if (collateralSeed > collateralCap) {
            vm.expectRevert(abi.encodeWithSelector(ISpokePoolManager.InvalidMarketParams.selector, collateralAsset));
            this.computeSeeds();
            return;
        }
        if (loanSeed > loanCap) {
            vm.expectRevert(abi.encodeWithSelector(ISpokePoolManager.InvalidMarketParams.selector, loanAsset));
            this.computeSeeds();
            return;
        }

        (address[] memory assets, uint256[] memory seeds) = this.computeSeeds();
        assertEq(assets[0], collateralAsset);
        assertEq(assets[1], loanAsset);
        uint256[2] memory prices = [collateralPrice, loanPrice];
        for (uint256 i; i < 2; ++i) {
            assertGe((seeds[i] * prices[i]) / 1e18, MIN_SEED_USD);
            assertLt(((seeds[i] - 1) * prices[i]) / 1e18, MIN_SEED_USD);
        }
    }

    // ----- supply cap worth -----

    /// @notice A cap priced by the ResilientOracle passes exactly when its whole tokens times the USD price fit the tier
    function testFuzz_supplyCapCheckOnPricedAsset(
        uint256 wholeTokens,
        uint256 usdPerToken,
        uint8 decimals,
        uint256 maxCapUsd
    ) public {
        wholeTokens = bound(wholeTokens, 0, 1e12);
        usdPerToken = bound(usdPerToken, 1, 1e24);
        decimals = uint8(bound(decimals, 6, 18));
        maxCapUsd = bound(maxCapUsd, 0, 1e40);
        _setTier(1e18, maxCapUsd, 1e18);
        address asset = address(new MockToken("COL", "COL", decimals));
        oracle.setPrice(asset, _price(usdPerToken, decimals));

        if (wholeTokens * usdPerToken > maxCapUsd) {
            vm.expectRevert(abi.encodeWithSelector(ISpokePoolManager.ExceedsTierLimit.selector, asset));
        }
        this.checkSupplyCapUsd(_collateralMarket(asset, wholeTokens * 10 ** decimals));
    }

    /// @notice A cap priced by its main feed passes exactly when its USD worth fits the tier, for any asset and feed
    /// decimals
    function testFuzz_supplyCapCheckScalesFeedPrices(
        uint256 wholeTokens,
        uint256 answer,
        uint8 assetDecimals,
        bool eighteenDecimalFeed,
        uint256 maxCapUsd
    ) public {
        wholeTokens = bound(wholeTokens, 0, 1e12);
        answer = bound(answer, 1, 1e24);
        assetDecimals = uint8(bound(assetDecimals, 6, 18));
        maxCapUsd = bound(maxCapUsd, 0, 1e40);
        uint8 feedDecimals = eighteenDecimalFeed ? 18 : 8;
        _setTier(1e18, maxCapUsd, 1e18);
        address asset = address(new MockToken("COL", "COL", assetDecimals));
        FeedStub feed = new FeedStub(feedDecimals);
        feed.setAnswer(int256(answer), block.timestamp);

        ISpokePoolManager.CollateralMarketRequestParams memory market = _collateralMarket(
            asset,
            wholeTokens * 10 ** assetDecimals
        );
        market.feeds[0] = ISpokePoolManager.OracleFeed(supportedOracles(0), address(feed), 1 days);
        // `answer` is the USD price of one whole token with `feedDecimals` decimals
        if (wholeTokens * answer * 10 ** (18 - feedDecimals) > maxCapUsd) {
            vm.expectRevert(abi.encodeWithSelector(ISpokePoolManager.ExceedsTierLimit.selector, asset));
        }
        this.checkSupplyCapUsd(market);
    }
}

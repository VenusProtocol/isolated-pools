// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { Action, ComptrollerInterface } from "../../ComptrollerInterface.sol";
import { InterestRateModel } from "../../InterestRateModel.sol";
import { PoolRegistry } from "../../Pool/PoolRegistry.sol";
import { VToken } from "../../VToken.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";
import { EXP_SCALE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ITierRegistry } from "../interfaces/ITierRegistry.sol";
import { IGovernorBravo, PROPOSAL_TYPE_NORMAL } from "../interfaces/external/IGovernorBravo.sol";
import { IResilientOracle } from "../interfaces/external/IResilientOracle.sol";
import { IYieldGroup } from "../interfaces/external/IYieldGroup.sol";

/**
 * @title SpokePoolProposalBuilder
 * @author Venus
 * @notice Builds `SpokePoolManager`'s VIPs as ABI-encoded GovernorBravo `propose` calls on the Normal route. A
 * request's VIP settles it: for a pool or markets request the builder deploys the contracts before the vote and the
 * VIP lists them; for a tier request the VIP sets the pool's loan market caps to the new tier's. An exit's VIPs wind
 * the pool down. The manager checks a request's markets before it calls the builder
 * @dev The VIPs grant no roles. The onboarding VIP gives wildcard ACM grants once: to the pool registry on
 * `setCloseFactor`, `setLiquidationIncentive`, `setMinLiquidatableCollateral`, `setCollateralFactor`,
 * `setMarketSupplyCaps` and `setMarketBorrowCaps`; to the Normal Timelock on `setSupplyAllowlistEnabled`,
 * `setAllowedSupplier`, `setForcedLiquidation` and the YieldGroups' `addResource`, `raiseResourceCap` and
 * `lowerResourceCap` (it already holds the other comptroller setters and `setReduceReservesBlockDelta`); to the Risk
 * Stewards on `setCollateralFactor` and `setMarketSupplyCaps`; to the supply pause steward on `setCollateralFactor`
 * and `setActionsPaused(address[],uint256[],bool)`. The Normal Timelock also needs `setTokenConfig` on the
 * ChainlinkOracle, the ResilientOracle and the DeviationBoundedOracle, to price a new collateral asset
 */
contract SpokePoolProposalBuilder is ISpokePoolProposalBuilder {
    /// @dev VIP actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        uint256 length;
    }

    /// @dev ERC-20 decimals of a new market's vToken
    uint8 internal constant VTOKEN_DECIMALS = 8;

    /**
     * @dev Actions of a request's VIP besides its markets': a new pool's `acceptOwnership`, `addPool` and
     *   `settleRequest`
     */
    uint256 internal constant POOL_CREATION_ACTIONS = 3;

    /**
     * @dev Most actions a VIP adds per new market: approve, `addMarket`, burn, `setReduceReservesBlockDelta`, and a
     *   loan market's `setSupplyAllowlistEnabled`, `setAllowedSupplier`, `addResource` and `lowerResourceCap`. A
     *   collateral market adds at most three oracle configs instead
     */
    uint256 internal constant MAX_ACTIONS_PER_MARKET = 8;

    /// @dev Actions of an exit VIP besides one per collateral market
    uint256 internal constant EXIT_ACTIONS = 4;

    /// @dev Most actions a tier VIP adds per loan market: its supply, borrow and Hub caps
    uint256 internal constant TIER_ACTIONS_PER_MARKET = 3;

    /// @dev Loop limit every comptroller the builder deploys is initialized with
    uint256 internal constant MAX_LOOPS_LIMIT = 100;

    /// @inheritdoc ISpokePoolProposalBuilder
    ISpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @inheritdoc ISpokePoolProposalBuilder
    IGovernorBravo public immutable GOVERNOR_BRAVO;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable POOL_REGISTRY;

    /// @inheritdoc ISpokePoolProposalBuilder
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable CHAINLINK_ORACLE;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable SPOKE_ADAPTER;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable COMPTROLLER_BEACON;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable VTOKEN_BEACON;

    /// @inheritdoc ISpokePoolProposalBuilder
    address payable public immutable PROTOCOL_SHARE_RESERVE;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable SHORTFALL;

    /// @inheritdoc ISpokePoolProposalBuilder
    uint256 public immutable MAX_POOL_MARKETS;

    /**
     * @param spokePoolManager The manager the builder works for
     * @param governorBravo The governor the VIPs are proposed to
     * @param poolRegistry The registry new pools are listed in
     * @param deviationBoundedOracle The oracle that bounds collateral prices
     * @param chainlinkOracle The oracle a new collateral asset's Chainlink feed is set on, the asset's main oracle
     * @param spokeAdapter The Hub adapter loan markets are registered with
     * @param comptrollerBeacon The beacon the comptroller proxies point at
     * @param vTokenBeacon The beacon the vToken proxies point at
     * @param protocolShareReserve The ProtocolShareReserve every market sends its income to
     * @param shortfall The `shortfall` of every market
     * @param maxPoolMarkets The most markets a pool may have
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     * @custom:error TooManyMarkets is thrown when a new pool's VIP with `maxPoolMarkets` markets would exceed
     *   GovernorBravo's action limit
     */
    constructor(
        ISpokePoolManager spokePoolManager,
        IGovernorBravo governorBravo,
        address poolRegistry,
        IDeviationBoundedOracle deviationBoundedOracle,
        address chainlinkOracle,
        address spokeAdapter,
        address comptrollerBeacon,
        address vTokenBeacon,
        address payable protocolShareReserve,
        address shortfall,
        uint256 maxPoolMarkets
    ) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(address(governorBravo));
        ensureNonzeroAddress(poolRegistry);
        ensureNonzeroAddress(address(deviationBoundedOracle));
        ensureNonzeroAddress(chainlinkOracle);
        ensureNonzeroAddress(spokeAdapter);
        ensureNonzeroAddress(comptrollerBeacon);
        ensureNonzeroAddress(vTokenBeacon);
        ensureNonzeroAddress(protocolShareReserve);
        ensureNonzeroAddress(shortfall);
        uint256 maxMarketCount = (governorBravo.proposalMaxOperations() - POOL_CREATION_ACTIONS) /
            MAX_ACTIONS_PER_MARKET;
        if (maxPoolMarkets > maxMarketCount) {
            revert TooManyMarkets(maxPoolMarkets, maxMarketCount);
        }

        SPOKE_POOL_MANAGER = spokePoolManager;
        GOVERNOR_BRAVO = governorBravo;
        POOL_REGISTRY = poolRegistry;
        DEVIATION_BOUNDED_ORACLE = deviationBoundedOracle;
        CHAINLINK_ORACLE = chainlinkOracle;
        SPOKE_ADAPTER = spokeAdapter;
        COMPTROLLER_BEACON = comptrollerBeacon;
        VTOKEN_BEACON = vTokenBeacon;
        PROTOCOL_SHARE_RESERVE = protocolShareReserve;
        SHORTFALL = shortfall;
        MAX_POOL_MARKETS = maxPoolMarkets;
    }

    // ──────────────────────────────────────────────────────────────────────
    // SpokePoolManager functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolProposalBuilder
    function buildRequestProposal(
        uint256 requestId,
        uint256 buildId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal) {
        if (msg.sender != address(SPOKE_POOL_MANAGER)) {
            revert NotSpokePoolManager(msg.sender);
        }
        ISpokePoolManager.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        comptroller = request.comptroller;
        if (request.requestType == ISpokePoolManager.RequestType.Tier) {
            return (
                comptroller,
                vTokens,
                _encodeProposal(_buildTierProposal(requestId, buildId, comptroller, request.tierId), description)
            );
        }
        address executor = GOVERNOR_BRAVO.proposalTimelocks(PROPOSAL_TYPE_NORMAL);
        // Only a pool request's first build has no comptroller yet
        if (comptroller == address(0)) {
            comptroller = _deployComptroller(executor);
        }
        string memory poolName = request.requestType == ISpokePoolManager.RequestType.Pool
            ? request.poolName
            : PoolRegistry(POOL_REGISTRY).getPoolByComptroller(comptroller).name;
        vTokens = _deployMarkets(comptroller, poolName, request, executor);
        proposal = _encodeProposal(
            _buildMarketsProposal(requestId, buildId, request, comptroller, vTokens, executor),
            description
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolProposalBuilder
    function buildExitProposal(
        address comptroller,
        uint256 buildId,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view returns (bytes memory) {
        VToken[] memory listed = _listedMarkets(comptroller);
        uint256 marketCount = listed.length;
        if (liquidationThresholds.length != marketCount) {
            revert InvalidArrayLength();
        }
        Proposal memory proposal = _newProposal(marketCount + EXIT_ACTIONS);

        // The comptroller's cap setters reject empty market arrays
        if (marketCount != 0) {
            uint256[] memory zeroCaps = new uint256[](marketCount);
            Action[] memory pausedActions = new Action[](3);
            pausedActions[0] = Action.MINT;
            pausedActions[1] = Action.BORROW;
            pausedActions[2] = Action.ENTER_MARKET;
            _addAction(
                proposal,
                comptroller,
                "setActionsPaused(address[],uint8[],bool)",
                abi.encode(listed, pausedActions, true)
            );
            _addAction(proposal, comptroller, "setMarketSupplyCaps(address[],uint256[])", abi.encode(listed, zeroCaps));
            _addAction(proposal, comptroller, "setMarketBorrowCaps(address[],uint256[])", abi.encode(listed, zeroCaps));
        }
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = listed[i];
            if (!SPOKE_POOL_MANAGER.isLoanMarket(address(vToken))) {
                _addAction(
                    proposal,
                    comptroller,
                    "setCollateralFactor(address,uint256,uint256)",
                    abi.encode(vToken, 0, liquidationThresholds[i])
                );
            }
        }
        _addAction(
            proposal,
            address(SPOKE_POOL_MANAGER),
            "startWindDown(address,uint256)",
            abi.encode(comptroller, buildId)
        );
        return _encodeProposal(proposal, description);
    }

    /// @inheritdoc ISpokePoolProposalBuilder
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view returns (bytes memory) {
        VToken[] memory listed = _listedMarkets(comptroller);
        uint256 marketCount = listed.length;
        Proposal memory proposal = _newProposal(marketCount);
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = listed[i];
            if (!SPOKE_POOL_MANAGER.isLoanMarket(address(vToken))) {
                _addAction(
                    proposal,
                    comptroller,
                    "setCollateralFactor(address,uint256,uint256)",
                    abi.encode(vToken, 0, 0)
                );
            } else if (vToken.totalBorrows() != 0) {
                _addAction(proposal, comptroller, "setForcedLiquidation(address,bool)", abi.encode(vToken, true));
            }
        }
        return _encodeProposal(proposal, description);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal functions
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Deploys a new pool's comptroller with both oracles; the Normal Timelock accepts its ownership in the VIP
    function _deployComptroller(address executor) internal returns (address comptroller) {
        comptroller = address(new BeaconProxy(COMPTROLLER_BEACON, ""));
        SpokeComptroller(comptroller).initialize(
            MAX_LOOPS_LIMIT,
            address(AccessControlledV8(address(SPOKE_POOL_MANAGER)).accessControlManager())
        );
        SpokeComptroller(comptroller).setPriceOracle(SPOKE_POOL_MANAGER.RESILIENT_ORACLE());
        SpokeComptroller(comptroller).setDeviationBoundedOracle(DEVIATION_BOUNDED_ORACLE);
        SpokeComptroller(comptroller).transferOwnership(executor);
    }

    /// @dev Deploys a request's markets: the collateral markets with Venus's model, then the loan markets with theirs
    function _deployMarkets(
        address comptroller,
        string memory poolName,
        ISpokePoolManager.Request memory request,
        address executor
    ) internal returns (address[] memory vTokens) {
        uint256 collateralCount = request.collateralMarkets.length;
        uint256 marketCount = collateralCount + request.loanMarkets.length;
        vTokens = new address[](marketCount);
        (address collateralInterestRateModel, , , , , , ) = SPOKE_POOL_MANAGER.marketParams();
        for (uint256 i; i < collateralCount; ++i) {
            vTokens[i] = _deployMarket(
                comptroller,
                poolName,
                request.collateralMarkets[i].asset,
                collateralInterestRateModel,
                executor
            );
        }
        for (uint256 i; i < request.loanMarkets.length; ++i) {
            ISpokePoolManager.LoanMarketParams memory market = request.loanMarkets[i];
            vTokens[collateralCount + i] = _deployMarket(
                comptroller,
                poolName,
                market.asset,
                market.interestRateModel,
                executor
            );
        }
    }

    /**
     * @dev Deploys a market owned by the Normal Timelock, named like Venus's isolated pool markets:
     *   `Venus <symbol> (<pool name>)` and `v<symbol>_<pool name>`
     */
    function _deployMarket(
        address comptroller,
        string memory poolName,
        address asset,
        address interestRateModel,
        address executor
    ) internal returns (address vToken) {
        (, uint256 reserveFactor, , , , , ) = SPOKE_POOL_MANAGER.marketParams();
        string memory assetSymbol = IERC20MetadataUpgradeable(asset).symbol();
        vToken = address(new BeaconProxy(VTOKEN_BEACON, ""));
        VToken(vToken).initialize(
            asset,
            ComptrollerInterface(comptroller),
            InterestRateModel(interestRateModel),
            uint256(10) ** (18 + IERC20MetadataUpgradeable(asset).decimals() - VTOKEN_DECIMALS),
            string.concat("Venus ", assetSymbol, " (", poolName, ")"),
            string.concat("v", assetSymbol, "_", poolName),
            VTOKEN_DECIMALS,
            executor,
            address(AccessControlledV8(address(SPOKE_POOL_MANAGER)).accessControlManager()),
            VTokenInterface.RiskManagementInit({ shortfall: SHORTFALL, protocolShareReserve: PROTOCOL_SHARE_RESERVE }),
            reserveFactor
        );
    }

    /**
     * @dev Returns a pool or markets request's VIP actions: a new pool's listing with Venus's current pool parameters,
     *   `settleRequest`, then the collateral markets' oracle configs and listings and the loan markets' listings and
     *   Hub registrations
     */
    function _buildMarketsProposal(
        uint256 requestId,
        uint256 buildId,
        ISpokePoolManager.Request memory request,
        address comptroller,
        address[] memory vTokens,
        address executor
    ) internal view returns (Proposal memory proposal) {
        proposal = _newProposal(POOL_CREATION_ACTIONS + MAX_ACTIONS_PER_MARKET * vTokens.length);
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            (uint256 closeFactor, uint256 liquidationIncentive, uint256 minLiquidatableCollateral) = SPOKE_POOL_MANAGER
                .poolParams();
            _addAction(proposal, comptroller, "acceptOwnership()", "");
            _addAction(
                proposal,
                POOL_REGISTRY,
                "addPool(string,address,uint256,uint256,uint256)",
                abi.encode(request.poolName, comptroller, closeFactor, liquidationIncentive, minLiquidatableCollateral)
            );
        }
        // Settled before the listings: it sends the seeds to the Normal Timelock, which lists the markets with them
        _addAction(
            proposal,
            address(SPOKE_POOL_MANAGER),
            "settleRequest(uint256,uint256)",
            abi.encode(requestId, buildId)
        );
        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketParams memory market = request.collateralMarkets[i];
            _addOracleConfigs(proposal, market);
            _addMarketListing(
                proposal,
                market.asset,
                PoolRegistry.AddMarketInput({
                    vToken: VToken(vTokens[i]),
                    collateralFactor: market.collateralFactor,
                    liquidationThreshold: market.liquidationThreshold,
                    initialSupply: request.seeds[i],
                    vTokenReceiver: executor,
                    supplyCap: market.supplyCap,
                    borrowCap: 0
                })
            );
        }
        ITierRegistry tierRegistry = SPOKE_POOL_MANAGER.TIER_REGISTRY();
        for (uint256 i; i < request.loanMarkets.length; ++i) {
            address asset = request.loanMarkets[i].asset;
            address vToken = vTokens[collateralCount + i];
            uint256 supplyCap = tierRegistry.getLoanSupplyCap(request.tierId, asset);
            _addMarketListing(
                proposal,
                asset,
                PoolRegistry.AddMarketInput({
                    vToken: VToken(vToken),
                    collateralFactor: 0,
                    liquidationThreshold: 0,
                    initialSupply: request.seeds[collateralCount + i],
                    vTokenReceiver: executor,
                    supplyCap: supplyCap,
                    borrowCap: supplyCap
                })
            );
            _addHubRegistration(proposal, comptroller, asset, vToken, supplyCap);
        }
    }

    /**
     * @dev Adds a collateral asset's oracle configs with Venus's parameters, skipping each oracle that has the asset
     *   already: its Chainlink feed as the ResilientOracle's only oracle, then its DeviationBoundedOracle config
     */
    function _addOracleConfigs(
        Proposal memory proposal,
        ISpokePoolManager.CollateralMarketParams memory market
    ) internal view {
        address asset = market.asset;
        (
            ,
            ,
            ,
            uint256 maxStalePeriod,
            uint64 cooldownPeriod,
            uint256 triggerThreshold,
            uint256 resetThreshold
        ) = SPOKE_POOL_MANAGER.marketParams();
        address resilientOracle = address(SPOKE_POOL_MANAGER.RESILIENT_ORACLE());
        if (IResilientOracle(resilientOracle).getTokenConfig(asset).asset == address(0)) {
            _addAction(
                proposal,
                CHAINLINK_ORACLE,
                "setTokenConfig((address,address,uint256))",
                abi.encode(asset, market.feed, maxStalePeriod)
            );
            _addAction(
                proposal,
                resilientOracle,
                "setTokenConfig((address,address[3],bool[3],bool))",
                abi.encode(
                    IResilientOracle.TokenConfig({
                        asset: asset,
                        oracles: [CHAINLINK_ORACLE, address(0), address(0)],
                        enableFlagsForOracles: [true, false, false],
                        cachingEnabled: false
                    })
                )
            );
        }
        (, , , , , , address initializedAsset, , , ) = DEVIATION_BOUNDED_ORACLE.assetProtectionConfig(asset);
        if (initializedAsset == address(0)) {
            _addAction(
                proposal,
                address(DEVIATION_BOUNDED_ORACLE),
                "setTokenConfig((address,uint64,uint256,uint256,bool,bool))",
                abi.encode(
                    IDeviationBoundedOracle.TokenConfigInput({
                        asset: asset,
                        cooldownPeriod: cooldownPeriod,
                        triggerThreshold: triggerThreshold,
                        resetThreshold: resetThreshold,
                        enableBoundedPricing: true,
                        enableCaching: false
                    })
                )
            );
        }
    }

    /// @dev Adds a market's listing: approve and add it with its seed, burn the seed's vTokens, set its reserve delta
    function _addMarketListing(
        Proposal memory proposal,
        address asset,
        PoolRegistry.AddMarketInput memory input
    ) internal view {
        _addAction(proposal, asset, "approve(address,uint256)", abi.encode(POOL_REGISTRY, input.initialSupply));
        _addAction(
            proposal,
            POOL_REGISTRY,
            "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
            abi.encode(input)
        );
        // A new market mints at its initial exchange rate, so this is every vToken `addMarket` mints
        address vToken = address(input.vToken);
        uint256 seedVTokens = (input.initialSupply * EXP_SCALE) / VToken(vToken).exchangeRateStored();
        _addAction(proposal, vToken, "transfer(address,uint256)", abi.encode(address(0), seedVTokens));
        (, , uint256 reduceReservesBlockDelta, , , , ) = SPOKE_POOL_MANAGER.marketParams();
        _addAction(proposal, vToken, "setReduceReservesBlockDelta(uint256)", abi.encode(reduceReservesBlockDelta));
    }

    /// @dev Adds a loan market's Hub registration: only its Hub YieldGroup supplies it, capped at its supply cap
    function _addHubRegistration(
        Proposal memory proposal,
        address comptroller,
        address asset,
        address vToken,
        uint256 supplyCap
    ) internal view {
        address yieldGroup = SPOKE_POOL_MANAGER.hubYieldGroups(asset);
        _addAction(proposal, comptroller, "setSupplyAllowlistEnabled(address,bool)", abi.encode(vToken, true));
        _addAction(
            proposal,
            comptroller,
            "setAllowedSupplier(address,address,bool)",
            abi.encode(vToken, yieldGroup, true)
        );
        _addAction(proposal, yieldGroup, "addResource(address,address)", abi.encode(vToken, SPOKE_ADAPTER));
        // `addResource` leaves the resource uncapped
        _addAction(proposal, yieldGroup, "lowerResourceCap(address,uint256)", abi.encode(vToken, supplyCap));
    }

    /// @dev Returns a tier request's VIP actions: `settleRequest`, then each loan market's caps set to the new tier's
    function _buildTierProposal(
        uint256 requestId,
        uint256 buildId,
        address comptroller,
        uint256 tierId
    ) internal view returns (Proposal memory proposal) {
        ITierRegistry tierRegistry = SPOKE_POOL_MANAGER.TIER_REGISTRY();
        VToken[] memory listed = _listedMarkets(comptroller);
        uint256 marketCount = listed.length;
        proposal = _newProposal(1 + TIER_ACTIONS_PER_MARKET * marketCount);
        _addAction(
            proposal,
            address(SPOKE_POOL_MANAGER),
            "settleRequest(uint256,uint256)",
            abi.encode(requestId, buildId)
        );
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(listed[i]);
            if (!SPOKE_POOL_MANAGER.isLoanMarket(vToken)) {
                continue;
            }
            address asset = VToken(vToken).underlying();
            uint256 supplyCap = tierRegistry.getLoanSupplyCap(tierId, asset);
            if (supplyCap == 0) {
                revert LoanAssetNotAllowed(asset);
            }
            address[] memory markets = new address[](1);
            markets[0] = vToken;
            uint256[] memory caps = new uint256[](1);
            caps[0] = supplyCap;
            _addAction(proposal, comptroller, "setMarketSupplyCaps(address[],uint256[])", abi.encode(markets, caps));
            _addAction(proposal, comptroller, "setMarketBorrowCaps(address[],uint256[])", abi.encode(markets, caps));

            address yieldGroup = SPOKE_POOL_MANAGER.hubYieldGroups(asset);
            // On a YieldGroup zero means uncapped; an unchanged cap is skipped
            uint256 resourceCap = IYieldGroup(yieldGroup).resourceCap(vToken);
            if (resourceCap == 0 || supplyCap < resourceCap) {
                _addAction(proposal, yieldGroup, "lowerResourceCap(address,uint256)", abi.encode(vToken, supplyCap));
            } else if (supplyCap > resourceCap) {
                _addAction(proposal, yieldGroup, "raiseResourceCap(address,uint256)", abi.encode(vToken, supplyCap));
            }
        }
    }

    /// @dev Returns a pool's listed markets, in `getAllMarkets` order
    function _listedMarkets(address comptroller) internal view returns (VToken[] memory listed) {
        VToken[] memory vTokens = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = vTokens.length;
        listed = new VToken[](marketCount);
        uint256 listedCount;
        for (uint256 i; i < marketCount; ++i) {
            if (SpokeComptroller(comptroller).isMarketListed(vTokens[i])) {
                listed[listedCount] = vTokens[i];
                ++listedCount;
            }
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(listed, listedCount)
        }
    }

    /// @dev Returns empty VIP actions with room for `capacity` of them
    function _newProposal(uint256 capacity) internal pure returns (Proposal memory proposal) {
        proposal.targets = new address[](capacity);
        proposal.signatures = new string[](capacity);
        proposal.calldatas = new bytes[](capacity);
    }

    /// @dev Appends an action
    function _addAction(
        Proposal memory proposal,
        address target,
        string memory signature,
        bytes memory callData
    ) internal pure {
        uint256 index = proposal.length;
        proposal.targets[index] = target;
        proposal.signatures[index] = signature;
        proposal.calldatas[index] = callData;
        proposal.length = index + 1;
    }

    /// @dev Returns the actions as a GovernorBravo `propose` call on the Normal route, trimming the arrays in place
    function _encodeProposal(
        Proposal memory proposal,
        string calldata description
    ) internal pure returns (bytes memory) {
        address[] memory targets = proposal.targets;
        string[] memory signatures = proposal.signatures;
        bytes[] memory calldatas = proposal.calldatas;
        uint256 length = proposal.length;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(targets, length)
            mstore(signatures, length)
            mstore(calldatas, length)
        }
        return
            abi.encodeCall(
                IGovernorBravo.propose,
                (targets, new uint256[](length), signatures, calldatas, description, PROPOSAL_TYPE_NORMAL)
            );
    }
}

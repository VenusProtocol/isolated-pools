// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";

import { Action, ComptrollerInterface } from "../../ComptrollerInterface.sol";
import { InterestRateModel } from "../../InterestRateModel.sol";
import { PoolRegistry } from "../../Pool/PoolRegistry.sol";
import { VToken } from "../../VToken.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";
import { EXP_SCALE, MANTISSA_ONE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolPolicyRegistry } from "../interfaces/ISpokePoolPolicyRegistry.sol";
import { IGovernorBravo } from "../interfaces/external/IGovernorBravo.sol";
import { IResilientOracle } from "../interfaces/external/IResilientOracle.sol";
import { IYieldGroup } from "../interfaces/external/IYieldGroup.sol";

/**
 * @title SpokePoolProposalBuilder
 * @author Venus
 * @notice Builds `SpokePoolManager`'s VIPs as ABI-encoded GovernorBravo `propose` calls on the Normal route. A
 * request's VIP settles it: for a pool or markets request the builder deploys the contracts before the vote and the
 * VIP lists them; for a tier request the VIP sets the pool's loan market caps to the new tier's. An exit's VIPs wind
 * the pool down. The manager checks a request's markets and pulls its seeds before it calls the builder, which reads
 * the seeds from `SPOKE_POOL_MANAGER.requestSeeds`
 * @dev A loan market is one whose supply allowlist is on, as its listing VIP enables it for the Hub.
 * The VIPs grant no roles. The onboarding VIP gives wildcard ACM grants once: to the pool registry on
 * `setCloseFactor`, `setLiquidationIncentive`, `setMinLiquidatableCollateral`, `setCollateralFactor`,
 * `setMarketSupplyCaps` and `setMarketBorrowCaps`; to the Normal Timelock on `setSupplyAllowlistEnabled`,
 * `setAllowedSupplier`, `setForcedLiquidation` and the YieldGroups' `addResource`, `raiseResourceCap` and
 * `lowerResourceCap` (it already holds the other comptroller setters and `setReduceReservesBlockDelta`); to the Risk
 * Stewards on `setCollateralFactor` and `setMarketSupplyCaps`; to the supply pause steward on `setCollateralFactor`
 * and `setActionsPaused(address[],uint256[],bool)`. The Normal Timelock also needs `settleRequest(uint256)` and
 * `startWindDown(address)` on the manager, and, to price new collateral assets, `setTokenConfig` on every supported
 * oracle and the ResilientOracle, `setValidateConfig` on the BoundValidator, whose batch setters call these, and
 * `setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])` on the DeviationBoundedOracle
 */
contract SpokePoolProposalBuilder is ISpokePoolProposalBuilder {
    /// @dev VIP actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        uint256 length;
    }

    /// @dev A feed's config on a ChainlinkOracle-compatible oracle, as its `setTokenConfigs` takes it
    struct FeedConfig {
        address asset;
        address feed;
        uint256 maxStalePeriod;
    }

    /// @dev An asset's bounds on the BoundValidator, as its `setValidateConfigs` takes them
    struct BoundConfig {
        address asset;
        uint256 upperBoundRatio;
        uint256 lowerBoundRatio;
    }

    /// @dev GovernorBravo `ProposalType.NORMAL`, the route the VIPs use
    uint8 internal constant PROPOSAL_TYPE_NORMAL = 0;

    /// @dev ERC-20 decimals of a new market's vToken
    uint8 internal constant VTOKEN_DECIMALS = 8;

    /**
     * @dev Actions of a request's VIP besides its markets': a new pool's `acceptOwnership`, `addPool` and
     *   `settleRequest`
     */
    uint256 internal constant POOL_CREATION_ACTIONS = 3;

    /**
     * @dev Most oracle actions of a request's VIP, each a batch over its new collateral assets: one per supported
     *   oracle, the BoundValidator, the ResilientOracle and the DeviationBoundedOracle
     */
    uint256 internal constant ORACLE_CONFIG_ACTIONS = 6;

    /**
     * @dev Most actions a VIP adds per new market: approve, `addMarket`, burn and `setReduceReservesBlockDelta`, plus a
     *   loan market's `setSupplyAllowlistEnabled`, `setAllowedSupplier`, `addResource` and `lowerResourceCap`
     */
    uint256 internal constant MAX_ACTIONS_PER_MARKET = 8;

    /// @dev Actions of an exit VIP besides one per collateral market
    uint256 internal constant EXIT_ACTIONS = 4;

    /// @dev Actions of a tier VIP besides one Hub cap per loan market: `settleRequest` and the batched caps
    uint256 internal constant TIER_ACTIONS = 3;

    /// @dev Loop limit every comptroller the builder deploys is initialized with
    uint256 internal constant MAX_LOOPS_LIMIT = 100;

    /// @inheritdoc ISpokePoolProposalBuilder
    ISpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @inheritdoc ISpokePoolProposalBuilder
    ISpokePoolPolicyRegistry public immutable POLICY_REGISTRY;

    /// @inheritdoc ISpokePoolProposalBuilder
    IGovernorBravo public immutable GOVERNOR_BRAVO;

    /// @inheritdoc ISpokePoolProposalBuilder
    address public immutable POOL_REGISTRY;

    /// @inheritdoc ISpokePoolProposalBuilder
    IDeviationBoundedOracle public immutable DEVIATION_BOUNDED_ORACLE;

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
        ensureNonzeroAddress(spokeAdapter);
        ensureNonzeroAddress(comptrollerBeacon);
        ensureNonzeroAddress(vTokenBeacon);
        ensureNonzeroAddress(protocolShareReserve);
        ensureNonzeroAddress(shortfall);

        uint256 maxMarketCount = (governorBravo.proposalMaxOperations() -
            POOL_CREATION_ACTIONS -
            ORACLE_CONFIG_ACTIONS) / MAX_ACTIONS_PER_MARKET;
        if (maxPoolMarkets > maxMarketCount) {
            revert TooManyMarkets(maxPoolMarkets, maxMarketCount);
        }

        SPOKE_POOL_MANAGER = spokePoolManager;
        POLICY_REGISTRY = spokePoolManager.POLICY_REGISTRY();
        GOVERNOR_BRAVO = governorBravo;
        POOL_REGISTRY = poolRegistry;
        DEVIATION_BOUNDED_ORACLE = deviationBoundedOracle;
        SPOKE_ADAPTER = spokeAdapter;
        COMPTROLLER_BEACON = comptrollerBeacon;
        VTOKEN_BEACON = vTokenBeacon;
        PROTOCOL_SHARE_RESERVE = protocolShareReserve;
        SHORTFALL = shortfall;
        MAX_POOL_MARKETS = maxPoolMarkets;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Request functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolProposalBuilder
    function buildRequestProposal(
        uint256 requestId,
        string calldata description
    ) external returns (address comptroller, address[] memory vTokens, bytes memory proposal) {
        if (msg.sender != address(SPOKE_POOL_MANAGER)) {
            revert NotSpokePoolManager(msg.sender);
        }

        ISpokePoolManager.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        comptroller = request.comptroller;
        if (request.requestType == ISpokePoolManager.RequestType.TierUpgrade) {
            return (
                comptroller,
                vTokens,
                _encodeProposal(_buildTierProposal(requestId, comptroller, request.tierId), description)
            );
        }

        address executor = GOVERNOR_BRAVO.proposalTimelocks(PROPOSAL_TYPE_NORMAL);
        string memory poolName;
        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            comptroller = _deployComptroller(executor);
            poolName = _poolName(requestId);
        } else {
            poolName = PoolRegistry(POOL_REGISTRY).getPoolByComptroller(comptroller).name;
        }

        vTokens = _deployMarkets(comptroller, poolName, request, executor);
        proposal = _encodeProposal(
            _buildMarketsProposal(requestId, request, comptroller, vTokens, executor),
            description
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Exit functions
    // ──────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISpokePoolProposalBuilder
    function buildExitProposal(
        address comptroller,
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
            if (!SpokeComptroller(comptroller).isSupplyAllowlistEnabled(address(vToken))) {
                _addAction(
                    proposal,
                    comptroller,
                    "setCollateralFactor(address,uint256,uint256)",
                    abi.encode(vToken, 0, liquidationThresholds[i])
                );
            }
        }

        _addAction(proposal, address(SPOKE_POOL_MANAGER), "startWindDown(address)", abi.encode(comptroller));
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
            if (!SpokeComptroller(comptroller).isSupplyAllowlistEnabled(address(vToken))) {
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
    function _deployComptroller(address executor) private returns (address comptroller) {
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
    ) private returns (address[] memory vTokens) {
        uint256 collateralCount = request.collateralMarkets.length;
        uint256 loanCount = request.loanMarkets.length;
        vTokens = new address[](collateralCount + loanCount);
        (address collateralInterestRateModel, , ) = POLICY_REGISTRY.marketParams();

        for (uint256 i; i < collateralCount; ++i) {
            vTokens[i] = _deployMarket(
                comptroller,
                poolName,
                request.collateralMarkets[i].asset,
                collateralInterestRateModel,
                executor
            );
        }
        for (uint256 i; i < loanCount; ++i) {
            ISpokePoolManager.LoanMarketRequestParams memory market = request.loanMarkets[i];
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
     *   `Venus <symbol> (<pool name>)` and `v<symbol>_<pool name without spaces>`
     */
    function _deployMarket(
        address comptroller,
        string memory poolName,
        address asset,
        address interestRateModel,
        address executor
    ) private returns (address vToken) {
        (, uint256 reserveFactor, ) = POLICY_REGISTRY.marketParams();
        string memory assetSymbol = IERC20MetadataUpgradeable(asset).symbol();
        vToken = address(new BeaconProxy(VTOKEN_BEACON, ""));
        VToken(vToken).initialize(
            asset,
            ComptrollerInterface(comptroller),
            InterestRateModel(interestRateModel),
            uint256(10) ** (18 + IERC20MetadataUpgradeable(asset).decimals() - VTOKEN_DECIMALS),
            string.concat("Venus ", assetSymbol, " (", poolName, ")"),
            string.concat("v", assetSymbol, "_", _withoutSpaces(poolName)),
            VTOKEN_DECIMALS,
            executor,
            address(AccessControlledV8(address(SPOKE_POOL_MANAGER)).accessControlManager()),
            VTokenInterface.RiskManagementInit({ shortfall: SHORTFALL, protocolShareReserve: PROTOCOL_SHARE_RESERVE }),
            reserveFactor
        );
    }

    /**
     * @dev Returns a pool or markets request's VIP actions: a new pool's `acceptOwnership` and its listing with Venus's
     *   current pool parameters, `settleRequest`, the collateral assets' oracle configs, then the collateral markets'
     *   listings and the loan markets' listings and Hub registrations
     */
    function _buildMarketsProposal(
        uint256 requestId,
        ISpokePoolManager.Request memory request,
        address comptroller,
        address[] memory vTokens,
        address executor
    ) private view returns (Proposal memory proposal) {
        proposal = _newProposal(
            POOL_CREATION_ACTIONS + ORACLE_CONFIG_ACTIONS + MAX_ACTIONS_PER_MARKET * vTokens.length
        );

        if (request.requestType == ISpokePoolManager.RequestType.Pool) {
            (uint256 closeFactor, uint256 liquidationIncentive, uint256 minLiquidatableCollateral) = POLICY_REGISTRY
                .poolParams();
            _addAction(proposal, comptroller, "acceptOwnership()", "");
            _addAction(
                proposal,
                POOL_REGISTRY,
                "addPool(string,address,uint256,uint256,uint256)",
                abi.encode(
                    _poolName(requestId),
                    comptroller,
                    closeFactor,
                    liquidationIncentive,
                    minLiquidatableCollateral
                )
            );
        }

        // Settled before the listings: it sends the seeds to the Normal Timelock, which lists the markets with them
        _addAction(proposal, address(SPOKE_POOL_MANAGER), "settleRequest(uint256)", abi.encode(requestId));

        // Before the listings: a collateral market needs a price for its collateral factor
        _addOracleConfigs(proposal, requestId, request.collateralMarkets);

        uint256 collateralCount = request.collateralMarkets.length;
        for (uint256 i; i < collateralCount; ++i) {
            ISpokePoolManager.CollateralMarketRequestParams memory market = request.collateralMarkets[i];
            _addMarketListing(
                proposal,
                market.asset,
                PoolRegistry.AddMarketInput({
                    vToken: VToken(vTokens[i]),
                    collateralFactor: market.collateralFactor,
                    liquidationThreshold: market.liquidationThreshold,
                    initialSupply: SPOKE_POOL_MANAGER.requestSeeds(requestId, market.asset),
                    vTokenReceiver: executor,
                    supplyCap: market.supplyCap,
                    borrowCap: 0
                })
            );
        }

        for (uint256 i; i < request.loanMarkets.length; ++i) {
            address asset = request.loanMarkets[i].asset;
            address vToken = vTokens[collateralCount + i];
            uint256 supplyCap = _loanSupplyCap(request.tierId, asset);
            uint256 seed = SPOKE_POOL_MANAGER.requestSeeds(requestId, asset);
            _addMarketListing(
                proposal,
                asset,
                PoolRegistry.AddMarketInput({
                    vToken: VToken(vToken),
                    collateralFactor: 0,
                    liquidationThreshold: 0,
                    initialSupply: seed,
                    vTokenReceiver: executor,
                    supplyCap: supplyCap,
                    borrowCap: supplyCap
                })
            );
            _addHubRegistration(proposal, comptroller, asset, vToken, supplyCap);
        }
    }

    /**
     * @dev Adds the collateral assets' oracle configs, one batch per oracle. Each asset the ResilientOracle does not
     *   price yet gets its set feeds, each on its own oracle, its BoundValidator bounds when a pivot feed is set, its
     *   ResilientOracle config with each set feed's oracle enabled, and its DeviationBoundedOracle config unless that
     *   oracle has it. An asset the ResilientOracle prices gets none, so a VIP of its own changes its price config
     */
    function _addOracleConfigs(
        Proposal memory proposal,
        uint256 requestId,
        ISpokePoolManager.CollateralMarketRequestParams[] memory markets
    ) private view {
        IResilientOracle resilientOracle = IResilientOracle(address(SPOKE_POOL_MANAGER.RESILIENT_ORACLE()));
        uint256 marketCount = markets.length;
        bool[] memory unpriced = new bool[](marketCount);
        for (uint256 i; i < marketCount; ++i) {
            unpriced[i] = resilientOracle.getTokenConfig(markets[i].asset).asset == address(0);
        }

        for (uint256 i; i < 3; ++i) {
            _addFeedConfigs(proposal, markets, unpriced, SPOKE_POOL_MANAGER.supportedOracles(i));
        }
        _addBoundConfigs(proposal, requestId, markets, unpriced, resilientOracle.boundValidator());
        _addResilientOracleConfigs(proposal, markets, unpriced);
        _addDeviationBoundedOracleConfigs(proposal, requestId, markets, unpriced);
    }

    /**
     * @dev Adds `oracle`'s batch of the unpriced assets' feeds on it, if any. The manager checked each set feed is on a
     *   supported oracle and that an asset's feeds are on distinct oracles
     */
    function _addFeedConfigs(
        Proposal memory proposal,
        ISpokePoolManager.CollateralMarketRequestParams[] memory markets,
        bool[] memory unpriced,
        address oracle
    ) private view {
        uint256 marketCount = markets.length;
        FeedConfig[] memory configs = new FeedConfig[](marketCount);
        uint256 count;
        for (uint256 i; i < marketCount; ++i) {
            if (!unpriced[i]) {
                continue;
            }

            for (uint256 j; j < 3; ++j) {
                ISpokePoolManager.OracleFeed memory feed = markets[i].feeds[j];
                if (feed.feed != address(0) && feed.oracle == oracle) {
                    configs[count] = FeedConfig(markets[i].asset, feed.feed, feed.maxStalePeriod);
                    ++count;
                    break;
                }
            }
        }

        if (count != 0) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(configs, count)
            }
            _addAction(proposal, oracle, "setTokenConfigs((address,address,uint256)[])", abi.encode(configs));
        }
    }

    /**
     * @dev Adds the BoundValidator's batch of the unpriced assets' bounds, if any, with the Venus team's deviation
     *   for the request, else the registry's. Only a pivot makes the ResilientOracle validate prices against it, and
     *   the manager allows a fallback only with a pivot
     */
    function _addBoundConfigs(
        Proposal memory proposal,
        uint256 requestId,
        ISpokePoolManager.CollateralMarketRequestParams[] memory markets,
        bool[] memory unpriced,
        address boundValidator
    ) private view {
        (, , , , uint256 registryDeviation) = POLICY_REGISTRY.oracleParams();
        uint256 marketCount = markets.length;
        BoundConfig[] memory configs = new BoundConfig[](marketCount);
        uint256 count;
        for (uint256 i; i < marketCount; ++i) {
            if (unpriced[i] && markets[i].feeds[1].feed != address(0)) {
                address asset = markets[i].asset;
                (uint256 boundDeviation, , , ) = SPOKE_POOL_MANAGER.requestOracleOverrides(requestId, asset);
                if (boundDeviation == 0) {
                    boundDeviation = registryDeviation;
                }
                configs[count] = BoundConfig(asset, MANTISSA_ONE + boundDeviation, MANTISSA_ONE - boundDeviation);
                ++count;
            }
        }

        if (count != 0) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(configs, count)
            }
            _addAction(
                proposal,
                boundValidator,
                "setValidateConfigs((address,uint256,uint256)[])",
                abi.encode(configs)
            );
        }
    }

    /// @dev Adds the ResilientOracle's batch of the unpriced assets' configs, each with its set feeds' oracles enabled
    function _addResilientOracleConfigs(
        Proposal memory proposal,
        ISpokePoolManager.CollateralMarketRequestParams[] memory markets,
        bool[] memory unpriced
    ) private view {
        uint256 marketCount = markets.length;
        IResilientOracle.TokenConfig[] memory configs = new IResilientOracle.TokenConfig[](marketCount);
        uint256 count;
        for (uint256 i; i < marketCount; ++i) {
            if (!unpriced[i]) {
                continue;
            }

            IResilientOracle.TokenConfig memory config = configs[count];
            config.asset = markets[i].asset;
            for (uint256 j; j < 3; ++j) {
                ISpokePoolManager.OracleFeed memory feed = markets[i].feeds[j];
                if (feed.feed != address(0)) {
                    config.oracles[j] = feed.oracle;
                    config.enableFlagsForOracles[j] = true;
                }
            }
            ++count;
        }

        if (count != 0) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(configs, count)
            }
            _addAction(
                proposal,
                address(SPOKE_POOL_MANAGER.RESILIENT_ORACLE()),
                "setTokenConfigs((address,address[3],bool[3],bool)[])",
                abi.encode(configs)
            );
        }
    }

    /**
     * @dev Adds the DeviationBoundedOracle's batch of configs for the unpriced assets it does not have yet, if any:
     *   the Venus team's config for the request, else the registry's while Venus enables it
     */
    function _addDeviationBoundedOracleConfigs(
        Proposal memory proposal,
        uint256 requestId,
        ISpokePoolManager.CollateralMarketRequestParams[] memory markets,
        bool[] memory unpriced
    ) private view {
        uint256 marketCount = markets.length;
        IDeviationBoundedOracle.TokenConfigInput[] memory configs = new IDeviationBoundedOracle.TokenConfigInput[](
            marketCount
        );
        uint256 count;
        for (uint256 i; i < marketCount; ++i) {
            address asset = markets[i].asset;
            if (!unpriced[i]) {
                continue;
            }
            (, , , , , , address initializedAsset, , , ) = DEVIATION_BOUNDED_ORACLE.assetProtectionConfig(asset);
            if (initializedAsset != address(0)) {
                continue;
            }

            IDeviationBoundedOracle.TokenConfigInput memory config = configs[count];
            (, config.cooldownPeriod, config.triggerThreshold, config.resetThreshold) = SPOKE_POOL_MANAGER
                .requestOracleOverrides(requestId, asset);
            if (config.triggerThreshold == 0) {
                bool enabled;
                (enabled, config.cooldownPeriod, config.triggerThreshold, config.resetThreshold, ) = POLICY_REGISTRY
                    .oracleParams();
                if (!enabled) {
                    continue;
                }
            }
            config.asset = asset;
            config.enableBoundedPricing = true;
            ++count;
        }

        if (count != 0) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(configs, count)
            }
            _addAction(
                proposal,
                address(DEVIATION_BOUNDED_ORACLE),
                "setTokenConfigs((address,uint64,uint256,uint256,bool,bool)[])",
                abi.encode(configs)
            );
        }
    }

    /// @dev Adds a market's listing: approve and add it with its seed, burn the seed's vTokens, set its reserve delta
    function _addMarketListing(
        Proposal memory proposal,
        address asset,
        PoolRegistry.AddMarketInput memory input
    ) private view {
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

        (, , uint256 reduceReservesBlockDelta) = POLICY_REGISTRY.marketParams();
        _addAction(proposal, vToken, "setReduceReservesBlockDelta(uint256)", abi.encode(reduceReservesBlockDelta));
    }

    /// @dev Adds a loan market's Hub registration: only its Hub YieldGroup supplies it, capped at its supply cap
    function _addHubRegistration(
        Proposal memory proposal,
        address comptroller,
        address asset,
        address vToken,
        uint256 supplyCap
    ) private view {
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

    /**
     * @dev Returns a tier request's VIP actions: `settleRequest`, each loan market's Hub cap set to the new tier's,
     *   then the loan markets' supply and borrow caps in one batch each
     */
    function _buildTierProposal(
        uint256 requestId,
        address comptroller,
        uint256 tierId
    ) private view returns (Proposal memory proposal) {
        VToken[] memory listed = _listedMarkets(comptroller);
        uint256 marketCount = listed.length;
        proposal = _newProposal(TIER_ACTIONS + marketCount);

        _addAction(proposal, address(SPOKE_POOL_MANAGER), "settleRequest(uint256)", abi.encode(requestId));

        address[] memory loanMarkets = new address[](marketCount);
        uint256[] memory caps = new uint256[](marketCount);
        uint256 loanCount;
        for (uint256 i; i < marketCount; ++i) {
            address vToken = address(listed[i]);
            if (!SpokeComptroller(comptroller).isSupplyAllowlistEnabled(vToken)) {
                continue;
            }

            address asset = VToken(vToken).underlying();
            uint256 supplyCap = _loanSupplyCap(tierId, asset);
            if (supplyCap == 0) {
                revert LoanAssetNotAllowed(asset);
            }

            loanMarkets[loanCount] = vToken;
            caps[loanCount] = supplyCap;
            ++loanCount;
            _addHubCap(proposal, asset, vToken, supplyCap);
        }

        // The comptroller's cap setters reject empty market arrays
        if (loanCount != 0) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(loanMarkets, loanCount)
                mstore(caps, loanCount)
            }
            _addAction(
                proposal,
                comptroller,
                "setMarketSupplyCaps(address[],uint256[])",
                abi.encode(loanMarkets, caps)
            );
            _addAction(
                proposal,
                comptroller,
                "setMarketBorrowCaps(address[],uint256[])",
                abi.encode(loanMarkets, caps)
            );
        }
    }

    /**
     * @dev Sets a loan market's Hub cap to `supplyCap`; zero means uncapped on a YieldGroup, and an unchanged cap is
     *   skipped
     */
    function _addHubCap(Proposal memory proposal, address asset, address vToken, uint256 supplyCap) private view {
        address yieldGroup = SPOKE_POOL_MANAGER.hubYieldGroups(asset);
        uint256 resourceCap = IYieldGroup(yieldGroup).resourceCap(vToken);
        if (resourceCap == 0 || supplyCap < resourceCap) {
            _addAction(proposal, yieldGroup, "lowerResourceCap(address,uint256)", abi.encode(vToken, supplyCap));
        } else if (supplyCap > resourceCap) {
            _addAction(proposal, yieldGroup, "raiseResourceCap(address,uint256)", abi.encode(vToken, supplyCap));
        }
    }

    /// @dev Returns a pool's listed markets, in `getAllMarkets` order
    function _listedMarkets(address comptroller) private view returns (VToken[] memory listed) {
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

    /// @dev Returns a tier's supply cap for a loan market of `asset`: its USD cap at the asset's current price
    function _loanSupplyCap(uint256 tierId, address asset) private view returns (uint256) {
        uint256 supplyCapUsd = POLICY_REGISTRY.getLoanSupplyCapUsd(tierId, asset);
        return (supplyCapUsd * EXP_SCALE) / SPOKE_POOL_MANAGER.RESILIENT_ORACLE().getPrice(asset);
    }

    /// @dev Returns empty VIP actions with room for `capacity` of them
    function _newProposal(uint256 capacity) private pure returns (Proposal memory proposal) {
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
    ) private pure {
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
    ) private pure returns (bytes memory) {
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

    /// @dev Returns a new pool's name, set from its request: `Spoke Pool <request id>`
    function _poolName(uint256 requestId) private pure returns (string memory) {
        return string.concat("Spoke Pool ", Strings.toString(requestId));
    }

    /// @dev Returns `name` with its spaces removed, for a market's symbol
    function _withoutSpaces(string memory name) private pure returns (string memory) {
        bytes memory source = bytes(name);
        uint256 sourceLength = source.length;
        bytes memory result = new bytes(sourceLength);
        uint256 length;
        for (uint256 i; i < sourceLength; ++i) {
            if (source[i] != " ") {
                result[length] = source[i];
                ++length;
            }
        }

        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(result, length)
        }

        return string(result);
    }
}

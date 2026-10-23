// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import { Action, ComptrollerInterface } from "../../ComptrollerInterface.sol";
import { InterestRateModel } from "../../InterestRateModel.sol";
import { PoolRegistry } from "../../Pool/PoolRegistry.sol";
import { VToken } from "../../VToken.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";
import { EXP_SCALE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { ISpokePoolProposer } from "../interfaces/ISpokePoolProposer.sol";
import { IGovernorBravo, PROPOSAL_TYPE_NORMAL } from "../interfaces/external/IGovernorBravo.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolProposer
 * @author Venus
 * @notice Builds `SpokePoolManager`'s GovernorBravo proposals on the Normal route: a request's proposal, after
 * deploying its contracts before the vote as in Venus market listings, and an exit's two proposals. Each is returned as
 * an ABI-encoded `propose` call, which the manager, holding the delegated votes, submits.
 * @dev Only the manager calls it. The proposals grant no roles: the onboarding VIP gives wildcard ACM grants once, for
 * every pool, to the pool registry on the setters it calls while listing (`setCloseFactor`, `setLiquidationIncentive`,
 * `setMinLiquidatableCollateral`, `setCollateralFactor`, `setMarketSupplyCaps`, `setMarketBorrowCaps`), to the Normal
 * Timelock on `setSupplyAllowlistEnabled`, `setAllowedSupplier`, `setForcedLiquidation` and the YieldGroups'
 * `addResource` (it already holds wildcards for the other comptroller setters and the vTokens'
 * `setReduceReservesBlockDelta`), and to the Risk Stewards on `setCollateralFactor`, `setMarketSupplyCaps`,
 * `setMarketBorrowCaps` and the vTokens' `setInterestRateModel`
 */
contract SpokePoolProposer is ISpokePoolProposer {
    /// @dev Governance proposal actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        uint256 length;
    }

    /// @notice Most actions a proposal adds per new market: a loan market's listing and Hub registration
    uint256 public constant MAX_ACTIONS_PER_MARKET = 8;

    /// @notice Most actions of a request's proposal besides its markets': a new pool's `acceptOwnership`, `addPool`
    ///   and `settleRequest`
    uint256 public constant POOL_CREATION_ACTIONS = 3;

    /// @notice Actions of an exit's first proposal besides one per collateral market
    uint256 public constant EXIT_ACTIONS = 4;

    /// @notice Loop limit every comptroller the proposer deploys is initialized with
    uint256 public constant MAX_LOOPS_LIMIT = 100;

    /// @notice The manager the proposer builds proposals for
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice The receiver of the seed vTokens that are not burned
    address public immutable TREASURY;

    /// @notice The Hub adapter loan markets are registered with
    address public immutable SPOKE_ADAPTER;

    /// @notice Beacon the comptroller proxies point at
    address public immutable COMPTROLLER_BEACON;

    /// @notice Beacon the vToken proxies point at
    address public immutable VTOKEN_BEACON;

    /// @notice ProtocolShareReserve every market sends its income to
    address payable public immutable PROTOCOL_SHARE_RESERVE;

    /// @notice The `shortfall` of every market, through which bad debt is recovered
    address public immutable SHORTFALL;

    /**
     * @notice Thrown when the caller is not the manager
     * @param caller The caller
     */
    error NotManager(address caller);

    /// @dev Reverts unless the caller is the manager
    modifier onlyManager() {
        if (msg.sender != address(SPOKE_POOL_MANAGER)) {
            revert NotManager(msg.sender);
        }
        _;
    }

    /**
     * @param spokePoolManager The manager the proposer builds proposals for
     * @param treasury The receiver of the seed vTokens that are not burned
     * @param spokeAdapter The Hub adapter loan markets are registered with
     * @param comptrollerBeacon Beacon the comptroller proxies point at
     * @param vTokenBeacon Beacon the vToken proxies point at
     * @param protocolShareReserve ProtocolShareReserve every market sends its income to
     * @param shortfall The `shortfall` of every market
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     * @custom:error TooManyMarkets is thrown when a pool-creation proposal with the manager's
     *   `MAX_POOL_MARKETS` markets would exceed GovernorBravo's action limit
     */
    constructor(
        SpokePoolManager spokePoolManager,
        address treasury,
        address spokeAdapter,
        address comptrollerBeacon,
        address vTokenBeacon,
        address payable protocolShareReserve,
        address shortfall
    ) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(treasury);
        ensureNonzeroAddress(spokeAdapter);
        ensureNonzeroAddress(comptrollerBeacon);
        ensureNonzeroAddress(vTokenBeacon);
        ensureNonzeroAddress(protocolShareReserve);
        ensureNonzeroAddress(shortfall);
        uint256 maxPoolMarkets = spokePoolManager.MAX_POOL_MARKETS();
        uint256 maxCount = (spokePoolManager.GOVERNOR_BRAVO().proposalMaxOperations() - POOL_CREATION_ACTIONS) /
            MAX_ACTIONS_PER_MARKET;
        if (maxPoolMarkets > maxCount) {
            revert ISpokePoolManager.TooManyMarkets(maxPoolMarkets, maxCount);
        }

        SPOKE_POOL_MANAGER = spokePoolManager;
        TREASURY = treasury;
        SPOKE_ADAPTER = spokeAdapter;
        COMPTROLLER_BEACON = comptrollerBeacon;
        VTOKEN_BEACON = vTokenBeacon;
        PROTOCOL_SHARE_RESERVE = protocolShareReserve;
        SHORTFALL = shortfall;
    }

    /// @inheritdoc ISpokePoolProposer
    function buildRequestProposal(
        uint256 requestId,
        string calldata description
    ) external onlyManager returns (address comptroller, address[] memory vTokens, bytes memory) {
        SpokePoolManagerStorage.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        address executor = SPOKE_POOL_MANAGER.GOVERNOR_BRAVO().proposalTimelocks(PROPOSAL_TYPE_NORMAL);
        // Only a pool request's first proposal has no comptroller yet
        comptroller = request.comptroller;
        if (comptroller == address(0)) {
            comptroller = _deployComptroller(executor);
        }
        vTokens = _deployMarkets(comptroller, request.markets, executor);

        Proposal memory proposal = _newProposal(
            POOL_CREATION_ACTIONS + MAX_ACTIONS_PER_MARKET * request.markets.length
        );
        if (request.requestType == SpokePoolManagerStorage.RequestType.Pool) {
            _addPoolListing(proposal, comptroller, request.pool);
        }
        // Settled before the markets are listed: it sends the seeds to the timelock, which lists the markets with them
        _addAction(proposal, address(SPOKE_POOL_MANAGER), "settleRequest(uint256)", abi.encode(requestId));
        address registry = SPOKE_POOL_MANAGER.POOL_REGISTRY();
        uint256 marketCount = request.markets.length;
        for (uint256 i; i < marketCount; ++i) {
            _addMarketListing(proposal, registry, request.markets[i], vTokens[i], executor);
            if (request.markets[i].isLoanMarket) {
                _addHubRegistration(proposal, comptroller, request.markets[i].asset, vTokens[i]);
            }
        }
        return (comptroller, vTokens, _encodeProposal(proposal, description));
    }

    /// @inheritdoc ISpokePoolProposer
    function buildExitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external view onlyManager returns (bytes memory) {
        (VToken[] memory listed, uint256[] memory currentThresholds) = _listedMarkets(comptroller);
        uint256 marketCount = listed.length;
        if (liquidationThresholds.length != marketCount) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        Proposal memory proposal = _newProposal(marketCount + EXIT_ACTIONS);

        // The comptroller rejects empty market arrays
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
            _addZeroCollateralFactor(proposal, comptroller, listed[i], liquidationThresholds[i], currentThresholds[i]);
        }
        _addAction(proposal, address(SPOKE_POOL_MANAGER), "startWindDown(address)", abi.encode(comptroller));
        return _encodeProposal(proposal, description);
    }

    /// @inheritdoc ISpokePoolProposer
    function buildForceCloseProposal(
        address comptroller,
        string calldata description
    ) external view onlyManager returns (bytes memory) {
        (VToken[] memory markets, ) = _listedMarkets(comptroller);
        uint256 marketCount = markets.length;
        Proposal memory proposal = _newProposal(marketCount);
        bool hasBorrows;
        for (uint256 i; i < marketCount; ++i) {
            VToken vToken = markets[i];
            if (!SPOKE_POOL_MANAGER.isLoanMarket(address(vToken))) {
                _addAction(
                    proposal,
                    comptroller,
                    "setCollateralFactor(address,uint256,uint256)",
                    abi.encode(vToken, 0, 0)
                );
            } else if (vToken.totalBorrows() != 0) {
                hasBorrows = true;
                _addAction(proposal, comptroller, "setForcedLiquidation(address,bool)", abi.encode(vToken, true));
            }
        }
        if (!hasBorrows) {
            revert ISpokePoolManager.NoOutstandingBorrows();
        }
        return _encodeProposal(proposal, description);
    }

    /**
     * @dev Deploys a new pool's comptroller, points it at both oracles and nominates the executor, which accepts in the
     *   request's proposal
     * @param executor The timelock that executes the proposal
     * @return comptroller The deployed comptroller
     */
    function _deployComptroller(address executor) internal returns (address comptroller) {
        SpokePoolManager manager = SPOKE_POOL_MANAGER;
        comptroller = address(new BeaconProxy(COMPTROLLER_BEACON, ""));
        SpokeComptroller(comptroller).initialize(MAX_LOOPS_LIMIT, address(manager.accessControlManager()));
        SpokeComptroller(comptroller).setPriceOracle(manager.RESILIENT_ORACLE());
        SpokeComptroller(comptroller).setDeviationBoundedOracle(manager.DEVIATION_BOUNDED_ORACLE());
        SpokeComptroller(comptroller).transferOwnership(executor);
    }

    /**
     * @dev Deploys and initializes a request's markets, owned by the executor, with `SHORTFALL` as their `shortfall`
     * @param comptroller The pool's comptroller
     * @param markets The markets' parameters
     * @param executor The timelock that executes the proposal
     * @return vTokens The deployed markets, in the order of `markets`
     */
    function _deployMarkets(
        address comptroller,
        SpokePoolManagerStorage.MarketParams[] memory markets,
        address executor
    ) internal returns (address[] memory vTokens) {
        address accessControlManager = address(SPOKE_POOL_MANAGER.accessControlManager());
        uint256 marketCount = markets.length;
        vTokens = new address[](marketCount);
        for (uint256 i; i < marketCount; ++i) {
            SpokePoolManagerStorage.MarketParams memory market = markets[i];
            vTokens[i] = address(new BeaconProxy(VTOKEN_BEACON, ""));
            VToken(vTokens[i]).initialize(
                market.asset,
                ComptrollerInterface(comptroller),
                InterestRateModel(market.interestRateModel),
                market.initialExchangeRate,
                market.name,
                market.symbol,
                market.decimals,
                executor,
                accessControlManager,
                VTokenInterface.RiskManagementInit({
                    shortfall: SHORTFALL,
                    protocolShareReserve: PROTOCOL_SHARE_RESERVE
                }),
                market.reserveFactor
            );
        }
    }

    /**
     * @dev Adds a new pool's listing: the comptroller's `acceptOwnership` and `addPool`
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param pool The pool's name and parameters
     */
    function _addPoolListing(
        Proposal memory proposal,
        address comptroller,
        SpokePoolManagerStorage.PoolRequest memory pool
    ) internal view {
        SpokePoolManagerStorage.PoolParams memory params = pool.params;
        _addAction(proposal, comptroller, "acceptOwnership()", "");
        _addAction(
            proposal,
            SPOKE_POOL_MANAGER.POOL_REGISTRY(),
            "addPool(string,address,uint256,uint256,uint256)",
            abi.encode(
                pool.name,
                comptroller,
                params.closeFactor,
                params.liquidationIncentive,
                params.minLiquidatableCollateral
            )
        );
    }

    /**
     * @dev Adds one market's listing: the executor approves the seed, `addMarket` mints the seed's vTokens to it, it
     * burns the market's seed burn percent of them and sends the rest to the treasury, and it sets the market's reserve
     * sweep interval. The vToken amount is exact because a new market mints at its initial exchange rate
     * @param proposal The proposal to add to
     * @param registry The registry the pool is listed in
     * @param market The market's parameters
     * @param vToken The market
     * @param executor The timelock that executes the proposal
     */
    function _addMarketListing(
        Proposal memory proposal,
        address registry,
        SpokePoolManagerStorage.MarketParams memory market,
        address vToken,
        address executor
    ) internal view {
        _addAction(proposal, market.asset, "approve(address,uint256)", abi.encode(registry, market.seed));
        _addAction(
            proposal,
            registry,
            "addMarket((address,uint256,uint256,uint256,address,uint256,uint256))",
            abi.encode(
                PoolRegistry.AddMarketInput({
                    vToken: VToken(vToken),
                    collateralFactor: market.collateralFactor,
                    liquidationThreshold: market.liquidationThreshold,
                    initialSupply: market.seed,
                    vTokenReceiver: executor,
                    supplyCap: market.supplyCap,
                    borrowCap: market.borrowCap
                })
            )
        );

        uint256 minted = (market.seed * EXP_SCALE) / market.initialExchangeRate;
        uint256 burned = (minted * market.seedBurnPercent) / EXP_SCALE;
        _addAction(proposal, vToken, "transfer(address,uint256)", abi.encode(address(0), burned));
        _addAction(proposal, vToken, "transfer(address,uint256)", abi.encode(TREASURY, minted - burned));
        _addAction(
            proposal,
            vToken,
            "setReduceReservesBlockDelta(uint256)",
            abi.encode(market.reduceReservesBlockDelta)
        );
    }

    /**
     * @dev Adds one loan market's Hub registration: only the asset's Hub source may supply it, and the source takes it
     * as a resource. The Hub operator adds it to the withdraw queue and funds it with `reallocate`
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param asset The market's asset
     * @param vToken The market
     */
    function _addHubRegistration(
        Proposal memory proposal,
        address comptroller,
        address asset,
        address vToken
    ) internal view {
        address source = SPOKE_POOL_MANAGER.spokeSources(asset);
        _addAction(proposal, comptroller, "setSupplyAllowlistEnabled(address,bool)", abi.encode(vToken, true));
        _addAction(proposal, comptroller, "setAllowedSupplier(address,address,bool)", abi.encode(vToken, source, true));
        _addAction(proposal, source, "addResource(address,address)", abi.encode(vToken, SPOKE_ADAPTER));
        // The withdraw queue is left to the Hub operator: a queue read here would revert the proposal, or drop a
        // resource, if the queue changed during the vote
    }

    /**
     * @dev Returns a pool's listed markets and their liquidation thresholds
     * @param comptroller The pool's comptroller
     * @return listed The listed markets, in `getAllMarkets` order
     * @return liquidationThresholds Each listed market's liquidation threshold
     */
    function _listedMarkets(
        address comptroller
    ) internal view returns (VToken[] memory listed, uint256[] memory liquidationThresholds) {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        listed = new VToken[](marketCount);
        liquidationThresholds = new uint256[](marketCount);
        uint256 listedCount;
        for (uint256 i; i < marketCount; ++i) {
            (bool isListed, , uint256 liquidationThreshold) = SpokeComptroller(comptroller).markets(
                address(markets[i])
            );
            if (isListed) {
                listed[listedCount] = markets[i];
                liquidationThresholds[listedCount] = liquidationThreshold;
                ++listedCount;
            }
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(listed, listedCount)
            mstore(liquidationThresholds, listedCount)
        }
    }

    /**
     * @dev Adds a listed collateral market's zero collateral factor, with a liquidation threshold no higher than now.
     * Loan markets are skipped
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param vToken The listed market
     * @param liquidationThreshold The market's new liquidation threshold
     * @param currentLiquidationThreshold The market's current liquidation threshold
     * @custom:error InvalidLiquidationThreshold is thrown when the threshold is above the market's current one
     */
    function _addZeroCollateralFactor(
        Proposal memory proposal,
        address comptroller,
        VToken vToken,
        uint256 liquidationThreshold,
        uint256 currentLiquidationThreshold
    ) internal view {
        if (SPOKE_POOL_MANAGER.isLoanMarket(address(vToken))) {
            return;
        }
        if (liquidationThreshold > currentLiquidationThreshold) {
            revert ISpokePoolManager.InvalidLiquidationThreshold(address(vToken));
        }
        _addAction(
            proposal,
            comptroller,
            "setCollateralFactor(address,uint256,uint256)",
            abi.encode(vToken, 0, liquidationThreshold)
        );
    }

    /**
     * @dev Returns an empty proposal with room for `capacity` actions
     * @param capacity The most actions the proposal holds
     * @return proposal The proposal
     */
    function _newProposal(uint256 capacity) internal pure returns (Proposal memory proposal) {
        proposal.targets = new address[](capacity);
        proposal.signatures = new string[](capacity);
        proposal.calldatas = new bytes[](capacity);
    }

    /**
     * @dev Appends one action to a proposal
     * @param proposal The proposal to append to
     * @param target The contract the timelock calls
     * @param signature The function signature the timelock calls
     * @param data The ABI-encoded arguments
     */
    function _addAction(
        Proposal memory proposal,
        address target,
        string memory signature,
        bytes memory data
    ) internal pure {
        uint256 index = proposal.length;
        proposal.targets[index] = target;
        proposal.signatures[index] = signature;
        proposal.calldatas[index] = data;
        proposal.length = index + 1;
    }

    /**
     * @dev Returns a proposal as a GovernorBravo `propose` call on the Normal route, shortening its action arrays in
     * place to the actions added
     * @param proposal The proposal
     * @param description The proposal's description
     * @return The ABI-encoded call
     */
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

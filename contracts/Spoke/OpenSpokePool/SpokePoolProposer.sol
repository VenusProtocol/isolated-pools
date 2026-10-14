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
import { PROPOSAL_TYPE_NORMAL } from "../interfaces/IGovernorBravo.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolProposer
 * @author Venus
 * @notice Builds and submits `SpokePoolManager`'s GovernorBravo proposals on the Normal route: a request's proposal,
 * after deploying its contracts before the vote as in Venus market listings, and an exit's two proposals.
 * @dev Only the manager calls it. It submits the proposals itself, so the GovernorBravo votes are delegated to it;
 * GovernorBravo allows one live proposal per proposer, so the votes run one after another. The proposals grant no
 * roles: the onboarding VIP gives wildcard ACM grants once, for every pool, to the pool registry on the setters it calls
 * while listing (`setCloseFactor`, `setLiquidationIncentive`, `setMinLiquidatableCollateral`, `setCollateralFactor`,
 * `setMarketSupplyCaps`, `setMarketBorrowCaps`), to the Normal Timelock on `setSupplyAllowlistEnabled`,
 * `setAllowedSupplier` and `setForcedLiquidation` (it already holds wildcards for the other setters), and to the Risk
 * Stewards on `setCollateralFactor`, `setMarketSupplyCaps` and `setMarketBorrowCaps`
 */
contract SpokePoolProposer {
    /// @dev Governance proposal actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        uint256 length;
    }

    /// @notice Most actions a proposal adds per new market: a loan market's listing and Hub registration
    uint256 public constant MAX_ACTIONS_PER_MARKET = 7;

    /// @notice Most actions of a request's proposal besides its markets' and interest rate models': a live pool's three
    ///   parameter changes and `settleRequest`; a new pool's `acceptOwnership`, `addPool` and `settleRequest` take fewer
    uint256 public constant POOL_CREATION_ACTIONS = 4;

    /// @notice Actions of an exit's first proposal besides one per collateral market
    uint256 public constant EXIT_ACTIONS = 4;

    /// @notice Loop limit every comptroller the proposer deploys is initialized with
    uint256 public constant MAX_LOOPS_LIMIT = 100;

    /// @notice The manager the proposer submits proposals for
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
    error OnlyManager(address caller);

    /// @dev Reverts unless the caller is the manager
    modifier onlyManager() {
        if (msg.sender != address(SPOKE_POOL_MANAGER)) {
            revert OnlyManager(msg.sender);
        }
        _;
    }

    /**
     * @param spokePoolManager The manager the proposer submits proposals for
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

    /**
     * @notice Deploys a request's comptroller, on a new pool's first proposal, and markets, then submits its proposal.
     *   In order, it lists a new pool or sets a live pool's changes, settles the request, then lists each market with
     *   its seed and registers each loan market with the Hub
     * @param requestId The request
     * @param description The proposal's description
     * @return proposalId The proposal
     * @return comptroller The pool's comptroller
     * @return vTokens The deployed markets, in the request's market order
     * @custom:error OnlyManager is thrown when the caller is not the manager
     * @custom:access Only the manager
     */
    function proposeRequest(
        uint256 requestId,
        string calldata description
    ) external onlyManager returns (uint256 proposalId, address comptroller, address[] memory vTokens) {
        SpokePoolManagerStorage.Request memory request = SPOKE_POOL_MANAGER.getRequest(requestId);
        bool isPoolRequest = request.requestType == SpokePoolManagerStorage.RequestType.Pool;
        address executor = SPOKE_POOL_MANAGER.GOVERNOR_BRAVO().proposalTimelocks(PROPOSAL_TYPE_NORMAL);
        comptroller = request.comptroller;
        if (isPoolRequest && comptroller == address(0)) {
            comptroller = _deployComptroller(executor);
        }
        vTokens = _deployMarkets(comptroller, request.markets, executor);

        Proposal memory proposal = _newProposal(
            POOL_CREATION_ACTIONS +
                request.poolConfig.interestRateModels.length +
                MAX_ACTIONS_PER_MARKET *
                request.markets.length
        );
        if (isPoolRequest) {
            _addPoolListing(proposal, comptroller, request.pool);
        } else if (request.requestType == SpokePoolManagerStorage.RequestType.PoolConfig) {
            _addPoolConfig(proposal, comptroller, request.poolConfig);
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
        proposalId = _propose(proposal, description);
    }

    /**
     * @notice Submits an exit's first proposal: pause minting, borrowing and entering markets, zero the caps of every
     *   listed market, zero each collateral market's collateral factor and lower its liquidation threshold, then start
     *   the wind-down in the manager
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds Each listed market's new liquidation threshold, in `getAllMarkets` order
     * @param description The proposal's description
     * @return The proposal
     * @custom:error OnlyManager is thrown when the caller is not the manager
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's listed markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     * @custom:access Only the manager
     */
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external onlyManager returns (uint256) {
        VToken[] memory listed = _listedMarkets(comptroller, SpokeComptroller(comptroller).getAllMarkets());
        uint256 marketCount = listed.length;
        if (liquidationThresholds.length != marketCount) {
            revert ISpokePoolManager.InvalidArrayLength();
        }
        Proposal memory proposal = _newProposal(marketCount + EXIT_ACTIONS);

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
        for (uint256 i; i < marketCount; ++i) {
            _addZeroCollateralFactor(proposal, comptroller, listed[i], liquidationThresholds[i]);
        }
        _addAction(proposal, address(SPOKE_POOL_MANAGER), "startWindDown(address)", abi.encode(comptroller));
        return _propose(proposal, description);
    }

    /**
     * @notice Submits an exit's force-close proposal: zero every collateral market's collateral factor and liquidation
     *   threshold, and enable forced liquidation on every loan market with borrows
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return The proposal
     * @custom:error OnlyManager is thrown when the caller is not the manager
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     * @custom:access Only the manager
     */
    function proposeForceClose(
        address comptroller,
        string calldata description
    ) external onlyManager returns (uint256) {
        VToken[] memory markets = _listedMarkets(comptroller, SpokeComptroller(comptroller).getAllMarkets());
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
        return _propose(proposal, description);
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
     * @dev Submits a proposal on the Normal route, shortening its action arrays in place to the actions added
     * @param proposal The proposal
     * @param description The proposal's description
     * @return The proposal's id
     */
    function _propose(Proposal memory proposal, string calldata description) internal returns (uint256) {
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
            SPOKE_POOL_MANAGER.GOVERNOR_BRAVO().propose(
                targets,
                new uint256[](length),
                signatures,
                calldatas,
                description,
                PROPOSAL_TYPE_NORMAL
            );
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
     * @dev Adds one market's listing: the executor approves the seed, `addMarket` mints the seed's vTokens to it, and
     * it burns the market's seed burn percent of them and sends the rest to the treasury. The vToken amount is exact
     * because a new market mints at its initial exchange rate
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
     * @dev Adds a listed collateral market's zero collateral factor, with its lowered liquidation threshold. Loan
     * markets are skipped
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param market The listed market
     * @param liquidationThreshold The market's new liquidation threshold
     * @custom:error InvalidLiquidationThreshold is thrown when the threshold is above the market's current one
     */
    function _addZeroCollateralFactor(
        Proposal memory proposal,
        address comptroller,
        VToken market,
        uint256 liquidationThreshold
    ) internal view {
        if (SPOKE_POOL_MANAGER.isLoanMarket(address(market))) {
            return;
        }
        (, , uint256 currentLiquidationThreshold) = SpokeComptroller(comptroller).markets(address(market));
        if (liquidationThreshold > currentLiquidationThreshold) {
            revert ISpokePoolManager.InvalidLiquidationThreshold(address(market));
        }
        _addAction(
            proposal,
            comptroller,
            "setCollateralFactor(address,uint256,uint256)",
            abi.encode(market, 0, liquidationThreshold)
        );
    }

    /**
     * @dev Returns a pool's listed markets
     * @param comptroller The pool's comptroller
     * @param markets The pool's markets, listed or not
     * @return listed The listed markets
     */
    function _listedMarkets(
        address comptroller,
        VToken[] memory markets
    ) internal view returns (VToken[] memory listed) {
        uint256 marketCount = markets.length;
        listed = new VToken[](marketCount);
        uint256 listedCount;
        for (uint256 i; i < marketCount; ++i) {
            if (SpokeComptroller(comptroller).isMarketListed(markets[i])) {
                listed[listedCount++] = markets[i];
            }
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(listed, listedCount)
        }
    }

    /**
     * @dev Adds a live pool's changes: each nonzero pool-wide parameter and each new interest rate model
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param config The changes
     */
    function _addPoolConfig(
        Proposal memory proposal,
        address comptroller,
        SpokePoolManagerStorage.PoolConfigRequest memory config
    ) internal pure {
        SpokePoolManagerStorage.PoolParams memory params = config.params;
        if (params.closeFactor != 0) {
            _addAction(proposal, comptroller, "setCloseFactor(uint256)", abi.encode(params.closeFactor));
        }
        if (params.liquidationIncentive != 0) {
            _addAction(
                proposal,
                comptroller,
                "setLiquidationIncentive(uint256)",
                abi.encode(params.liquidationIncentive)
            );
        }
        if (params.minLiquidatableCollateral != 0) {
            _addAction(
                proposal,
                comptroller,
                "setMinLiquidatableCollateral(uint256)",
                abi.encode(params.minLiquidatableCollateral)
            );
        }
        uint256 modelCount = config.interestRateModels.length;
        for (uint256 i; i < modelCount; ++i) {
            SpokePoolManagerStorage.MarketInterestRateModel memory model = config.interestRateModels[i];
            _addAction(proposal, model.vToken, "setInterestRateModel(address)", abi.encode(model.interestRateModel));
        }
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
}

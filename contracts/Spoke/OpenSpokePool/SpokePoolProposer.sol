// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { Action } from "../../ComptrollerInterface.sol";
import { PoolRegistry } from "../../Pool/PoolRegistry.sol";
import { VToken } from "../../VToken.sol";
import { EXP_SCALE } from "../../lib/constants.sol";
import { ensureNonzeroAddress } from "../../lib/validators.sol";
import { SpokeComptroller } from "../SpokeComptroller.sol";
import { IGovernorBravo, PROPOSAL_TYPE_NORMAL } from "../interfaces/IGovernorBravo.sol";
import { SpokePoolFactory } from "./SpokePoolFactory.sol";
import { SpokePoolManager } from "./SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "./SpokePoolManagerStorage.sol";

/**
 * @title SpokePoolProposer
 * @author Venus
 * @notice Puts open spoke pool requests and exits to a GovernorBravo vote for the Venus team. It builds the actions of
 * each proposal from `SpokePoolManager`'s state and configuration (creating a pool, adding markets to a pool, and the
 * two proposals of an exit), submits it on the Normal route and records it in the manager, which checks the request or
 * pool and moves its state.
 * @dev The proposer must hold XVSVault votes, delegated to it, of at least GovernorBravo's Normal proposal threshold:
 * GovernorBravo has no proposer whitelist, and anyone can cancel the proposer's proposals while its votes are below
 * the threshold. GovernorBravo allows one live proposal per proposer, so the proposals run one after another. The
 * proposer sits behind a proxy so the delegated votes stay at one address across upgrades. It needs the manager's
 * `recordRequestProposal`, `recordExitProposal` and `recordForceCloseProposal` roles. The manager's checks run after the
 * actions are built and submitted, in the same transaction, so an error from building can surface before them.
 * @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
 */
contract SpokePoolProposer is AccessControlledV8 {
    /// @dev Governance proposal actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        // Number of actions added
        uint256 length;
    }

    /// @notice Most actions a proposal adds per new market: a loan market's listing and Hub registration
    uint256 public constant MAX_ACTIONS_PER_MARKET = 7;

    /// @notice Actions of a pool-creation proposal besides its markets': the 12 role grants, `createPool`,
    ///   `acceptOwnership` and `addPool`
    uint256 public constant POOL_CREATION_ACTIONS = 15;

    /// @notice Actions of an exit's first proposal besides one per collateral market: the pause, two cap resets and
    ///   `startWindDown`
    uint256 public constant EXIT_ACTIONS = 4;

    /// @dev Address seed vTokens are burned to, as in Venus market listing proposals
    address internal constant BURN_ADDRESS = address(0);

    /// @notice The manager whose requests and pools the proposals are for
    SpokePoolManager public immutable SPOKE_POOL_MANAGER;

    /// @notice The receiver of the seed vTokens that are not burned
    address public immutable TREASURY;

    /**
     * @notice Thrown when a request is proposed through the function for the other kind of request
     * @param requestId The request
     */
    error InvalidRequestType(uint256 requestId);

    /// @notice Thrown when the liquidation thresholds of an exit do not match the pool's markets
    error InvalidArrayLength();

    /**
     * @notice Thrown when an exit would raise a market's liquidation threshold
     * @param vToken The market
     */
    error InvalidLiquidationThreshold(address vToken);

    /// @notice Thrown when no loan market has borrows left to force-close
    error NoOutstandingBorrows();

    /**
     * @notice Thrown when the manager's `MAX_POOL_MARKETS` is too large for a pool-creation proposal to fit
     *   GovernorBravo's action limit
     * @param maxPoolMarkets The manager's maximum
     * @param maxCount The largest maximum that fits
     */
    error MaxPoolMarketsTooLarge(uint256 maxPoolMarkets, uint256 maxCount);

    /**
     * @param spokePoolManager The manager whose requests and pools the proposals are for
     * @param treasury The receiver of the seed vTokens that are not burned
     * @custom:error ZeroAddressNotAllowed is thrown when any address is zero
     * @custom:error MaxPoolMarketsTooLarge is thrown when a pool-creation proposal with the manager's `MAX_POOL_MARKETS`
     *   markets would exceed GovernorBravo's action limit
     */
    constructor(SpokePoolManager spokePoolManager, address treasury) {
        ensureNonzeroAddress(address(spokePoolManager));
        ensureNonzeroAddress(treasury);
        uint256 maxPoolMarkets = spokePoolManager.MAX_POOL_MARKETS();
        uint256 maxCount = (spokePoolManager.GOVERNOR_BRAVO().proposalMaxOperations() - POOL_CREATION_ACTIONS) /
            MAX_ACTIONS_PER_MARKET;
        if (maxPoolMarkets > maxCount) {
            revert MaxPoolMarketsTooLarge(maxPoolMarkets, maxCount);
        }

        SPOKE_POOL_MANAGER = spokePoolManager;
        TREASURY = treasury;

        _disableInitializers();
    }

    /**
     * @notice Initializes the proposer
     * @param accessControlManager_ The AccessControlManager the proposer checks roles in
     */
    function initialize(address accessControlManager_) external initializer {
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);
    }

    /*** Venus team functions ***/

    /**
     * @notice Proposes a request for a new pool to GovernorBravo with its final parameters, agreed with the project
     *   off-chain. The proposal grants the pool's roles, deploys it through the factory, lists it and its markets with
     *   their seeds and registers each loan market with its asset's Hub source. The manager checks the markets against
     *   the current values of the request's tier. A request whose proposal was canceled, defeated or expired can be
     *   proposed again
     * @param requestId The request
     * @param params The final parameters. Each market's seed is pulled from the project, which must have approved the
     *   manager for it; a failed proposal's seeds are returned to the project first
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event The manager emits RequestProposed
     * @custom:error InvalidRequestType is thrown when the request is for new markets
     * @custom:error The manager's `recordRequestProposal` errors, such as ProposalNotFailed when the request's last
     *   proposal can still execute, or ExceedsTierLimit when the markets do not fit the tier
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeCreatePool(
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeCreatePool(uint256,PoolParams,string)");

        if (_requestPool(requestId) != address(0)) {
            revert InvalidRequestType(requestId);
        }
        proposalId = _propose(_poolCreationProposal(requestId, params), description);
        SPOKE_POOL_MANAGER.recordRequestProposal(requestId, params.markets, proposalId);
    }

    /**
     * @notice Proposes a request for new markets in a live pool to GovernorBravo with its final parameters, agreed
     *   with the project off-chain. The proposal deploys the markets through the factory, lists them with their seeds
     *   and registers each loan market with its asset's Hub source. The manager checks the markets against the current
     *   values of the pool's current tier. A request whose proposal was canceled, defeated or expired can be proposed
     *   again
     * @param requestId The request
     * @param params The final parameters; only `params.markets` is used. Each market's seed is pulled from the
     *   project, which must have approved the manager for it; a failed proposal's seeds are returned to the project
     *   first
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event The manager emits RequestProposed
     * @custom:error InvalidRequestType is thrown when the request is for a new pool
     * @custom:error The manager's `recordRequestProposal` errors, such as InvalidPoolStatus when the pool is not live
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeAddMarkets(
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeAddMarkets(uint256,PoolParams,string)");

        address comptroller = _requestPool(requestId);
        if (comptroller == address(0)) {
            revert InvalidRequestType(requestId);
        }
        proposalId = _propose(_marketAdditionProposal(requestId, comptroller, params), description);
        SPOKE_POOL_MANAGER.recordRequestProposal(requestId, params.markets, proposalId);
    }

    /**
     * @notice Starts a pool's exit, whether or not its deployer asked for it, ending the deployer's rights, and submits
     *   the exit's first proposal. It pauses minting, borrowing and entering markets and zeroes the supply and borrow
     *   caps on every market, sets each collateral market's collateral factor to zero and its liquidation threshold to
     *   the given value, and starts the repayment window. Borrowers can still repay, redeem and be liquidated. Called
     *   again if that proposal fails
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds The new liquidation threshold of each market, in `getAllMarkets` order, scaled by
     *   1e18; each at most the market's current one. Entries of loan markets and unlisted markets are ignored
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event The manager emits ExitProposed
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     * @custom:error The manager's `recordExitProposal` errors: InvalidPoolStatus when the pool is already winding down,
     *   closed or taken over. A comptroller that is not a pool fails while the actions are built
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeExit(
        address comptroller,
        uint256[] calldata liquidationThresholds,
        string calldata description
    ) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeExit(address,uint256[],string)");

        proposalId = _propose(_exitProposal(comptroller, liquidationThresholds), description);
        SPOKE_POOL_MANAGER.recordExitProposal(comptroller, proposalId);
    }

    /**
     * @notice Submits the exit's second proposal once the repayment window has elapsed with borrows left: collateral
     *   factors and liquidation thresholds go to zero and forced liquidation is enabled on every loan market with
     *   borrows, so liquidators can close them in full. Called again if that proposal fails
     * @param comptroller The pool's comptroller
     * @param description The proposal's description
     * @return proposalId The id of the proposal
     * @custom:event The manager emits ForceCloseProposed
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     * @custom:error The manager's `recordForceCloseProposal` errors: InvalidPoolStatus when the pool is not winding
     *   down, and RepaymentWindowNotElapsed before the repayment window ends
     * @custom:access Controlled by AccessControlManager, granted to the Venus team
     */
    function proposeForceClose(address comptroller, string calldata description) external returns (uint256 proposalId) {
        _checkAccessAllowed("proposeForceClose(address,string)");

        proposalId = _propose(_forceCloseProposal(comptroller), description);
        SPOKE_POOL_MANAGER.recordForceCloseProposal(comptroller, proposalId);
    }

    /*** Internal functions ***/

    /**
     * @dev Submits a proposal's actions to GovernorBravo on the Normal route. The action arrays are the proposal's own,
     * shortened in place to the actions added
     * @param proposal The proposal
     * @param description The proposal's description
     * @return The id of the proposal
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
            _governor().propose(
                targets,
                new uint256[](length),
                signatures,
                calldatas,
                description,
                PROPOSAL_TYPE_NORMAL
            );
    }

    /**
     * @dev Builds a request's pool-creation proposal, in execution order: the pool's role grants, `createPool`, the
     * comptroller's `acceptOwnership`, `addPool`, each market's listing with its seed, and each loan market's Hub
     * registration
     * @param requestId The request
     * @param params The pool to create
     * @return proposal The proposal's actions
     */
    function _poolCreationProposal(
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params
    ) internal view returns (Proposal memory proposal) {
        SpokePoolFactory factory = SpokePoolFactory(SPOKE_POOL_MANAGER.factory());
        (address comptroller, address[] memory vTokens) = factory.predictAddresses(requestId, params.markets.length);
        proposal = _newProposal(POOL_CREATION_ACTIONS + MAX_ACTIONS_PER_MARKET * vTokens.length);

        _addRoleGrants(proposal, comptroller);
        // Canonical signature of `SpokePoolFactory.createPool`; it must change with `PoolParams` and `MarketParams`
        _addAction(
            proposal,
            address(factory),
            "createPool(uint256,(string,uint256,uint256,uint256,"
            "(address,address,string,string,uint8,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)[]))",
            abi.encode(requestId, params)
        );
        _addAction(proposal, comptroller, "acceptOwnership()", "");
        _addAction(
            proposal,
            SPOKE_POOL_MANAGER.POOL_REGISTRY(),
            "addPool(string,address,uint256,uint256,uint256)",
            abi.encode(
                params.name,
                comptroller,
                params.closeFactor,
                params.liquidationIncentive,
                params.minLiquidatableCollateral
            )
        );
        _addMarkets(proposal, comptroller, params.markets, vTokens);
    }

    /**
     * @dev Builds a request's proposal that adds markets to its pool, in execution order: `addMarkets`, each market's
     * listing with its seed, and each loan market's Hub registration
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param params The markets to add, in `params.markets`
     * @return proposal The proposal's actions
     */
    function _marketAdditionProposal(
        uint256 requestId,
        address comptroller,
        SpokePoolManagerStorage.PoolParams calldata params
    ) internal view returns (Proposal memory proposal) {
        SpokePoolFactory factory = SpokePoolFactory(SPOKE_POOL_MANAGER.factory());
        (, address[] memory vTokens) = factory.predictAddresses(requestId, params.markets.length);
        proposal = _newProposal(1 + MAX_ACTIONS_PER_MARKET * vTokens.length);

        // Canonical signature of `SpokePoolFactory.addMarkets`; it must change with `PoolParams` and `MarketParams`
        _addAction(
            proposal,
            address(factory),
            "addMarkets(uint256,address,(string,uint256,uint256,uint256,"
            "(address,address,string,string,uint8,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)[]))",
            abi.encode(requestId, comptroller, params)
        );
        _addMarkets(proposal, comptroller, params.markets, vTokens);
    }

    /**
     * @dev Builds an exit's first proposal: pause minting, borrowing and entering markets in one action and zero the
     * supply and borrow caps on every listed market, zero each collateral market's collateral factor and lower its liquidation
     * threshold, then open the repayment window in the manager
     * @param comptroller The pool's comptroller
     * @param liquidationThresholds The new liquidation threshold of each market, in `getAllMarkets` order
     * @return proposal The proposal's actions
     * @custom:error InvalidArrayLength is thrown when the thresholds do not match the pool's markets
     * @custom:error InvalidLiquidationThreshold is thrown when a threshold is above the market's current one
     */
    function _exitProposal(
        address comptroller,
        uint256[] calldata liquidationThresholds
    ) internal view returns (Proposal memory proposal) {
        VToken[] memory markets = SpokeComptroller(comptroller).getAllMarkets();
        uint256 marketCount = markets.length;
        if (liquidationThresholds.length != marketCount) {
            revert InvalidArrayLength();
        }
        proposal = _newProposal(marketCount + EXIT_ACTIONS);

        VToken[] memory listed = _listedMarkets(comptroller, markets);
        uint256[] memory zeroCaps = new uint256[](listed.length);
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
            _addExitCollateralFactor(proposal, comptroller, markets[i], liquidationThresholds[i]);
        }
        _addAction(proposal, address(SPOKE_POOL_MANAGER), "startWindDown(address)", abi.encode(comptroller));
    }

    /**
     * @dev Builds an exit's second proposal: zero every collateral market's collateral factor and liquidation
     * threshold, and enable forced liquidation on every loan market with borrows
     * @param comptroller The pool's comptroller
     * @return proposal The proposal's actions
     * @custom:error NoOutstandingBorrows is thrown when no loan market has borrows
     */
    function _forceCloseProposal(address comptroller) internal view returns (Proposal memory proposal) {
        VToken[] memory markets = _listedMarkets(comptroller, SpokeComptroller(comptroller).getAllMarkets());
        uint256 marketCount = markets.length;
        proposal = _newProposal(marketCount);
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
            revert NoOutstandingBorrows();
        }
    }

    /**
     * @dev Adds the grants a new pool needs on its comptroller: the six setters the registry drives while listing,
     * the allowlist and forced-liquidation functions no wildcard grants the executor, and the setters the manager
     * drives for the deployer
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     */
    function _addRoleGrants(Proposal memory proposal, address comptroller) internal view {
        address acm = address(SPOKE_POOL_MANAGER.accessControlManager());
        address registry = SPOKE_POOL_MANAGER.POOL_REGISTRY();
        address executor = _executor();
        address manager = address(SPOKE_POOL_MANAGER);

        _addGrant(proposal, acm, comptroller, "setCloseFactor(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setLiquidationIncentive(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setMinLiquidatableCollateral(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setCollateralFactor(address,uint256,uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setMarketSupplyCaps(address[],uint256[])", registry);
        _addGrant(proposal, acm, comptroller, "setMarketBorrowCaps(address[],uint256[])", registry);

        _addGrant(proposal, acm, comptroller, "setSupplyAllowlistEnabled(address,bool)", executor);
        _addGrant(proposal, acm, comptroller, "setAllowedSupplier(address,address,bool)", executor);
        _addGrant(proposal, acm, comptroller, "setForcedLiquidation(address,bool)", executor);

        _addGrant(proposal, acm, comptroller, "setCollateralFactor(address,uint256,uint256)", manager);
        _addGrant(proposal, acm, comptroller, "setMarketSupplyCaps(address[],uint256[])", manager);
        _addGrant(proposal, acm, comptroller, "setMarketBorrowCaps(address[],uint256[])", manager);
    }

    /**
     * @dev Adds each new market's listing with its seed, and each new loan market's Hub registration
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param markets The new markets' parameters
     * @param vTokens The new markets' predicted addresses
     */
    function _addMarkets(
        Proposal memory proposal,
        address comptroller,
        SpokePoolManagerStorage.MarketParams[] calldata markets,
        address[] memory vTokens
    ) internal view {
        address registry = SPOKE_POOL_MANAGER.POOL_REGISTRY();
        address executor = _executor();
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            _addMarketListing(proposal, registry, markets[i], vTokens[i], executor);
            if (markets[i].isLoanMarket) {
                _addHubRegistration(proposal, comptroller, markets[i].asset, vTokens[i]);
            }
        }
    }

    /**
     * @dev Adds the listing of one market: the executor approves the registry for the seed, `addMarket` mints the
     * seed's vTokens to the executor, which sends the market's `seedBurnShare` of them to the burn address and the rest
     * to the treasury. The vToken amount is exact because a new market mints at its initial exchange rate
     * @param proposal The proposal to add to
     * @param registry The registry the pool is listed in
     * @param market The market's parameters
     * @param vToken The market's predicted address
     * @param executor The timelock that executes the proposal
     */
    function _addMarketListing(
        Proposal memory proposal,
        address registry,
        SpokePoolManagerStorage.MarketParams calldata market,
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
        uint256 burned = (minted * market.seedBurnShare) / EXP_SCALE;
        _addAction(proposal, vToken, "transfer(address,uint256)", abi.encode(BURN_ADDRESS, burned));
        _addAction(proposal, vToken, "transfer(address,uint256)", abi.encode(TREASURY, minted - burned));
    }

    /**
     * @dev Adds the Hub registration of one loan market: only the asset's Hub source may supply it, and the source takes
     * it as a resource. The Hub operator adds it to the source's withdraw queue and funds it with `reallocate`
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param asset The market's underlying asset
     * @param vToken The market's predicted address
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
        _addAction(
            proposal,
            source,
            "addResource(address,address)",
            abi.encode(vToken, SPOKE_POOL_MANAGER.spokeAdapter())
        );
        // The withdraw queue is left to the Hub operator: YieldGroup cannot append to it, and a queue read at propose
        // time would revert this proposal, or drop a resource, if the queue changed during the vote
    }

    /**
     * @dev Adds the collateral factor an exit's first proposal sets on a listed collateral market: zero, with the
     * liquidation threshold lowered to the given value
     * @param proposal The proposal to add to
     * @param comptroller The pool's comptroller
     * @param market The market; loan markets and unlisted markets are skipped
     * @param liquidationThreshold The market's new liquidation threshold, scaled by 1e18
     * @custom:error InvalidLiquidationThreshold is thrown when the threshold is above the market's current one
     */
    function _addExitCollateralFactor(
        Proposal memory proposal,
        address comptroller,
        VToken market,
        uint256 liquidationThreshold
    ) internal view {
        if (SPOKE_POOL_MANAGER.isLoanMarket(address(market))) {
            return;
        }
        (bool isListed, , uint256 currentLiquidationThreshold) = SpokeComptroller(comptroller).markets(address(market));
        if (!isListed) {
            return;
        }
        if (liquidationThreshold > currentLiquidationThreshold) {
            revert InvalidLiquidationThreshold(address(market));
        }
        _addAction(
            proposal,
            comptroller,
            "setCollateralFactor(address,uint256,uint256)",
            abi.encode(market, 0, liquidationThreshold)
        );
    }

    /**
     * @dev Returns the pool a request adds markets to, or zero for a request for a new pool
     * @param requestId The request
     * @return comptroller The pool's comptroller
     */
    function _requestPool(uint256 requestId) internal view returns (address comptroller) {
        (, , comptroller, , , ) = SPOKE_POOL_MANAGER.requests(requestId);
    }

    /**
     * @dev Returns the timelock GovernorBravo executes Normal proposals through
     * @return The timelock
     */
    function _executor() internal view returns (address) {
        return _governor().proposalTimelocks(PROPOSAL_TYPE_NORMAL);
    }

    /**
     * @dev Returns the governor the proposals are submitted to, as configured in the manager
     * @return The governor
     */
    function _governor() internal view returns (IGovernorBravo) {
        return SPOKE_POOL_MANAGER.GOVERNOR_BRAVO();
    }

    /**
     * @dev Returns the listed markets of a pool
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
     * @dev Adds an ACM grant of `role` on `comptroller` to `account`
     * @param proposal The proposal to add to
     * @param acm The AccessControlManager
     * @param comptroller The contract the role is on
     * @param role The function signature the contract checks
     * @param account The account granted the role
     */
    function _addGrant(
        Proposal memory proposal,
        address acm,
        address comptroller,
        string memory role,
        address account
    ) internal pure {
        _addAction(proposal, acm, "giveCallPermission(address,string,address)", abi.encode(comptroller, role, account));
    }

    /**
     * @dev Returns an empty proposal with room for `capacity` actions; each builder sizes it for the most actions it
     * adds
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

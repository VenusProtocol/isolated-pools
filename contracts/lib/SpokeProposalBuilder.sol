// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { PoolRegistry } from "../Pool/PoolRegistry.sol";
import { SpokePoolFactory } from "../Spoke/OpenSpokePool/SpokePoolFactory.sol";
import { SpokePoolManager } from "../Spoke/OpenSpokePool/SpokePoolManager.sol";
import { SpokePoolManagerStorage } from "../Spoke/OpenSpokePool/SpokePoolManagerStorage.sol";
import { IYieldGroup } from "../Spoke/interfaces/IYieldGroup.sol";
import { VToken } from "../VToken.sol";
import { EXP_SCALE } from "./constants.sol";

/**
 * @title SpokeProposalBuilder
 * @author Venus
 * @notice Builds the actions of the governance proposals `SpokePoolManager` submits: creating a pool and adding markets
 * to a pool. The manager links it and passes itself, and the builder reads the manager's configuration through its
 * getters.
 */
library SpokeProposalBuilder {
    /// @dev Governance proposal actions being assembled, with room for a fixed number of them
    struct Proposal {
        address[] targets;
        string[] signatures;
        bytes[] calldatas;
        // Number of actions added
        uint256 length;
    }

    /// @dev Address seed vTokens are burned to, as in Venus market listing proposals
    address internal constant BURN_ADDRESS = address(0);

    /// @dev Signature of the AccessControlManager function a role grant calls
    string internal constant GIVE_CALL_PERMISSION = "giveCallPermission(address,string,address)";

    /// @dev Canonical signature of `SpokePoolFactory.createPool`; it must change with `PoolParams` and `MarketParams`
    string internal constant CREATE_POOL =
        "createPool(uint256,(string,uint256,uint256,uint256,"
        "(address,address,string,string,uint8,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)[]))";

    /// @dev Canonical signature of `SpokePoolFactory.addMarkets`; it must change with `PoolParams` and `MarketParams`
    string internal constant ADD_MARKETS =
        "addMarkets(uint256,address,(string,uint256,uint256,uint256,"
        "(address,address,string,string,uint8,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)[]))";

    /// @dev Most actions a proposal adds per new market: a loan market's listing and Hub registration
    uint256 internal constant MAX_ACTIONS_PER_MARKET = 8;

    /// @dev Actions of a pool-creation proposal besides its markets': the 8 role grants, `createPool`, `acceptOwnership`
    /// and `addPool`
    uint256 internal constant POOL_CREATION_ACTIONS = 11;

    /**
     * @notice Builds the actions of a request's pool-creation proposal, in execution order: the pool's role grants,
     *   `createPool`, the comptroller's `acceptOwnership`, `addPool`, each market's listing with its seed, and each loan
     *   market's Hub registration
     * @dev Hub source withdraw queues are read now, so a change to them before this proposal executes is overwritten
     * @param manager The manager
     * @param requestId The request
     * @param params The pool to create
     * @return targets The contract each action calls
     * @return signatures The function signature each action calls
     * @return calldatas The ABI-encoded arguments of each action
     */
    function buildPoolCreationProposal(
        SpokePoolManager manager,
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params
    ) external view returns (address[] memory targets, string[] memory signatures, bytes[] memory calldatas) {
        return _toArrays(_poolCreationProposal(manager, requestId, params));
    }

    /**
     * @notice Builds the actions of a request's proposal that adds markets to its pool, in execution order:
     *   `addMarkets`, each market's listing with its seed, and each loan market's Hub registration
     * @dev Hub source withdraw queues are read now, so a change to them before this proposal executes is overwritten
     * @param manager The manager
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param params The markets to add, in `params.markets`
     * @return targets The contract each action calls
     * @return signatures The function signature each action calls
     * @return calldatas The ABI-encoded arguments of each action
     */
    function buildMarketAdditionProposal(
        SpokePoolManager manager,
        uint256 requestId,
        address comptroller,
        SpokePoolManagerStorage.PoolParams calldata params
    ) external view returns (address[] memory targets, string[] memory signatures, bytes[] memory calldatas) {
        return _toArrays(_marketAdditionProposal(manager, requestId, comptroller, params));
    }

    /**
     * @dev Builds a request's pool-creation proposal
     * @param manager The manager
     * @param requestId The request
     * @param params The pool to create
     * @return proposal The proposal's actions
     */
    function _poolCreationProposal(
        SpokePoolManager manager,
        uint256 requestId,
        SpokePoolManagerStorage.PoolParams calldata params
    ) private view returns (Proposal memory proposal) {
        SpokePoolFactory factory = manager.factory();
        (address comptroller, address[] memory vTokens) = factory.predictAddresses(requestId, params.markets.length);
        proposal = _newProposal(POOL_CREATION_ACTIONS + MAX_ACTIONS_PER_MARKET * vTokens.length);

        _addRoleGrants(proposal, manager, comptroller);
        _add(proposal, address(factory), CREATE_POOL, abi.encode(requestId, params));
        _add(proposal, comptroller, "acceptOwnership()", "");
        _add(
            proposal,
            manager.POOL_REGISTRY(),
            "addPool(string,address,uint256,uint256,uint256)",
            abi.encode(
                params.name,
                comptroller,
                params.closeFactor,
                params.liquidationIncentive,
                params.minLiquidatableCollateral
            )
        );
        _addMarkets(proposal, manager, comptroller, params.markets, vTokens);
    }

    /**
     * @dev Builds a request's proposal that adds markets to its pool
     * @param manager The manager
     * @param requestId The request
     * @param comptroller The pool's comptroller
     * @param params The markets to add, in `params.markets`
     * @return proposal The proposal's actions
     */
    function _marketAdditionProposal(
        SpokePoolManager manager,
        uint256 requestId,
        address comptroller,
        SpokePoolManagerStorage.PoolParams calldata params
    ) private view returns (Proposal memory proposal) {
        SpokePoolFactory factory = manager.factory();
        (, address[] memory vTokens) = factory.predictAddresses(requestId, params.markets.length);
        proposal = _newProposal(1 + MAX_ACTIONS_PER_MARKET * vTokens.length);

        _add(proposal, address(factory), ADD_MARKETS, abi.encode(requestId, comptroller, params));
        _addMarkets(proposal, manager, comptroller, params.markets, vTokens);
    }

    /**
     * @dev Adds each new market's listing with its seed, and each new loan market's Hub registration
     * @param proposal The proposal to add to
     * @param manager The manager
     * @param comptroller The pool's comptroller
     * @param markets The new markets' parameters
     * @param vTokens The new markets' predicted addresses
     */
    function _addMarkets(
        Proposal memory proposal,
        SpokePoolManager manager,
        address comptroller,
        SpokePoolManagerStorage.MarketParams[] calldata markets,
        address[] memory vTokens
    ) private view {
        address registry = manager.POOL_REGISTRY();
        address executor = _executor(manager);
        uint256 marketCount = vTokens.length;
        for (uint256 i; i < marketCount; ++i) {
            _addMarketListing(proposal, manager, registry, markets[i], vTokens[i], executor);
            if (markets[i].isLoanMarket) {
                _addHubRegistration(proposal, manager, comptroller, markets[i].asset, vTokens[i]);
            }
        }
    }

    /**
     * @dev Adds the listing of one market: the executor approves the registry for the seed, `addMarket` mints the
     * seed's vTokens to the executor, which sends the market's `seedBurnShare` of them to the burn address
     * and the rest to the treasury. The vToken amount is exact because a new market mints at its initial exchange rate
     * @param proposal The proposal to add to
     * @param manager The manager
     * @param registry The registry the pool is listed in
     * @param market The market's parameters
     * @param vToken The market's predicted address
     * @param executor The timelock that executes the proposal
     */
    function _addMarketListing(
        Proposal memory proposal,
        SpokePoolManager manager,
        address registry,
        SpokePoolManagerStorage.MarketParams calldata market,
        address vToken,
        address executor
    ) private view {
        _add(proposal, market.asset, "approve(address,uint256)", abi.encode(registry, market.seed));
        _add(
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
        _add(proposal, vToken, "transfer(address,uint256)", abi.encode(BURN_ADDRESS, burned));
        _add(proposal, vToken, "transfer(address,uint256)", abi.encode(manager.TREASURY(), minted - burned));
    }

    /**
     * @dev Adds the Hub registration of one loan market: only the asset's Hub source may supply it, and the source takes
     * it as a resource and appends it to its withdraw queue. The Hub operator funds it with `reallocate`
     * @param proposal The proposal to add to
     * @param manager The manager
     * @param comptroller The pool's comptroller
     * @param asset The market's underlying asset
     * @param vToken The market's predicted address
     */
    function _addHubRegistration(
        Proposal memory proposal,
        SpokePoolManager manager,
        address comptroller,
        address asset,
        address vToken
    ) private view {
        address source = manager.spokeSources(asset);
        _add(proposal, comptroller, "setSupplyAllowlistEnabled(address,bool)", abi.encode(vToken, true));
        _add(proposal, comptroller, "setAllowedSupplier(address,address,bool)", abi.encode(vToken, source, true));
        _add(proposal, source, "addResource(address,address)", abi.encode(vToken, manager.spokeAdapter()));
        _add(
            proposal,
            source,
            "setInnerWithdrawQueue(address[])",
            abi.encode(_append(IYieldGroup(source).innerWithdrawQueue(), vToken))
        );
    }

    /**
     * @dev Adds the grants a new pool needs on its comptroller: the six setters the registry drives while listing and
     * the allowlist functions no wildcard grants the executor
     * @param proposal The proposal to add to
     * @param manager The manager
     * @param comptroller The pool's comptroller
     */
    function _addRoleGrants(Proposal memory proposal, SpokePoolManager manager, address comptroller) private view {
        address acm = address(manager.accessControlManager());
        address registry = manager.POOL_REGISTRY();
        address executor = _executor(manager);

        _addGrant(proposal, acm, comptroller, "setCloseFactor(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setLiquidationIncentive(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setMinLiquidatableCollateral(uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setCollateralFactor(address,uint256,uint256)", registry);
        _addGrant(proposal, acm, comptroller, "setMarketSupplyCaps(address[],uint256[])", registry);
        _addGrant(proposal, acm, comptroller, "setMarketBorrowCaps(address[],uint256[])", registry);

        _addGrant(proposal, acm, comptroller, "setSupplyAllowlistEnabled(address,bool)", executor);
        _addGrant(proposal, acm, comptroller, "setAllowedSupplier(address,address,bool)", executor);
    }

    /**
     * @dev Returns the timelock GovernorBravo executes the manager's proposals through
     * @param manager The manager
     * @return The timelock
     */
    function _executor(SpokePoolManager manager) private view returns (address) {
        return manager.GOVERNOR_BRAVO().proposalTimelocks(manager.NORMAL_PROPOSAL());
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
    ) private pure {
        _add(proposal, acm, GIVE_CALL_PERMISSION, abi.encode(comptroller, role, account));
    }

    /**
     * @dev Returns a copy of `list` with `item` appended
     * @param list The list to copy
     * @param item The item to append
     * @return extended The extended list
     */
    function _append(address[] memory list, address item) private pure returns (address[] memory extended) {
        uint256 length = list.length;
        extended = new address[](length + 1);
        for (uint256 i; i < length; ++i) {
            extended[i] = list[i];
        }
        extended[length] = item;
    }

    /**
     * @dev Returns an empty proposal with room for `capacity` actions; the builder sizes it for the most actions it adds
     * @param capacity The most actions the proposal holds
     * @return proposal The proposal
     */
    function _newProposal(uint256 capacity) private pure returns (Proposal memory proposal) {
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
    function _add(Proposal memory proposal, address target, string memory signature, bytes memory data) private pure {
        uint256 index = proposal.length;
        proposal.targets[index] = target;
        proposal.signatures[index] = signature;
        proposal.calldatas[index] = data;
        proposal.length = index + 1;
    }

    /**
     * @dev Returns a proposal's actions as arrays of their exact length. The arrays are the proposal's own, shortened in
     * place, so no action can be added afterwards
     * @param proposal The proposal
     * @return targets The contract each action calls
     * @return signatures The function signature each action calls
     * @return calldatas The ABI-encoded arguments of each action
     */
    function _toArrays(
        Proposal memory proposal
    ) private pure returns (address[] memory targets, string[] memory signatures, bytes[] memory calldatas) {
        targets = proposal.targets;
        signatures = proposal.signatures;
        calldatas = proposal.calldatas;
        uint256 length = proposal.length;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(targets, length)
            mstore(signatures, length)
            mstore(calldatas, length)
        }
    }
}

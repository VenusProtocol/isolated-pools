// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ISpokeBondManager } from "../interfaces/ISpokeBondManager.sol";
import { ISpokePoolProposalBuilder } from "../interfaces/ISpokePoolProposalBuilder.sol";
import { ISpokePoolManager } from "../interfaces/ISpokePoolManager.sol";

/**
 * @title SpokePoolManagerStorage
 * @author Venus
 * @notice Storage layout of `SpokePoolManager`
 */
// solhint-disable-next-line max-states-count
abstract contract SpokePoolManagerStorage is ISpokePoolManager {
    /// @inheritdoc ISpokePoolManager
    ISpokePoolProposalBuilder public proposalBuilder;

    /// @inheritdoc ISpokePoolManager
    ISpokeBondManager public bondManager;

    /// @inheritdoc ISpokePoolManager
    uint256 public windDownPeriod;

    /// @inheritdoc ISpokePoolManager
    uint256 public maxResidualPoolDebtUsd;

    /// @inheritdoc ISpokePoolManager
    PoolParams public poolDefaults;

    /// @inheritdoc ISpokePoolManager
    ProtocolMarketParams public marketDefaults;

    /// @inheritdoc ISpokePoolManager
    uint256 public requestCount;

    /// @inheritdoc ISpokePoolManager
    uint256 public buildCount;

    /// @inheritdoc ISpokePoolManager
    mapping(address => address) public hubYieldGroups;

    /// @dev Pools by comptroller; read them with `getPool`
    mapping(address => Pool) internal pools;

    /// @inheritdoc ISpokePoolManager
    mapping(address => bool) public isLoanMarket;

    /// @dev Requests by id; read them with `getRequest`
    mapping(uint256 => Request) internal requests;

    /// @inheritdoc ISpokePoolManager
    mapping(address => uint256) public latestRequestIds;

    /// @inheritdoc ISpokePoolManager
    mapping(address => address) public activePools;

    /// @inheritdoc ISpokePoolManager
    mapping(address => uint256) public escrowedAmounts;

    /// @inheritdoc ISpokePoolManager
    mapping(uint256 => bytes) public requestProposals;

    /// @inheritdoc ISpokePoolManager
    mapping(address => bytes) public exitProposals;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[29] private __gap;
}

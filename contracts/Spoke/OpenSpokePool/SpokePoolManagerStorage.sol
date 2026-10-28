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
    uint256 public requestCount;

    /// @inheritdoc ISpokePoolManager
    mapping(address asset => address yieldGroup) public hubYieldGroups;

    /// @dev Pools by comptroller; read them with `getPool`
    mapping(address comptroller => Pool pool) internal pools;

    /// @dev Requests by id; read them with `getRequest`
    mapping(uint256 requestId => Request request) internal requests;

    /// @inheritdoc ISpokePoolManager
    mapping(address deployer => uint256 requestId) public latestRequestIds;

    /// @inheritdoc ISpokePoolManager
    mapping(address deployer => address comptroller) public activePools;

    /// @inheritdoc ISpokePoolManager
    mapping(uint256 requestId => mapping(address asset => uint256 seed)) public requestSeeds;

    /// @inheritdoc ISpokePoolManager
    mapping(uint256 requestId => bytes payload) public requestProposals;

    /// @inheritdoc ISpokePoolManager
    mapping(address comptroller => bytes payload) public exitProposals;

    /// @inheritdoc ISpokePoolManager
    address[3] public supportedOracles;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[35] private __gap;
}

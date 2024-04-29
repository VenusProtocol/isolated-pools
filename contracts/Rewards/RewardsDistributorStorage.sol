// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { Comptroller } from "../Comptroller.sol";

/**
 * @title RewardsDistributorStorage
 * @author Venus
 * @dev Storage for RewardsDistributor
 */
contract RewardsDistributorStorage {
    struct RewardToken {
        // The market's last updated rewardTokenBorrowIndex or rewardTokenSupplyIndex
        uint224 index;
        // The block number the index was last updated at
        uint32 block;
        // The block number at which to stop rewards
        uint32 lastRewardingBlock;
    }

    struct TimeBasedRewardToken {
        // The market's last updated rewardTokenBorrowIndex or rewardTokenSupplyIndex
        uint224 index;
        // The block timestamp the index was last updated at
        uint256 timestamp;
        // The block timestamp at which to stop rewards
        uint256 lastRewardingTimestamp;
    }

    /// @notice The REWARD TOKEN market supply state for each market
    mapping(address => RewardToken) public rewardTokenSupplyState;

    /// @notice The REWARD TOKEN borrow index for each market for each supplier as of the last time they accrued REWARD TOKEN
    mapping(address => mapping(address => uint256)) public rewardTokenSupplierIndex;

    /// @notice The REWARD TOKEN accrued but not yet transferred to each user
    mapping(address => uint256) public rewardTokenAccrued;

    /// @notice The rate at which rewardToken is distributed to the corresponding borrow market per slot (block or second)
    mapping(address => uint256) public rewardTokenBorrowSpeeds;

    /// @notice The rate at which rewardToken is distributed to the corresponding supply market per slot (block or second)
    mapping(address => uint256) public rewardTokenSupplySpeeds;

    /// @notice The REWARD TOKEN market borrow state for each market
    mapping(address => RewardToken) public rewardTokenBorrowState;

    /// @notice The portion of REWARD TOKEN that each contributor receives per slot (block or second)
    mapping(address => uint256) public rewardTokenContributorSpeeds;

    /// @notice Last slot (block or second) at which a contributor's REWARD TOKEN rewards have been allocated
    mapping(address => uint256) public lastContributorBlock;

    /// @notice The REWARD TOKEN borrow index for each market for each borrower as of the last time they accrued REWARD TOKEN
    mapping(address => mapping(address => uint256)) public rewardTokenBorrowerIndex;

    Comptroller internal comptroller;

    IERC20Upgradeable public rewardToken;

    /// @notice The REWARD TOKEN market supply state for each market
    mapping(address => TimeBasedRewardToken) public rewardTokenSupplyStateTimeBased;

    /// @notice The REWARD TOKEN market borrow state for each market
    mapping(address => TimeBasedRewardToken) public rewardTokenBorrowStateTimeBased;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[37] private __gap;
}

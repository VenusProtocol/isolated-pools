// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VToken } from "../../VToken.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

abstract contract IRewardsDistributor {
    struct RewardToken {
        // The market's last updated rewardTokenBorrowIndex or rewardTokenSupplyIndex
        uint224 index;
        // The block number the index was last updated at
        uint32 block;
        // The block number at which to stop rewards
        uint32 lastRewardingBlock;
    }

    IERC20Upgradeable public rewardToken;

    function claimRewardToken(address holder, VToken[] memory vTokens) external virtual;
}

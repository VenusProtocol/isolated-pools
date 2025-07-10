// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import { RewardsDistributor } from "../Rewards/RewardsDistributor.sol";
import { ExponentialNoError } from "../ExponentialNoError.sol";
import { VToken } from "../VToken.sol";

library Rewards {
    /**
     * @dev Updates and distributes supply-side rewards for a market/user
     */
    function updateAndDistributeSupplyRewards(
        RewardsDistributor[] storage rewardsDistributors,
        address vToken,
        address user
    ) internal {
        uint256 rewardDistributorsCount = rewardsDistributors.length;
        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor distributor = rewardsDistributors[i];
            distributor.updateRewardTokenSupplyIndex(vToken);
            distributor.distributeSupplierRewardToken(vToken, user);
        }
    }

    function updateAndDistributeSupplyRewardsMulti(
        RewardsDistributor[] storage rewardsDistributors,
        address vToken,
        address user1,
        address user2
    ) internal {
        uint256 rewardDistributorsCount = rewardsDistributors.length;
        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor distributor = rewardsDistributors[i];
            distributor.updateRewardTokenSupplyIndex(vToken);
            distributor.distributeSupplierRewardToken(vToken, user1);
            distributor.distributeSupplierRewardToken(vToken, user2);
        }
    }

    /**
     * @dev Updates and distributes borrow-side rewards
     */
    function updateAndDistributeBorrowRewards(
        RewardsDistributor[] storage rewardsDistributors,
        address vToken,
        address user
    ) internal {
        uint256 rewardDistributorsCount = rewardsDistributors.length;

        ExponentialNoError.Exp memory borrowIndex = ExponentialNoError.Exp({ mantissa: VToken(vToken).borrowIndex() });

        for (uint256 i; i < rewardDistributorsCount; ++i) {
            RewardsDistributor distributor = rewardsDistributors[i];
            distributor.updateRewardTokenBorrowIndex(vToken, borrowIndex);
            distributor.distributeBorrowerRewardToken(vToken, user, borrowIndex);
        }
    }
}

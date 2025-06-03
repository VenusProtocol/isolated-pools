// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Action } from "../../ComptrollerInterface.sol";
import { RewardsDistributor } from "../../Rewards/RewardsDistributor.sol";

/**
 * @title IComptroller
 * @author Venus
 * @notice Combined interface for the `Comptroller` contract, including both core and view functions.
 */
interface IComptroller {
    function actionPaused(address market, Action action) external view returns (bool);

    function getRewardDistributors() external view returns (RewardsDistributor[] memory);

    function supplyCaps(address) external view returns (uint256);
}

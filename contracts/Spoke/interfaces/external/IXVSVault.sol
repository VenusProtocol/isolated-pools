// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IXVSVault
 * @author Venus
 * @notice The XVSVault functions the XVS bond accounts call
 */
interface IXVSVault {
    /**
     * @notice Stakes tokens in a vault pool; pending rewards are paid to the caller
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     * @param amount The amount to stake
     */
    function deposit(address rewardToken, uint256 pid, uint256 amount) external;

    /**
     * @notice Pays an account's pending rewards to it
     * @param account The account
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     */
    function claim(address account, address rewardToken, uint256 pid) external;

    /**
     * @notice Requests a withdrawal, executable after the pool's lock period; pending rewards are paid to the caller
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     * @param amount The amount to withdraw
     */
    function requestWithdrawal(address rewardToken, uint256 pid, uint256 amount) external;

    /**
     * @notice Sends the caller every requested withdrawal whose lock period has passed
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     */
    function executeWithdrawal(address rewardToken, uint256 pid) external;

    /**
     * @notice Returns an account's stake in a pool
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     * @param user The account
     * @return amount The staked amount, including requested withdrawals
     * @return rewardDebt The reward already accounted for
     * @return pendingWithdrawals The requested withdrawals not executed yet
     */
    function getUserInfo(
        address rewardToken,
        uint256 pid,
        address user
    ) external view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals);

    /**
     * @notice Returns the requested withdrawals of an account whose lock period has passed
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     * @param user The account
     * @return The amount `executeWithdrawal` would send
     */
    function getEligibleWithdrawalAmount(
        address rewardToken,
        uint256 pid,
        address user
    ) external view returns (uint256);
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IXVSVault
 * @author Venus
 * @notice The XVSVault functions the Spoke contracts call: staking, used by the XVS bond accounts, and the stake lock,
 * used by SpokePoolManager
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
     * @notice Locks part of an account's XVS stake so it cannot be requested for withdrawal
     * @param account The account whose stake is locked
     * @param amount The amount to lock
     */
    function lock(address account, uint256 amount) external;

    /**
     * @notice Unlocks part of an account's locked XVS stake
     * @param account The account whose stake is unlocked
     * @param amount The amount to unlock
     */
    function unlock(address account, uint256 amount) external;

    /**
     * @notice Takes locked XVS stake out of the vault
     * @param account The account whose locked stake is taken
     * @param amount The amount to take
     * @param to The receiver of the XVS
     */
    function seizeLocked(address account, uint256 amount, address to) external;

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

    /**
     * @notice Returns the XVS token
     * @return The XVS token
     */
    function xvsAddress() external view returns (address);

    /**
     * @notice Returns a vault pool
     * @param rewardToken The pool's reward token
     * @param pid The pool index
     * @return token The staked token
     * @return allocPoint The pool's share of the reward token's rewards
     * @return lastRewardBlockOrSecond When the pool's rewards were last updated
     * @return accRewardPerShare Rewards accumulated per staked token, scaled by 1e12
     * @return lockPeriod Time between a withdrawal request and its execution, in seconds
     */
    function poolInfos(
        address rewardToken,
        uint256 pid
    )
        external
        view
        returns (
            address token,
            uint256 allocPoint,
            uint256 lastRewardBlockOrSecond,
            uint256 accRewardPerShare,
            uint256 lockPeriod
        );
}

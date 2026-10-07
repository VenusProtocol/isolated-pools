// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IXVSVault
 * @author Venus
 * @notice The XVSVault functions that hold a project's stake in place
 */
interface IXVSVault {
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
}

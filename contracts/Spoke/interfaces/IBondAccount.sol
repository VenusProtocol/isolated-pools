// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title IBondAccount
 * @author Venus
 * @notice Functions, events and errors of the bond accounts, each holding one open spoke pool bond: `BondAccount`,
 * which keeps its asset idle, and the Liquidity Hub account built on it
 */
interface IBondAccount {
    /**
     * @notice Emitted when the source refuses a deposit; the amount stays in the account until a later deposit
     * @param amount The amount kept
     */
    event SourceDepositRefused(uint256 amount);

    /**
     * @notice Emitted when the account pays out: a seizure, a withdrawal, or the bond holder after release
     * @param receiver The receiver
     * @param amount The amount paid
     */
    event Paid(address indexed receiver, uint256 amount);

    /**
     * @notice Thrown when the caller is not `BOND_MANAGER`
     * @param caller The caller
     */
    error NotBondManager(address caller);

    /**
     * @notice Thrown when a seizure asks for more than the bond holds
     * @param amount The amount asked for
     * @param available What the bond holds
     */
    error InsufficientFunds(uint256 amount, uint256 available);

    /**
     * @notice Thrown when a withdrawal finds the bond holding no more than the floor it keeps
     * @param bondAssets What the bond holds
     * @param floor The floor
     */
    error NoExcessBond(uint256 bondAssets, uint256 floor);

    /// @notice Thrown when depositing in an account whose bond is released
    error BondAlreadyReleased();

    /**
     * @notice Initializes the account
     * @param bondHolder_ The bond holder, in whose name the bond is created
     * @param asset_ The bond's asset
     * @param source_ Where the asset earns yield; zero for an asset with no source
     * @custom:access Anyone, once; `BOND_MANAGER` initializes each clone in the transaction that creates it
     */
    function initialize(address bondHolder_, IERC20Upgradeable asset_, address source_) external;

    /**
     * @notice Deposits the account's balance in the source, keeping it here if refused; `BOND_MANAGER` calls it after
     *   each deposit it sends here, and to retry a refused one
     * @custom:event Emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error BondAlreadyReleased is thrown once the bond is released
     * @custom:access Only `BOND_MANAGER`
     */
    function depositInSource() external;

    /**
     * @notice Pays the bond holder at once what the bond holds beyond `floor`, its yield and extra top-ups alike
     * @param floor The bond the pool's tier requires, in the asset; the bond keeps at least this much
     * @return amount The amount paid
     * @custom:event Emits Paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error NoExcessBond is thrown when the bond holds no more than `floor`
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `BOND_MANAGER`
     */
    function withdrawExcess(uint256 floor) external returns (uint256 amount);

    /**
     * @notice Takes `amount` from the bond and pays it to `receiver` at once
     * @param amount The amount to take
     * @param receiver The receiver
     * @custom:event Emits Paid when something is paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error InsufficientFunds is thrown when the bond holds less than `amount`
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `BOND_MANAGER`
     */
    function seize(uint256 amount, address receiver) external;

    /**
     * @notice Releases the bond and pays the bond holder everything at once
     * @custom:event Emits Paid when the bond holder is paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `BOND_MANAGER`
     */
    function release() external;

    /**
     * @notice Returns what the bond holds now, net of a source loss and a Hub's exit fee; zero once released. It is read
     *   before the Hub accrues its fees, so `seize` may see a different amount
     * @return The amount, in the asset
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function currentBondAmount() external view returns (uint256);

    /**
     * @notice Returns the SpokeBondManager, the account's only caller. It is an immutable of the implementation, so
     *   every clone has the same one
     * @return The SpokeBondManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function BOND_MANAGER() external view returns (address);

    /**
     * @notice Returns the bond holder, in whose name the bond is created; paid the withdrawals and, after release, the
     *   rest
     * @return The bond holder
     */
    function bondHolder() external view returns (address);

    /**
     * @notice Returns the bond's asset
     * @return The asset
     */
    function asset() external view returns (IERC20Upgradeable);

    /**
     * @notice Returns whether the bond is released; the bond holder is then paid everything the seizures leave
     * @return Whether it is released
     */
    function released() external view returns (bool);

    /**
     * @notice Returns where the asset earns yield
     * @return The source; zero for an asset with no source
     */
    function source() external view returns (address);
}

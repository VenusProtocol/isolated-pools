// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title IBondAccount
 * @author Venus
 * @notice Functions, events and errors of the bond accounts, each holding one open spoke pool bond: `BaseBondAccount`
 * and its Idle, XVSVault and Liquidity Hub accounts
 */
interface IBondAccount {
    /**
     * @notice Emitted when the source refuses a deposit; the amount stays in the account until a later deposit
     * @param amount The amount kept
     */
    event SourceDepositRefused(uint256 amount);

    /**
     * @notice Emitted when the account pays out: a seizure, the yield, or the bond holder after release
     * @param receiver The receiver
     * @param amount The amount paid
     */
    event Paid(address indexed receiver, uint256 amount);

    /**
     * @notice Emitted when an account whose source pays later owes part of a seizure to its receiver
     * @param receiver The seizure's receiver
     * @param amount The amount owed
     */
    event PaymentOwed(address indexed receiver, uint256 amount);

    /**
     * @notice Thrown when the caller is not `BOND_MANAGER`
     * @param caller The caller
     */
    error NotBondManager(address caller);

    /**
     * @notice Thrown when a seizure asks for more than the bond holds beyond what it owes receivers
     * @param amount The amount asked for
     * @param available What the bond holds beyond what it owes receivers
     */
    error InsufficientFunds(uint256 amount, uint256 available);

    /**
     * @notice Thrown when the source cannot pay a seizure or the release at once
     * @param amount The part it cannot pay
     */
    error InsufficientLiquidity(uint256 amount);

    /**
     * @notice Initializes the account
     * @param bondHolder_ The bond holder, in whose name the bond is created
     * @param asset_ The bond's asset
     * @param source_ Where the asset earns yield; zero for an asset with no source
     * @custom:access Anyone, once; `BOND_MANAGER` initializes each clone in the transaction that creates it
     */
    function initialize(address bondHolder_, IERC20Upgradeable asset_, address source_) external;

    /**
     * @notice Adds `amount`, which `BOND_MANAGER` sent here, to the principal, then deposits the account's balance
     *   beyond what it owes receivers in the source, keeping it here if refused; nothing is deposited after release
     * @param amount The amount; zero only retries depositing the balance
     * @custom:event Emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:access Only `BOND_MANAGER`
     */
    function deposit(uint256 amount) external;

    /**
     * @notice Pays the yield, what the bond holds beyond its principal, to the bond holder; a Liquidity Hub account
     *   withdraws from the Hub as needed, an XVSVault account pays only from its balance beyond what it owes
     * @return amount The amount paid
     * @custom:event Emits Paid when something is paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function claimYield() external returns (uint256 amount);

    /**
     * @notice Takes `amount` from the bond, yield first, and pays `receiver` what is liquid now. An XVSVault account
     *   owes the rest, such as XVS in its lock period, and pays it by `payReceiver`; any other account reverts
     * @param amount The amount to take
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event Emits Paid for what is paid now and PaymentOwed for what is owed
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error InsufficientFunds is thrown when the bond holds less than `amount` beyond what it owes receivers
     * @custom:error InsufficientLiquidity is thrown when an account other than an XVSVault one cannot pay it all now
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function seize(uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Releases the bond and pays the bond holder everything at once; an XVSVault account instead requests its
     *   whole stake, and `payReceiver` pays the bond holder the balance beyond what seizures still hold, the stake
     *   included once it unlocks
     * @custom:event Emits Paid when the bond holder is paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error InsufficientLiquidity is thrown when an account other than an XVSVault one cannot pay it all now
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function release() external;

    /**
     * @notice Pays `receiver` what the account owes it, as far as matured XVSVault withdrawals and the balance allow;
     *   after release the bond holder receives the balance beyond what unpaid seizures still hold. A no-op for accounts
     *   that never owe
     * @param receiver The receiver
     * @custom:event Emits Paid for every payment
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function payReceiver(address receiver) external;

    /**
     * @notice Returns the principal the bond still covers: its principal, or less after a loss in the source or net of
     *   a Hub's exit fee
     * @return The amount, in the asset
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function value() external view returns (uint256);

    /**
     * @notice Returns the most a seizure can take: what the bond holds beyond what it owes receivers. It is read before
     *   yield accrues, so `seize` may see a different amount, such as more once unclaimed XVS rewards are claimed
     * @return The amount, in the asset
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function seizableAmount() external view returns (uint256);

    /**
     * @notice Returns the SpokeBondManager, the account's only caller. It is an immutable of the implementation, so
     *   every clone has the same one
     * @return The SpokeBondManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function BOND_MANAGER() external view returns (address);

    /**
     * @notice Returns the bond holder, in whose name the bond is created; paid the yield and, after release, the rest
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

    /**
     * @notice Returns the bond's principal, held in the account or in the source
     * @return The principal, in the asset
     */
    function principal() external view returns (uint256);
}

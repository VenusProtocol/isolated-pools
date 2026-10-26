// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { ISpokeBondManager } from "./ISpokeBondManager.sol";

/**
 * @title IBondAccount
 * @author Venus
 * @notice Functions, events and errors of `BondAccount`, the account that holds one open spoke pool bond
 */
interface IBondAccount {
    // ──────────────────────────────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────────────────────────────

    /// @notice A payment owed to a seizure's receiver
    struct Payment {
        address receiver;
        uint256 amount;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when the source refuses a deposit and the amount is kept as a pending deposit
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
     * @notice Emitted when part of a seizure cannot be paid at once
     * @param receiver The seizure's receiver
     * @param amount The amount owed
     */
    event PaymentQueued(address indexed receiver, uint256 amount);

    // ──────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Thrown when the caller is not `BOND_MANAGER`
     * @param caller The caller
     */
    error NotBondManager(address caller);

    /// @notice Thrown when there is no pending deposit to retry
    error NothingToRetry();

    /// @notice Thrown when the source refuses the pending deposit
    error SourceDepositFailed();

    /**
     * @notice Thrown when a seizure asks for more than the bond holds beyond what it owes receivers
     * @param amount The amount asked for
     * @param available What the bond holds beyond what it owes receivers
     */
    error InsufficientFunds(uint256 amount, uint256 available);

    // ──────────────────────────────────────────────────────────────────────
    // Initializer
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Initializes the account
     * @param bondHolder_ The bond holder, in whose name the bond is created
     * @param asset_ The bond's asset
     * @param source_ Where the asset earns yield; zero for an asset with no source
     * @custom:access Anyone, once; `BOND_MANAGER` initializes each clone in the transaction that creates it
     */
    function initialize(address bondHolder_, IERC20Upgradeable asset_, address source_) external;

    // ──────────────────────────────────────────────────────────────────────
    // SpokeBondManager functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Pulls `amount` into the principal and deposits it in the source, or keeps it pending if refused
     * @param amount The amount, which `BOND_MANAGER` must have approved
     * @custom:event Emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:access Only `BOND_MANAGER`
     */
    function deposit(uint256 amount) external;

    /**
     * @notice Pays the yield, everything beyond the principal, to the bond holder: from the balance beyond the pending
     *   deposit first, then the source; nothing is paid while a receiver is still owed
     * @return amount The amount paid
     * @custom:event Emits Paid when something is paid
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function claimYield() external returns (uint256 amount);

    /**
     * @notice Takes `amount` from the bond, yield first, and pays `receiver` what is liquid now, even ahead of earlier
     *   seizures still owed; the rest, such as XVS principal in its lock period, is owed and paid by `payReceivers`
     * @param amount The amount to take
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event Emits Paid for what is paid now and PaymentQueued for what is owed
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error InsufficientFunds is thrown when the bond holds less than `amount` beyond what it owes receivers
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function seize(uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Releases the bond: owed receivers are paid first, then the bond holder, now or by `payReceivers`
     * @return paidToBondHolder The amount paid to the bond holder now
     * @custom:event Emits Paid for every payment
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function release() external returns (uint256 paidToBondHolder);

    /**
     * @notice Retries depositing the pending deposit in the source
     * @return amount The amount deposited
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error NothingToRetry is thrown when there is no pending deposit
     * @custom:error SourceDepositFailed is thrown when the source refuses the deposit
     * @custom:access Only `BOND_MANAGER`
     */
    function retryDeposit() external returns (uint256 amount);

    /**
     * @notice Pays the owed receivers in order, then after release the bond holder, from what the source pays now
     * @custom:event Emits Paid for every payment
     * @custom:error NotBondManager is thrown when the caller is not `BOND_MANAGER`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `BOND_MANAGER`
     */
    function payReceivers() external;

    // ──────────────────────────────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns whether `source_` can hold `asset_` for this kind of account; with no source, it must be zero
     * @param asset_ The asset
     * @param source_ The source
     * @return Whether it fits
     */
    function isValidSource(address asset_, address source_) external view returns (bool);

    /**
     * @notice Returns the principal the bond still covers: its principal, or less after a loss in the source
     * @return The amount, in the asset
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function value() external view returns (uint256);

    /**
     * @notice Returns the most a seizure can take: what the bond holds beyond what it owes receivers. It is read before
     *   yield accrues, so it may differ from what `seize` sees by dust
     * @return The amount, in the asset
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function seizableAmount() external view returns (uint256);

    /**
     * @notice Returns the SpokeBondManager, the account's only caller; clones share their implementation's
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

    /**
     * @notice Returns the principal the source refused, held here until `retryDeposit` or a seizure spends it
     * @return The amount, in the asset
     */
    function pendingDeposit() external view returns (uint256);

    /**
     * @notice Returns the total still owed to seizure receivers
     * @return The amount, in the asset
     */
    function owedToReceivers() external view returns (uint256);

    /**
     * @notice Returns the index in `receiverPayments` of the next payment to make; every earlier one is made
     * @return The index
     */
    function nextPaymentIndex() external view returns (uint256);

    /**
     * @notice Returns a payment owed to a seizure receiver, in seizure order; a made payment has a zero amount
     * @param index The payment's index
     * @return receiver The receiver
     * @return amount The amount still owed
     */
    function receiverPayments(uint256 index) external view returns (address receiver, uint256 amount);

    /**
     * @notice Returns the kind of source this account puts the bond to work in
     * @return The source type
     */
    function sourceType() external pure returns (ISpokeBondManager.SourceType);
}

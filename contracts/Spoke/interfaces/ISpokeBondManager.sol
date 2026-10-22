// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title ISpokeBondManager
 * @author Venus
 * @notice Functions, events and errors of `SpokeBondManager`
 */
interface ISpokeBondManager {
    /// @notice Where a bond's asset earns yield
    enum SourceType {
        Idle,
        XVSVault,
        Hub
    }

    /// @notice Where an asset earns yield
    struct AssetSource {
        SourceType sourceType;
        // The XVSVault or Hub; zero for an idle asset
        address source;
    }

    /**
     * @notice Emitted when governance sets where an asset earns yield
     * @param asset The asset
     * @param oldSource The previous source
     * @param newSource The new source
     */
    event AssetSourceUpdated(address indexed asset, AssetSource oldSource, AssetSource newSource);

    /**
     * @notice Emitted when a pool's bond is created
     * @param comptroller The pool's comptroller
     * @param account The bond's account
     * @param owner The bond's owner
     * @param asset The bond's asset
     * @param amount The amount deposited
     */
    event BondCreated(
        address indexed comptroller,
        address indexed account,
        address indexed owner,
        address asset,
        uint256 amount
    );

    /**
     * @notice Emitted when a pool's bond is topped up
     * @param comptroller The pool's comptroller
     * @param amount The amount added
     */
    event BondToppedUp(address indexed comptroller, uint256 amount);

    /**
     * @notice Emitted when a bond's yield is paid to its owner
     * @param comptroller The pool's comptroller
     * @param amount The amount paid
     */
    event YieldClaimed(address indexed comptroller, uint256 amount);

    /**
     * @notice Emitted when part of a bond is seized
     * @param comptroller The pool's comptroller
     * @param receiver The receiver
     * @param amount The amount taken from the bond
     * @param paidNow The part of it paid now; the rest is paid by `payOwed`
     */
    event BondSeized(address indexed comptroller, address indexed receiver, uint256 amount, uint256 paidNow);

    /**
     * @notice Emitted when a pool's bond is released and its account detached from the pool
     * @param comptroller The pool's comptroller
     * @param account The bond's account
     * @param paidNow The amount paid to the owner now; the rest is paid by `payOwed`
     */
    event BondReleased(address indexed comptroller, address indexed account, uint256 paidNow);

    /**
     * @notice Emitted when a bond's pending deposit is retried and deposited in its source
     * @param account The bond's account
     * @param amount The amount deposited
     */
    event DepositRetried(address indexed account, uint256 amount);

    /**
     * @notice Emitted when the account implementation of a source type changes
     * @param sourceType The source type
     * @param oldImplementation The previous implementation
     * @param newImplementation The new implementation
     */
    event AccountImplementationUpdated(
        SourceType indexed sourceType,
        address indexed oldImplementation,
        address indexed newImplementation
    );

    /**
     * @notice Thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @param caller The caller
     */
    error NotSpokePoolManager(address caller);

    /**
     * @notice Thrown when a pool already has a live bond
     * @param comptroller The pool's comptroller
     */
    error BondAlreadyExists(address comptroller);

    /**
     * @notice Thrown when a pool has no live bond
     * @param comptroller The pool's comptroller
     */
    error BondNotFound(address comptroller);

    /**
     * @notice Thrown when an account was not created here
     * @param account The account
     */
    error NotBondAccount(address account);

    /**
     * @notice Thrown when a source does not fit its type or asset, or its type has no account implementation
     * @param asset The asset
     */
    error InvalidAssetSource(address asset);

    /**
     * @notice Thrown when an account implementation is for another source type
     * @param sourceType The source type it was set for
     * @param implementation The implementation
     */
    error InvalidAccountImplementation(SourceType sourceType, address implementation);

    /**
     * @notice Thrown when a source type has no account implementation yet
     * @param sourceType The source type
     */
    error AccountImplementationNotSet(SourceType sourceType);

    /**
     * @notice Creates a pool's bond: clones the account implementation of the asset's source type, pulls the bond
     *   from the caller into it and deposits it in the source. If the source refuses, the bond is kept as a pending
     *   deposit and the call still succeeds
     * @param comptroller The pool's comptroller
     * @param bondOwner The bond's owner
     * @param asset The bond's asset
     * @param amount The amount, which the caller must have approved
     * @return account The bond's account
     * @custom:event Emits BondCreated; the account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondAlreadyExists is thrown when the pool already has a live bond
     * @custom:error AccountImplementationNotSet is thrown when the asset's source type has no account implementation
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function createBond(
        address comptroller,
        address bondOwner,
        address asset,
        uint256 amount
    ) external returns (address account);

    /**
     * @notice Adds to a pool's bond: pulls the amount from the caller and deposits it in the bond's source. If the
     *   source refuses, the amount is kept as a pending deposit and the call still succeeds
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset, which the caller must have approved
     * @custom:event Emits BondToppedUp; the account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function topUp(address comptroller, uint256 amount) external;

    /**
     * @notice Pays a pool's bond yield, everything it holds beyond its principal and the seizures it owes, to its
     *   owner; from a Hub, as much as the Hub can pay now. Nothing is paid while a seizure is still owed
     * @param comptroller The pool's comptroller
     * @return amount The amount paid
     * @custom:event Emits YieldClaimed; the account emits Paid when something is paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function claimYield(address comptroller) external returns (uint256 amount);

    /**
     * @notice Takes `amount` from a pool's bond, yield first, then principal, and pays it to `receiver`. What cannot
     *   be paid now is owed and paid by `payOwed`; XVS principal waits for the XVSVault's lock period
     * @param comptroller The pool's comptroller
     * @param amount The amount to take, in the bond's asset; at most `getSeizableAmount`
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event Emits BondSeized; the account emits Paid and PaymentOwed
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error InsufficientBond is thrown by the account when the bond holds less than `amount`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function seize(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Releases a pool's bond and detaches its account from the pool. What the source can pay now goes to the
     *   seizures still owed, then to the owner; the rest is paid by `payOwed`
     * @param comptroller The pool's comptroller
     * @return paidNow The amount paid to the owner now
     * @custom:event Emits BondReleased; the account emits Paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function release(address comptroller) external returns (uint256 paidNow);

    /**
     * @notice Deposits a bond's pending deposit in its source, once the source accepts deposits again
     * @param account The bond's account
     * @custom:event Emits DepositRetried
     * @custom:error NotBondAccount is thrown when the account was not created here
     * @custom:error NothingToRetry is thrown when there is no pending deposit
     * @custom:error SourceDepositFailed is thrown when the source refuses the deposit
     * @custom:access Controlled by AccessControlManager
     */
    function retryDeposit(address account) external;

    /**
     * @notice Pays what a bond's source can pay now to the seizures it owes, in order, and after release the rest to
     *   its owner
     * @param account The bond's account, live or released
     * @custom:event The account emits Paid for every payment
     * @custom:error NotBondAccount is thrown when the account was not created here
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Controlled by AccessControlManager
     */
    function payOwed(address account) external;

    /**
     * @notice Sets where an asset earns yield; bonds already deposited keep their source
     * @param asset The asset
     * @param sourceType Idle, XVSVault or Hub
     * @param source The source, checked by the type's account implementation: an XVSVault whose XVS pool stakes the
     *   asset, a Hub for the asset, or zero for Idle
     * @custom:event Emits AssetSourceUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:error InvalidAssetSource is thrown when the type has no account implementation or the source does not
     *   fit the asset
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAssetSource(address asset, SourceType sourceType, address source) external;

    /**
     * @notice Sets the account implementation that new bonds of a source type are cloned from; existing accounts keep
     *   their code
     * @param sourceType The source type
     * @param implementation The implementation, whose `sourceType` must be `sourceType`
     * @custom:event Emits AccountImplementationUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the implementation is zero
     * @custom:error InvalidAccountImplementation is thrown when the implementation is for another source type
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAccountImplementation(SourceType sourceType, address implementation) external;

    /**
     * @notice Returns the most `seize` can take from a pool's bond, in the bond's asset: everything it holds beyond
     *   the seizures owed. It is read before the source is brought up to date, so it can differ slightly from what
     *   `seize` sees
     * @param comptroller The pool's comptroller
     * @return The amount
     * @custom:error BondNotFound is thrown when the pool has no live bond
     */
    function getSeizableAmount(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the USD value of the principal a pool's bond still covers, at ResilientOracle prices; yield and
     *   seizures owed are not counted, and a Hub position is valued net of the Hub's exit fee
     * @param comptroller The pool's comptroller
     * @return The value, scaled by 1e18
     * @custom:error BondNotFound is thrown when the pool has no live bond
     */
    function getBondValueUsd(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the account implementation that new bonds of a source type are cloned from
     * @param sourceType The source type
     * @return The implementation; zero when not set
     */
    function accountImplementations(SourceType sourceType) external view returns (address);

    /**
     * @notice Returns the live bond's account of a pool
     * @param comptroller The pool's comptroller
     * @return The account; zero when the pool has no live bond
     */
    function bondAccounts(address comptroller) external view returns (address);

    /**
     * @notice Returns whether an account was created here, including the accounts of released bonds
     * @param account The account
     * @return Whether it was created here
     */
    function isBondAccount(address account) external view returns (bool);
}

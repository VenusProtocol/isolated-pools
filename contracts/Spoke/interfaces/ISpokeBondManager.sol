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
        LiquidityHub
    }

    /// @notice How a bond asset is held and where it earns yield; the policy registry says whether pools may use it
    struct AssetConfig {
        SourceType sourceType;
        // The Hub; zero for an idle asset
        address source;
    }

    /**
     * @notice Emitted when a pool's bond is created
     * @param comptroller The pool's comptroller
     * @param account The bond's account
     * @param bondHolder The bond holder, in whose name the bond is created
     * @param asset The bond's asset
     * @param amount The amount deposited
     */
    event BondCreated(
        address indexed comptroller,
        address indexed account,
        address indexed bondHolder,
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
     * @notice Emitted when what a bond holds beyond its tier's required bond is paid to its bond holder
     * @param comptroller The pool's comptroller
     * @param amount The amount paid
     */
    event ExcessWithdrawn(address indexed comptroller, uint256 amount);

    /**
     * @notice Emitted when part of a bond is seized
     * @param comptroller The pool's comptroller
     * @param receiver The receiver
     * @param amount The amount taken from the bond and paid
     */
    event BondSeized(address indexed comptroller, address indexed receiver, uint256 amount);

    /**
     * @notice Emitted when a pool's bond is released and its account detached from the pool
     * @param comptroller The pool's comptroller
     * @param account The bond's account
     */
    event BondReleased(address indexed comptroller, address indexed account);

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
     * @notice Emitted when governance sets a bond asset's config
     * @param asset The asset
     * @param oldConfig The previous config
     * @param newConfig The new config
     */
    event AssetConfigUpdated(address indexed asset, AssetConfig oldConfig, AssetConfig newConfig);

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
     * @notice Thrown when a bond asset's source type has no account implementation, or its source does not fit the
     *   asset
     * @param asset The asset
     */
    error InvalidAssetConfig(address asset);

    /**
     * @notice Creates a pool's bond account and deposits the bond in its source, or keeps it in the account if refused
     * @param comptroller The pool's comptroller
     * @param bondHolder The bond holder, in whose name the bond is created
     * @param asset The bond's asset, which the caller checks is allowed; it must move exact amounts, with no fee on
     *   transfer
     * @param amount The amount, which the caller must have approved
     * @return account The bond's account
     * @custom:event Emits BondCreated; the account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondAlreadyExists is thrown when the pool already has a live bond
     * @custom:error InvalidAssetConfig is thrown when the asset's source type has no account implementation
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function createBond(
        address comptroller,
        address bondHolder,
        address asset,
        uint256 amount
    ) external returns (address account);

    /**
     * @notice Adds to a pool's bond and deposits it in the bond's source, or keeps it in the account if refused
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset, which the caller must have approved
     * @custom:event Emits BondToppedUp; the account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function topUp(address comptroller, uint256 amount) external;

    /**
     * @notice Pays a pool's bond holder at once what its bond holds beyond `floor`, its yield and extra top-ups alike
     * @param comptroller The pool's comptroller
     * @param floor The bond the pool's tier requires, in the asset; the bond keeps at least this much
     * @return amount The amount paid
     * @custom:event Emits ExcessWithdrawn; the account emits Paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error NoExcessBond is thrown by the account when the bond holds no more than `floor`
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function withdrawExcess(address comptroller, uint256 floor) external returns (uint256 amount);

    /**
     * @notice Takes `amount` from a pool's bond and pays it to `receiver` at once
     * @param comptroller The pool's comptroller
     * @param amount The amount to take, in the bond's asset; at most `getSeizableAmount`
     * @param receiver The receiver
     * @custom:event Emits BondSeized; the account emits Paid when something is paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error ZeroAddressNotAllowed is thrown when the receiver is zero
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error InsufficientFunds is thrown by the account when the bond holds less than `amount`
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function seize(address comptroller, uint256 amount, address receiver) external;

    /**
     * @notice Releases a pool's bond and detaches its account, which pays the bond holder everything at once
     * @param comptroller The pool's comptroller
     * @custom:event Emits BondReleased; the account emits Paid when it pays the bond holder
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors, such as the Hub's when it cannot pay it all now
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function release(address comptroller) external;

    /**
     * @notice Deposits a bond account's balance in its source, such as a refused deposit once the source accepts
     *   deposits again; a no-op when there is none
     * @param account The bond's account
     * @custom:event The account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotBondAccount is thrown when the account was not created here
     * @custom:error BondAlreadyReleased is thrown by the account once its bond is released
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function depositInSource(address account) external;

    /**
     * @notice Sets the account implementation new bonds of a source type are cloned from; existing accounts keep theirs
     * @param sourceType The source type
     * @param implementation The implementation, an account of that source type serving this contract
     * @custom:event Emits AccountImplementationUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the implementation is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAccountImplementation(SourceType sourceType, address implementation) external;

    /**
     * @notice Sets a bond asset's config; bonds already deposited keep their source
     * @param asset The asset
     * @param config The config; its source must fit the asset: a Liquidity Hub for it, or zero for Idle
     * @custom:event Emits AssetConfigUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:error InvalidAssetConfig is thrown when the type has no account implementation, or the source is not a
     *   Liquidity Hub for the asset, or not zero for Idle
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAssetConfig(address asset, AssetConfig calldata config) external;

    /**
     * @notice Returns the most `seize` can take from a pool's bond. It is read before the Hub accrues its fees, so
     *   `seize` may see a different amount
     * @param comptroller The pool's comptroller
     * @return The amount, in the bond's asset
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function getSeizableAmount(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the SpokePoolManager, the only caller of `createBond`, `topUp`, `withdrawExcess`, `seize` and
     *   `release`
     * @return The SpokePoolManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function SPOKE_POOL_MANAGER() external view returns (address);

    /**
     * @notice Returns the account implementation that new bonds of a source type are cloned from
     * @param sourceType The source type
     * @return The implementation; zero when not set
     */
    function accountImplementations(SourceType sourceType) external view returns (address);

    /**
     * @notice Returns a bond asset's config
     * @param asset The asset
     * @return sourceType The source type; Idle for an asset never set
     * @return source The Liquidity Hub; zero for Idle
     */
    function assetConfigs(address asset) external view returns (SourceType sourceType, address source);

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

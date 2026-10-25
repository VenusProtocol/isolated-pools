// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

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
        LiquidityHub
    }

    /// @notice How a bond asset is accepted and where it earns yield
    struct AssetConfig {
        SourceType sourceType;
        // The XVSVault or Hub; zero for an idle asset
        address source;
        // False stops new pools from using the asset; live pools keep working
        bool allowed;
        // Multiplies a tier's minimum bond, scaled by 1e18
        uint256 factor;
    }

    /**
     * @notice Emitted when governance sets a bond asset's config
     * @param asset The asset
     * @param oldConfig The previous config
     * @param newConfig The new config
     */
    event AssetConfigUpdated(address indexed asset, AssetConfig oldConfig, AssetConfig newConfig);

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
     * @notice Emitted when a bond's yield is paid to its bond holder
     * @param comptroller The pool's comptroller
     * @param amount The amount paid
     */
    event YieldClaimed(address indexed comptroller, uint256 amount);

    /**
     * @notice Emitted when part of a bond is seized
     * @param comptroller The pool's comptroller
     * @param receiver The receiver
     * @param amount The amount taken from the bond
     * @param paidNow The part of it paid now; the rest is paid by `payReceivers`
     */
    event BondSeized(address indexed comptroller, address indexed receiver, uint256 amount, uint256 paidNow);

    /**
     * @notice Emitted when a pool's bond is released and its account detached from the pool
     * @param comptroller The pool's comptroller
     * @param account The bond's account
     * @param paidToBondHolder The amount paid to the bond holder now; the rest is paid by `payReceivers`
     */
    event BondReleased(address indexed comptroller, address indexed account, uint256 paidToBondHolder);

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
     * @notice Thrown when a source does not fit its type or asset, its type has no account implementation, or the
     *   factor is zero
     * @param asset The asset
     */
    error InvalidAssetConfig(address asset);

    /**
     * @notice Thrown when an account implementation is for another source type or another bond manager
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
     * @notice Creates a pool's bond account and deposits the bond in its source, or keeps it pending if refused
     * @param comptroller The pool's comptroller
     * @param bondHolder The bond holder, in whose name the bond is created
     * @param asset The bond's asset, an allowed asset that moves exact amounts, with no fee on transfer
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
        address bondHolder,
        address asset,
        uint256 amount
    ) external returns (address account);

    /**
     * @notice Adds to a pool's bond and deposits it in the bond's source, or keeps it pending if refused
     * @param comptroller The pool's comptroller
     * @param amount The amount, in the bond's asset, which the caller must have approved
     * @custom:event Emits BondToppedUp; the account emits SourceDepositRefused when the source refuses the deposit
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function topUp(address comptroller, uint256 amount) external;

    /**
     * @notice Pays a pool's bond yield to its bond holder; nothing is paid while a receiver is still owed
     * @param comptroller The pool's comptroller
     * @return amount The amount paid
     * @custom:event Emits YieldClaimed, and the account emits Paid, when something is paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function claimYield(address comptroller) external returns (uint256 amount);

    /**
     * @notice Takes `amount` from a pool's bond, yield first, and pays `receiver` what is liquid now, even ahead of
     *   earlier seizures still owed; the rest is owed and paid by `payReceivers`
     * @param comptroller The pool's comptroller
     * @param amount The amount to take, in the bond's asset; at most `getSeizableAmount`
     * @param receiver The receiver
     * @return paidNow The amount paid now
     * @custom:event Emits BondSeized; the account emits Paid and PaymentQueued
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error InsufficientFunds is thrown by the account when the bond holds less than `amount`
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function seize(address comptroller, uint256 amount, address receiver) external returns (uint256 paidNow);

    /**
     * @notice Releases a pool's bond and detaches its account; owed receivers are paid first, then the bond holder
     * @param comptroller The pool's comptroller
     * @return paidToBondHolder The amount paid to the bond holder now; the rest is paid by `payReceivers`
     * @custom:event Emits BondReleased; the account emits Paid
     * @custom:error NotSpokePoolManager is thrown when the caller is not `SPOKE_POOL_MANAGER`
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Only `SPOKE_POOL_MANAGER`
     */
    function release(address comptroller) external returns (uint256 paidToBondHolder);

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
     * @notice Pays a bond's owed receivers in order, then after release its bond holder, from what the source pays now
     * @param account The bond's account, live or released
     * @custom:event The account emits Paid for every payment
     * @custom:error NotBondAccount is thrown when the account was not created here
     * @custom:error The source's errors, such as the XVSVault's while it is paused
     * @custom:access Anyone; it only pays the queue in order, then the bond holder after release
     */
    function payReceivers(address account) external;

    /**
     * @notice Sets a bond asset's config; bonds already deposited keep their source
     * @param asset The asset
     * @param config The config; its source is checked by the type's account implementation: an XVSVault whose XVS
     *   pool stakes the asset, a Liquidity Hub for the asset, or zero for Idle. Disallow the asset with `allowed`,
     *   never with a zero factor
     * @custom:event Emits AssetConfigUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the asset is zero
     * @custom:error InvalidAssetConfig is thrown when the type has no account implementation, the source does not
     *   fit the asset or the factor is zero
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAssetConfig(address asset, AssetConfig calldata config) external;

    /**
     * @notice Sets the account implementation new bonds of a source type are cloned from; existing accounts keep theirs
     * @param sourceType The source type
     * @param implementation The implementation, whose `sourceType` must be `sourceType` and whose `BOND_MANAGER` must
     *   be this contract
     * @custom:event Emits AccountImplementationUpdated
     * @custom:error ZeroAddressNotAllowed is thrown when the implementation is zero
     * @custom:error InvalidAccountImplementation is thrown when the implementation is for another source type or
     *   another bond manager
     * @custom:access Controlled by AccessControlManager, granted to the Normal Timelock
     */
    function setAccountImplementation(SourceType sourceType, address implementation) external;

    /**
     * @notice Returns the most `seize` can take from a pool's bond; read before yield accrues, it may be off by dust
     * @param comptroller The pool's comptroller
     * @return The amount, in the bond's asset
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function getSeizableAmount(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the USD value of the principal a pool's bond still covers, net of a Hub's exit fee
     * @param comptroller The pool's comptroller
     * @return The value, scaled by 1e18
     * @custom:error BondNotFound is thrown when the pool has no live bond
     * @custom:error The source's errors when it cannot report the bond's position
     */
    function getBondValueUsd(address comptroller) external view returns (uint256);

    /**
     * @notice Returns the SpokePoolManager, the only caller that moves bonds
     * @return The SpokePoolManager
     */
    // solhint-disable-next-line func-name-mixedcase
    function SPOKE_POOL_MANAGER() external view returns (address);

    /**
     * @notice Returns the oracle bonds are valued with
     * @return The ResilientOracle
     */
    // solhint-disable-next-line func-name-mixedcase
    function RESILIENT_ORACLE() external view returns (ResilientOracleInterface);

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
     * @return source The XVSVault or Liquidity Hub; zero for Idle
     * @return allowed Whether new pools may use the asset
     * @return factor The factor that multiplies a tier's minimum bond, scaled by 1e18
     */
    function assetConfigs(
        address asset
    ) external view returns (SourceType sourceType, address source, bool allowed, uint256 factor);

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

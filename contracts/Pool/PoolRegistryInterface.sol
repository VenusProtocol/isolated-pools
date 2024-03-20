// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

/**
 * @title PoolRegistryInterface
 * @author Venus
 * @notice Interface implemented by `PoolRegistry`.
 */
interface PoolRegistryInterface {
    /**
     * @notice Struct for a Venus interest rate pool.
     */
    struct VenusPool {
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
    }

    /**
     * @notice Struct for a Venus interest rate pool metadata.
     */
    struct VenusPoolMetaData {
        string category;
        string logoURL;
        string description;
    }

    /// @notice Get all pools in PoolRegistry
    function getAllPools() external view returns (VenusPool[] memory);

    /// @notice Get a pool by comptroller address
    function getPoolByComptroller(address comptroller) external view returns (VenusPool memory);

    /// @notice Get the address of the VToken contract in the Pool where the underlying token is the provided asset
    function getVTokenForAsset(address comptroller, address asset) external view returns (address);

    /// @notice Get the addresss of the Pools supported that include a market for the provided asset
    function getPoolsSupportedByAsset(address asset) external view returns (address[] memory);

    /// @notice Get the metadata of a Pool by comptroller address
    function getVenusPoolMetadata(address comptroller) external view returns (VenusPoolMetaData memory);
}

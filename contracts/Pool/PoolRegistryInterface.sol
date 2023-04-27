// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface PoolRegistryInterface {
    /**
     * @dev Struct for a Venus interest rate pool.
     */
    struct VenusPool {
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
    }

    /**
     * @dev Struct for a Venus interest rate pool metadata.
     */
    struct VenusPoolMetaData {
        string category;
        string logoURL;
        string description;
    }

    /*** get All Pools in PoolRegistry ***/
    function getAllPools() external view returns (VenusPool[] memory);

    /*** get a Pool by comptrollerAddress ***/
    function getPoolByComptroller(address comptroller) external view returns (VenusPool memory);

    /*** get VToken in the Pool for an Asset ***/
    function getVTokenForAsset(address comptroller, address asset) external view returns (address);

    /*** get Pools supported by Asset ***/
    function getPoolsSupportedByAsset(address asset) external view returns (address[] memory);

    /*** get metadata of a Pool by comptroller ***/
    function getVenusPoolMetadata(address comptroller) external view returns (VenusPoolMetaData memory);
}

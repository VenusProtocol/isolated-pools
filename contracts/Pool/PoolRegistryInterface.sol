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
     * @dev Enum for risk rating of Venus interest rate pool.
     */
    enum RiskRating {
        VERY_HIGH_RISK,
        HIGH_RISK,
        MEDIUM_RISK,
        LOW_RISK,
        MINIMAL_RISK
    }

    /**
     * @dev Struct for a Venus interest rate pool metadata.
     */
    struct VenusPoolMetaData {
        RiskRating riskRating;
        string category;
        string logoURL;
        string description;
    }

    /*** get All Pools in PoolRegistry ***/
    function getAllPools() external view virtual returns (VenusPool[] memory);

    /*** get a Pool by comptrollerAddress ***/
    function getPoolByComptroller(address comptroller) external view virtual returns (VenusPool memory);

    /*** get VToken in the Pool for an Asset ***/
    function getVTokenForAsset(address comptroller, address asset) external view virtual returns (address);

    /*** get Pools supported by Asset ***/
    function getPoolsSupportedByAsset(address asset) external view virtual returns (address[] memory);

    /*** get metadata of a Pool by comptroller ***/
    function getVenusPoolMetadata(address comptroller) external view virtual returns (VenusPoolMetaData memory);
}

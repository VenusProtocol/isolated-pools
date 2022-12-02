// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "./PoolRegistry.sol";

abstract contract PoolRegistryInterface {
    /*** get All Pools in PoolRegistry ***/
    function getAllPools() external view virtual returns (PoolRegistry.VenusPool[] memory);

    /*** get a Pool by comptrollerAddress ***/
    function getPoolByComptroller(address comptroller) external view virtual returns (PoolRegistry.VenusPool memory);

    /*** get all Bookmarks made by an account ***/
    function getBookmarks(address account) external view virtual returns (address[] memory);

    /*** get VToken in the Pool for an Asset ***/
    function getVTokenForAsset(address comptroller, address asset) external view virtual returns (address);

    /*** get Pools supported by Asset ***/
    function getPoolsSupportedByAsset(address asset) external view virtual returns (uint256[] memory);

    /*** get metadata of a Pool by comptroller ***/
    function getVenusPoolMetadata(
        address comptroller
    ) external view virtual returns (PoolRegistry.VenusPoolMetaData memory);
}

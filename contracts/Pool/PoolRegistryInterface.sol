// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "./PoolRegistry.sol";

abstract contract PoolRegistryInterface {

    /*** get All Pools in PoolRegistry ***/
    function getAllPools() virtual external view returns (PoolRegistry.VenusPool[] memory);

    /*** get a Pool by PoolIndex ***/
    function getPoolByID(uint256 index) virtual external view returns (PoolRegistry.VenusPool memory);

    /*** get a Pool by comptrollerAddress ***/
    function getPoolByComptroller(address comptroller) virtual external view returns (PoolRegistry.VenusPool memory);

    /*** get a PoolId by comptrollerAddress ***/
    function getPoolIDByComptroller(address comptroller) virtual external view returns (uint256);

    /*** get all Bookmarks made by an account ***/
    function getBookmarks(address account) virtual external view returns (address[] memory);

    /*** get VToken in the Pool for an Asset ***/
    function getVTokenForAsset(uint poolId, address asset) virtual external view returns (address);

    /*** get Pools supported by Asset ***/
    function getPoolsSupportedByAsset(address asset) virtual external view returns (uint256[] memory);

    /*** get metadata of a Pool by poolId ***/
    function getVenusPoolMetadata(uint256 poolId) virtual external view returns (PoolRegistry.VenusPoolMetaData memory);
}

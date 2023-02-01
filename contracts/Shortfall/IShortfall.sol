// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IShortfall {
    function convertibleBaseAsset() external returns (address);
}

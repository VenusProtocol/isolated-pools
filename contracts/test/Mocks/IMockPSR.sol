// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IMockProtocolShareReserve {
    function updateAssetsState(address comptroller, address asset) external;

    function acceptOwnership() external;

    function releaseFunds(address comptroller, address asset, uint256 amount) external;

    function assetsReserves(address asset) external view returns (uint256);
}

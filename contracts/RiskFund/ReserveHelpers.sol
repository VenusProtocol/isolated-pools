// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../ComptrollerInterface.sol";

contract ReserveHelpers {
    using SafeERC20 for IERC20;

    // Store the previous state for the asset transferred to ProtocolShareReserve combined(for all pools).
    mapping(address => uint256) internal assetsReserves;

    // Store the asset's reserve per pool in the ProtocolShareReserve.
    // Comptroller(pool) -> Asset -> amount
    mapping(address => mapping(address => uint256)) internal poolsAssetsReserves;

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to risk fund.
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     */
    function updateAssetsState(address comptroller, address asset) external {
        require(
            ComptrollerInterface(comptroller).isComptroller(),
            "Liquidated shares Reserves: Comptroller address invalid"
        );
        require(asset != address(0), "Liquidated shares Reserves: Asset address invalid");
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        uint256 assetReserve = assetsReserves[asset];
        if (currentBalance > assetReserve) {
            uint256 balanceDifference;
            unchecked {
                balanceDifference = currentBalance - assetReserve;
            }
            assetsReserves[asset] += balanceDifference;
            poolsAssetsReserves[comptroller][asset] += balanceDifference;
        }
    }

    /**
     * @dev Get the Amount of the asset in the risk fund for the specific pool.
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     * @return Asset's reserve in risk fund.
     */
    function getPoolAssetReserve(address comptroller, address asset) external view returns (uint256) {
        require(
            ComptrollerInterface(comptroller).isComptroller(),
            "Liquidated shares Reserves: Comptroller address invalid"
        );
        require(asset != address(0), "Liquidated shares Reserves: Asset address invalid");
        return poolsAssetsReserves[comptroller][asset];
    }
}

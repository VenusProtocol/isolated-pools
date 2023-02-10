// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../ComptrollerInterface.sol";
import "../Pool/PoolRegistryInterface.sol";

contract ReserveHelpers {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Store the previous state for the asset transferred to ProtocolShareReserve combined(for all pools).
    mapping(address => uint256) internal assetsReserves;

    // Store the asset's reserve per pool in the ProtocolShareReserve.
    // Comptroller(pool) -> Asset -> amount
    mapping(address => mapping(address => uint256)) internal poolsAssetsReserves;

    // Address of pool registry contract
    address internal poolRegistry;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[48] private __gap;

    // Event emitted after the updation of the assets reserves.
    // amount -> reserve increased by amount.
    event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount);

    /**
     * @dev Get the Amount of the asset in the risk fund for the specific pool.
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     * @return Asset's reserve in risk fund.
     */
    function getPoolAssetReserve(address comptroller, address asset) external view returns (uint256) {
        require(ComptrollerInterface(comptroller).isComptroller(), "ReserveHelpers: Comptroller address invalid");
        require(asset != address(0), "ReserveHelpers: Asset address invalid");
        return poolsAssetsReserves[comptroller][asset];
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to risk fund
     * and transferring funds to the protocol share reserve
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     */
    function updateAssetsState(address comptroller, address asset) public virtual {
        require(ComptrollerInterface(comptroller).isComptroller(), "ReserveHelpers: Comptroller address invalid");
        require(asset != address(0), "ReserveHelpers: Asset address invalid");
        require(poolRegistry != address(0), "ReserveHelpers: Pool Registry address is not set");
        require(
            PoolRegistryInterface(poolRegistry).getVTokenForAsset(comptroller, asset) != address(0),
            "ReserveHelpers: The pool doesn't support the asset"
        );

        uint256 currentBalance = IERC20Upgradeable(asset).balanceOf(address(this));
        uint256 assetReserve = assetsReserves[asset];
        if (currentBalance > assetReserve) {
            uint256 balanceDifference;
            unchecked {
                balanceDifference = currentBalance - assetReserve;
            }
            assetsReserves[asset] += balanceDifference;
            poolsAssetsReserves[comptroller][asset] += balanceDifference;
            emit AssetsReservesUpdated(comptroller, asset, balanceDifference);
        }
    }
}

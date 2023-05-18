// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ensureNonzeroAddress } from "../lib/validators.sol";
import { ComptrollerInterface } from "../ComptrollerInterface.sol";
import { PoolRegistryInterface } from "../Pool/PoolRegistryInterface.sol";

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

    /// @notice Event emitted after the update of the assets reserves.
    /// @param comptroller Pool's Comptroller address
    /// @param asset Token address
    /// @param amount An amount by which the reserves have increased
    event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount);

    /**
     * @dev Get the Amount of the asset in the risk fund for the specific pool.
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     * @return Asset's reserve in risk fund.
     * @custom:error ZeroAddressNotAllowed is thrown when asset address is zero
     */
    function getPoolAssetReserve(address comptroller, address asset) external view returns (uint256) {
        ensureNonzeroAddress(asset);
        require(ComptrollerInterface(comptroller).isComptroller(), "ReserveHelpers: Comptroller address invalid");
        return poolsAssetsReserves[comptroller][asset];
    }

    /**
     * @dev Update the reserve of the asset for the specific pool after transferring to risk fund
     * and transferring funds to the protocol share reserve
     * @param comptroller  Comptroller address(pool).
     * @param asset Asset address.
     * @custom:error ZeroAddressNotAllowed is thrown when asset address is zero
     */
    function updateAssetsState(address comptroller, address asset) public virtual {
        ensureNonzeroAddress(asset);
        require(ComptrollerInterface(comptroller).isComptroller(), "ReserveHelpers: Comptroller address invalid");
        address poolRegistry_ = poolRegistry;
        require(poolRegistry_ != address(0), "ReserveHelpers: Pool Registry address is not set");
        require(
            PoolRegistryInterface(poolRegistry_).getVTokenForAsset(comptroller, asset) != address(0),
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

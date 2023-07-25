// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import { IProtocolShareReserve } from "./IProtocolShareReserve.sol";

/**
 * @title IRiskFund
 * @author Venus
 * @notice Interface implemented by `RiskFund`.
 */
interface IRiskFund {
    function swapPoolsAssets(
        address[] calldata markets,
        uint256[] calldata amountsOutMin,
        address[][] calldata paths
    ) external returns (uint256);

    function transferReserveForAuction(address comptroller, uint256 amount) external returns (uint256);

    function updateAssetsState(
        address comptroller,
        address asset,
        IProtocolShareReserve.IncomeType kind
    ) external;

    function convertibleBaseAsset() external view returns (address);

    function getPoolsBaseAssetReserves(address comptroller) external view returns (uint256);
}

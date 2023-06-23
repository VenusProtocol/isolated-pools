// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IProtocolShareReserve {
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(
        address comptroller,
        address asset,
        IncomeType kind
    ) external;
}

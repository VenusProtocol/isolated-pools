// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IPrime {
    function isUserPrimeHolder(address user) external view returns (bool isPrimeHolder);
}

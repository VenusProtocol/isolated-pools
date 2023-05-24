// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/// @notice Thrown if the supplied address is a zero address where it is not allowed
error ZeroAddressNotAllowed();

/// @notice Checks if the provided address is nonzero, reverts otherwise
/// @param address_ Address to check
/// @custom:error ZeroAddressNotAllowed is thrown if the provided address is a zero address
function ensureNonzeroAddress(address address_) pure {
    if (address_ == address(0)) {
        revert ZeroAddressNotAllowed();
    }
}

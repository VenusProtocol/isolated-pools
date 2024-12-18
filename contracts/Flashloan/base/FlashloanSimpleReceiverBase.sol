// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IFlashloanSimpleReceiver } from "../interfaces/IFlashloanSimpleReceiver.sol";
import { VTokenInterface } from "../../VTokenInterfaces.sol";

/**
 * @title FlashloanSimpleReceiverBase
 * @author Venus
 * @notice Base contract to develop a flashloan-receiver contract.
 * @dev This contract serves as a foundational contract for implementing custom flash loan receiver logic.
 * Inheritors of this contract need to implement the `executeOperation` function defined in the `IFlashloanSimpleReceiver` interface.
 */
abstract contract FlashloanSimpleReceiverBase is IFlashloanSimpleReceiver {
    /// @notice The VToken contract used to initiate and handle flash loan
    /// @dev This is an immutable reference to the VTokenInterface, which enables the flash loan functionality.
    VTokenInterface public immutable VTOKEN;

    /// @notice Initializes the base contract by setting the VToken address
    /// @param vToken_ The address of the VToken contract that supports flash loan
    constructor(VTokenInterface vToken_) {
        VTOKEN = vToken_;
    }
}

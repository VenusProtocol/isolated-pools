// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IFlashloanReceiver } from "../interfaces/IFlashloanReceiver.sol";
import { ComptrollerInterface } from "../../ComptrollerInterface.sol";

/// @title FlashloanReceiverBase
/// @notice A base contract for implementing flashloan receiver logic.
/// @dev This abstract contract provides the necessary structure for inheriting contracts to implement the `IFlashloanReceiver` interface.
///      It stores a reference to the Comptroller contract, which manages various aspects of the protocol.
abstract contract FlashloanReceiverBase is IFlashloanReceiver {
    /// @notice The Comptroller contract that governs the protocol.
    /// @dev This immutable variable stores the address of the Comptroller contract, which cannot be changed after deployment.
    ComptrollerInterface public immutable COMPTROLLER;

    /**
     * @notice Constructor to initialize the base contract with the Comptroller address.
     * @param comptroller_ The address of the Comptroller contract that oversees the protocol.
     */
    constructor(ComptrollerInterface comptroller_) {
        COMPTROLLER = comptroller_;
    }
}

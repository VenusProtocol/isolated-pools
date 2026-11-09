// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SpokeComptroller } from "../Spoke/SpokeComptroller.sol";

/**
 * @title UpgradedSpokeComptroller
 * @notice Test-only successor implementation for the spoke beacon.
 * @dev Appends one variable and one function, which is the shape a real upgrade takes. Lets the tests prove that the
 * existing storage survives a beacon upgrade and that the appended slot starts empty. Never deployed to a network.
 */
contract UpgradedSpokeComptroller is SpokeComptroller {
    /// @notice Value only the upgraded implementation knows about
    uint256 public addedAfterUpgrade;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address poolRegistry_) SpokeComptroller(poolRegistry_) {}

    /// @notice Writes the appended variable, so a test can tell a live upgrade from a no-op
    function setAddedAfterUpgrade(uint256 value) external {
        addedAfterUpgrade = value;
    }
}

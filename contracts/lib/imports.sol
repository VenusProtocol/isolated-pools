// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

// This file is needed to make hardhat and typechain generate artifacts for
// contracts we depend on (e.g. in tests or deployments) but not use directly.
// Another way to do this would be to use hardhat-dependency-compiler, but
// since we only have a couple of dependencies, installing a separate package
// seems an overhead.

import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

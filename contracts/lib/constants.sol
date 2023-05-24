// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/// @dev The approximate number of blocks per year that is assumed by the interest rate model
uint256 constant BLOCKS_PER_YEAR = 10_512_000;

/// @dev Base unit for computations, usually used in scaling (multiplications, divisions)
uint256 constant EXP_SCALE = 1e18;

/// @dev A unit (literal one) in EXP_SCALE, usually used in additions/subtractions
uint256 constant MANTISSA_ONE = EXP_SCALE;

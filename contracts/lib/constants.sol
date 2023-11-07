// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/// @dev The approximate number of seconds per year(considered 1 second = 1 block), it is assumed by the interest rate model
uint256 constant SECONDS_PER_YEAR = 31_536_000;

/// @dev Base unit for computations, usually used in scaling (multiplications, divisions)
uint256 constant EXP_SCALE = 1e18;

/// @dev A unit (literal one) in EXP_SCALE, usually used in additions/subtractions
uint256 constant MANTISSA_ONE = EXP_SCALE;

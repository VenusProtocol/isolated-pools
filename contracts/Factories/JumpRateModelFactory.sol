// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "../JumpRateModelV2.sol";

contract JumpRateModelFactory {
  function deploy(
    uint baseRatePerYear, 
    uint multiplierPerYear, 
    uint jumpMultiplierPerYear, 
    uint kink_, 
    address owner_
  ) external returns (JumpRateModelV2) {
    JumpRateModelV2 rate = new JumpRateModelV2(
      baseRatePerYear,
      multiplierPerYear,
      jumpMultiplierPerYear,
      kink_,
      owner_
    );

    return rate;
  }
}
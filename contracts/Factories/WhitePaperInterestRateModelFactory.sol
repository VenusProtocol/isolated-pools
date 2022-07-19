// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "../WhitePaperInterestRateModel.sol";

contract WhitePaperInterestRateModelFactory {
  function deploy(
    uint256 baseRatePerYear, 
    uint256 multiplierPerYear
  ) external returns (WhitePaperInterestRateModel) {
    WhitePaperInterestRateModel rate = new WhitePaperInterestRateModel(
      baseRatePerYear,
      multiplierPerYear
    );

    return rate;
  }
}
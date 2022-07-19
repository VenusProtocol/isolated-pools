// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "../CErc20Immutable.sol";

contract CErc20ImmutableFactory {
  function deployCErc20(
    address underlying_,
    ComptrollerInterface comptroller_,
    InterestRateModel interestRateModel_,
    uint256 initialExchangeRateMantissa_,
    string memory name_,
    string memory symbol_,
    uint8 decimals_,
    address payable admin_
  ) external returns (CErc20Immutable) {
    CErc20Immutable cToken = new CErc20Immutable(
      underlying_,
      comptroller_,
      interestRateModel_,
      initialExchangeRateMantissa_,
      name_,
      symbol_,
      decimals_,
      admin_
    );

    return cToken;
  }
}
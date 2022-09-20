// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "../VBep20Immutable.sol";
import "../Governance/AccessControlManager.sol";

contract VBep20ImmutableFactory {
  function deployVBep20(
    address underlying_,
    ComptrollerInterface comptroller_,
    InterestRateModel interestRateModel_,
    uint256 initialExchangeRateMantissa_,
    string memory name_,
    string memory symbol_,
    uint8 decimals_,
    address payable admin_,
    AccessControlManager accessControlManager_,
    address payable riskFund_,
    address payable protocolShareReserve_
  ) external returns (VBep20Immutable) {
    VBep20Immutable cToken = new VBep20Immutable(
      underlying_,
      comptroller_,
      interestRateModel_,
      initialExchangeRateMantissa_,
      name_,
      symbol_,
      decimals_,
      admin_,
      accessControlManager_,
      riskFund_,
      protocolShareReserve_
    );

    return cToken;
  }
}
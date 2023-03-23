// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import "../VToken.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlManager.sol";
import "../VTokenInterfaces.sol";

contract VTokenProxyFactory {
    struct VTokenArgs {
        address underlying_;
        ComptrollerInterface comptroller_;
        InterestRateModel interestRateModel_;
        uint256 initialExchangeRateMantissa_;
        string name_;
        string symbol_;
        uint8 decimals_;
        address admin_;
        AccessControlManager accessControlManager_;
        VTokenInterface.RiskManagementInit riskManagement;
        address beaconAddress;
        uint256 reserveFactor;
    }

    event VTokenProxyDeployed(VTokenArgs args);

    function deployVTokenProxy(VTokenArgs memory input) external returns (VToken) {
        BeaconProxy proxy = new BeaconProxy(
            input.beaconAddress,
            abi.encodeWithSelector(
                VToken.initialize.selector,
                input.underlying_,
                input.comptroller_,
                input.interestRateModel_,
                input.initialExchangeRateMantissa_,
                input.name_,
                input.symbol_,
                input.decimals_,
                input.admin_,
                input.accessControlManager_,
                input.riskManagement,
                input.reserveFactor
            )
        );

        emit VTokenProxyDeployed(input);

        return VToken(address(proxy));
    }
}

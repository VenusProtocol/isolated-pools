// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import "../VBep20Immutable.sol";
import "../Governance/AccessControlManager.sol";
import "../VTokenInterfaces.sol";

contract VBep20ImmutableProxyFactory {
    struct VBep20Args {
        address underlying_;
        ComptrollerInterface comptroller_;
        InterestRateModel interestRateModel_;
        uint256 initialExchangeRateMantissa_;
        string name_;
        string symbol_;
        uint8 decimals_;
        address payable admin_;
        AccessControlManager accessControlManager_;
        VBep20Interface.RiskManagementInit riskManagement;
        address vTokenProxyAdmin_;
        VBep20Immutable tokenImplementation_;
    }

    function deployVBep20(VBep20Args memory input)
        external
        returns (VBep20Immutable)
    {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            address(input.tokenImplementation_),
            input.vTokenProxyAdmin_,
            abi.encodeWithSelector(
                input.tokenImplementation_.initializeVToken.selector,
                input.underlying_,
                input.comptroller_,
                input.interestRateModel_,
                input.initialExchangeRateMantissa_,
                input.name_,
                input.symbol_,
                input.decimals_,
                input.admin_,
                input.accessControlManager_,
                input.riskManagement
            )
        );
        return VBep20Immutable(address(proxy));
    }
}

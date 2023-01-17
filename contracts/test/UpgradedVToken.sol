// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../VToken.sol";
import "../Governance/AccessControlManager.sol";
import "../InterestRate/StableRateModel.sol";

/**
 * @title Venus's VToken Contract
 * @notice VTokens which wrap an EIP-20 underlying and are immutable
 * @author Venus
 */
contract UpgradedVToken is VToken {
    /**
     * @notice Construct a new money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     * @param admin_ Address of the administrator of this token
     * @param riskManagement Addresses of risk fund contracts
     * @param stableRateModel_ The address of the stable interest rate model
     */

    function initializeV2(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        AccessControlManager accessControlManager_,
        RiskManagementInit memory riskManagement,
        StableRateModel stableRateModel_
    ) public reinitializer(2) {
        super._initialize(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            accessControlManager_,
            riskManagement,
            stableRateModel_
        );
    }

    function getTokenUnderlying() public view returns (address) {
        return underlying;
    }

    /// @notice We added this new function to test contract upgrade
    function version() external view returns (uint256) {
        return 2;
    }
}

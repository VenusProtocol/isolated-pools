// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { AccessControlManager } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlManager.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { VTokenInterface } from "../VTokenInterfaces.sol";
import { ComptrollerViewInterface } from "../ComptrollerInterface.sol";
import { MANTISSA_ONE, EXP_SCALE } from "../lib/constants.sol";

contract AbstractSwapper {
    /// @notice Swap configuration for the tokens pair
    struct SwapConfiguration {
        /// tokenIn address
        address tokenAddressIn;
        /// tokenOut address
        address tokenAddressOut;
        /// incentive on swapping tokens
        uint256 incentive;
        /// whether the swap is enabled
        bool enabled;
    }

    /// @notice Access control manager
    AccessControlManager public accessControlManager;

    /// @notice swap configurations for the existing pairs
    mapping(address => mapping(address => SwapConfiguration)) public swapConfigurations;

    /// @notice Emitted when config is updated for tokens pair
    event SwapConfigurationUpdated(
        address tokenAddressIn,
        address tokenAddressOut,
        uint256 oldIncentive,
        uint256 newIncentive,
        bool oldEnabled,
        bool newEnabled
    );

    /// @notice Thrown when given input amount is zero
    error InsufficientInputAmount();

    /// @notice Thrown when swap is disabled or config does not exist for given pair
    error SwapConfigurationNotEnabled();

    /// @notice Thrown when underlying price is zero
    error InvalidOraclePrice();

    /// @notice Thrown when the action is prohibited by AccessControlManager
    error Unauthorized(address sender, address calledContract, string methodSignature);

    /// @param accessControlManager_ Access control manager contract address
    constructor(AccessControlManager accessControlManager_) {
        accessControlManager = accessControlManager_;
    }

    /// @notice Set the configuration for new or existing swap pair
    /// @param swapConfiguration SwapConfiguration config details to update
    /// @custom:event Emits SwapConfigurationUpdated event on success
    /// @custom:error Unauthorized error is thrown when the call is not authorized by AccessControlManager
    /// @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
    /// @custom:access Controlled by AccessControlManager
    function setSwapConfiguration(SwapConfiguration calldata swapConfiguration) external {
        bool isAllowedToCall = accessControlManager.isAllowedToCall(
            msg.sender,
            "setSwapConfiguration(SwapConfiguration)"
        );

        if (!isAllowedToCall) {
            revert Unauthorized(msg.sender, address(this), "setSwapConfiguration(SwapConfiguration)");
        }

        ensureNonzeroAddress(swapConfiguration.tokenAddressIn);
        ensureNonzeroAddress(swapConfiguration.tokenAddressOut);

        SwapConfiguration storage configuration = swapConfigurations[swapConfiguration.tokenAddressIn][
            swapConfiguration.tokenAddressOut
        ];

        uint256 oldIncentive = configuration.incentive;
        bool oldEnabled = configuration.enabled;

        configuration.tokenAddressIn = swapConfiguration.tokenAddressIn;
        configuration.tokenAddressOut = swapConfiguration.tokenAddressOut;
        configuration.incentive = swapConfiguration.incentive;
        configuration.enabled = swapConfiguration.enabled;

        emit SwapConfigurationUpdated(
            swapConfiguration.tokenAddressIn,
            swapConfiguration.tokenAddressOut,
            oldIncentive,
            swapConfiguration.incentive,
            oldEnabled,
            swapConfiguration.enabled
        );
    }
}

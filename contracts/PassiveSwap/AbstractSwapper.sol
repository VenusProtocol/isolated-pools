// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracle } from "@venusprotocol/oracle/contracts/ResilientOracle.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { VTokenInterface } from "../VTokenInterfaces.sol";
import { MANTISSA_ONE, EXP_SCALE } from "../lib/constants.sol";

contract AbstractSwapper is AccessControlledV8 {
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

    ResilientOracle public priceOracle;

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

    /**
     * @param accessControlManager_ Access control manager contract address
     */
    function initialize(address accessControlManager_, ResilientOracle priceOracle_) external initializer {
        __AccessControlled_init(accessControlManager_);
        priceOracle = priceOracle_;
    }

    /// @notice Set the configuration for new or existing swap pair
    /// @param swapConfiguration SwapConfiguration config details to update
    /// @custom:event Emits SwapConfigurationUpdated event on success
    /// @custom:error Unauthorized error is thrown when the call is not authorized by AccessControlManager
    /// @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
    /// @custom:access Controlled by AccessControlManager
    function setSwapConfiguration(SwapConfiguration calldata swapConfiguration) external {
        _checkAccessAllowed("setSwapConfiguration(SwapConfiguration)");
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

    /// @notice To get the amount of tokenAddressOut tokens sender could receive on providing amountInMantissa tokens of tokenAddressIn
    /// @param amountInMantissa Amount of tokenAddressIn
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @return amountSwappedMantissa Amount of tokenAddressIn should be transferred after swap
    /// @return amountOutMantissa Amount of the tokenAddressOut sender should receive after swap
    /// @custom:error InsufficientInputAmount error is thrown when given input amount is zero
    /// @custom:error SwapConfigurationNotEnabled is thrown when swap is disabled or config does not exist for given pair
    /// @custom:error InvalidOraclePrice is thrown when underlying price is zero
    function getAmountOut(
        uint256 amountInMantissa,
        address tokenAddressIn,
        address tokenAddressOut
    ) external view returns (uint256 amountSwappedMantissa, uint256 amountOutMantissa) {
        if (amountInMantissa == 0) {
            revert InsufficientInputAmount();
        }

        SwapConfiguration storage configuration = swapConfigurations[tokenAddressIn][tokenAddressOut];

        if (!configuration.enabled) {
            revert SwapConfigurationNotEnabled();
        }

        uint256 maxTokenOutLiquidity = VTokenInterface(tokenAddressOut).balanceOf(address(this));
        uint256 tokenInUnderlyingPrice = priceOracle.getUnderlyingPrice(tokenAddressIn);
        uint256 tokenOutUnderlyingPrice = priceOracle.getUnderlyingPrice(tokenAddressOut);

        if (tokenInUnderlyingPrice == 0 || tokenOutUnderlyingPrice == 0) {
            revert InvalidOraclePrice();
        }
        /// amount of tokenAddressOut after including incentive
        uint256 conversionWithIncentive = MANTISSA_ONE + configuration.incentive;
        /// conversion rate after considering incentive(conversionWithIncentive)
        uint256 tokenInToOutConversion = (tokenInUnderlyingPrice * conversionWithIncentive) / tokenOutUnderlyingPrice;

        amountOutMantissa = (amountInMantissa * tokenInToOutConversion) / EXP_SCALE;
        amountSwappedMantissa = amountInMantissa;

        /// If contract has less liquity for tokenAddressOut than amountOutMantissa
        if (maxTokenOutLiquidity < amountOutMantissa) {
            amountSwappedMantissa = ((maxTokenOutLiquidity * EXP_SCALE) / tokenInToOutConversion);
            amountOutMantissa = maxTokenOutLiquidity;
        }
    }
}

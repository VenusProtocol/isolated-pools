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
        /// incentive on swapping tokens in mantissa i.e 10% incentive would be 0.1 * 1e18
        uint256 incentive;
        /// whether the swap is enabled
        bool enabled;
    }

    uint256 public constant MAX_INCENTIVE = 5e18;

    ResilientOracle public priceOracle;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[49] private __gap;

    /// @notice swap configurations for the existing pairs
    /// @dev tokenAddressIn => tokenAddressOut => SwapConfiguration
    mapping(address => mapping(address => SwapConfiguration)) public swapConfigurations;

    /// @notice Emitted when config is updated for tokens pair
    event SwapConfigurationUpdated(
        address indexed tokenAddressIn,
        address indexed tokenAddressOut,
        uint256 oldIncentive,
        uint256 newIncentive,
        bool oldEnabled,
        bool newEnabled
    );
    /// @notice Emitted when price oracle address is updated
    event PriceOracleUpdated(ResilientOracle oldPriceOracle, ResilientOracle priceOracle);

    /// @notice Thrown when given input amount is zero
    error InsufficientInputAmount();

    /// @notice Thrown when swap is disabled or config does not exist for given pair
    error SwapConfigurationNotEnabled();

    /// @notice Thrown when incentive is higher than the MAX_INCENTIVE
    error IncentiveTooHigh(uint256 incentive, uint256 maxIncentive);

    /// @param accessControlManager_ Access control manager contract address
    function initialize(address accessControlManager_, ResilientOracle priceOracle_) external initializer {
        __AccessControlled_init(accessControlManager_);
        _setPriceOracle(priceOracle_);
    }

    /// @notice Sets a new price oracle
    /// @param priceOracle_ Address of the new price oracle to set
    /// @custom:access Only Governance
    function setPriceOracle(ResilientOracle priceOracle_) external onlyOwner {
        _setPriceOracle(priceOracle_);
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

        if (swapConfiguration.incentive > MAX_INCENTIVE) {
            revert IncentiveTooHigh(swapConfiguration.incentive, MAX_INCENTIVE);
        }

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

    /// @notice Sets a new price oracle
    /// @param priceOracle_ Address of the new price oracle to set
    /// @custom:event Emits PriceOracleUpdated event on success
    /// @custom:error ZeroAddressNotAllowed is thrown when pool registry address is zero
    function _setPriceOracle(ResilientOracle priceOracle_) internal {
        ensureNonzeroAddress(address(priceOracle_));

        ResilientOracle oldPriceOracle = priceOracle;
        priceOracle = priceOracle_;

        emit PriceOracleUpdated(oldPriceOracle, priceOracle);
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ResilientOracle } from "@venusprotocol/oracle/contracts/ResilientOracle.sol";

import { MANTISSA_ONE, EXP_SCALE } from "../lib/constants.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { VTokenInterface } from "../VTokenInterfaces.sol";

contract AbstractSwapper is AccessControlledV8 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

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

    /// @notice swap configurations for the existing pairs
    /// @dev tokenAddressIn => tokenAddressOut => SwapConfiguration
    mapping(address => mapping(address => SwapConfiguration)) public swapConfigurations;

    /// @notice Address at all incoming tokens are transferred to
    address public destinationAddress;

    /// @notice Boolean of if swap is paused
    bool public swapPaused;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[47] private __gap;

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

    /// @notice Emitted when exact amount of tokens are swapped for tokens
    event SwapExactTokensForTokens(uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when tokens are swapped for exact amount of tokens
    event SwapTokensForExactTokens(uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when exact amount of tokens are swapped for tokens, for deflationary tokens
    event SwapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when tokens are swapped for exact amount of tokens, for deflationary tokens
    event SwapTokensForExactTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when swap is paused
    event SwapPaused(address sender);

    /// @notice Emitted when swap is unpaused
    event SwapResumed(address sender);

    /// @notice Event emitted when tokens are swept
    event SweepToken(address indexed token);

    /// @notice Thrown when given input amount is zero
    error InsufficientInputAmount();

    /// @notice Thrown when swap is disabled or config does not exist for given pair
    error SwapConfigurationNotEnabled();

    /// @notice Thrown when incentive is higher than the MAX_INCENTIVE
    error IncentiveTooHigh(uint256 incentive, uint256 maxIncentive);

    /// @notice Thrown when amountOut is lower than amountOutMin
    error AmountOutLowerThanMinRequired(uint256 amountOutMantissa, uint256 amountOutMinMantissa);

    /// @notice Thrown when actual amountIn or amountOut is lower than expected
    error AmountInOrAmountOutMismatched(
        uint256 actualAmountIn,
        uint256 requiredAmountIn,
        uint256 actualAmountOut,
        uint256 requiredAmountOut
    );

    /// @notice Thrown when amountIn is higher than amountInMax
    error AmountInHigherThanMax(uint256 amountInMantissa, uint256 amountInMaxMantissa);

    /// @notice Thrown when swap is paused
    error SwapTokensPaused();

    /// @notice Thrown when swap is Active
    error SwapTokensActive();

    /// @param accessControlManager_ Access control manager contract address
    function initialize(
        address accessControlManager_,
        ResilientOracle priceOracle_,
        address destinationAddress_
    ) external initializer {
        __AccessControlled_init(accessControlManager_);
        _setPriceOracle(priceOracle_);
        destinationAddress = destinationAddress_;
        swapPaused = false;
    }

    /**
     * @notice Pause swapping of tokens
     * @custom:event Emits SwapPaused on success
     * @custom:error SwapTokensPaused thrown when Swap is already paused
     * @custom:access Restricted by ACM
     */
    function pauseSwap() external {
        _checkAccessAllowed("pauseSwap()");
        _checkSwapPaused();
        swapPaused = true;
        emit SwapPaused(msg.sender);
    }

    /**
     * @notice Resume swapping of tokens.
     * @custom:event Emits SwapResumed on success
     * @custom:error SwapTokensActive thrown when Swap is already active
     * @custom:access Restricted by ACM
     */
    function resumeSwap() external {
        _checkAccessAllowed("resumeSwap()");
        if (!swapPaused) {
            revert SwapTokensActive();
        }

        swapPaused = false;
        emit SwapResumed(msg.sender);
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

    /// @notice Swap exact amount of tokenAddressIn for tokenAddressOut
    /// @dev Method does not support deflationary tokens transfer
    /// @param amountInMantissa Amount of tokenAddressIn
    /// @param amountOutMinMantissa Min amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @custom:event Emits SwapExactTokensForTokens event on success
    /// @custom:error AmountOutLowerThanMinRequired error is thrown when amount of output tokenAddressOut is less than amountOutMinMantissa
    /// @custom:error AmountInOrAmountOutMismatched error is thrown when Amount of tokenAddressIn or tokenAddressOut is lower than expected fater transfer
    function swapExactTokensForTokens(
        uint256 amountInMantissa,
        uint256 amountOutMinMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external {
        _checkSwapPaused();
        uint256 actualAmountIn;
        uint256 amountSwappedMantissa;
        uint256 actualAmountOut;
        uint256 amountOutMantissa;

        (actualAmountIn, amountSwappedMantissa, actualAmountOut, amountOutMantissa) = _swapExactTokensForTokens(
            amountInMantissa,
            amountOutMinMantissa,
            tokenAddressIn,
            tokenAddressOut,
            to
        );

        if ((actualAmountIn < amountSwappedMantissa) || (actualAmountOut < amountOutMantissa)) {
            revert AmountInOrAmountOutMismatched(
                actualAmountIn,
                amountSwappedMantissa,
                actualAmountOut,
                amountOutMantissa
            );
        }

        emit SwapExactTokensForTokens(actualAmountIn, actualAmountOut);
    }

    /// @notice Swap tokens for tokenAddressIn for exact amount of tokenAddressOut
    /// @dev Method does not support deflationary tokens transfer
    /// @param amountInMaxMantissa Max amount of tokenAddressIn
    /// @param amountOutMantissa Amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @custom:event Emits SwapTokensForExactTokens event on success
    /// @custom:error AmountInHigherThanMax error is thrown when amount of tokenAddressIn is higher than amountInMaxMantissa
    /// @custom:error AmountInOrAmountOutMismatched error is thrown when Amount of tokenAddressIn or tokenAddressOut is lower than expected fater transfer
    function swapTokensForExactTokens(
        uint256 amountInMaxMantissa,
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external {
        _checkSwapPaused();
        uint256 actualAmountIn;
        uint256 amountInMantissa;
        uint256 actualAmountOut;
        uint256 amountSwappedMantissa;

        (actualAmountIn, amountInMantissa, actualAmountOut, amountSwappedMantissa) = _swapTokensForExactTokens(
            amountInMaxMantissa,
            amountOutMantissa,
            tokenAddressIn,
            tokenAddressOut,
            to
        );

        if ((actualAmountIn < amountInMantissa) || (actualAmountOut < amountSwappedMantissa)) {
            revert AmountInOrAmountOutMismatched(
                actualAmountIn,
                amountInMantissa,
                actualAmountOut,
                amountSwappedMantissa
            );
        }

        emit SwapTokensForExactTokens(actualAmountIn, actualAmountOut);
    }

    /// @notice Swap exact amount of tokenAddressIn for tokenAddressOut
    /// @param amountInMantissa Amount of tokenAddressIn
    /// @param amountOutMinMantissa Min amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @custom:event Emits SwapExactTokensForTokensSupportingFeeOnTransferTokens event on success
    /// @custom:error AmountOutLowerThanMinRequired error is thrown when amount of output tokenAddressOut is less than amountOutMinMantissa
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountInMantissa,
        uint256 amountOutMinMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external {
        _checkSwapPaused();
        uint256 actualAmountIn;
        uint256 amountSwappedMantissa;
        uint256 actualAmountOut;
        uint256 amountOutMantissa;

        (actualAmountIn, amountSwappedMantissa, actualAmountOut, amountOutMantissa) = _swapExactTokensForTokens(
            amountInMantissa,
            amountOutMinMantissa,
            tokenAddressIn,
            tokenAddressOut,
            to
        );

        emit SwapExactTokensForTokensSupportingFeeOnTransferTokens(actualAmountIn, actualAmountOut);
    }

    /// @notice Swap tokens for tokenAddressIn for exact amount of tokenAddressOut
    /// @param amountInMaxMantissa Max amount of tokenAddressIn
    /// @param amountOutMantissa Amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @custom:event Emits SwapTokensForExactTokensSupportingFeeOnTransferTokens event on success
    /// @custom:error AmountInHigherThanMax error is thrown when amount of tokenAddressIn is higher than amountInMaxMantissa
    function swapTokensForExactTokensSupportingFeeOnTransferTokens(
        uint256 amountInMaxMantissa,
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    ) external {
        _checkSwapPaused();
        uint256 actualAmountIn;
        uint256 amountInMantissa;
        uint256 actualAmountOut;
        uint256 amountSwappedMantissa;

        (actualAmountIn, amountInMantissa, actualAmountOut, amountSwappedMantissa) = _swapTokensForExactTokens(
            amountInMaxMantissa,
            amountOutMantissa,
            tokenAddressIn,
            tokenAddressOut,
            to
        );

        emit SwapTokensForExactTokensSupportingFeeOnTransferTokens(actualAmountIn, actualAmountOut);
    }

    /// @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to admin (timelock)
    /// @param tokenAddress The address of the ERC-20 token to sweep
    /// @custom:event Emits SweepToken event on success
    /// @custom:access Only Governance
    function sweepToken(address tokenAddress) external onlyOwner {
        preSweepToken(tokenAddress);
        
        IERC20Upgradeable token = IERC20Upgradeable(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);

        emit SweepToken(address(token));
        
        postSwapHook(tokenAddress);
    }

    /// @notice Get the balance for specific token 
    /// @param token Address od the token
    function balanceOf(address token) public virtual {}

    /// @notice Operations to perform before sweepToken
    /// @param token Address od the token
    function preSweepToken(address token) public virtual {}

    /// @notice Operations to perform after sweepToken
    /// @param token Address od the token
    function postSwapHook(address token) public virtual {}

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
    ) public view returns (uint256 amountSwappedMantissa, uint256 amountOutMantissa) {
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

    /// @notice To get the amount of tokenAddressIn tokens sender would send on receiving amountOutMantissa tokens of tokenAddressOut
    /// @param amountOutMantissa Amount of tokenAddressOut user wants to receive
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @return amountSwappedMantissa Amount of tokenAddressOut should be transferred after swap
    /// @return amountInMantissa Amount of the tokenAddressIn sender would send to contract before swap
    /// @custom:error InsufficientInputAmount error is thrown when given input amount is zero
    /// @custom:error SwapConfigurationNotEnabled is thrown when swap is disabled or config does not exist for given pair
    function getAmountIn(
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut
    ) public view returns (uint256 amountSwappedMantissa, uint256 amountInMantissa) {
        if (amountOutMantissa == 0) {
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

        amountInMantissa = ((amountOutMantissa * EXP_SCALE) / tokenInToOutConversion);
        amountSwappedMantissa = amountOutMantissa;

        /// If contract has less liquity for tokenAddressOut than amountOutMantissa
        if (maxTokenOutLiquidity < amountOutMantissa) {
            amountInMantissa = ((maxTokenOutLiquidity * EXP_SCALE) / tokenInToOutConversion);
            amountSwappedMantissa = maxTokenOutLiquidity;
        }
    }

    /// @notice Swap exact amount of tokenAddressIn for tokenAddressOut
    /// @param amountInMantissa Amount of tokenAddressIn
    /// @param amountOutMinMantissa Min amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @return actualAmountIn Actual amount of tokenAddressIn transferred
    /// @return amountSwappedMantissa Amount of tokenAddressIn supposed to get transferred
    /// @return actualAmountOut Actual amount of tokenAddressOut transferred
    /// @return amountOutMantissa Amount of tokenAddressOut supposed to get transferred
    /// @custom:error AmountOutLowerThanMinRequired error is thrown when amount of output tokenAddressOut is less than amountOutMinMantissa
    function _swapExactTokensForTokens(
        uint256 amountInMantissa,
        uint256 amountOutMinMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    )
        internal
        returns (
            uint256 actualAmountIn,
            uint256 amountSwappedMantissa,
            uint256 actualAmountOut,
            uint256 amountOutMantissa
        )
    {
        (amountSwappedMantissa, amountOutMantissa) = getAmountOut(amountInMantissa, tokenAddressIn, tokenAddressOut);

        if (amountOutMantissa < amountOutMinMantissa) {
            revert AmountOutLowerThanMinRequired(amountOutMantissa, amountOutMinMantissa);
        }

        IERC20Upgradeable tokenIn = IERC20Upgradeable(tokenAddressIn);
        uint256 balanceBeforeDestination = tokenIn.balanceOf(destinationAddress);
        tokenIn.safeTransferFrom(msg.sender, destinationAddress, amountSwappedMantissa);
        uint256 balanceAfterDestination = tokenIn.balanceOf(destinationAddress);

        IERC20Upgradeable tokenOut = IERC20Upgradeable(tokenAddressOut);
        uint256 balanceBeforeTo = tokenOut.balanceOf(to);
        tokenOut.safeTransfer(to, amountOutMantissa);
        uint256 balanceAfterTo = tokenOut.balanceOf(to);

        unchecked {
            actualAmountIn = balanceAfterDestination - balanceBeforeDestination;
            actualAmountOut = balanceAfterTo - balanceBeforeTo;
        }
    }

    /// @notice Swap tokens for tokenAddressIn for exact amount of tokenAddressOut
    /// @param amountInMaxMantissa Max amount of tokenAddressIn
    /// @param amountOutMantissa Amount of tokenAddressOut required as output
    /// @param tokenAddressIn Address of the token to swap
    /// @param tokenAddressOut Address of the token to get after swap
    /// @param to Address of the tokenAddressOut receiver
    /// @return actualAmountIn Actual amount of tokenAddressIn transferred
    /// @return amountInMantissa Amount of tokenAddressIn supposed to get transferred
    /// @return actualAmountOut Actual amount of tokenAddressOut transferred
    /// @return amountSwappedMantissa Amount of tokenAddressOut supposed to get transferred
    /// @custom:error AmountInHigherThanMax error is thrown when amount of tokenAddressIn is higher than amountInMaxMantissa
    function _swapTokensForExactTokens(
        uint256 amountInMaxMantissa,
        uint256 amountOutMantissa,
        address tokenAddressIn,
        address tokenAddressOut,
        address to
    )
        internal
        returns (
            uint256 actualAmountIn,
            uint256 amountInMantissa,
            uint256 actualAmountOut,
            uint256 amountSwappedMantissa
        )
    {
        (amountSwappedMantissa, amountInMantissa) = getAmountIn(amountOutMantissa, tokenAddressIn, tokenAddressOut);

        if (amountInMantissa > amountInMaxMantissa) {
            revert AmountInHigherThanMax(amountInMantissa, amountInMaxMantissa);
        }

        IERC20Upgradeable tokenIn = IERC20Upgradeable(tokenAddressIn);
        uint256 balanceBeforeDestination = tokenIn.balanceOf(destinationAddress);
        tokenIn.safeTransferFrom(msg.sender, destinationAddress, amountInMantissa);
        uint256 balanceAfterDestination = tokenIn.balanceOf(destinationAddress);

        IERC20Upgradeable tokenOut = IERC20Upgradeable(tokenAddressOut);
        uint256 balanceBeforeTo = tokenOut.balanceOf(to);
        tokenOut.safeTransfer(to, amountSwappedMantissa);
        uint256 balanceAfterTo = tokenOut.balanceOf(to);

        unchecked {
            actualAmountIn = balanceAfterDestination - balanceBeforeDestination;
            actualAmountOut = balanceAfterTo - balanceBeforeTo;
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

    /// @notice To check, is swapping paused
    function _checkSwapPaused() internal view {
        if (swapPaused) {
            revert SwapTokensPaused();
        }
    }
}

// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title INativeTokenGateway
 * @author Venus
 * @notice Interface for NativeTokenGateway contract
 */
interface INativeTokenGateway {
    /**
     * @dev Emitted when native currency is supplied
     */
    event TokensWrappedAndSupplied(address indexed sender, address indexed vToken, uint256 amount);

    /**
     * @dev Emitted when tokens are redeemed and then unwrapped to be sent to user
     */
    event TokensRedeemedAndUnwrapped(address indexed sender, address indexed vToken, uint256 amount);

    /**
     * @dev Emitted when native tokens are borrowed and unwrapped
     */
    event TokensBorrowedAndUnwrapped(address indexed sender, address indexed vToken, uint256 amount);

    /**
     * @dev Emitted when native currency is wrapped and repaid
     */
    event TokensWrappedAndRepaid(address indexed sender, address indexed vToken, uint256 amount);

    /**
     * @dev Emitted when token is swept from the contract
     */
    event SweepToken(address indexed token, address indexed receiver, uint256 amount);

    /**
     * @dev Emitted when native asset is swept from the contract
     */
    event SweepNative(address indexed receiver, uint256 amount);

    /**
     * @notice Thrown if transfer of native token fails
     */
    error NativeTokenTransferFailed();

    /**
     * @notice Thrown if the supplied address is a zero address where it is not allowed
     */
    error ZeroAddressNotAllowed();

    /**
     * @notice Thrown if the supplied value is 0 where it is not allowed
     */
    error ZeroValueNotAllowed();

    /**
     * @dev Wrap Native Token, get wNativeToken, mint vWNativeTokens, and supply to the market
     * @param minter The address on behalf of whom the supply is performed
     */
    function wrapAndSupply(address minter) external payable;

    /**
     * @dev Redeem vWNativeTokens, unwrap to Native Token, and send to the user
     * @param redeemAmount The amount of underlying tokens to redeem
     */
    function redeemUnderlyingAndUnwrap(uint256 redeemAmount) external;

    /**
     * @dev Redeem vWNativeTokens, unwrap to Native Token, and send to the user
     * @param redeemTokens The amount of vWNative tokens to redeem
     */
    function redeemAndUnwrap(uint256 redeemTokens) external;

    /**
     * @dev Borrow wNativeToken, unwrap to Native Token, and send to the user
     * @param amount The amount of underlying tokens to borrow
     */
    function borrowAndUnwrap(uint256 amount) external;

    /**
     * @dev Wrap Native Token, repay borrow in the market, and send remaining Native Token to the user
     */
    function wrapAndRepay() external payable;

    /**
     * @dev Sweeps input token address tokens from the contract and sends them to the owner
     */
    function sweepToken(IERC20 token) external;

    /**
     * @dev Sweeps native assets (Native Token) from the contract and sends them to the owner
     */
    function sweepNative() external;
}

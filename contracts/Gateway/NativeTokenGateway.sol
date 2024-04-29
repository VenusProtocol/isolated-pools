// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { IWrappedNative } from "./Interfaces/IWrappedNative.sol";
import { INativeTokenGateway } from "./INativeTokenGateway.sol";
import { IVToken } from "./Interfaces/IVToken.sol";

/**
 * @title NativeTokenGateway
 * @author Venus
 * @notice NativeTokenGateway contract facilitates interactions with a vToken market for native tokens (Native or wNativeToken)
 */
contract NativeTokenGateway is INativeTokenGateway, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /**
     * @notice Address of wrapped native token contract
     */
    IWrappedNative public immutable wNativeToken;

    /**
     * @notice Address of wrapped native token market
     */
    IVToken public immutable vWNativeToken;

    /**
     * @notice Constructor for NativeTokenGateway
     * @param vWrappedNativeToken Address of wrapped native token market
     */
    constructor(IVToken vWrappedNativeToken) {
        ensureNonzeroAddress(address(vWrappedNativeToken));

        vWNativeToken = vWrappedNativeToken;
        wNativeToken = IWrappedNative(vWNativeToken.underlying());
    }

    /**
     * @notice To receive Native when msg.data is empty
     */
    receive() external payable {}

    /**
     * @notice To receive Native when msg.data is not empty
     */
    fallback() external payable {}

    /**
     * @notice Wrap Native, get wNativeToken, mint vWNativeToken, and supply to the market.
     * @param minter The address on behalf of whom the supply is performed.
     * @custom:error ZeroAddressNotAllowed is thrown if address of minter is zero address
     * @custom:error ZeroValueNotAllowed is thrown if mintAmount is zero
     * @custom:event TokensWrappedAndSupplied is emitted when assets are supplied to the market
     */
    function wrapAndSupply(address minter) external payable nonReentrant {
        ensureNonzeroAddress(minter);

        uint256 mintAmount = msg.value;
        ensureNonzeroValue(mintAmount);

        wNativeToken.deposit{ value: mintAmount }();
        IERC20(address(wNativeToken)).forceApprove(address(vWNativeToken), mintAmount);

        vWNativeToken.mintBehalf(minter, mintAmount);

        IERC20(address(wNativeToken)).forceApprove(address(vWNativeToken), 0);
        emit TokensWrappedAndSupplied(minter, address(vWNativeToken), mintAmount);
    }

    /**
     * @notice Redeem vWNativeToken, unwrap to Native Token, and send to the user
     * @param redeemAmount The amount of underlying tokens to redeem
     * @custom:error ZeroValueNotAllowed is thrown if redeemAmount is zero
     * @custom:event TokensRedeemedAndUnwrapped is emitted when assets are redeemed from a market and unwrapped
     */
    function redeemUnderlyingAndUnwrap(uint256 redeemAmount) external nonReentrant {
        _redeemAndUnwrap(redeemAmount, true);
    }

    /**
     * @notice Redeem vWNativeToken, unwrap to Native Token, and send to the user
     * @param redeemTokens The amount of vWNative tokens to redeem
     * @custom:error ZeroValueNotAllowed is thrown if redeemTokens is zero
     * @custom:event TokensRedeemedAndUnwrapped is emitted when assets are redeemed from a market and unwrapped
     */
    function redeemAndUnwrap(uint256 redeemTokens) external nonReentrant {
        _redeemAndUnwrap(redeemTokens, false);
    }

    /**
     * @dev Borrow wNativeToken, unwrap to Native, and send to the user
     * @param borrowAmount The amount of underlying tokens to borrow
     * @custom:error ZeroValueNotAllowed is thrown if borrowAmount is zero
     * @custom:event TokensBorrowedAndUnwrapped is emitted when assets are borrowed from a market and unwrapped
     */
    function borrowAndUnwrap(uint256 borrowAmount) external nonReentrant {
        ensureNonzeroValue(borrowAmount);

        vWNativeToken.borrowBehalf(msg.sender, borrowAmount);

        wNativeToken.withdraw(borrowAmount);
        _safeTransferNativeTokens(msg.sender, borrowAmount);
        emit TokensBorrowedAndUnwrapped(msg.sender, address(vWNativeToken), borrowAmount);
    }

    /**
     * @notice Wrap Native, repay borrow in the market, and send remaining Native to the user
     * @custom:error ZeroValueNotAllowed is thrown if repayAmount is zero
     * @custom:event TokensWrappedAndRepaid is emitted when assets are repaid to a market and unwrapped
     */
    function wrapAndRepay() external payable nonReentrant {
        uint256 repayAmount = msg.value;
        ensureNonzeroValue(repayAmount);

        wNativeToken.deposit{ value: repayAmount }();
        IERC20(address(wNativeToken)).forceApprove(address(vWNativeToken), repayAmount);

        uint256 borrowBalanceBefore = vWNativeToken.borrowBalanceCurrent(msg.sender);
        vWNativeToken.repayBorrowBehalf(msg.sender, repayAmount);
        uint256 borrowBalanceAfter = vWNativeToken.borrowBalanceCurrent(msg.sender);

        IERC20(address(wNativeToken)).forceApprove(address(vWNativeToken), 0);

        if (borrowBalanceAfter == 0 && (repayAmount > borrowBalanceBefore)) {
            uint256 dust;
            unchecked {
                dust = repayAmount - borrowBalanceBefore;
            }

            wNativeToken.withdraw(dust);
            _safeTransferNativeTokens(msg.sender, dust);
        }
        emit TokensWrappedAndRepaid(msg.sender, address(vWNativeToken), borrowBalanceBefore - borrowBalanceAfter);
    }

    /**
     * @notice Sweeps native assets (Native) from the contract and sends them to the owner
     * @custom:event SweepNative is emitted when assets are swept from the contract
     * @custom:access Controlled by Governance
     */
    function sweepNative() external onlyOwner {
        uint256 balance = address(this).balance;

        if (balance > 0) {
            address owner_ = owner();
            _safeTransferNativeTokens(owner_, balance);
            emit SweepNative(owner_, balance);
        }
    }

    /**
     * @notice Sweeps the input token address tokens from the contract and sends them to the owner
     * @param token Address of the token
     * @custom:event SweepToken emits on success
     * @custom:access Controlled by Governance
     */
    function sweepToken(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));

        if (balance > 0) {
            address owner_ = owner();
            token.safeTransfer(owner_, balance);
            emit SweepToken(address(token), owner_, balance);
        }
    }

    /**
     * @dev Redeems tokens, unwrap them to Native Token, and send to the user
     * This function is internally called by `redeemUnderlyingAndUnwrap` and `redeemAndUnwrap`
     * @param redeemTokens The amount of tokens to be redeemed. This can refer to either the underlying tokens directly or their equivalent vTokens
     * @param isUnderlying A boolean flag indicating whether the redemption is for underlying tokens directly (`true`) or for their equivalent vTokens (`false`).
     * @custom:error ZeroValueNotAllowed is thrown if redeemTokens is zero
     * @custom:event TokensRedeemedAndUnwrapped is emitted when assets are redeemed from a market and unwrapped
     */
    function _redeemAndUnwrap(uint256 redeemTokens, bool isUnderlying) internal {
        ensureNonzeroValue(redeemTokens);

        uint256 balanceBefore = wNativeToken.balanceOf(address(this));

        if (isUnderlying) {
            vWNativeToken.redeemUnderlyingBehalf(msg.sender, redeemTokens);
        } else {
            vWNativeToken.redeemBehalf(msg.sender, redeemTokens);
        }

        uint256 balanceAfter = wNativeToken.balanceOf(address(this));
        uint256 redeemedAmount = balanceAfter - balanceBefore;
        wNativeToken.withdraw(redeemedAmount);

        _safeTransferNativeTokens(msg.sender, redeemedAmount);
        emit TokensRedeemedAndUnwrapped(msg.sender, address(vWNativeToken), redeemedAmount);
    }

    /**
     * @dev transfer Native tokens to an address, revert if it fails
     * @param to recipient of the transfer
     * @param value the amount to send
     * @custom:error NativeTokenTransferFailed is thrown if the Native token transfer fails
     */
    function _safeTransferNativeTokens(address to, uint256 value) internal {
        (bool success, ) = to.call{ value: value }(new bytes(0));

        if (!success) {
            revert NativeTokenTransferFailed();
        }
    }

    /**
     * @dev Checks if the provided address is nonzero, reverts otherwise
     * @param address_ Address to check
     * @custom:error ZeroAddressNotAllowed is thrown if the provided address is a zero address
     **/
    function ensureNonzeroAddress(address address_) internal pure {
        if (address_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }

    /**
     * @dev Checks if the provided value is nonzero, reverts otherwise
     * @param value_ Value to check
     * @custom:error ZeroValueNotAllowed is thrown if the provided value is 0
     */
    function ensureNonzeroValue(uint256 value_) internal pure {
        if (value_ == 0) {
            revert ZeroValueNotAllowed();
        }
    }
}

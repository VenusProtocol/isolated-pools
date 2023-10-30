// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { BaseXVSProxyOFT } from "./BaseXVSProxyOFT.sol";

/**
 * @title XVSProxyOFTSrc
 * @author Venus
 * @notice XVSProxyOFTSrc contract serves as a crucial component for cross-chain token transactions,
 * focusing on the source side of these transactions.
 * It monitors the total amount transferred to other chains, ensuring it complies with defined limits,
 * and provides functions for transferring tokens while maintaining control over the circulating supply on the source chain.
 */

contract XVSProxyOFTSrc is BaseXVSProxyOFT {
    using SafeERC20 for IERC20;
    /**
     * @notice total amount is transferred from this chain to other chains.
     */
    uint256 public outboundAmount;

    /**
     * @notice Emits when locked token released manually by owner.
     */
    event FallbackWithdraw(address indexed to, uint256 amount);
    /**
     * @notice Emits when stored message dropped without successfull retrying.
     */
    event DropFailedMessage(uint16 srcChainId, bytes indexed srcAddress, uint64 nonce);

    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address oracle_
    ) BaseXVSProxyOFT(tokenAddress_, sharedDecimals_, lzEndpoint_, oracle_) {}

    /** @notice Only call it when there is no way to recover the failed message.
     * `dropFailedMessage` must be called first if transaction is from remote->local chain to avoid double spending.
     * @param to_ The address to withdraw to
     * @param amount_ The amount of withdrawal
     */
    function fallbackWithdraw(address to_, uint256 amount_) external onlyOwner {
        outboundAmount -= amount_;
        _transferFrom(address(this), to_, amount_);
        emit FallbackWithdraw(to_, amount_);
    }

    /** @notice Clear failed messages from the storage.
     * @param srcChainId_ Chain id of source
     * @param srcAddress_ Address of source followed by current bridge address
     * @param nonce_ Nonce_ of the transaction
     */
    function dropFailedMessage(uint16 srcChainId_, bytes memory srcAddress_, uint64 nonce_) external onlyOwner {
        failedMessages[srcChainId_][srcAddress_][nonce_] = bytes32(0);
        emit DropFailedMessage(srcChainId_, srcAddress_, nonce_);
    }

    /**
     * @notice Returns the total circulating supply of the token on the source chain i.e (total supply - locked in this contract).
     */
    function circulatingSupply() public view override returns (uint256) {
        return innerToken.totalSupply() - outboundAmount;
    }

    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes32,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        require(from_ == _msgSender(), "ProxyOFT: owner is not send caller");
        _isEligibleToSend(from_, dstChainId_, amount_);

        uint256 amount = _transferFrom(from_, address(this), amount_);
        outboundAmount += amount;
        return amount;
    }

    function _creditTo(
        uint16 srcChainId_,
        address toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        _isEligibleToReceive(toAddress_, srcChainId_, amount_);
        outboundAmount -= amount_;
        // tokens are already in this contract, so no need to transfer
        if (toAddress_ == address(this)) {
            return amount_;
        }

        return _transferFrom(address(this), toAddress_, amount_);
    }
}

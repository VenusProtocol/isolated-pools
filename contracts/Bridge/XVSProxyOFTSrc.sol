// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { BaseXVSProxyOFT } from "./BaseXVSProxyOFT.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract XVSProxyOFTSrc is BaseXVSProxyOFT {
    using SafeERC20 for IERC20;

    IERC20 internal immutable innerToken;
    uint256 internal immutable ld2sdRate;

    // total amount is transferred from this chain to other chains, ensuring the total is less than uint64.max in sd
    uint256 public outboundAmount;

    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address accessControlManager_,
        address oracle_
    ) BaseXVSProxyOFT(sharedDecimals_, lzEndpoint_, accessControlManager_, oracle_) {
        innerToken = IERC20(tokenAddress_);

        (bool success, bytes memory data) = tokenAddress_.staticcall(abi.encodeWithSignature("decimals()"));
        require(success, "ProxyOFT: failed to get token decimals");
        uint8 decimals = abi.decode(data, (uint8));

        require(sharedDecimals_ <= decimals, "ProxyOFT: sharedDecimals must be <= decimals");
        ld2sdRate = 10**(decimals - sharedDecimals_);
    }

    /************************************************************************
     * public functions
     ************************************************************************/
    function circulatingSupply() public view override returns (uint256) {
        return innerToken.totalSupply() - outboundAmount;
    }

    function token() public view override returns (address) {
        return address(innerToken);
    }

    /************************************************************************
     * internal functions
     ************************************************************************/
    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes32,
        uint256 amount_
    ) internal override returns (uint256) {
        require(from_ == _msgSender(), "ProxyOFT: owner is not send caller");
        _isEligibleToSend(from_, dstChainId_, amount_);

        amount_ = _transferFrom(from_, address(this), amount_);

        // amount_ still may have dust if the token has transfer fee, then give the dust back to the sender
        (uint256 amount, uint256 dust) = _removeDust(amount_);
        if (dust > 0) innerToken.safeTransfer(from_, dust);

        // check total outbound amount
        outboundAmount += amount;
        uint256 cap = _sd2ld(type(uint64).max);
        require(cap >= outboundAmount, "ProxyOFT: outboundAmount overflow");

        return amount;
    }

    function _creditTo(
        uint16 srcChainId_,
        address _toAddress,
        uint256 amount_
    ) internal override returns (uint256) {
        _isEligibleToReceive(srcChainId_, amount_);
        outboundAmount -= amount_;
        // tokens are already in this contract, so no need to transfer
        if (_toAddress == address(this)) {
            return amount_;
        }

        return _transferFrom(address(this), _toAddress, amount_);
    }

    function _transferFrom(
        address from_,
        address to_,
        uint256 amount_
    ) internal override returns (uint256) {
        uint256 before = innerToken.balanceOf(to_);
        if (from_ == address(this)) {
            innerToken.safeTransfer(to_, amount_);
        } else {
            innerToken.safeTransferFrom(from_, to_, amount_);
        }
        return innerToken.balanceOf(to_) - before;
    }

    function _ld2sdRate() internal view override returns (uint256) {
        return ld2sdRate;
    }
}

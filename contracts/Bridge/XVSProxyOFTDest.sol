// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { BaseXVSProxyOFT } from "./BaseXVSProxyOFT.sol";
import { IXVS } from "./interfaces/IXVS.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract XVSProxyOFTDest is BaseXVSProxyOFT {
    using SafeERC20 for IERC20;

    IERC20 internal immutable innerToken;
    uint256 internal immutable ld2sdRate;

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
        return innerToken.totalSupply();
    }

    function token() public view override returns (address) {
        return address(innerToken);
    }

    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes32,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        require(from_ == _msgSender(), "ProxyOFT: owner is not send caller");
        _isEligibleToSend(from_, dstChainId_, amount_);
        IXVS(address(innerToken)).burn(from_, amount_);
        return amount_;
    }

    function _creditTo(
        uint16,
        address toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        IXVS(address(innerToken)).mint(toAddress_, amount_);
        return amount_;
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

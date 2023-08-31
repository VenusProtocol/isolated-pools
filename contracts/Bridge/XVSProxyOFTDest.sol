// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IXVS } from "./interfaces/IXVS.sol";
import { BaseXVSProxyOFT } from "./BaseXVSProxyOFT.sol";

contract XVSProxyOFTDest is BaseXVSProxyOFT {
    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address oracle_
    ) BaseXVSProxyOFT(tokenAddress_, sharedDecimals_, lzEndpoint_, oracle_) {}

    function circulatingSupply() public view override returns (uint256) {
        return innerToken.totalSupply();
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
        uint16 srcChainId_,
        address toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        _isEligibleToReceive(srcChainId_, amount_);
        IXVS(address(innerToken)).mint(toAddress_, amount_);
        return amount_;
    }
}

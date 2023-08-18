// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { BaseXVSProxyOFT } from "./BaseXVSProxyOFT.sol";

contract XVSProxyOFTSrc is BaseXVSProxyOFT {
    constructor(
        address tokenAddress_,
        uint8 sharedDecimals_,
        address lzEndpoint_,
        address accessControlManager_,
        address oracle_
    ) BaseXVSProxyOFT(tokenAddress_, sharedDecimals_, lzEndpoint_, accessControlManager_, oracle_) {}

    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes32 toAddress_,
        uint256 amount_
    ) internal override whenNotPaused returns (uint256) {
        _isEligibleToSend(from_, dstChainId_, amount_);
        return super._debitFrom(from_, dstChainId_, toAddress_, amount_);
    }
}

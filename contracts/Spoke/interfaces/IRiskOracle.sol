// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

interface IRiskOracle {
    function publishRiskParameterUpdate(
        string memory referenceId,
        bytes memory newValue,
        string memory updateType,
        address market,
        uint96 poolId,
        uint32 dstEid,
        bytes memory additionalData
    ) external;
}

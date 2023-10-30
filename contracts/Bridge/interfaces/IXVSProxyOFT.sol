// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title IXVSProxyOFT
 * @author Venus
 * @notice Interface implemented by `XVSProxyOFT`.
 */
interface IXVSProxyOFT {
    function transferOwnership(address addr) external;

    function setTrustedRemoteAddress(uint16 remoteChainId, bytes calldata srcAddress) external;

    function isTrustedRemote(uint16 remoteChainId, bytes calldata srcAddress) external returns (bool);
}

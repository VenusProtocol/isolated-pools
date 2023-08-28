// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IXVSBridge {
    function setOracle(address oracleAddress_) external;

    function setMaxSingleTransactionLimit(uint16 chainId_, uint256 limit_) external;

    function setMaxDailyLimit(uint16 chainId_, uint256 limit_) external;

    function setMaxSingleReceiveTransactionLimit(uint16 chainId, uint256 limit) external;

    function setMaxDailyReceiveLimit(uint16 chainId, uint256 limit) external;

    function pause() external;

    function unpause() external;

    function setWhitelist(address addr, bool val) external;

    function transferOwnership(address addr) external;

    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes calldata _config
    ) external;

    function setSendVersion(uint16 _version) external;

    function setReceiveVersion(uint16 _version) external;

    function forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) external;

    function setTrustedRemote(uint16 _remoteChainId, bytes calldata _path) external;

    function setTrustedRemoteAddress(uint16 _remoteChainId, bytes calldata _remoteAddress) external;

    function setPrecrime(address _precrime) external;

    function setMinDstGas(
        uint16 _dstChainId,
        uint16 _packetType,
        uint256 _minGas
    ) external;

    function setPayloadSizeLimit(uint16 _dstChainId, uint256 _size) external;

    function setUseCustomAdapterParams(bool _useCustomAdapterParams) external;
}

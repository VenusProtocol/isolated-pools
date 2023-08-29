// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

interface IXVSBridge {
    function transferOwnership(address addr) external;
}

contract XVSBridgeAdmin is AccessControlledV8 {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IXVSBridge public immutable XVSBridge;

    mapping(bytes4 => string) public functionRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address XVSBridge_) {
        require(XVSBridge_ != address(0), "Address must not be zero");
        XVSBridge = IXVSBridge(XVSBridge_);
        _disableInitializers();
    }

    /**
     * @notice Invoked when called function does not exist in the contract
     */
    fallback() external {
        string memory res = _getFunctionName(msg.sig);
        require(bytes(res).length != 0, "Function not found");
        _checkAccessAllowed(res);
        (bool ok, ) = address(XVSBridge).call(msg.data);
        require(ok, "call failed");
    }

    function initialize(address accessControlManager_) external initializer {
        require(address(accessControlManager_) != address(0), "Address must not be zero");
        __AccessControlled_init(accessControlManager_);

        functionRegistry[hex"7adbf973"] = "setOracle(address)";
        functionRegistry[hex"53489d6c"] = "setMaxSingleTransactionLimit(uint16,uint256)";
        functionRegistry[hex"2488eec8"] = "setMaxDailyLimit(uint16,uint256)";
        functionRegistry[hex"cc01e9b6"] = "setMaxSingleReceiveTransactionLimit(uint16,uint256)";
        functionRegistry[hex"69c1e7b8"] = "setMaxDailyReceiveLimit(uint16,uint256)";
        functionRegistry[hex"8456cb59"] = "pause()";
        functionRegistry[hex"3f4ba83a"] = "unpause()";
        functionRegistry[hex"53d6fd59"] = "setWhitelist(address,bool)";
        functionRegistry[hex"cbed8b9c"] = "setConfig(uint16,uint16,uint256,bytes)";
        functionRegistry[hex"07e0db17"] = "setSendVersion(uint16)";
        functionRegistry[hex"10ddb137"] = "setReceiveVersion(uint16)";
        functionRegistry[hex"42d65a8d"] = "forceResumeReceive(uint16,bytes)";
        functionRegistry[hex"eb8d72b7"] = "setTrustedRemote(uint16,bytes)";
        functionRegistry[hex"a6c3d165"] = "setTrustedRemoteAddress(uint16,bytes)";
        functionRegistry[hex"baf3292d"] = "setPrecrime(address)";
        functionRegistry[hex"df2a5b3b"] = "setMinDstGas(uint16,uint16,uint256)";
        functionRegistry[hex"0df37483"] = "setPayloadSizeLimit(uint16,uint256)";
        functionRegistry[hex"eab45d9c"] = "setUseCustomAdapterParams(bool)";
    }

    /**
     * @notice This function transfer the ownership of the bridge from this contract to new owner.
     * @param newOwner_ New owner of the XVS Bridge.
     */
    function transferBridgeOwnership(address newOwner_) external {
        _checkAccessAllowed("transferBridgeOwnership(address)");
        require(address(newOwner_) != address(0), "Address must not be zero");
        XVSBridge.transferOwnership(newOwner_);
    }

    function renounceOwnership() public override {}

    function _getFunctionName(bytes4 signature_) internal view returns (string memory) {
        return functionRegistry[signature_];
    }
}

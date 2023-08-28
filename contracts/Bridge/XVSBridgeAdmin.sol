// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IXVSBridge } from "./interfaces/IXVSBridge.sol";

contract XVSBridgeAdmin is AccessControlledV8 {
    struct FunctionInfo {
        bytes4 signature;
        string name;
    }

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IXVSBridge public immutable XVSBridge;

    FunctionInfo[] public functionRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address XVSBridge_) {
        require(XVSBridge_ != address(0), "Address must not be zero");
        XVSBridge = IXVSBridge(XVSBridge_);
        _disableInitializers();
    }

    function initialize(address accessControlManager_) external initializer {
        require(address(accessControlManager_) != address(0), "Address must not be zero");
        __AccessControlled_init(accessControlManager_);

        functionRegistry.push(FunctionInfo(hex"7adbf973", "setOracle(address)"));
        functionRegistry.push(FunctionInfo(hex"53489d6c", "setMaxSingleTransactionLimit(uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"2488eec8", "setMaxDailyLimit(uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"cc01e9b6", "setMaxSingleReceiveTransactionLimit(uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"69c1e7b8", "setMaxDailyReceiveLimit(uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"8456cb59", "pause()"));
        functionRegistry.push(FunctionInfo(hex"3f4ba83a", "unpause()"));
        functionRegistry.push(FunctionInfo(hex"53d6fd59", "setWhitelist(address,bool)"));
        functionRegistry.push(FunctionInfo(hex"f2fde38b", "transferOwnership(address)"));
        functionRegistry.push(FunctionInfo(hex"cbed8b9c", "setConfig(uint16,uint16,uint256,bytes)"));
        functionRegistry.push(FunctionInfo(hex"07e0db17", "setSendVersion(uint16)"));
        functionRegistry.push(FunctionInfo(hex"10ddb137", "setReceiveVersion(uint16)"));
        functionRegistry.push(FunctionInfo(hex"42d65a8d", "forceResumeReceive(uint16,bytes)"));
        functionRegistry.push(FunctionInfo(hex"eb8d72b7", "setTrustedRemote(uint16,bytes)"));
        functionRegistry.push(FunctionInfo(hex"a6c3d165", "setTrustedRemoteAddress(uint16,bytes)"));
        functionRegistry.push(FunctionInfo(hex"baf3292d", "setPrecrime(address)"));
        functionRegistry.push(FunctionInfo(hex"df2a5b3b", "setMinDstGas(uint16,uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"0df37483", "setPayloadSizeLimit(uint16,uint256)"));
        functionRegistry.push(FunctionInfo(hex"eab45d9c", "setUseCustomAdapterParams(bool)"));
    }

    function renounceOwnership() public override {}

    /**
     * @notice Invoked when called function does not exist in the contract
     */
    fallback() external onlyOwner {
        string memory res = getFunctionName(msg.sig);
        require(bytes(res).length != 0, "Function not found");
        _checkAccessAllowed(res);
        (bool ok, ) = address(XVSBridge).call(msg.data);
        require(ok, "call failed");
    }

    function getFunctionName(bytes4 _signature) internal view returns (string memory) {
        FunctionInfo[] memory registry = functionRegistry;
        for (uint256 i = 0; i < registry.length; i++) {
            if (registry[i].signature == _signature) {
                return registry[i].name;
            }
        }
        return "";
    }
}

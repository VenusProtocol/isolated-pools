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

    // Event emitted when function registry updated
    event FunctionRegistryChanged(string signature, bool isRemoved);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address XVSBridge_) {
        require(XVSBridge_ != address(0), "Address must not be zero");
        XVSBridge = IXVSBridge(XVSBridge_);
        _disableInitializers();
    }

    /**
     * @notice Invoked when called function does not exist in the contract
     */
    fallback(bytes calldata data) external payable returns (bytes memory) {
        string memory fun = _getFunctionName(msg.sig);
        require(bytes(fun).length != 0, "Function not found");
        _checkAccessAllowed(fun);
        (bool ok, bytes memory res) = address(XVSBridge).call(data);
        require(ok, "call failed");
        return res;
    }

    function initialize(address accessControlManager_) external initializer {
        require(address(accessControlManager_) != address(0), "Address must not be zero");
        __AccessControlled_init(accessControlManager_);
    }

    function upsertSignature(string[] calldata signatures_, bool[] calldata remove_) external onlyOwner {
        uint256 signatureLength = signatures_.length;
        require(signatureLength == remove_.length, "Input arrays must have the same length");
        for (uint256 i; i < signatureLength; i++) {
            bytes4 sigHash = bytes4(keccak256(bytes(signatures_[i])));
            if (remove_[i]) {
                delete functionRegistry[sigHash];
                emit FunctionRegistryChanged(signatures_[i], true);
            } else {
                functionRegistry[sigHash] = signatures_[i];
                emit FunctionRegistryChanged(signatures_[i], false);
            }
        }
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

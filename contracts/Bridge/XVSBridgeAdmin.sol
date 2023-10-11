// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ensureNonzeroAddress } from "../lib/validators.sol";
import { IXVSProxyOFT } from "./interfaces/IXVSProxyOFT.sol";

/**
 * @title XVSBridgeAdmin
 * @author Venus
 * @notice The XVSBridgeAdmin contract extends a parent contract AccessControlledV8 for access control, and it manages an external contract called XVSProxyOFT.
 * It maintains a registry of function signatures and names,
 * allowing for dynamic function handling i.e checking of access control of interaction with only owner functions.
 */
contract XVSBridgeAdmin is AccessControlledV8 {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IXVSProxyOFT public immutable XVSBridge;

    mapping(bytes4 => string) public functionRegistry;

    // Event emitted when function registry updated
    event FunctionRegistryChanged(string signature, bool isRemoved);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address XVSBridge_) {
        ensureNonzeroAddress(XVSBridge_);
        XVSBridge = IXVSProxyOFT(XVSBridge_);
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
        ensureNonzeroAddress(newOwner_);
        XVSBridge.transferOwnership(newOwner_);
    }

    /**
     * @notice Empty implementation of renounce ownership to avoid any mishappening.
     */
    function renounceOwnership() public override {}

    /**
     * @dev Returns function name string associated with function signature.
     */
    function _getFunctionName(bytes4 signature_) internal view returns (string memory) {
        return functionRegistry[signature_];
    }
}

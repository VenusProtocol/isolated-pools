// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AccessControlManager is AccessControl {
    constructor() {
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function isAllowedToCall(
        string memory contractName,
        string memory functionSig
    ) public view returns (bool) {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        return hasRole(role, msg.sender);
    }

    function giveCallPermission(
        string memory contractName,
        string memory functionSig,
        address accountToPermit
    ) public {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        grantRole(role, accountToPermit);
    }
}

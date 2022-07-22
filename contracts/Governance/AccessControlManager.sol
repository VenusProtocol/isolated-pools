// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "hardhat/console.sol";

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
        console.log("Role checked %s for address %s", functionSig, msg.sender);
        console.log(hasRole(role, msg.sender));
        return hasRole(role, msg.sender);
    }

    function giveCallPermission(
        string memory contractName,
        string memory functionSig,
        address accountToPermit
    ) public {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        console.log(
            "Role granted %s for user %s",
            functionSig,
            accountToPermit
        );
        grantRole(role, accountToPermit);
    }
}

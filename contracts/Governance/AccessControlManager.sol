// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Venus Access Control Contract
 * @author 0xLucian
 * @dev This contract is a wrapper of OpenZeppelin AccessControl
 *		extending it in a way to standartize access control
 *		within Venus Smart Contract Ecosystem
 */
contract AccessControlManager is AccessControl {
    constructor() {
        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     *@notice Verifies if the msg.sender can call a praticular contract's function
     *@param Documents a parameter just like in doxygen (must be followed by parameter name)
     *@return Documents the return variables of a contract’s function state variable
     */
    function isAllowedToCall(
        string memory contractName,
        string memory functionSig
    ) public view returns (bool) {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        return hasRole(role, msg.sender);
    }

    /**
     * @notice Gives a function call permission to one single account
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     */
    function giveCallPermission(
        string memory contractName,
        string memory functionSig,
        address accountToPermit
    ) public {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        grantRole(role, accountToPermit);
    }

    /**
     * @notice Revokes an account's permission to a particular function call
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     */
    function revokeCallPermission(
        string memory contractName,
        string memory functionSig,
        address accountToRevoke
    ) public {
        bytes32 role = keccak256(abi.encodePacked(contractName, functionSig));
        revokeRole(role, accountToRevoke);
    }
}
